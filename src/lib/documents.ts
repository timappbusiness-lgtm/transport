import type { StatusTone } from '@/components/ui/primitives';
import type { Database } from '@/lib/supabase/database.types';
import { daysBetween, parseDateOnly } from './format';

/**
 * Reading a document's state the way a dispatcher needs it.
 *
 * Two different things are called a "status" here and they must not be
 * confused. `document_status` is the stored column and only the database
 * moves it — `review_document()` for a person's decision, the nightly sweep
 * for expiry. `DisplayStatus` is derived from `valid_until` at render time
 * and is never stored: it is what turns "approved" into "expires in eleven
 * days", which is the difference between a renewal and a suspension.
 */

type DocumentStatus = Database['public']['Enums']['document_status'];

/** docs/01-product-spec.md, "Document display status". Never stored. */
export type DisplayStatus = 'valid' | 'expiring_soon' | 'expired';

export const EXPIRING_SOON_DAYS = 30;

/**
 * valid          expires in more than 30 days
 * expiring_soon  expires in 30 days or less
 * expired        past valid_until
 * null           the document has no expiry date
 */
export function documentDisplayStatus(
  validUntil: string | null,
  today: Date = new Date(),
): DisplayStatus | null {
  if (!validUntil) return null;
  const days = daysBetween(today, parseDateOnly(validUntil));
  if (days < 0) return 'expired';
  if (days <= EXPIRING_SOON_DAYS) return 'expiring_soon';
  return 'valid';
}

export const DISPLAY_STATUS: Record<DisplayStatus, { label: string; tone: StatusTone }> = {
  valid: { label: 'Valabil', tone: 'success' },
  expiring_soon: { label: 'Expiră curând', tone: 'warning' },
  expired: { label: 'Expirat', tone: 'danger' },
};

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  uploaded: 'Încărcat',
  parsing: 'Se citește',
  pending: 'În verificare',
  approved: 'Aprobat',
  rejected: 'Respins',
  expired: 'Expirat',
  replaced: 'Înlocuit',
};

/** States from v_company_missing_documents / v_vehicle_missing_documents. */
export type RequirementState = 'ok' | 'missing' | 'in_review' | 'rejected' | 'expired';

export const REQUIREMENT_STATE: Record<RequirementState, { label: string; tone: StatusTone }> = {
  ok: { label: 'Valabil', tone: 'success' },
  in_review: { label: 'În verificare', tone: 'neutral' },
  missing: { label: 'Lipsă', tone: 'danger' },
  rejected: { label: 'Respins', tone: 'danger' },
  expired: { label: 'Expirat', tone: 'danger' },
};

export function isRequirementState(value: string | null): value is RequirementState {
  return value !== null && value in REQUIREMENT_STATE;
}

/** The storage path convention the documents bucket policies rely on. */
export function documentStoragePath(
  companyId: string,
  documentId: string,
  fileName: string,
): string {
  const ext = /\.([a-z0-9]{2,5})$/i.exec(fileName)?.[1]?.toLowerCase() ?? 'bin';
  return `${companyId}/${documentId}.${ext}`;
}

export const ACCEPTED_DOCUMENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
] as const;

export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/**
 * Why a chosen file cannot be a document, before it is uploaded — by the
 * same list `registerDocumentAction` accepts, so nothing passes here to
 * be refused after the upload. A JPG, PNG or WebP is drawn down in the
 * browser first, so only a PDF or a HEIC is refused for its size now.
 */
export function documentFileProblem(file: { type: string; size: number }): 'wrong_type' | 'too_large' | null {
  if (!(ACCEPTED_DOCUMENT_TYPES as readonly string[]).includes(file.type)) return 'wrong_type';
  const redrawn = file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'image/webp';
  if (!redrawn && file.size > MAX_DOCUMENT_BYTES) return 'too_large';
  return null;
}
