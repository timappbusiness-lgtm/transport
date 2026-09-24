// What parse-document is asked to do, and whether it may.
//
// Three requests, one function:
//   parse    { document_id }                  read a registered document
//                                              and write what it says
//   classify { mode: "classify", file_path }  read a file not registered
//                                              yet and say what it is —
//                                              the gallery upload, where
//                                              the person has not said
//   declare  { mode: "declare", document_id,  keep the expiry date the
//              valid_until }                   carrier confirmed, beside
//                                              the one the model read
//
// Kept free of Deno, Supabase and Anthropic imports so the rules run
// under `deno test` without network or credentials.

export type ParseRequest =
  | { mode: "parse"; documentId: string }
  | { mode: "classify"; filePath: string }
  | { mode: "declare"; documentId: string; validUntil: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function readRequest(body: unknown): ParseRequest | { error: string } {
  const data = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const mode = data.mode ?? "parse";

  if (mode === "classify") {
    const path = data.file_path;
    if (typeof path !== "string" || !isDocumentPath(path)) return { error: "file_path is invalid" };
    return { mode: "classify", filePath: path };
  }

  const id = data.document_id;
  if (typeof id !== "string" || !UUID.test(id)) return { error: "document_id is required" };

  if (mode === "declare") {
    const date = data.valid_until;
    if (typeof date !== "string" || !isCalendarDate(date)) return { error: "valid_until is invalid" };
    return { mode: "declare", documentId: id, validUntil: date };
  }
  if (mode !== "parse") return { error: "mode is invalid" };
  return { mode: "parse", documentId: id };
}

/**
 * `<company_id>/<document_id>.<ext>` — the only shape the bucket holds
 * (`documentStoragePath` in the app, `guard_document_insert` in the
 * database). Anything else is not a document this function reads.
 */
export function isDocumentPath(path: string): boolean {
  return /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(pdf|jpg|jpeg|png|webp|heic)$/i.test(path);
}

export function isCalendarDate(value: string): boolean {
  if (!DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * A document is read, or its date declared, only while it waits for us.
 * Approved, rejected, expired and replaced ones are history: reading one
 * again used to send it back to `pending` — back into the review queue.
 */
export function mayRead(status: string | null | undefined): boolean {
  return status === "uploaded" || status === "parsing" || status === "pending";
}

/** The formats the model can see. HEIC it cannot; the app converts photos to JPEG before they go. */
export function readableMime(mime: string): "application/pdf" | "image/jpeg" | "image/png" | "image/webp" | null {
  switch (mime) {
    case "application/pdf":
    case "image/jpeg":
    case "image/png":
    case "image/webp":
      return mime;
    default:
      return null;
  }
}

/** The extracted record with the carrier's own date beside the model's. */
export function withDeclaredDate(
  extracted: unknown,
  validUntil: string,
  userId: string,
  now: Date,
): Record<string, unknown> {
  const base = extracted && typeof extracted === "object" && !Array.isArray(extracted)
    ? { ...(extracted as Record<string, unknown>) }
    : {};
  return {
    ...base,
    declared: { valid_until: validUntil, by: userId, at: now.toISOString() },
  };
}
