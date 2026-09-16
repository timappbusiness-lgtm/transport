// =====================================================================
// verify-cui-anaf
//
// Looks a Romanian company up in the ANAF public register by CUI.
// Free, official, no API key. We use it for two things:
//   1. autofilling the company form at signup (name, address, VAT status)
//   2. an anti-fraud signal - a company flagged inactive or struck off
//      never gets to post on the exchange
//
// POST { "cui": "RO12345678", "company_id": "<uuid>" }
//   company_id is optional; when present the snapshot is saved on the row.
// =====================================================================

import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ANAF versions this path (…/v9/tva today). Kept in an env var so a
// version bump is a config change, not a redeploy.
const ANAF_ENDPOINT = Deno.env.get("ANAF_ENDPOINT") ??
  "https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

/** "RO 12 345 678" -> 12345678. Returns null when it cannot be a CUI. */
function normaliseCui(raw: string): number | null {
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length < 2 || digits.length > 10) return null;
  const value = Number(digits);
  return Number.isFinite(value) ? value : null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const { cui, company_id } = await req.json().catch(() => ({}));
    if (!cui) return jsonResponse({ error: "cui is required" }, 400);

    const parsedCui = normaliseCui(String(cui));
    if (parsedCui === null) return jsonResponse({ error: "CUI invalid" }, 400);

    const today = new Date().toISOString().slice(0, 10);

    const anafResponse = await fetch(ANAF_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify([{ cui: parsedCui, data: today }]),
      signal: AbortSignal.timeout(10_000),
    });

    if (!anafResponse.ok) {
      // ANAF rate-limits aggressively (roughly 1 req/s). Surface it as 503
      // so the client can retry rather than treating the company as invalid.
      return jsonResponse(
        { error: `ANAF indisponibil (HTTP ${anafResponse.status})`, retryable: true },
        503,
      );
    }

    const payload = await anafResponse.json();
    const record = payload?.found?.[0];

    if (!record) {
      return jsonResponse({ found: false, cui: parsedCui, message: "CUI negăsit la ANAF" }, 404);
    }

    const general = record.date_generale ?? {};
    const inactive = record.stare_inactiv ?? {};
    const vat = record.inregistrare_scop_Tva ?? {};

    const result = {
      found: true,
      cui: parsedCui,
      legal_name: general.denumire ?? null,
      address: general.adresa ?? null,
      reg_com: general.nrRegCom ?? null,
      phone: general.telefon ?? null,
      caen_code: general.cod_CAEN ?? null,
      status_text: general.stare_inregistrare ?? null,
      vat_payer: vat.scpTVA ?? false,
      // The two fields that matter for fraud screening.
      is_inactive: Boolean(inactive.statusInactivi),
      is_struck_off: typeof general.stare_inregistrare === "string" &&
        /radiat/i.test(general.stare_inregistrare),
      checked_at: new Date().toISOString(),
      raw: record,
    };

    if (company_id) {
      const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      });
      const { error } = await admin
        .from("companies")
        .update({
          anaf_payload: record,
          anaf_checked_at: result.checked_at,
          anaf_is_inactive: result.is_inactive || result.is_struck_off,
          legal_name: result.legal_name ?? undefined,
          reg_com: result.reg_com ?? undefined,
          address: result.address ?? undefined,
          vat_payer: result.vat_payer,
        })
        .eq("id", company_id);

      if (error) console.error("verify-cui-anaf: could not persist snapshot", error.message);
    }

    return jsonResponse(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("verify-cui-anaf failed", message);
    return jsonResponse({ error: message, retryable: true }, 500);
  }
});
