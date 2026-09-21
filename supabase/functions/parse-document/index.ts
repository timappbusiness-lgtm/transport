// =====================================================================
// parse-document
//
// Reads an uploaded compliance document (ITP, RCA, community licence,
// ARR conform copy, ...) from private storage, asks Claude to extract the
// structured fields, and writes them back onto the document row.
//
// It NEVER approves a document. The result always lands in status
// 'pending' so a human reviews it - see docs/03-document-compliance.md
// for why that matters legally and commercially.
//
// POST { "document_id": "<uuid>" }
// =====================================================================

import { corsFor } from "../_shared/security.ts";
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@^1/base64";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;

// Opus 5 is the default. Extraction quality on blurry phone photos of
// Romanian documents is what protects us from wrong expiry dates, and a
// wrong expiry date means either a suspended customer who should not be
// or a truck on the board without valid insurance.
// Switch via env if volume makes the cost matter - see the note at the
// bottom of this file.
const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-opus-5";


// Strict JSON schema: every key is required and nullable, so Claude has a
// way to say "not on this document" instead of inventing a value.
const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    detected_kind: {
      type: ["string", "null"],
      enum: [
        "licenta_comunitara",
        "licenta_transport_national",
        "certificat_casa_expeditii",
        "certificat_inregistrare_onrc",
        "asigurare_cmr",
        "asigurare_raspundere_expeditor",
        "certificat_fiscal",
        "copie_conforma",
        "itp",
        "rca",
        "carte_verde",
        "casco",
        "asigurare_marfa",
        "autorizatie_adr",
        "rovinieta",
        "atestat_profesional",
        "permis_conducere",
        "card_tahograf",
        null,
      ],
      description: "Tipul documentului, dacă poate fi identificat cu certitudine.",
    },
    document_number: { type: ["string", "null"] },
    issued_at: { type: ["string", "null"], description: "Data emiterii, format YYYY-MM-DD." },
    valid_from: { type: ["string", "null"], description: "Valabil de la, format YYYY-MM-DD." },
    valid_until: { type: ["string", "null"], description: "Valabil până la, format YYYY-MM-DD." },
    holder_name: { type: ["string", "null"], description: "Denumirea firmei sau numele titularului." },
    holder_cui: { type: ["string", "null"], description: "CUI / CIF, doar cifrele." },
    plate_number: { type: ["string", "null"], description: "Numărul de înmatriculare, fără spații." },
    vin: { type: ["string", "null"] },
    confidence: {
      type: "number",
      description: "0.0 - 1.0. Sub 0.7 documentul merge la verificare manuală prioritară.",
    },
    issues: {
      type: "array",
      items: { type: "string" },
      description: "Probleme observate: poză tăiată, ilizibilă, document expirat, pare modificat.",
    },
  },
  required: [
    "detected_kind",
    "document_number",
    "issued_at",
    "valid_from",
    "valid_until",
    "holder_name",
    "holder_cui",
    "plate_number",
    "vin",
    "confidence",
    "issues",
  ],
} as const;

