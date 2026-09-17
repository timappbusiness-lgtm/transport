import { FILTERABLE_CATEGORIES, type CargoCategory, type Direction } from './departures';

/**
 * The board's filters live in the URL and nowhere else.
 *
 * That is what makes a search shareable, bookmarkable and — the reason it
 * matters here — storable as a saved search: the same object that drives the
 * query is the one written into `saved_searches.filters`.
 *
 * Everything is parsed defensively. These values arrive from a query string,
 * which is to say from anyone.
 */

export type Tab = 'toate' | 'tur' | 'retur';

/**
 * Whether the route stays inside one country.
 *
 * The definition lives in the database, as `is_domestic` on
 * `v_departures_public`, so the board and a company profile cannot end up
 * meaning different things by "intern".
 */
export type ScopeFilter = 'intern' | 'international';

export interface DepartureFilters {
  tab: Tab;
  fromCountry: string | null;
  fromCounty: string | null;
  toCountry: string | null;
  toCounty: string | null;
  /** Inclusive, ISO `YYYY-MM-DD`. */
  dateFrom: string | null;
  dateTo: string | null;
  minSeats: number | null;
  vehicleType: CargoCategory | null;
  scope: ScopeFilter | null;
}

export const EMPTY_FILTERS: DepartureFilters = {
  tab: 'toate',
  fromCountry: null,
  fromCounty: null,
  toCountry: null,
  toCounty: null,
  dateFrom: null,
  dateTo: null,
  minSeats: null,
  vehicleType: null,
  scope: null,
};

/** Query keys, Romanian so a shared link reads like the site. */
export const FILTER_KEYS = {
  tab: 'directie',
  fromCountry: 'tara-plecare',
  fromCounty: 'judet-plecare',
  toCountry: 'tara-sosire',
  toCounty: 'judet-sosire',
  dateFrom: 'de-la',
  dateTo: 'pana-la',
  minSeats: 'locuri',
  vehicleType: 'vehicul',
  scope: 'acoperire',
} as const;

type SearchParams = Record<string, string | string[] | undefined>;

function one(params: SearchParams, key: string): string | null {
  const value = params[key];
  const text = Array.isArray(value) ? value[0] : value;
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  return trimmed === '' ? null : trimmed;
}

/** Two upper-case letters, or nothing. Keeps a junk value out of the query. */
function countryCode(value: string | null): string | null {
  if (value === null) return null;
  const upper = value.toUpperCase();
  return /^[A-Z]{2}$/.test(upper) ? upper : null;
}

function isoDate(value: string | null): string | null {
  if (value === null || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  // Rejects 2026-02-31, which matches the shape but is not a date.
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || !date.toISOString().startsWith(value) ? null : value;
}

function isTab(value: string | null): value is Tab {
  return value === 'tur' || value === 'retur' || value === 'toate';
}

function isScope(value: string | null): value is ScopeFilter {
  return value === 'intern' || value === 'international';
}

function isCategory(value: string | null): value is CargoCategory {
  return value !== null && (FILTERABLE_CATEGORIES as readonly string[]).includes(value);
}

/** A county name, trimmed and length-capped; anything longer is not one. */
function county(value: string | null): string | null {
  if (value === null) return null;
  return value.length > 60 ? null : value;
}

export function parseFilters(params: SearchParams): DepartureFilters {
  const rawTab = one(params, FILTER_KEYS.tab);
  const seats = Number(one(params, FILTER_KEYS.minSeats) ?? '');

  const dateFrom = isoDate(one(params, FILTER_KEYS.dateFrom));
  let dateTo = isoDate(one(params, FILTER_KEYS.dateTo));
  // A window that runs backwards is a typo, not a filter; drop the end
  // rather than returning nothing and looking broken.
  if (dateFrom && dateTo && dateTo < dateFrom) dateTo = null;

  return {
    tab: isTab(rawTab) ? rawTab : 'toate',
    fromCountry: countryCode(one(params, FILTER_KEYS.fromCountry)),
    fromCounty: county(one(params, FILTER_KEYS.fromCounty)),
    toCountry: countryCode(one(params, FILTER_KEYS.toCountry)),
    toCounty: county(one(params, FILTER_KEYS.toCounty)),
    dateFrom,
    dateTo,
    minSeats: Number.isInteger(seats) && seats > 0 && seats <= 8 ? seats : null,
    vehicleType: isCategory(one(params, FILTER_KEYS.vehicleType))
      ? (one(params, FILTER_KEYS.vehicleType) as CargoCategory)
      : null,
    scope: isScope(one(params, FILTER_KEYS.scope)) ? one(params, FILTER_KEYS.scope) as ScopeFilter : null,
  };
}

/** Back to a query string, dropping everything left at its default. */
export function filtersToQuery(filters: DepartureFilters): string {
  const query = new URLSearchParams();
  if (filters.tab !== 'toate') query.set(FILTER_KEYS.tab, filters.tab);
  if (filters.fromCountry) query.set(FILTER_KEYS.fromCountry, filters.fromCountry);
  if (filters.fromCounty) query.set(FILTER_KEYS.fromCounty, filters.fromCounty);
  if (filters.toCountry) query.set(FILTER_KEYS.toCountry, filters.toCountry);
  if (filters.toCounty) query.set(FILTER_KEYS.toCounty, filters.toCounty);
  if (filters.dateFrom) query.set(FILTER_KEYS.dateFrom, filters.dateFrom);
  if (filters.dateTo) query.set(FILTER_KEYS.dateTo, filters.dateTo);
  if (filters.minSeats !== null) query.set(FILTER_KEYS.minSeats, String(filters.minSeats));
  if (filters.vehicleType) query.set(FILTER_KEYS.vehicleType, filters.vehicleType);
  if (filters.scope) query.set(FILTER_KEYS.scope, filters.scope);
  const text = query.toString();
  return text === '' ? '' : `?${text}`;
}

/** True when the visitor has narrowed anything at all. */
export function hasActiveFilters(filters: DepartureFilters): boolean {
  return filtersToQuery({ ...filters, tab: 'toate' }) !== '';
}

/** The direction a tab selects, or null for "everything". */
export function tabDirection(tab: Tab): Direction | null {
  return tab === 'toate' ? null : tab;
}

/** What a saved search stores: the filters, without the tab-as-navigation. */
export function filtersForSavedSearch(filters: DepartureFilters): Record<string, string> {
  const query = new URLSearchParams(filtersToQuery(filters).replace(/^\?/, ''));
  return Object.fromEntries(query.entries());
}
