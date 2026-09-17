import type { Database } from '@/lib/supabase/database.types';

/**
 * Reading the public company directory.
 *
 * Everything here works from `v_public_companies`, which carries only what
 * a profile is allowed to show: no telephone number, no e-mail address, no
 * street address, no documents and no plates. A company appears in it only
 * if it asked to, is verified and is not suspended — three conditions the
 * view enforces, so nothing on this side can widen them.
 *
 * Free of React and of SQL, so every rule below is testable without either.
 */

export type CompanyType = Database['public']['Enums']['company_type'];
export type DocumentKind = Database['public']['Enums']['document_kind'];

/** One row of `v_public_companies`. The view's columns are nullable; a row
 * that reaches a page has been through `toCompany`, which drops the ones
 * that cannot be rendered. */
export interface PublicCompany {
  slug: string;
  name: string;
  legalName: string;
  cui: string;
  city: string | null;
  county: string | null;
  companyType: CompanyType;
  logoPath: string | null;
  description: string | null;
  /** When the paperwork was last approved, ISO. null while unknown. */
  verifiedSince: string | null;
  ratingAvg: number | null;
  ratingCount: number;
  compliantVehicles: number;
  servesNational: boolean;
  servesInternational: boolean;
  lastCheckedAt: string | null;
}

/** One row of `v_public_company_documents`. */
export type DocumentState = 'valid' | 'expiring_soon' | 'expired';

export interface PublicCompanyDocument {
  kind: DocumentKind;
  label: string;
  state: DocumentState;
  /** First of the month the document runs to, ISO. null when it has none. */
  validMonth: string | null;
}

export interface DirectoryStats {
  verifiedCompanies: number;
  compliantVehicles: number;
  listedCompanies: number;
}

export interface DirectoryThresholds {
  /** Below this many verified carriers, the band states no number. */
  statsMinCompanies: number;
  /** Below this many listed companies, the homepage grid stays hidden. */
  directoryMinCompanies: number;
  /** Days free after a company is verified. 0 hides the claim entirely. */
  trialDays: number;
}

/** What the database's check constraint allows, mirrored for the form. */
export const MAX_PUBLIC_DESCRIPTION = 300;

/** What the `company-logos` bucket accepts. The bucket enforces both. */
export const ACCEPTED_LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const MAX_LOGO_BYTES = 1024 * 1024;

/**
 * Where a logo lives: the company's own folder, which is what the storage
 * policies check. One file per company, replaced rather than accumulated —
 * a logo has no history worth keeping.
 */
export function logoStoragePath(companyId: string, mime: string): string {
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
  return `${companyId}/logo.${ext}`;
}

/** Twelve on the homepage, a full page of twenty-four in the directory. */
export const HOME_GRID_SIZE = 12;
export const DIRECTORY_PAGE_SIZE = 24;

/**
 * Below these, neither is shown.
 *
 * A grid with three cards in it says we have three carriers, and "4 firme
 * verificate" is a number better left unsaid than stated — so the
 * thresholds are a claim about honesty rather than a layout preference,
 * and they live in the database where the team can move them.
 */
export function showStatsBand(
  stats: DirectoryStats | null,
  t: DirectoryThresholds,
): stats is DirectoryStats {
  return stats !== null && stats.verifiedCompanies >= t.statsMinCompanies;
}

export function showCompanyGrid(
  companies: readonly PublicCompany[],
  stats: DirectoryStats | null,
  t: DirectoryThresholds,
): boolean {
  const listed = stats?.listedCompanies ?? companies.length;
  return listed >= t.directoryMinCompanies && companies.length > 0;
}

/**
 * The grid shows twelve of what may be hundreds, so which twelve is a
 * decision. Rotating by the day gives every listed company its turn without
 * a random order that reshuffles on every render and without a "featured"
 * flag somebody would have to sell.
 *
 * `day` is a parameter rather than a call to `Date.now()` so the server and
 * the test can ask the same question.
 */
export function rotateDaily<T>(items: readonly T[], size: number, day: Date): T[] {
  if (items.length === 0 || size <= 0) return [];
  if (items.length <= size) return [...items];

  const offset = dayNumber(day) % items.length;
  const out: T[] = [];
  for (let i = 0; i < size; i += 1) {
    const item = items[(offset + i) % items.length];
    if (item !== undefined) out.push(item);
  }
  return out;
}

/** Whole days since the epoch, in UTC: the same number all day everywhere. */
export function dayNumber(day: Date): number {
  return Math.floor(
    Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()) / 86_400_000,
  );
}

/**
 * The letters on a card that has no logo. Two initials from the trading
 * name, skipping the legal form: "Autotrans Vest SRL" gives AV, not AS.
 */
const LEGAL_FORMS = new Set(['srl', 'sa', 'srl-d', 'pfa', 'ii', 'snc', 'sca', 'scs']);

export function monogram(name: string): string {
  const words = name
    .split(/[\s.\-–]+/u)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((w) => w !== '' && !LEGAL_FORMS.has(w.toLowerCase()));

  const initials = words.slice(0, 2).map((w) => w[0] ?? '');
  const out = initials.join('').toUpperCase();
  return out === '' ? '—' : out;
}

/** "Verificat din septembrie 2026", or null while we do not know when. */
export function verifiedSinceLabel(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return `Verificat din ${monthYear(date)}`;
}

