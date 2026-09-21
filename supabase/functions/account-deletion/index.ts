// =====================================================================
// account-deletion
//
// The job that carries out what somebody asked for a fortnight ago.
//
// It exists as an edge function rather than as SQL for one reason: the
// bytes behind a document live in object storage, and deleting the row
// that names a file is not deleting the file. A "deletion" that leaves
// somebody's ITP scan sitting in a bucket is the worst kind of bug in
// this whole repository — it passes every test and it is a data breach.
//
// POST {} with header x-cron-secret: <CRON_SECRET>
//
// Per request, in this order and no other:
//   1. read the file list, while the rows that name the files still exist
//   2. empty the buckets
//   3. `complete_account_deletion`, which anonymises and deletes the
//      auth user last, and which re-checks the blocking rules first
//
// A run that dies between 2 and 3 leaves an account with no files and a
// working login, which is recoverable. The other order would leave a
// login with nothing behind it, which is not.
// =====================================================================

import { secretsMatch } from "../_shared/security.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { chunk, groupByBucket, isAlreadyGone, type StorageFile } from "./deletion.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? null;

const BATCH = 20;
const PATHS_PER_CALL = 100;

interface DeletionRow {
  id: string;
  user_id: string | null;
  company_id: string | null;
  kind: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * One place the client is built, so its type carries the generics.
 * `ReturnType<typeof createClient>` resolves them to `never` and every
 * RPC below then takes no arguments.
 */
function createAdmin() {
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

type Admin = ReturnType<typeof createAdmin>;

/**
 * Empties the buckets for one request.
 *
 * Returns how many paths were named and how many are still there. A
 * leftover is not fatal to the run, but it is fatal to *this* request:
 * the database step is skipped, the row keeps its schedule, and the next
 * run tries again with the file list still readable.
 */
async function removeFiles(
  admin: Admin,
  requestId: string,
): Promise<{ named: number; left: number; errors: string[] }> {
  const { data, error } = await admin.rpc("account_deletion_files", { p_id: requestId });
  if (error) throw new Error(`account_deletion_files: ${error.message}`);

  const grouped = groupByBucket((data ?? []) as StorageFile[]);
  let named = 0;
  let left = 0;
  const errors: string[] = [];

  for (const [bucket, paths] of grouped) {
    named += paths.length;
    for (const batch of chunk(paths, PATHS_PER_CALL)) {
      const { error: removeError } = await admin.storage.from(bucket).remove(batch);
      if (removeError && !isAlreadyGone(removeError.message)) {
        left += batch.length;
        errors.push(`${bucket}: ${removeError.message}`);
      }
    }
  }

  return { named, left, errors };
}

/** Archives whose day is up, with the files they still name. */
async function expireExports(admin: Admin): Promise<number> {
  const { data, error } = await admin.rpc("expired_data_exports");
  if (error) throw new Error(`expired_data_exports: ${error.message}`);

  let removed = 0;
  for (const row of (data ?? []) as { id: string; file_path: string }[]) {
    const { error: removeError } = await admin.storage.from("exports").remove([row.file_path]);
    if (removeError && !isAlreadyGone(removeError.message)) continue;
    await admin.rpc("forget_data_export", { p_id: row.id });
    removed += 1;
  }
  return removed;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  if (CRON_SECRET === null) {
    console.error("account-deletion cannot run", { missing: "CRON_SECRET" });
    return json({
      ok: false,
      error: "Lipsește CRON_SECRET. Fără el nu se șterge nimic și cererile se adună.",
      missing: "CRON_SECRET",
    }, 503);
  }
  if (!secretsMatch(req.headers.get("x-cron-secret"), CRON_SECRET)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const admin = createAdmin();

  let processed = 0;
  let failed = 0;
  let blocked = 0;
  let filesRemoved = 0;
  const reasons: Record<string, number> = {};

  try {
    const { data: rows, error: claimError } = await admin
      .rpc("claim_account_deletions", { p_limit: BATCH });
    if (claimError) throw new Error(`claim_account_deletions: ${claimError.message}`);

    for (const row of (rows ?? []) as DeletionRow[]) {
      try {
        const files = await removeFiles(admin, row.id);
        if (files.left > 0) {
          // Deliberately not completed. The row keeps its schedule, the
          // file list is still readable next time, and nobody is told
          // their data is gone while some of it is not.
          throw new Error(`fișiere rămase în storage: ${files.errors.join("; ")}`);
        }
        filesRemoved += files.named;

        const { data: done, error: completeError } = await admin
          .rpc("complete_account_deletion", { p_id: row.id });
        if (completeError) throw new Error(completeError.message);

        // The database re-checks the blocking rules and can step back:
        // a fortnight is long enough for a new transport to start.
        const finished = done as { status?: string; user_id?: string | null } | null;
        const status = finished?.status;
        if (status === "blocked") {
          blocked += 1;
        } else {
          // The login, through the admin API. The database deletes it
          // itself where it may, so this is usually a 404 — but
          // `auth.users` belongs to another role, and an erasure that
          // leaves a working login because of a privilege grant is the
          // one failure here nobody would see.
          if (row.kind === "user" && finished?.user_id) {
            const { error: authError } = await admin.auth.admin.deleteUser(finished.user_id);
            if (authError && !isAlreadyGone(authError.message)) {
              throw new Error(`auth.deleteUser: ${authError.message}`);
            }
          }
          processed += 1;
        }
      } catch (error) {
        failed += 1;
        const reason = error instanceof Error ? error.message : String(error);
        reasons[reason] = (reasons[reason] ?? 0) + 1;
        console.error("account deletion failed", { request: row.id, reason });
      }
    }

    const exportsRemoved = await expireExports(admin);

    await admin.rpc("log_job_run", {
      p_workflow: "account-deletion",
      p_processed: processed,
      p_failed: failed,
      p_details: {
        blocked,
        files_removed: filesRemoved,
        exports_removed: exportsRemoved,
        reasons,
      },
    });

    return json({ ok: true, processed, blocked, failed, files_removed: filesRemoved });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("account-deletion failed", { message });

    await admin.rpc("log_job_run", {
      p_workflow: "account-deletion",
      p_processed: processed,
      p_failed: failed + 1,
      p_details: { error: message },
    }).then(() => {}, () => {});

    return json({ ok: false, error: message }, 500);
  }
});
