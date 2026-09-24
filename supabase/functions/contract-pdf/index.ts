// =====================================================================
// contract-pdf
//
// Draws a transport contract version as a PDF and answers with a short
// signed link to it.
//
// POST { "contract_id": "<uuid>", "disposition": "inline" | "attachment" }
//   Authorization: Bearer <the user's access token>
//
// The caller's own token asks the database first:
// `order_contract_render_data()` answers only a party to the order or
// staff, and answers everybody else exactly as it answers an id that does
// not exist (P0002 -> 404). Only after that does the service role touch
// storage: the bucket has no write policy, so nobody can put a file there
// that the snapshot did not produce.
//
// The PDF is drawn once per version, template, acceptance count and
// renderer revision (cache.ts), kept in the private bucket
// `order-contracts`, and served through a link that lives 60 seconds.
//
//   200 { url, filename, expires_in }
//   400 not a contract id
//   401 not signed in
//   404 no such contract, or not yours
//   500 anything else — logged here with the contract id, never the data
// =====================================================================

import { Buffer } from "node:buffer";
import PDFDocument from "npm:pdfkit@0.20.2";
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsFor } from "../_shared/security.ts";
import { downloadName, objectPath, readRequest, SIGNED_URL_SECONDS, statusForRpcError } from "./cache.ts";
import { INTER_REGULAR, INTER_SEMIBOLD } from "./fonts.ts";
import { contractFacts } from "./model.ts";
import { type PdfKitConstructor, renderContractPdf } from "./render.ts";
import { parseRenderData } from "./snapshot.ts";
import { templateFor } from "./templates/index.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "order-contracts";

// Decoded once per instance, not per request.
const FONTS = {
  regular: Buffer.from(INTER_REGULAR, "base64"),
  semibold: Buffer.from(INTER_SEMIBOLD, "base64"),
};

function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsFor(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsFor(req) });
  if (req.method !== "POST") return json(req, { error: "Method not allowed" }, 405);

  const authorization = req.headers.get("Authorization") ?? "";
  if (!/^Bearer\s+\S+/.test(authorization)) return json(req, { error: "Neautentificat" }, 401);

  const request = readRequest(await req.json().catch(() => null));
  if (!request) return json(req, { error: "Contract invalid" }, 400);

  try {
    const caller = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false },
      global: { headers: { Authorization: authorization } },
    });
    const { data: raw, error: rpcError } = await caller.rpc("order_contract_render_data", {
      p_contract_id: request.contractId,
    });
    const status = statusForRpcError(rpcError);
    if (status === 404) return json(req, { error: "Contractul nu există" }, 404);
    if (status !== 200) {
      console.error("contract-pdf: render data failed", request.contractId, rpcError?.code, rpcError?.message);
      return json(req, { error: "Contractul nu a putut fi citit" }, 500);
    }

    const data = parseRenderData(raw);
    const path = objectPath(data);
    const filename = downloadName(data);
    const signOptions = request.disposition === "attachment" ? { download: filename } : undefined;

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const bucket = admin.storage.from(BUCKET);

    let signed = await bucket.createSignedUrl(path, SIGNED_URL_SECONDS, signOptions);
    if (signed.error) {
      // Not drawn yet (or drawn before an erasure removed it): draw it now.
      const facts = contractFacts(data);
      const document = templateFor(data.template_version).build(facts, data.snapshot.generated_at ?? null);
      const pdf = await renderContractPdf(document, {
        PDFDocument: PDFDocument as unknown as PdfKitConstructor,
        fonts: FONTS,
      });
      const upload = await bucket.upload(path, pdf, { contentType: "application/pdf", upsert: true });
      if (upload.error) {
        console.error("contract-pdf: upload failed", request.contractId, upload.error.message);
        return json(req, { error: "Contractul nu a putut fi salvat" }, 500);
      }
      signed = await bucket.createSignedUrl(path, SIGNED_URL_SECONDS, signOptions);
      if (signed.error) {
        console.error("contract-pdf: signing failed", request.contractId, signed.error.message);
        return json(req, { error: "Legătura nu a putut fi creată" }, 500);
      }
    }

    return json(req, { url: signed.data.signedUrl, filename, expires_in: SIGNED_URL_SECONDS });
  } catch (error) {
    console.error("contract-pdf: failed", request.contractId, error instanceof Error ? error.message : String(error));
    return json(req, { error: "Contractul nu a putut fi generat" }, 500);
  }
});
