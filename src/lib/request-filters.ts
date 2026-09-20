import { CARGO_CATEGORIES, type CargoCategory } from './departures';
import type { ListingBoard } from './requests';
import type { Database } from './supabase/database.types';

/**
 * The request board's filters, in the URL and nowhere else.
 *
 * Same shape and the same reasoning as `departure-filters.ts`: a search is
 * shareable and bookmarkable only if it is in the address bar, and the
 * object that drives the query is the one a saved search will store.
 *
 * Everything is parsed defensively. These values arrive from a query
 * string, which is to say from anyone.
 */

/** Who posted it. `curse` is a firm, `retur` a private person. */
export type Tab = 'toate' | 'curse' | 'retur';

/**
 * What the carrier has to bring.
 *
 * `needs_winch` is derived in the database from the condition flags, so
 * "nu pornește" here means exactly what it means on the card and in the
 * price — there is no second definition in the frontend.
 */
export type ConditionFilter = 'ruleaza' | 'nu-ruleaza';

/** Whether the move crosses a border. Computed as `is_domestic` in the view. */
export type ScopeFilter = 'intern' | 'international';

/**
 * How the job is run, which is the price.
 *
 * `pe_sens` waits for the platform to fill and is the cheap one;
 * `expres` is a dedicated departure. The distinction has been on the
 * card since the schema was written and could not be filtered on, which
 * made it decoration. A carrier who only runs express wants to see only
 * those, and a client choosing express wants to know somebody does.
 *
 * `tractare` stays out of the filter for the same reason it stays out of
 * the form: the product spec hides it at launch.
 */
export type ServiceFilter = Extract<
  Database['public']['Enums']['service_type'],
  'pe_sens' | 'expres'
>;

export interface RequestFilters {
  tab: Tab;
  fromCountry: string | null;
  fromCity: string | null;
  toCountry: string | null;
  toCity: string | null;
  /** Inclusive, ISO `YYYY-MM-DD`, matched against the loading window. */
  dateFrom: string | null;
  dateTo: string | null;
  category: CargoCategory | null;
  condition: ConditionFilter | null;
  scope: ScopeFilter | null;
  service: ServiceFilter | null;
}

export const EMPTY_REQUEST_FILTERS: RequestFilters = {
  tab: 'toate',
  fromCountry: null,
  fromCity: null,
  toCountry: null,
  toCity: null,
  dateFrom: null,
  dateTo: null,
  category: null,
  condition: null,
  scope: null,
  service: null,
};

/** Query keys, Romanian so a shared link reads like the site. */
export const REQUEST_FILTER_KEYS = {
  tab: 'cine',
  fromCountry: 'tara-plecare',
  fromCity: 'oras-plecare',
  toCountry: 'tara-sosire',
  toCity: 'oras-sosire',
  dateFrom: 'de-la',
  dateTo: 'pana-la',
  category: 'categorie',
  condition: 'stare',
  scope: 'acoperire',
  service: 'serviciu',
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

/** A locality name, trimmed and length-capped; anything longer is not one. */
function city(value: string | null): string | null {
  if (value === null) return null;
  return value.length > 60 ? null : value;
}

function isTab(value: string | null): value is Tab {
  return value === 'toate' || value === 'curse' || value === 'retur';
}

function isCondition(value: string | null): value is ConditionFilter {
  return value === 'ruleaza' || value === 'nu-ruleaza';
}

function isScope(value: string | null): value is ScopeFilter {
  return value === 'intern' || value === 'international';
}

/**
 * Every category the schema has, not the six the filter used to offer.
 *
 * A board that accepts fourteen kinds of vehicle and lets you filter on
 * six is a board where the other eight are unfindable — which for a
 * caravan or a tractor is the whole search.
 */
function isCategory(value: string | null): value is CargoCategory {
  return value !== null && (CARGO_CATEGORIES as readonly string[]).includes(value);
}

function isService(value: string | null): value is ServiceFilter {
  return value === 'pe_sens' || value === 'expres';
}

export function parseRequestFilters(params: SearchParams): RequestFilters {
  const rawTab = one(params, REQUEST_FILTER_KEYS.tab);
  const rawCategory = one(params, REQUEST_FILTER_KEYS.category);
  const rawCondition = one(params, REQUEST_FILTER_KEYS.condition);
  const rawScope = one(params, REQUEST_FILTER_KEYS.scope);

  const dateFrom = isoDate(one(params, REQUEST_FILTER_KEYS.dateFrom));
  let dateTo = isoDate(one(params, REQUEST_FILTER_KEYS.dateTo));
  // A window that runs backwards is a typo, not a filter; drop the end
  // rather than returning nothing and looking broken.
  if (dateFrom && dateTo && dateTo < dateFrom) dateTo = null;

  return {
    tab: isTab(rawTab) ? rawTab : 'toate',
    fromCountry: countryCode(one(params, REQUEST_FILTER_KEYS.fromCountry)),
    fromCity: city(one(params, REQUEST_FILTER_KEYS.fromCity)),
    toCountry: countryCode(one(params, REQUEST_FILTER_KEYS.toCountry)),
    toCity: city(one(params, REQUEST_FILTER_KEYS.toCity)),
    dateFrom,
    dateTo,
    category: isCategory(rawCategory) ? rawCategory : null,
    condition: isCondition(rawCondition) ? rawCondition : null,
    scope: isScope(rawScope) ? rawScope : null,
    service: isService(one(params, REQUEST_FILTER_KEYS.service)) 
      ? (one(params, REQUEST_FILTER_KEYS.service) as ServiceFilter)
      : null,
  };
}

/** Back to a query string, dropping everything left at its default. */
export function requestFiltersToQuery(filters: RequestFilters): string {
  const query = new URLSearchParams();
  if (filters.tab !== 'toate') query.set(REQUEST_FILTER_KEYS.tab, filters.tab);
  if (filters.fromCountry) query.set(REQUEST_FILTER_KEYS.fromCountry, filters.fromCountry);
  if (filters.fromCity) query.set(REQUEST_FILTER_KEYS.fromCity, filters.fromCity);
  if (filters.toCountry) query.set(REQUEST_FILTER_KEYS.toCountry, filters.toCountry);
  if (filters.toCity) query.set(REQUEST_FILTER_KEYS.toCity, filters.toCity);
  if (filters.dateFrom) query.set(REQUEST_FILTER_KEYS.dateFrom, filters.dateFrom);
  if (filters.dateTo) query.set(REQUEST_FILTER_KEYS.dateTo, filters.dateTo);
  if (filters.category) query.set(REQUEST_FILTER_KEYS.category, filters.category);
  if (filters.condition) query.set(REQUEST_FILTER_KEYS.condition, filters.condition);
  if (filters.scope) query.set(REQUEST_FILTER_KEYS.scope, filters.scope);
  if (filters.service) query.set(REQUEST_FILTER_KEYS.service, filters.service);
  const text = query.toString();
  return text === '' ? '' : `?${text}`;
}

/** True when the visitor has narrowed anything at all. */
export function hasActiveRequestFilters(filters: RequestFilters): boolean {
  return requestFiltersToQuery({ ...filters, tab: 'toate' }) !== '';
}

/** The board a tab selects, or null for "everything". */
export function tabBoard(tab: Tab): ListingBoard | null {
  return tab === 'toate' ? null : tab;
}

/** What `condition` means to the query: a value for `is_running`, or nothing. */
export function conditionIsRunning(condition: ConditionFilter | null): boolean | null {
  if (condition === null) return null;
  return condition === 'ruleaza';
}
