import type { Database } from '@/lib/supabase/database.types';
import { pluralRo } from './requests';

/**
 * The rules behind the safety claims, read as data.
 *
 * /verificare does not describe the document rules in prose that somebody
 * has to remember to update — it renders `document_requirements`. That is
 * the point: the page and the platform cannot drift apart, because they are
 * the same rows.
 *
 * Free of React and of SQL, so all of it is testable without either.
 */

export type DocumentScope = Database['public']['Enums']['document_scope'];
export type DocumentKind = Database['public']['Enums']['document_kind'];
export type CompanyType = Database['public']['Enums']['company_type'];

/** One row of `v_document_requirements_public`. */
export interface PublicRequirement {
  scope: DocumentScope;
  kind: DocumentKind;
  label_ro: string;
  for_company_types: CompanyType[] | null;
  for_vehicle_types: string[] | null;
  is_blocking: boolean;
  has_expiry: boolean;
  grace_days: number;
  reminder_days: number[];
}

/**
 * The order the table reads in: what the company brings, then what each
 * vehicle brings. Anything the database adds later that is not named here
 * still appears, after the ones that are.
 */
const ORDER: readonly DocumentKind[] = [
  'licenta_comunitara',
  'certificat_casa_expeditii',
  'certificat_inregistrare_onrc',
  'asigurare_cmr',
  'asigurare_raspundere_expeditor',
  'copie_conforma',
  'itp',
  'rca',
];

/**
 * What the page lists: the documents that decide whether a company or a
 * vehicle may work. The optional ones (Carte Verde, ADR, driver papers) are
 * real requirements for particular jobs, not conditions of being on the
 * platform, and putting them in the same table would overstate what we ask
 * of everybody.
 */
export function requiredDocuments(requirements: PublicRequirement[]): PublicRequirement[] {
  return requirements
    .filter((r) => r.is_blocking && r.scope !== 'driver')
    .sort((a, b) => rank(a.kind) - rank(b.kind));
}

function rank(kind: DocumentKind): number {
  const index = ORDER.indexOf(kind);
  return index === -1 ? ORDER.length : index;
}

/** What happens when this document lapses. The component supplies the words. */
export type ExpiryEffect =
  | { kind: 'none' }
  | { kind: 'company'; graceDays: number }
  | { kind: 'vehicle' }
  | { kind: 'optional' };

export function expiryEffect(requirement: PublicRequirement): ExpiryEffect {
  if (!requirement.is_blocking) return { kind: 'optional' };
  if (!requirement.has_expiry) return { kind: 'none' };
  if (requirement.scope === 'vehicle') return { kind: 'vehicle' };
  return { kind: 'company', graceDays: requirement.grace_days };
}

/**
 * Which companies a requirement applies to, or null when it applies to all
 * of them — in which case the column says only "Firmă", because naming
 * every type would read as a restriction that is not there.
 */
export function appliesTo(requirement: PublicRequirement): 'transport' | 'forwarder' | null {
  const types = requirement.for_company_types;
  if (!types || types.length === 0) return null;
  const hasTransport = types.includes('transport');
  const hasForwarder = types.includes('expeditie');
  if (hasTransport && !hasForwarder) return 'transport';
  if (hasForwarder && !hasTransport) return 'forwarder';
  return null;
}

/** "30, 14, 7 și o zi" — the reminder schedule, read from the row. */
export function remindersLabel(days: number[]): string | null {
  const sorted = [...days].filter((d) => Number.isFinite(d) && d > 0).sort((a, b) => b - a);
  if (sorted.length === 0) return null;

  const parts = sorted.map((d) => (d === 1 ? 'o zi' : String(d)));
  if (parts.length === 1) return parts[0] ?? null;
  const last = parts[parts.length - 1];
  return `${parts.slice(0, -1).join(', ')} și ${last}`;
}

/** "N zile", for the grace period a company gets after an insurance lapses. */
export function graceLabel(days: number): string {
  return pluralRo(days, 'zi', 'zile');
}

/**
 * Whether the homepage says how many carriers there are.
 *
 * A line that reads "3 firme" is worse than no line: it answers the
 * question "is anyone here" with "barely". Below the threshold the team
 * sets, the sentence is simply absent.
 */
export function showCarrierCount(count: number | null, minimum: number): boolean {
  return count !== null && count >= minimum && minimum > 0;
}

/** "24 de firme", with the Romanian plural. */
export function formatCompanies(count: number): string {
  return pluralRo(count, 'firmă', 'firme');
}
