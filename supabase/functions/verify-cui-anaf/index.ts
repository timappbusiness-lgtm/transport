// =====================================================================
// verify-cui-anaf
//
// Looks a Romanian company up in the ANAF public register by CUI.
// Free, official, no API key. We use it for two things:
//   1. autofilling the company form at signup (name, address, VAT status)
//   2. an anti-fraud signal - a company flagged inactive or struck off
//      never gets to post on the exchange
//
// POST { "cui": "RO12345678", "company_id": "<uuid>", "keep_details": true }
//   company_id is optional; when present the snapshot is saved on the row.
//   keep_details saves only the snapshot and its flags (the record, when it
//   was checked, inactive or struck off, VAT) and leaves the name, address
//   and reg. com. the person confirmed in the form as they are. Sign-up
//   sends it: the form already offered ANAF's values, and what the person
//   kept or corrected is theirs to decide; the snapshot is what staff and
//   submit_company_for_review() compare against.
//   Saving requires the caller to manage that company and the CUI to be the
//   company's own (see authorize.ts): 403 or 409 otherwise, before ANAF is
//   even called.
//
// Every answer that is not a company carries a `reason` the app turns into
// a sentence, so a failed lookup is never silent:
//   400 invalid        not a CUI, or its control digit is wrong
//   404 not_found      ANAF has no company under this CUI
//   503 unavailable    ANAF did not answer, or answered with an error
// The record itself is mapped in map.ts.
// =====================================================================

import { corsFor } from "../_shared/security.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { authorizeCompanyWrite, hasValidControlDigit, normaliseCui } from "./authorize.ts";
import { mapAnafRecord } from "./map.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ANAF versions this path (…/v9/tva today). Kept in an env var so a
// version bump is a config change, not a redeploy.
const ANAF_ENDPOINT = Deno.env.get("ANAF_ENDPOINT") ??
  "https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva";


/**
 * Antetele CORS depind acum de cererea care le-a cerut: originea se
 * întoarce numai dacă este pe lista din `ALLOWED_ORIGIN`. Deci și
 * răspunsul de eroare are nevoie de cerere.
 */
function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsFor(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsFor(req) });
  if (req.method !== "POST") return jsonResponse(req, { error: "Method not allowed" }, 405);

  try {
    const { cui, company_id, keep_details } = await req.json().catch(() => ({}));
    if (!cui) return jsonResponse(req, { error: "cui is required" }, 400);

    const parsedCui = normaliseCui(String(cui));
    if (parsedCui === null) return jsonResponse(req, { error: "CUI invalid", reason: "invalid" }, 400);
    if (!hasValidControlDigit(parsedCui)) {
      return jsonResponse(
        req,
        { error: "Cifra de control a CUI-ului nu se potrivește", reason: "invalid" },
        400,
      );
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });

    if (company_id) {
      // The service role bypasses RLS: decide before writing anything.
      const caller = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
        auth: { persistSession: false },
      });
      const decision = await authorizeCompanyWrite(
        {
          callerManages: async (id) => {
            const { data, error } = await caller.rpc("is_company_manager", { p_company_id: id });
            if (error) throw error;
            return data === true;
          },
          storedCui: async (id) => {
            const { data, error } = await admin.from("companies").select("cui").eq("id", id).maybeSingle();
            if (error) throw error;
            return data?.cui ?? null;
          },
        },
        String(company_id),
        parsedCui,
      );
      if (!decision.allowed) return jsonResponse(req, { error: decision.error }, decision.status);
    }

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
        req,
        { error: `ANAF indisponibil (HTTP ${anafResponse.status})`, reason: "unavailable", retryable: true },
        503,
      );
    }

    const payload = await anafResponse.json();
    const record = payload?.found?.[0];

    if (!record) {
      return jsonResponse(
        req,
        { found: false, cui: parsedCui, reason: "not_found", message: "CUI negăsit la ANAF" },
        404,
      );
    }

    const result = mapAnafRecord(record, parsedCui, new Date());

    if (company_id) {
      const snapshot = {
        anaf_payload: record,
        anaf_checked_at: result.checked_at,
        anaf_is_inactive: result.is_inactive || result.is_struck_off,
        vat_payer: result.vat_payer,
      };
      const { error } = await admin
        .from("companies")
        .update(
          keep_details === true ? snapshot : {
            ...snapshot,
            legal_name: result.legal_name ?? undefined,
            reg_com: result.reg_com ?? undefined,
            address: result.address ?? undefined,
          },
        )
        .eq("id", company_id);

      if (error) console.error("verify-cui-anaf: could not persist snapshot", error.message);
    }

    return jsonResponse(req, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("verify-cui-anaf failed", message);
    // A timeout or a refused connection to ANAF lands here too: the same
    // „try again or fill it in" as a 503, not a broken form.
    return jsonResponse(req, { error: message, reason: "unavailable", retryable: true }, 500);
  }
});
