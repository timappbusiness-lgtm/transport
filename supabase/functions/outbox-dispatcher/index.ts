// =====================================================================
// outbox-dispatcher
//
// The thing that was missing. `notification_outbox` has been filling
// since migration 0007 and nothing emptied it, because the four n8n
// workflows in the README were never built and nobody runs an n8n.
//
// So this is the drain, as an edge function called by pg_cron through
// pg_net every five minutes — the same mechanism the three existing jobs
// already rely on, rather than a second piece of infrastructure to keep
// alive.
//
// POST {} with header x-cron-secret: <CRON_SECRET>
//
// Per run:
//   1. claim up to 50 email/in-app rows with `for update skip locked`
//   2. send each one, or mark it for another try
//   3. hand the push channel to its own dispatcher
//   4. write one row into job_run_log
//
// It is safe to overlap with itself: the claim is what makes that true,
// and a check in rls_test.sql proves two concurrent runs split the rows
// rather than both taking them.
// =====================================================================

import { BRAND_NAME } from "../_shared/brand.ts";
import { secretsMatch } from "../_shared/security.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { MissingVariable, render } from "./render.ts";
import { renderValues, type SendResult, sendEmail } from "./send.ts";
import { TEMPLATES } from "./templates.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? null;

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? null;
const MAIL_FROM = Deno.env.get("MAIL_FROM") ?? null;
// Optional, both of them: a missing reply-to degrades to the plain sending
// address, and a missing display name to the brand name, rather than
// stopping the run.
const MAIL_SENDER_NAME = Deno.env.get("MAIL_SENDER_NAME") ?? BRAND_NAME;
const MAIL_REPLY_TO = Deno.env.get("MAIL_REPLY_TO") ?? undefined;
// Required, like the two above it. Every e-mail is a link to a page on
// the site; without the site's address the link would point at a domain
// guessed from the brand name, which is not decided and may not be ours.
const SITE_URL = Deno.env.get("SITE_URL")?.replace(/\/+$/, "") || null;

const BATCH = 50;

