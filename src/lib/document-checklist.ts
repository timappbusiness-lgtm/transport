/**
 * Which documents a firm still owes, counted the way the database counts
 * them.
 *
 * The requirements are rows in `document_requirements`, read through the
 * views `v_company_missing_documents` and `v_vehicle_missing_documents`;
 * nothing here decides what is required. What this does is add them up
 * for one screen: „3 din 5 încărcate", and whether „Trimite la verificare"
 * can be pressed — by the same reading as `company_review_readiness()`,
 * which is what refuses it when it cannot:
 *
 *   - a blocking document counts as done once something usable is
 *     uploaded: approved and valid, or waiting for our check;
 *   - missing, rejected and expired all still need a file;
 *   - a firm that carries needs at least one vehicle, and every vehicle
 *     its blocking documents.
 *
 * Free of React and of Supabase.
 */

import type { RequirementState } from './documents';
import { IN_PLACE } from './review';

export type { RequirementState };

export interface RequirementRow {
  scope: 'company' | 'vehicle';
  kind: string;
  label: string;
  isBlocking: boolean;
  state: RequirementState;
  validUntil: string | null;
  /** For a vehicle's document. */
  vehicleId?: string | null;
}

/** Something usable is on file: ours to check, or checked. `IN_PLACE`, as `reviewProgress` reads it. */
export function isUploaded(state: RequirementState): boolean {
  return IN_PLACE.includes(state);
}

export interface ChecklistCounts {
  /** Blocking documents, and how many of them have a usable file. */
  blockingTotal: number;
  blockingDone: number;
  /** The ones that can wait: they never stop the check. */
  optionalTotal: number;
  optionalDone: number;
  /** Blocking documents still needing a file. */
  blockingMissing: number;
}

export function countChecklist(rows: readonly Pick<RequirementRow, 'isBlocking' | 'state'>[]): ChecklistCounts {
  let blockingTotal = 0;
  let blockingDone = 0;
  let optionalTotal = 0;
  let optionalDone = 0;
  for (const row of rows) {
    const done = isUploaded(row.state);
    if (row.isBlocking) {
      blockingTotal += 1;
      if (done) blockingDone += 1;
    } else {
      optionalTotal += 1;
      if (done) optionalDone += 1;
    }
  }
  return { blockingTotal, blockingDone, optionalTotal, optionalDone, blockingMissing: blockingTotal - blockingDone };
}

/** „3 din 5 încărcate". */
export function progressLabel(counts: Pick<ChecklistCounts, 'blockingDone' | 'blockingTotal'>): string {
  return `${counts.blockingDone} din ${counts.blockingTotal} încărcate`;
}

/**
 * Whether „Trimite la verificare" can be pressed. The mirror of
 * `company_review_readiness().is_ready` plus the status the RPC accepts.
 */
export function canSubmitForReview(input: {
  verificationStatus: string;
  carries: boolean;
  vehicleCount: number;
  rows: readonly RequirementRow[];
}): boolean {
  if (input.verificationStatus !== 'draft' && input.verificationStatus !== 'rejected') return false;
  if (input.carries && input.vehicleCount === 0) return false;
  return countChecklist(input.rows).blockingMissing === 0;
}

/**
 * The rows in the order a person works through them: what still needs a
 * file first — blocking before optional — then what is done.
 */
export function orderForWork<T extends Pick<RequirementRow, 'isBlocking' | 'state'>>(rows: readonly T[]): T[] {
  const rank = (row: T) => (isUploaded(row.state) ? 2 : 0) + (row.isBlocking ? 0 : 1);
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => rank(a.row) - rank(b.row) || a.index - b.index)
    .map(({ row }) => row);
}

/** The rows of one vehicle, or of the firm itself when `vehicleId` is null. */
export function rowsFor<T extends Pick<RequirementRow, 'scope' | 'vehicleId'>>(rows: readonly T[], vehicleId: string | null): T[] {
  return rows.filter((row) => (vehicleId === null ? row.scope === 'company' : row.vehicleId === vehicleId));
}

/**
 * The anchor of one row on the documents screen, so a link — an e-mail
 * about an expiring document, an old bookmark — lands on the row itself.
 */
export function requirementAnchor(kind: string, vehicleId: string | null | undefined): string {
  return `act-${vehicleId ?? 'firma'}-${kind}`;
}
