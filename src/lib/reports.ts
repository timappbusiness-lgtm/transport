/**
 * Sesizări: what a report is, and what a person calls each of its states.
 *
 * `reports` has been complete since phase 0 — reason, evidence, status,
 * resolution, who handled it — and nothing ever read it, so a person
 * reporting a problem from /verificare was writing into a drawer. This
 * file is the reading half: the labels, the order a queue is worked in,
 * and the one rule the screen enforces before the database does.
 *
 * Free of React and of the database, so the words a list shows and the
 * words a confirmation shows cannot disagree.
 */

/** The database's names. The screen never shows these. */
export type ReportStatus = 'open' | 'investigating' | 'resolved' | 'dismissed';
export type ReportKind = 'firma' | 'anunt' | 'mesaj' | 'evaluare' | 'altul';

export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  open: 'Nou',
  investigating: 'În lucru',
  resolved: 'Rezolvat',
  dismissed: 'Respins',
};

export const REPORT_KIND_LABELS: Record<ReportKind, string> = {
  firma: 'Firmă',
  // The enum value stays `anunt`; the words on screen do not.
  anunt: 'Cerere sau traseu',
  mesaj: 'Mesaj',
  evaluare: 'Evaluare',
  altul: 'Altceva',
};

/**
 * Unde se duce echipa pentru fiecare fel de sesizare.
 *
 * `null` înseamnă „nu există un ecran pentru asta" — o sesizare despre o
 * firmă se rezolvă din sesizarea însăși. Cele trei care au ecran duc
 * acolo, cu id-ul, ca nimeni să nu caute manual rândul.
 */
export function reportTarget(row: {
  kind: ReportKind;
  message_id?: string | null;
  rating_id?: string | null;
  cargo_listing_id?: string | null;
}): { href: string; label: string } | null {
  if (row.kind === 'mesaj' && row.message_id) {
    return { href: '/admin/conversatii', label: 'Vezi conversația' };
  }
  if (row.kind === 'anunt' && row.cargo_listing_id) {
    // A cargo listing is a request.
    return { href: '/admin/anunturi', label: 'Vezi cererea' };
  }
  if (row.kind === 'evaluare' && row.rating_id) {
    return { href: '/admin/evaluari', label: 'Vezi evaluarea' };
  }
  return null;
}

/**
 * The order a queue is worked in: what nobody has looked at, then what
 * somebody is looking at, then what is done. Not the order the database
 * happens to return, and not alphabetical — „dismissed" would come first.
 */
export const REPORT_STATUS_ORDER: readonly ReportStatus[] = [
  'open',
  'investigating',
  'resolved',
  'dismissed',
];

/** Closing a report is a decision somebody will be told about. */
export function isClosing(status: ReportStatus): boolean {
  return status === 'resolved' || status === 'dismissed';
}

export interface ReportRow {
  id: string;
  created_at: string;
  status: ReportStatus;
  kind: ReportKind;
  reason: string;
  details: string | null;
  evidence_path: string | null;
  resolution: string | null;
  internal_notes: string | null;
  resolved_at: string | null;
  reporter_notified_at: string | null;
  reporter_user_id: string;
  reporter_name: string | null;
  reporter_email: string | null;
  reported_company_id: string | null;
  reported_company_name: string | null;
  reported_user_id: string | null;
  cargo_listing_id: string | null;
  /** Adăugate de 20260924100000 și 20260925100000. */
  message_id: string | null;
  rating_id: string | null;
  assigned_to: string | null;
  assigned_name: string | null;
  handled_by: string | null;
}

/**
 * What a report is about, as one line.
 *
 * Returns null when the report names nothing the platform can link to —
 * which is the common case from /verificare, where the person typed a
 * firm's name into free text. Saying „Firmă: —" there would be a worse
 * answer than saying nothing and letting the details speak.
 */
export function reportedEntity(row: ReportRow): string | null {
  if (row.reported_company_name !== null) return `Firma ${row.reported_company_name}`;
  if (row.reported_company_id !== null) return `Firmă ${row.reported_company_id}`;
  if (row.cargo_listing_id !== null) return `Cererea ${row.cargo_listing_id}`;
  if (row.reported_user_id !== null) return `Cont ${row.reported_user_id}`;
  return null;
}

/** How many are waiting for somebody, which is what the tab counter shows. */
export function openCount(rows: readonly ReportRow[]): number {
  return rows.filter((row) => row.status === 'open' || row.status === 'investigating').length;
}
