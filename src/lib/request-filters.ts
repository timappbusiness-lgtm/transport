import { cityFromValue, cityValue, type City } from './cities';
import { CARGO_CATEGORIES, type CargoCategory } from './departures';
import { DEFAULT_RADIUS_KM, MAX_RADIUS_KM } from './radius';
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

/** The heaviest thing this marketplace moves, from the publish form. */
const MAX_FILTER_WEIGHT_KG = 20000;

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
  /**
   * „Doar cele potrivite cu firma mea".
   *
   * Applied after the query rather than inside it: what a firm carries
   * is coverage, categories, equipment and the detour its own published
   * routes allow, and none of those are columns on the board view. The
   * rule is `src/lib/matching.ts`, the same one the dashboard and the
   * alert e-mails use.
   */
  mine: boolean;
  /**
   * „Lângă" — the locality a radius is measured from.
   *
   * A known city from `cities.ts`, because the radius needs coordinates
   * and only a known city has them. Somebody who types a town that is
   * not on the list gets no radius rather than a silent full board.
   */
  near: City | null;
  /** Kilometres from `near`. Meaningless, and null, without one. */
  radiusKm: number | null;
  /**
   * The heaviest vehicle the carrier will take, in kilograms.
   *
   * Requests with no weight written down stay in the list. The field is
   * optional on the publish form, so excluding them would hide most of
   * the board from anyone who used this filter at all — and the weight,
   * or its absence, is on every card.
   */
  maxWeightKg: number | null;
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
  mine: false,
  near: null,
  radiusKm: null,
  maxWeightKg: null,
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
  mine: 'doar',
  near: 'langa',
  radiusKm: 'raza',
  maxWeightKg: 'greutate',
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

/** A whole number inside a range, or nothing. */
function bounded(value: string | null, min: number, max: number): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}

/**
 * Who is looking changes one default, and only one.
 *
 * A carrier opens the board to see what it can take, so for a carrier
 * „Potrivite cu firma mea" is the view with nothing in the address, and
 * „Toate cererile" is the one that says so (`doar=toate`). For everybody
 * else it is the other way round, as it always was (`doar=firma`). Either
 * way the address says what is on the screen once it differs from what
 * that person gets by default, so a link, a refresh and the way back from
 * a request all land on the same view.
 */
export interface RequestFilterOptions {
  mineByDefault?: boolean;
}

/** The value `doar` takes to ask for everything on a board whose default is narrowed. */
export const MINE_ALL = 'toate';
const MINE_COMPANY = 'firma';

export function parseRequestFilters(
  params: SearchParams,
  options: RequestFilterOptions = {},
): RequestFilters {
  const rawTab = one(params, REQUEST_FILTER_KEYS.tab);
  const rawCategory = one(params, REQUEST_FILTER_KEYS.category);
  const rawCondition = one(params, REQUEST_FILTER_KEYS.condition);
  const rawScope = one(params, REQUEST_FILTER_KEYS.scope);

  const dateFrom = isoDate(one(params, REQUEST_FILTER_KEYS.dateFrom));
  let dateTo = isoDate(one(params, REQUEST_FILTER_KEYS.dateTo));
  // A window that runs backwards is a typo, not a filter; drop the end
  // rather than returning nothing and looking broken.
  if (dateFrom && dateTo && dateTo < dateFrom) dateTo = null;

  // The two travel together. A radius with no centre cannot be applied,
  // and a centre with no radius is somebody who picked a town and left
  // the distance alone — that is the default distance, not no filter.
  const near = cityFromValue(one(params, REQUEST_FILTER_KEYS.near));
  const radiusKm =
    near === null
      ? null
      : (bounded(one(params, REQUEST_FILTER_KEYS.radiusKm), 1, MAX_RADIUS_KM) ??
        DEFAULT_RADIUS_KM);

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
    mine: parseMine(one(params, REQUEST_FILTER_KEYS.mine), options.mineByDefault === true),
    near,
    radiusKm,
    maxWeightKg: bounded(one(params, REQUEST_FILTER_KEYS.maxWeightKg), 1, MAX_FILTER_WEIGHT_KG),
  };
}

function parseMine(raw: string | null, byDefault: boolean): boolean {
  if (raw === MINE_COMPANY) return true;
  if (raw === MINE_ALL) return false;
  return byDefault;
}

/** Back to a query string, dropping everything left at its default. */
export function requestFiltersToQuery(
  filters: RequestFilters,
  options: RequestFilterOptions = {},
): string {
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
  const mineByDefault = options.mineByDefault === true;
  if (filters.mine && !mineByDefault) query.set(REQUEST_FILTER_KEYS.mine, MINE_COMPANY);
  if (!filters.mine && mineByDefault) query.set(REQUEST_FILTER_KEYS.mine, MINE_ALL);
  if (filters.near) {
    query.set(REQUEST_FILTER_KEYS.near, cityValue(filters.near));
    query.set(REQUEST_FILTER_KEYS.radiusKm, String(filters.radiusKm ?? DEFAULT_RADIUS_KM));
  }
  if (filters.maxWeightKg !== null) {
    query.set(REQUEST_FILTER_KEYS.maxWeightKg, String(filters.maxWeightKg));
  }
  const text = query.toString();
  return text === '' ? '' : `?${text}`;
}

/** True when the visitor has narrowed anything at all. */
export function hasActiveRequestFilters(
  filters: RequestFilters,
  options: RequestFilterOptions = {},
): boolean {
  return requestFiltersToQuery({ ...filters, tab: 'toate' }, options) !== '';
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
