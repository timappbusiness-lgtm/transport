// =====================================================================
// push-dispatcher
//
// Drains the `push` rows out of `notification_outbox` and delivers them.
// The same split as every other channel here: Postgres decided who and
// when, this decides nothing and only sends.
//
// Protect it with the shared secret the other jobs use:
//   x-cron-secret: <CRON_SECRET>
//
// POST {}  ->  { claimed, sent, retried, disabled, failed }
//
// Required secrets. The function refuses to start without them rather
// than failing per message, because a missing VAPID key is a
// configuration mistake and every message would fail identically:
//
//   VAPID_PUBLIC_KEY    also public as NEXT_PUBLIC_VAPID_PUBLIC_KEY
//   VAPID_PRIVATE_KEY   secret
//   VAPID_SUBJECT       mailto: or https:, identifies the sender
//
// Generate a pair with any VAPID tool, for example:
//   npx web-push generate-vapid-keys
// and set them with `supabase secrets set`. Never commit them.
// =====================================================================

import { secretsMatch } from "../_shared/security.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { backoffSeconds, sendPush, type VapidKeys } from "./webpush.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;

/** At most this many per invocation, so one run cannot exceed its timeout. */
const BATCH = 50;
/** After this many tries a message is failed rather than retried forever. */
const MAX_ATTEMPTS = 5;

function vapid(): VapidKeys {
  const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
  const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
  const subject = Deno.env.get("VAPID_SUBJECT");

  // A hard stop, named. Falling back to "send nothing" would look exactly
  // like "nobody is subscribed", which is the wrong thing to be debugging
  // at the other end of it.
  const missing = [
    publicKey ? null : "VAPID_PUBLIC_KEY",
    privateKey ? null : "VAPID_PRIVATE_KEY",
    subject ? null : "VAPID_SUBJECT",
  ].filter((name): name is string => name !== null);

  if (missing.length > 0) {
    throw new Error(
      `Push is not configured: ${missing.join(", ")} missing. ` +
        `Generate a VAPID pair and set them with \`supabase secrets set\`.`,
    );
  }

  return { publicKey: publicKey!, privateKey: privateKey!, subject: subject! };
}

interface QueuedRow {
  id: string;
  template: string;
  recipient_user_id: string | null;
  payload: Record<string, unknown>;
  attempts: number;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }
  if (!secretsMatch(req.headers.get("x-cron-secret"), CRON_SECRET)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  let keys: VapidKeys;
  try {
    keys = vapid();
  } catch (error) {
    // 503 rather than 500: the service is fine, it is not configured.
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "unconfigured" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  // Claim the batch first, so two runs cannot pick up the same rows. The
  // RPC does the `for update skip locked` that makes that true.
  const { data: claimed, error: claimError } = await admin.rpc("claim_push_batch", {
    p_limit: BATCH,
  });
  if (claimError) {
    return new Response(JSON.stringify({ error: claimError.message }), { status: 500 });
  }

  const rows = (claimed ?? []) as QueuedRow[];
  let sent = 0;
  let retried = 0;
  let disabled = 0;
  let failed = 0;

  for (const row of rows) {
    if (!row.recipient_user_id) {
      await admin.rpc("finish_push", { p_id: row.id, p_status: "skipped", p_error: null });
      failed += 1;
      continue;
    }

    const { data: subscriptions } = await admin
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("user_id", row.recipient_user_id)
      .is("disabled_at", null);

    const targets = subscriptions ?? [];
    if (targets.length === 0) {
      // Every device went away between queueing and sending. Nothing to
      // retry towards.
      await admin.rpc("finish_push", { p_id: row.id, p_status: "skipped", p_error: null });
      continue;
    }

    const body = JSON.stringify(row.payload);
    let anySent = false;
    let lastError: string | null = null;
    let anyRetryable = false;

    for (const target of targets) {
      const result = await sendPush(target, body, keys);

      if (result.outcome === "sent") {
        anySent = true;
        await admin
          .from("push_subscriptions")
          .update({ last_seen_at: new Date().toISOString(), last_error: null })
          .eq("id", target.id);
        continue;
      }

      lastError = result.error;

      if (result.outcome === "gone") {
        // The browser is gone: cleared site data, uninstalled, or the
        // subscription expired. The row is kept and marked so the settings
        // screen can say so rather than quietly showing nothing.
        await admin
          .from("push_subscriptions")
          .update({ disabled_at: new Date().toISOString(), last_error: result.error })
          .eq("id", target.id);
        disabled += 1;
        continue;
      }

      if (result.outcome === "retry") anyRetryable = true;
      await admin
        .from("push_subscriptions")
        .update({ last_error: result.error })
        .eq("id", target.id);
    }

    if (anySent) {
      // Delivered to at least one device, which is what the person asked
      // for. Retrying towards the others would re-deliver to this one.
      await admin.rpc("finish_push", { p_id: row.id, p_status: "sent", p_error: null });
      sent += 1;
    } else if (anyRetryable && row.attempts < MAX_ATTEMPTS) {
      await admin.rpc("retry_push", {
        p_id: row.id,
        p_after_seconds: backoffSeconds(row.attempts),
        p_error: lastError,
      });
      retried += 1;
    } else {
      await admin.rpc("finish_push", { p_id: row.id, p_status: "failed", p_error: lastError });
      failed += 1;
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      ran_at: new Date().toISOString(),
      claimed: rows.length,
      sent,
      retried,
      disabled,
      failed,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});
