/**
 * Where a file goes, decided by an id the device chose once.
 *
 * Every upload that passes through our server — a request's photographs,
 * a driver's pickup and delivery photographs, a message's images — is
 * named after the id the browser gave the file when it was chosen. The
 * same file sent twice (a retry, a reload, a closed tab reopened) lands
 * on the same object and the same row, and the second arrival is read as
 * „already there", not as a second copy.
 *
 * Free of the server and of the browser, so the rules are tested alone.
 */

export const UPLOAD_KINDS = ['poza-cerere', 'dovada', 'atasament'] as const;
export type UploadKind = (typeof UPLOAD_KINDS)[number];

export function isUploadKind(value: string): value is UploadKind {
  return (UPLOAD_KINDS as readonly string[]).includes(value);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The shape of an id we accept from the device: it becomes part of a path. */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID.test(value);
}

/** A new id, in the same shape where `crypto.randomUUID` is missing (an old browser, plain http). */
export function newUploadId(random: () => number = Math.random): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch {
      // Not a secure context: fall through.
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const n = Math.floor(random() * 16);
    return (char === 'x' ? n : (n & 0x3) | 0x8).toString(16);
  });
}

/** A request's photograph, in the person's own folder (the storage policy's rule). */
export function requestPhotoPath(userId: string, id: string): string {
  return `${userId}/foto-${id}.jpg`;
}

/** A pickup or delivery photograph, in the order's folder. The row's id is the file's. */
export function evidencePath(orderId: string, id: string): string {
  return `${orderId}/${id}.jpg`;
}

/** A message's image, in the conversation's folder, named after its message. */
export function attachmentPath(conversationId: string, messageId: string, id: string): string {
  return `${conversationId}/${messageId}-${id}.jpg`;
}

/**
 * Storage's refusal of an object that already exists. For a path named
 * after an id chosen once, it means an earlier attempt got through and
 * only its answer was lost.
 */
export function isDuplicateObject(error: { message?: unknown; statusCode?: unknown } | null | undefined): boolean {
  if (!error) return false;
  if (error.statusCode === '409' || error.statusCode === 409) return true;
  return typeof error.message === 'string' && /already exists|duplicate/i.test(error.message);
}

/** Postgres's unique violation. */
export function isDuplicateRow(error: { code?: unknown } | null | undefined): boolean {
  return error?.code === '23505';
}