/** "octombrie 2027" — the month a document runs to, never the day. */
export function monthYear(date: Date): string {
  return new Intl.DateTimeFormat('ro-RO', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export const DOCUMENT_STATE_LABELS: Record<DocumentState, string> = {
  valid: 'Valabil',
  expiring_soon: 'Expiră curând',
  expired: 'Expirat',
};

export const COMPANY_TYPE_LABELS: Record<CompanyType, string> = {
  transport: 'Transportator',
  expeditie: 'Casă de expediții',
  both: 'Transportator și casă de expediții',
};

/** What a company covers, from the routes it has published. */
export function scopeLabel(company: PublicCompany): string | null {
  if (company.servesNational && company.servesInternational) {
    return 'Intern și internațional';
  }
  if (company.servesNational) return 'Intern';
  if (company.servesInternational) return 'Internațional';
  return null;
}

/**
 * The rating, or nothing at all.
 *
 * A single rating is not an average, and a figure with no count behind it
 * says more than it knows — so below `MIN_RATINGS` the card shows no score
 * rather than a one-star company that had one unhappy client.
 */
export const MIN_RATINGS = 3;

export function ratingLabel(company: PublicCompany): string | null {
  if (company.ratingAvg === null || company.ratingCount < MIN_RATINGS) return null;
  return company.ratingAvg.toFixed(1).replace('.', ',');
}

/**
 * The filters the directory accepts, parsed from the query string.
 *
 * Anything unrecognised becomes "no filter" rather than an error: a stale
 * bookmark should show the whole list, not a 400.
 */
export type ScopeFilter = 'intern' | 'international';

/**
 * Only two, though the enum has three: a company that does both is a
 * carrier to somebody looking for a carrier, so "both" is matched by either
 * filter rather than hidden behind a third one nobody would pick.
 */
export type TypeFilter = 'transport' | 'expeditie';

export const TYPE_FILTER_MATCHES: Record<TypeFilter, readonly CompanyType[]> = {
  transport: ['transport', 'both'],
  expeditie: ['expeditie', 'both'],
};

export interface DirectoryFilters {
  county: string | null;
  companyType: TypeFilter | null;
  scope: ScopeFilter | null;
  query: string | null;
  page: number;
}

export const EMPTY_FILTERS: DirectoryFilters = {
  county: null,
  companyType: null,
  scope: null,
  query: null,
  page: 1,
};

const TYPE_FILTERS: readonly TypeFilter[] = ['transport', 'expeditie'];
const SCOPES: readonly ScopeFilter[] = ['intern', 'international'];

export function parseFilters(params: Record<string, string | string[] | undefined>): DirectoryFilters {
  return {
    county: text(params['judet'], 60),
    companyType: oneOf(first(params['tip']), TYPE_FILTERS),
    scope: oneOf(first(params['acoperire']), SCOPES),
    query: text(params['q'], 80),
    page: page(first(params['pagina'])),
  };
}

/** The query string for a set of filters, with the empty ones left out. */
export function filtersToQuery(filters: DirectoryFilters): string {
  const params = new URLSearchParams();
  if (filters.county) params.set('judet', filters.county);
  if (filters.companyType) params.set('tip', filters.companyType);
  if (filters.scope) params.set('acoperire', filters.scope);
  if (filters.query) params.set('q', filters.query);
  if (filters.page > 1) params.set('pagina', String(filters.page));
  const out = params.toString();
  return out === '' ? '' : `?${out}`;
}

export function hasFilters(filters: DirectoryFilters): boolean {
  return (
    filters.county !== null ||
    filters.companyType !== null ||
    filters.scope !== null ||
    filters.query !== null
  );
}

export function pageCount(total: number, size: number = DIRECTORY_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / Math.max(size, 1)));
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function text(value: string | string[] | undefined, max: number): string | null {
  const raw = first(value);
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().slice(0, max);
  return trimmed === '' ? null : trimmed;
}

function oneOf<T extends string>(value: string | undefined, allowed: readonly T[]): T | null {
  return allowed.find((a) => a === value) ?? null;
}

/**
 * What is safe to put inside a PostgREST `or(...)` filter.
 *
 * A comma or a parenthesis in the search box would otherwise be read as
 * filter syntax rather than as part of a company name, and `%` would turn
 * a search into a wildcard the visitor did not type.
 */
export function sanitizeSearch(value: string): string {
  return value.replace(/[,()%*\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

function page(value: string | undefined): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 1000 ? n : 1;
}

/**
 * A view row as the pages use it.
 *
 * The view's columns are all nullable to PostgREST, and a row with no slug
 * or no name cannot be linked to or labelled — so rather than spreading
 * `?? ''` through the components, those rows are dropped here.
 */
type CompanyRow = Database['public']['Views']['v_public_companies']['Row'];

export function toCompany(row: CompanyRow): PublicCompany | null {
  if (!row.slug || !row.name || !row.legal_name || !row.cui || !row.company_type) return null;
  return {
    slug: row.slug,
    name: row.name,
    legalName: row.legal_name,
    cui: row.cui,
    city: row.city,
    county: row.county,
    companyType: row.company_type,
    logoPath: row.logo_path,
    description: row.public_description,
    verifiedSince: row.verified_since,
    ratingAvg: row.rating_avg === null ? null : Number(row.rating_avg),
    ratingCount: Number(row.rating_count ?? 0),
    compliantVehicles: Number(row.compliant_vehicles ?? 0),
    servesNational: row.serves_national === true,
    servesInternational: row.serves_international === true,
    lastCheckedAt: row.last_checked_at,
  };
}

/** The slug is how the row was found, so a profile does not select it back. */
type DocumentRow = Omit<
  Database['public']['Views']['v_public_company_documents']['Row'],
  'slug'
>;

export function toDocument(row: DocumentRow): PublicCompanyDocument | null {
  if (!row.kind || !row.label_ro) return null;
  const state: DocumentState =
    row.state === 'expired' || row.state === 'expiring_soon' ? row.state : 'valid';
  return { kind: row.kind, label: row.label_ro, state, validMonth: row.valid_month };
}
