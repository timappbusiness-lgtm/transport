import type { Database } from './supabase/database.types';
import type { CargoCategory, ServiceType } from './departures';

export type ListingBoard = Database['public']['Enums']['listing_board'];
export type ListingStatus = Database['public']['Enums']['listing_status'];

/**
 * Reading a transport request the way the homepage shows it.
 *
 * Everything here works from `v_requests_public`, which is locality-level
 * and carries no notes, no photographs, no price and nobody's name. There
 * is no second, richer read for a visitor: what this file can describe is
 * the whole of what a visitor is shown.
 *
 * Free of React and of SQL, so every rule below is testable without either.
 */

/**
 * One row of `v_requests_public`.
 *
 * The first thirteen columns are what the homepage feed has always shown.
 * The rest were appended for the board in phase 2 — what a carrier filters
 * on, and nothing more. There is still no price, no note, no photograph and
 * nobody's name here; those need a session, and the contact needs a plan.
 */
export interface PublicRequest {
  id: string;
  category: CargoCategory;
  make: string | null;
  model: string | null;
  year: number | null;
  is_running: boolean;
  service_type: ServiceType;
  from_city: string;
  from_country: string;
  to_city: string;
  to_country: string;
  estimated_km: number | null;
  published_at: string;
  /** `curse` was posted by a firm, `retur` by a private person. */
  board: ListingBoard;
  loading_from: string;
  loading_to: string | null;
  weight_kg: number | null;
  /** Derived in the database from the condition flags, never entered. */
  needs_winch: boolean;
  /** How many photographs the request carries, not the photographs. */
  photo_count: number;
  is_domestic: boolean;
  /** ISO 3166-2:RO, resolved from the city on the server. null when unknown. */
  from_county: string | null;
  to_county: string | null;
  /**
   * City centroids, from the server's own city list at publication.
   * Null on a request whose city never resolved, and every reader treats
   * null as „cannot tell" rather than as a point at sea.
   */
  from_lat: number | null;
  from_lng: number | null;
  to_lat: number | null;
  to_lng: number | null;
}

export interface ActivityStats {
  /** Requests ever published, minus drafts and cancellations. */
  publishedTotal: number;
  publishedLast7d: number;
  /** Straight-line kilometres, summed over the same set. */
  totalKm: number;
  /** Requests live right now — the same set the feed shows. */
  activeTotal: number;
  /** Thirty numbers, oldest first. */
  daily: number[];
  /** The day `daily[0]` counts, as `YYYY-MM-DD`. */
  dailyFrom: string;
}

export interface ActivityThresholds {
  statsMinRequests: number;
  feedMinRequests: number;
  /** Below this many verified carriers, the homepage states no number. */
  verifiedCompaniesMin: number;
}

/** Six on a wide screen; the last two are hidden on a phone, not fetched twice. */
export const FEED_LIMIT = 6;
export const FEED_LIMIT_MOBILE = 4;

export type Scope = 'intern' | 'international';

export const SCOPE_LABELS: Record<Scope, string> = {
  intern: 'Intern',
  international: 'Internațional',
};

/**
 * Whether the request crosses a border.
 *
 * Country codes arrive from the database, where they are stored as typed;
 * comparing them case-insensitively costs nothing and means a row saved as
 * "ro" never reads as an international move.
 */
export function scopeOf(fromCountry: string, toCountry: string): Scope {
  return fromCountry.trim().toUpperCase() === toCountry.trim().toUpperCase()
    ? 'intern'
    : 'international';
}

/**
 * Below these, the homepage shows neither.
 *
 * Three published requests are not a statistic and a grid with two cards in
 * it looks like a site nobody uses — so the thresholds are a claim about
 * honesty rather than a layout preference, and they live in the database
 * where the team can move them.
 */
export function showStats(stats: ActivityStats | null, t: ActivityThresholds): boolean {
  return stats !== null && stats.publishedTotal >= t.statsMinRequests;
}