interface OutboxRow {
  id: string;
  channel: string;
  template: string;
  recipient_user_id: string | null;
  recipient_company_id: string | null;
  to_email: string | null;
  payload: Record<string, unknown>;
  attempts: number;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * A missing secret is a 503 that names it, not a silent no-op.
 *
 * The whole reason this function exists is that something was quietly not
 * running. A dispatcher that starts, finds no mail provider and reports
 * success would be the same bug wearing a different hat.
 */
function missingSecret(): string | null {
  if (CRON_SECRET === null) return "CRON_SECRET";
  if (RESEND_API_KEY === null) return "RESEND_API_KEY";
  if (MAIL_FROM === null) return "MAIL_FROM";
  if (SITE_URL === null) return "SITE_URL";
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  const missing = missingSecret();
  if (missing !== null) {
    console.error("outbox-dispatcher cannot run", { missing });
    // Write the reason down before refusing. Returning 503 to pg_cron
    // tells nobody: pg_net does not keep the body, so without this row
    // /admin/notificari can only say „nothing has been sent" and not
    // „nothing has been sent because MAIL_FROM is not set". Naming the
    // variable is the difference between a mystery and a five-minute fix.
    await admin.rpc("log_job_run", {
      p_workflow: "outbox-dispatcher",
      p_processed: 0,
      p_failed: 1,
      p_details: { missing },
    }).then(() => {}, () => {});

    return json({
      ok: false,
      error: `Lipsește ${missing}. Fără el nu se trimite nimic și coada crește.`,
      missing,
    }, 503);
  }

  if (!secretsMatch(req.headers.get("x-cron-secret"), CRON_SECRET)) {
    return json({ error: "Unauthorized" }, 401);
  }

  let processed = 0;
  let failed = 0;
  let bounced = 0;
  let skippedByBounce = 0;
  const reasons: Record<string, number> = {};

  try {
    const { data: rows, error: claimError } = await admin
      .rpc("claim_outbox_batch", { p_limit: BATCH });

    if (claimError) throw new Error(`claim_outbox_batch: ${claimError.message}`);

    for (const row of (rows ?? []) as OutboxRow[]) {
      let result: SendResult;

      if (row.channel === "inapp") {
        // The row itself is the notification. Nothing leaves the building.
        result = { ok: true };
      } else {
        const template = TEMPLATES[row.template];
        if (template === undefined) {
          result = { ok: false, error: `șablon necunoscut: ${row.template}`, permanent: true };
        } else if (row.to_email === null || row.to_email.trim() === "") {
          result = { ok: false, error: "rândul nu are adresă de e-mail", permanent: true };
        } else {
          try {
            const unsubscribeUrl = template.unsubscribable
              ? `${SITE_URL}/cont/setari/notificari`
              : undefined;
            const mail = render(row.template, template, renderValues(row.payload, SITE_URL!), {
              unsubscribeUrl,
              markUrl: `${SITE_URL}/brand/mark-email.png`,
            });
            result = await sendEmail(
              {
                apiKey: RESEND_API_KEY!,
                from: MAIL_FROM!,
                senderName: MAIL_SENDER_NAME,
                replyTo: MAIL_REPLY_TO,
              },
              row.to_email,
              mail.subject,
              mail.html,
              mail.text,
            );
          } catch (error) {
            // A missing variable is a bug in the producer, not a hiccup.
            // Retrying renders the same hole four more times.
            result = error instanceof MissingVariable
              ? { ok: false, error: error.message, permanent: true }
              : {
                ok: false,
                error: error instanceof Error ? error.message : "necunoscut",
                permanent: true,
              };
          }
        }
      }

      if (result.ok) {
        processed += 1;
        await admin.rpc("finish_outbox", {
          p_id: row.id,
          p_status: "sent",
          p_provider_id: result.providerId ?? null,
        });
        continue;
      }

      failed += 1;
      const reason = result.error ?? "necunoscut";
      reasons[reason] = (reasons[reason] ?? 0) + 1;
      // A permanent failure skips the remaining attempts by exhausting
      // them in one go; `finish_outbox` then leaves it failed.
      console.error("outbox row failed", { template: row.template, reason });
      await admin.rpc("finish_outbox", {
        p_id: row.id,
        p_status: "failed",
        p_error: result.permanent ? `definitiv: ${reason}` : reason,
        p_provider_id: result.providerId ?? null,
      });

      // A hard bounce is about the address rather than this message, so
      // everything else queued for it goes too. Doing it here rather than
      // leaving each row to fail on its own is the difference between one
      // rejection and five a week for ever.
      if (result.hardBounce === true && row.to_email !== null) {
        const { data: skipped, error: flagError } = await admin.rpc(
          "flag_email_undeliverable",
          { p_email: row.to_email, p_reason: reason },
        );
        if (flagError === null) {
          bounced += 1;
          skippedByBounce += (typeof skipped === "number" ? skipped : 0);
        }
      }
    }

    // Push has its own claim function and its own sender. Calling it from
    // the same five-minute tick means one schedule drains both queues,
    // and the two never touch the same row.
    let pushInvoked = false;
    try {
      const { error } = await admin.functions.invoke("push-dispatcher", {
        headers: { "x-cron-secret": CRON_SECRET! },
        body: {},
      });
      pushInvoked = error === null;
    } catch {
      // The push dispatcher being down is not a reason to fail this run:
      // the e-mails went out, and its own rows stay queued for the next.
      pushInvoked = false;
    }

    await admin.rpc("log_job_run", {
      p_workflow: "outbox-dispatcher",
      p_processed: processed,
      p_failed: failed,
      p_details: {
        reasons,
        push_invoked: pushInvoked,
        bounced,
        skipped_by_bounce: skippedByBounce,
      },
    });

    return json({
      ok: true,
      processed,
      failed,
      bounced,
      skipped_by_bounce: skippedByBounce,
      push_invoked: pushInvoked,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("outbox-dispatcher failed", { message });

    await admin.rpc("log_job_run", {
      p_workflow: "outbox-dispatcher",
      p_processed: processed,
      p_failed: failed + 1,
      p_details: { error: message },
    }).then(() => {}, () => {});

    return json({ ok: false, error: message }, 500);
  }
});