const SYSTEM_PROMPT = `Ești un asistent care extrage date din documente românești de transport rutier:
licență comunitară, licență de transport, copie conformă ARR, ITP (anexă / certificat),
poliță RCA, Carte Verde, asigurare CMR, atestat profesional, certificat ONRC.

Reguli stricte:
- Extrage DOAR ce este scris efectiv în document. Dacă un câmp nu apare, pune null.
- Nu deduce și nu completa date lipsă din context sau din cunoștințe generale.
- Toate datele calendaristice se returnează în format YYYY-MM-DD.
- Atenție la formatul românesc zi.lună.an (25.03.2027 = 2027-03-25).
- Pentru "valabil până la" caută: "valabilă până la", "expiră la", "data expirării",
  "valabilitate", "termen de valabilitate", "perioada asigurată" (data de sfârșit).
- La ITP data relevantă este data următoarei inspecții.
- La RCA perioada de asigurare are o dată de început și una de sfârșit; valid_until este sfârșitul.
- confidence reflectă cât de lizibil este documentul, nu cât de sigur ești pe reguli.
- Semnalează în issues orice suspiciune de document modificat digital.`;

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

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  let documentId: string | undefined;

  try {
    const body = await req.json().catch(() => ({}));
    documentId = body.document_id;
    if (!documentId) return jsonResponse(req, { error: "document_id is required" }, 400);

    // --- Authorisation -------------------------------------------------
    // The caller must be a member of the company that owns the document.
    // We check with the caller's own JWT so RLS does the work for us.
    const authHeader = req.headers.get("Authorization") ?? "";
    const caller = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: visible, error: visibleError } = await caller
      .from("documents")
      .select("id")
      .eq("id", documentId)
      .maybeSingle();

    if (visibleError) return jsonResponse(req, { error: visibleError.message }, 500);
    if (!visible) return jsonResponse(req, { error: "Document not found or not accessible" }, 403);

    // --- Load the row and the file -------------------------------------
    const { data: doc, error: docError } = await admin
      .from("documents")
      .select("id, company_id, kind, scope, file_path, file_mime, status")
      .eq("id", documentId)
      .single();

    if (docError || !doc) return jsonResponse(req, { error: "Document not found" }, 404);
    if (doc.status === "approved") {
      return jsonResponse(req, { error: "Document already approved" }, 409);
    }

    await admin.from("documents").update({ status: "parsing" }).eq("id", documentId);

    const { data: file, error: fileError } = await admin.storage
      .from("documents")
      .download(doc.file_path);

    if (fileError || !file) {
      throw new Error(`Storage download failed: ${fileError?.message ?? "empty file"}`);
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const base64 = encodeBase64(bytes);
    const mime = doc.file_mime ?? file.type ?? "application/octet-stream";

    // PDFs go in as document blocks, photos as image blocks.
    const mediaBlock = mime === "application/pdf"
      ? {
        type: "document" as const,
        source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64 },
      }
      : {
        type: "image" as const,
        source: {
          type: "base64" as const,
          media_type: mime as "image/jpeg" | "image/png" | "image/webp",
          data: base64,
        },
      };

    // --- Ask Claude ----------------------------------------------------
    const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    const response = await anthropic.messages.create({
      model: MODEL,
      // The answer is a small JSON object; a low cap keeps latency and
      // cost predictable without risking truncation.
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: EXTRACTION_SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: [
            mediaBlock,
            {
              type: "text",
              text: doc.kind
                ? `Utilizatorul a declarat că acesta este un document de tip "${doc.kind}". ` +
                  `Verifică dacă se potrivește și extrage câmpurile.`
                : "Identifică tipul documentului și extrage câmpurile.",
            },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      throw new Error("Model declined to process this document");
    }

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("No text block in model response");
    }

    const extracted = JSON.parse(textBlock.text) as {
      detected_kind: string | null;
      document_number: string | null;
      issued_at: string | null;
      valid_from: string | null;
      valid_until: string | null;
      confidence: number;
      issues: string[];
    };

    // --- Persist -------------------------------------------------------
    // Always 'pending': a human approves, never the model.
    const { error: updateError } = await admin
      .from("documents")
      .update({
        status: "pending",
        extracted,
        extraction_confidence: extracted.confidence,
        extraction_error: null,
        document_number: extracted.document_number,
        issued_at: extracted.issued_at,
        valid_from: extracted.valid_from,
        valid_until: extracted.valid_until,
      })
      .eq("id", documentId);

    if (updateError) throw new Error(updateError.message);

    return jsonResponse(req, {
      ok: true,
      document_id: documentId,
      extracted,
      kind_mismatch: extracted.detected_kind !== null && extracted.detected_kind !== doc.kind,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("parse-document failed", { documentId, message });

    // Never leave a row stuck in 'parsing'; a human can still review it.
    if (documentId) {
      await admin
        .from("documents")
        .update({ status: "pending", extraction_error: message })
        .eq("id", documentId);
    }
    return jsonResponse(req, { error: message }, 500);
  }
});

// ---------------------------------------------------------------------
// Cost note (list prices at the time of writing, Claude Opus 5:
// $5 / MTok input, $25 / MTok output).
// A phone photo of an A4 document is roughly 1.5k-2.5k input tokens and
// the JSON answer is under 300 output tokens, so about $0.02 per document
// - roughly 0.09 RON. At 500 documents/month that is under 50 RON.
// If volume grows past a few thousand a month, set ANTHROPIC_MODEL to
// claude-sonnet-5 and re-run the accuracy check in
// docs/03-document-compliance.md before switching for good.
// ---------------------------------------------------------------------