/** One row of `category_counts()`: a real count, never a rounded one. */
export interface CategoryCount {
  category: CargoCategory;
  label: string;
  requests: number;
}

/**
 * Whether the category counters may be shown at all.
 *
 * The same threshold the figures use, and for the same reason: „Rulote:
 * 1" is not a statistic, it is a single row of the board reprinted as a
 * headline. Below it the block is absent entirely rather than showing
 * zeroes — `category_counts()` never returns a zero, so a short list is
 * what „nothing in that category" looks like, and a short list under a
 * confident heading reads as a site nobody uses.
 */
export function showCategories(
  stats: ActivityStats | null,
  categories: readonly CategoryCount[],
  t: ActivityThresholds,
): boolean {
  return showStats(stats, t) && categories.length > 0;
}

export function showFeed(
  stats: ActivityStats | null,
  requests: PublicRequest[],
  t: ActivityThresholds,
): boolean {
  return stats !== null && stats.activeTotal >= t.feedMinRequests && requests.length > 0;
}

/** "~2.970 km". The tilde is load-bearing: this is a straight line, not a route. */
export function formatKm(km: number | null): string | null {
  if (km === null || !Number.isFinite(km) || km <= 0) return null;
  return `~${formatNumber(Math.round(km))} km`;
}

/** Romanian groups thousands with a full stop: 12.480. */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 }).format(value);
}

/**
 * "Opel Combo, 2019", and whatever is left when some of that is missing.
 *
 * A person filling in the form may know the make and nothing else, so every
 * combination has to read like a sentence rather than like a gap.
 */
export function vehicleLine(request: PublicRequest): string | null {
  const name = [request.make, request.model].filter(Boolean).join(' ').trim();
  if (name !== '' && request.year !== null) return `${name}, ${request.year}`;
  if (name !== '') return name;
  if (request.year !== null) return String(request.year);
  return null;
}

/**
 * Romanian plurals: one takes the singular, two to nineteen the plural, and
 * twenty upwards the plural with "de" — două ore, but douăzeci de ore.
 *
 * The article at one has to be told, not guessed. Romanian nouns carry
 * gender that no rule recovers from the word: "o oră" but "un vehicul", and
 * a helper that assumes one of them writes "o vehicul" on a dashboard. The
 * default is feminine because most of what this application counts —
 * cereri, ore, zile, firme — is.
 */
export function pluralRo(
  n: number,
  one: string,
  many: string,
  article: 'o' | 'un' = 'o',
): string {
  if (n === 1) return `${article} ${one}`;
  const lastTwo = Math.abs(n) % 100;
  return lastTwo >= 1 && lastTwo <= 19 ? `${n} ${many}` : `${n} de ${many}`;
}

/**
 * "acum 6 min".
 *
 * `now` is a parameter so the server and the browser can be asked the same
 * question and the test can ask it without waiting. Anything in the future
 * — a clock a few seconds out — reads as "chiar acum" rather than as a
 * negative number.
 */
export function relativeTimeRo(publishedAt: string, now: Date = new Date()): string {
  const then = new Date(publishedAt).getTime();
  if (Number.isNaN(then)) return '';

  const seconds = Math.floor((now.getTime() - then) / 1000);
  if (seconds < 45) return 'chiar acum';

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `acum ${Math.max(minutes, 1)} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `acum ${pluralRo(hours, 'oră', 'ore')}`;

  const days = Math.floor(hours / 24);
  if (days < 30) return `acum ${pluralRo(days, 'zi', 'zile')}`;

  return `acum ${pluralRo(Math.floor(days / 30), 'lună', 'luni')}`;
}

/** True when the newest row on the server is not the newest row on screen. */
export function hasNewer(shown: PublicRequest[], fetched: PublicRequest[]): boolean {
  const newest = fetched[0];
  if (!newest) return false;
  const current = shown[0];
  if (!current) return true;
  return newest.id !== current.id;
}
