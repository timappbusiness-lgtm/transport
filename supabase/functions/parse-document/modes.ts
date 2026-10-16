// What parse-document is asked to do, and whether it may.
//
// Four requests, one function:
//   parse    { document_id }                  read a registered document
//                                              and write what it says
//   classify { mode: "classify", file_path }  read a file not registered
//                                              yet and say what it is —
//                                              the gallery upload, where
//                                              the person has not said
//   declare  { mode: "declare", document_id,  keep the expiry date the
//              valid_until }                   carrier confirmed, beside
//                                              the one the model read
//   memento  { mode: "memento", file_path,    propose the date on a photo
//              kind }                          for the memento — a date the
//                                              person confirms, never a
//                                              verified document; writes
//                                              nothing
//
// Kept free of Deno, Supabase and Anthropic imports so the rules run
// under `deno test` without network or credentials.

/** What a memento date can be about; `memento_entries.kind` in the database. */
export const MEMENTO_KINDS = [
  "rca",
  "itp",
  "rovinieta",
  "casco",
  "trusa_medicala",
  "extinctor",
  "revizie",
  "altceva",
] as const;
export type MementoKind = (typeof MEMENTO_KINDS)[number];

export type ParseRequest =
  | { mode: "parse"; documentId: string }
  | { mode: "classify"; filePath: string }
  | { mode: "declare"; documentId: string; validUntil: string }
  | { mode: "memento"; filePath: string; kind: MementoKind };

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

  if (mode === "memento") {
    const path = data.file_path;
    if (typeof path !== "string" || !isMementoPath(path)) return { error: "file_path is invalid" };
    const kind = data.kind;
    if (typeof kind !== "string" || !(MEMENTO_KINDS as readonly string[]).includes(kind)) {
      return { error: "kind is invalid" };
    }
    return { mode: "memento", filePath: path, kind: kind as MementoKind };
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

/**
 * `<owner id>/<file id>.jpg` in the `memento` bucket — the person's id or
 * the firm's, and always a JPEG, because the upload route re-encodes
 * every photo. The `photo_path` check on `memento_entries` is the same.
 */
export function isMementoPath(path: string): boolean {
  return /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/.test(path);
}

/**
 * What the model is told the photo should be. Rovinieta is a receipt or
 * an e-mail from CNAIR more often than a sticker: there is no public API
 * to ask, so the person photographs whatever they have and confirms the
 * date.
 */
export function mementoHint(kind: MementoKind): string | null {
  switch (kind) {
    case "rca":
      return "rca";
    case "itp":
      return "itp";
    case "casco":
      return "casco";
    case "rovinieta":
      return "rovinieta (chitanță sau confirmare de plată; data relevantă este sfârșitul valabilității)";
    case "trusa_medicala":
      return "trusă medicală auto (data relevantă este data expirării de pe trusă)";
    case "extinctor":
      return "extinctor auto (data relevantă este data următoarei verificări sau a expirării)";
    case "revizie":
      return "fișă de service (data relevantă este data următoarei revizii)";
    default:
      return null;
  }
}

/**
 * The model's answer, cut to what the memento form uses. The extracted
 * record of a verified document carries more; a memento never stores
 * any of it, so nothing more leaves the function.
 */
export function mementoAnswer(extracted: unknown): {
  valid_until: string | null;
  document_number: string | null;
  plate_number: string | null;
  confidence: number | null;
} {
  const e = (extracted && typeof extracted === "object" ? extracted : {}) as Record<string, unknown>;
  const text = (value: unknown, max: number) =>
    typeof value === "string" && value.trim() !== "" ? value.trim().slice(0, max) : null;
  const date = typeof e.valid_until === "string" && isCalendarDate(e.valid_until) ? e.valid_until : null;
  return {
    valid_until: date,
    document_number: text(e.document_number, 60),
    plate_number: text(e.plate_number, 12),
    confidence: typeof e.confidence === "number" ? e.confidence : null,
  };
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
