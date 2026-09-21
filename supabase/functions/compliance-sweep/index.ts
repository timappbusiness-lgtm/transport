// =====================================================================
// compliance-sweep
//
// HTTP entry point for the nightly compliance job. pg_cron already calls
// run_compliance_sweep() directly (migration 0007); this function exists
// so n8n can trigger the same work, get the counters back, and alert us
// when something looks wrong.
//
// Protect it with a shared secret: the caller must send
//   x-cron-secret: <CRON_SECRET>
//
// POST {}  ->  { expired_documents, suspended_companies, reactivated_companies, reminders_queued }
// =====================================================================

import { secretsMatch } from "../_shared/security.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }
  if (!secretsMatch(req.headers.get("x-cron-secret"), CRON_SECRET)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  try {
    const { data: sweep, error: sweepError } = await admin.rpc("run_compliance_sweep");
    if (sweepError) throw new Error(`run_compliance_sweep: ${sweepError.message}`);

    const { data: reminders, error: reminderError } = await admin.rpc("queue_expiry_reminders");
    if (reminderError) throw new Error(`queue_expiry_reminders: ${reminderError.message}`);

    const { data: cleaned, error: cleanupError } = await admin.rpc("expire_stale_listings");
    if (cleanupError) throw new Error(`expire_stale_listings: ${cleanupError.message}`);

    const counters = Array.isArray(sweep) ? sweep[0] : sweep;

    return new Response(
      JSON.stringify({
        ok: true,
        ran_at: new Date().toISOString(),
        expired_documents: counters?.expired_documents ?? 0,
        suspended_companies: counters?.suspended_companies ?? 0,
        reactivated_companies: counters?.reactivated_companies ?? 0,
        reminders_queued: reminders ?? 0,
        listings_expired: cleaned ?? 0,
      }),
      { headers: { "Content-Type": "application/json" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("compliance-sweep failed", message);
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
