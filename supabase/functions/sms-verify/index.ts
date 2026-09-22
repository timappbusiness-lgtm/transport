// =====================================================================
// sms-verify
//
// Sends the code that confirms somebody's telephone number. The same
// split as every other channel here: Postgres decides whether this
// person may ask for a code right now — `open_phone_verification()`
// holds the rate limits, the cooldown and the expiry — and this decides
// nothing, generates the code, sends it and reports back.
//
// POST { phone: "07..." }  with the caller's JWT
//   -> 200 { ok: true, expires_at, attempts_left }
//   -> 503 { error, missing: "TWILIO_AUTH_TOKEN" }   when unconfigured
//
// Confirming the code does not come through here: the account calls
// `confirm_phone_verification()` directly, because the provider has no
// part in it and a hop that adds nothing is a hop that can break.
//
// Secrets. Without them the function refuses, loudly, naming the one
// that is missing, and writes that name into `job_run_log` so
// /admin/notificari can say „neconfigurat" instead of staying silent:
//
//   TWILIO_ACCOUNT_SID
//   TWILIO_AUTH_TOKEN
//   TWILIO_FROM_NUMBER            a sending number in E.164
//   TWILIO_MESSAGING_SERVICE_SID  or a Messaging Service, instead
//
// Until they are set, a number is still confirmed the way it is today:
// somebody on the team rings it and calls `staff_set_phone_verified()`
// from /admin/pilot. That path is untouched on purpose — the pilot
// should not wait on a supplier contract.
// =====================================================================

import { corsFor } from "../_shared/security.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  generateCode,
  hashCode,
  missingSecret,
  twilioProvider,
  verificationMessage,
  type ProviderSecrets,
} from "./provider.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BRAND = Deno.env.get("BRAND_NAME") ?? "Coridor";

function secrets(): ProviderSecrets {
  return {
    accountSid: Deno.env.get("TWILIO_ACCOUNT_SID") ?? undefined,
    authToken: Deno.env.get("TWILIO_AUTH_TOKEN") ?? undefined,
    fromNumber: Deno.env.get("TWILIO_FROM_NUMBER") ?? undefined,
    messagingServiceSid: Deno.env.get("TWILIO_MESSAGING_SERVICE_SID") ?? undefined,
  };
}

function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsFor(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsFor(req) });
  if (req.method !== "POST") return jsonResponse(req, { error: "POST" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Who is asking. The JWT is the only thing that decides it: a user id
  // in the body would let anybody request a code for anybody's number.
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (token === "") return jsonResponse(req, { error: "Trebuie să fii conectat" }, 401);

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  const user = userData?.user ?? null;
  if (userError !== null || user === null) {
    return jsonResponse(req, { error: "Sesiunea nu mai este valabilă" }, 401);
  }

  let phone = "";
  try {
    const body = (await req.json()) as { phone?: unknown };
    if (typeof body.phone === "string") phone = body.phone.trim();
  } catch {
    // Falls through to the empty-phone refusal below.
  }
  if (phone === "") return jsonResponse(req, { error: "Scrie numărul de telefon" }, 400);

  // The refusal comes before the challenge is opened, so an unconfigured
  // platform does not burn somebody's hourly quota on a code that was
  // never going to be sent.
  const missing = missingSecret(secrets());
  if (missing !== null) {
    await admin.from("job_run_log").insert({
      workflow: "sms-verify",
      processed: 0,
      failed: 1,
      details: { missing },
    });
    return jsonResponse(
      req,
      {
        error:
          "Trimiterea prin SMS nu este configurată. Echipa îți poate confirma numărul manual.",
        missing,
      },
      503,
    );
  }

  const { data: challenge, error: openError } = await admin
    .rpc("open_phone_verification", { p_user: user.id, p_phone: phone })
    .single();

  if (openError !== null || challenge === null) {
    // The database's own sentence reaches the person: it says how long
    // to wait, or why the number is not one.
    return jsonResponse(req, { error: openError?.message ?? "Nu am putut cere un cod" }, 400);
  }

  const row = challenge as { id: string; phone: string; expires_at: string };
  const code = generateCode();
  const provider = twilioProvider(secrets());
  const result = await provider.send(row.phone, verificationMessage(code, BRAND));

  if (!result.ok) {
    await admin.rpc("failed_phone_verification", {
      p_id: row.id,
      p_error: result.error ?? "necunoscut",
    });
    await admin.from("job_run_log").insert({
      workflow: "sms-verify",
      processed: 0,
      failed: 1,
      details: { error: result.error ?? null, permanent: result.permanent ?? false },
    });
    return jsonResponse(
      req,
      { error: "Nu am reușit să trimitem SMS-ul. Încearcă din nou în câteva minute." },
      502,
    );
  }

  // The hash is written only now. A hash stored before the send would be
  // a valid code for a message that never left.
  await admin.rpc("sent_phone_verification", {
    p_id: row.id,
    p_code_hash: await hashCode(code),
    p_provider: provider.name,
    p_provider_id: result.providerId ?? null,
  });

  await admin.from("job_run_log").insert({
    workflow: "sms-verify",
    processed: 1,
    failed: 0,
    details: {},
  });

  return jsonResponse(req, { ok: true, expires_at: row.expires_at });
});
