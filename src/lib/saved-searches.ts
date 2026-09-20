import { CARGO_CATEGORY_LABELS, type CargoCategory } from './departures';
import { COUNTRY_OPTIONS } from './vehicles';
import { countyName } from './counties';
import type { Database } from './supabase/database.types';

/**
 * A saved search, and the sentence that describes it.
 *
 * The criteria live in the URL when somebody is browsing and in a jsonb
 * column when they save it, which means the same six keys in both places
 * — see `REQUEST_FILTER_KEYS`. What this file adds is the reading: a
 * person looking at a list of five saved searches needs to tell them
 * apart at a glance, and `{"from_country":"DE","category":"autoturism"}`
 * is not a glance.
 *
 * Free of React and of the database, so the description a list shows and
 * the description a confirmation dialog shows cannot disagree.
 */

export type AlertFrequency = Database['public']['Enums']['alert_frequency'];

/** The filter keys a saved search stores. The board writes the same names. */
export interface SearchFilters {
  from_country?: string;
  from_county?: string;
  to_country?: string;
  to_county?: string;
  category?: string;
  condition?: string;
  service?: string;
  scope?: string;
}

export interface SavedSearch {
  id: string;
  name: string;
  target: string;
  filters: SearchFilters;
  frequency: AlertFrequency;
  notify_email: boolean;
  is_active: boolean;
  created_at: string;
  last_digest_at: string | null;
  last_notified_at: string | null;
}

export interface SearchActivity {
  saved_search_id: string;
  matches: number;
  last_match_at: string | null;
}

const COUNTRY_NAMES = new Map(COUNTRY_OPTIONS.map((c) => [c.code, c.name]));

function country(code: string | undefined): string | null {
  if (code === undefined || code === '') return null;
  return COUNTRY_NAMES.get(code.toUpperCase()) ?? code.toUpperCase();
}

/**
 * The criteria as a person would say them.
 *
 * Returns the parts rather than one string, so a list can show them as
 * chips and a sentence can join them. Order is the order somebody thinks
 * in: where from, where to, what, in what state, how.
 */
export function describeFilters(filters: SearchFilters): string[] {
  const parts: string[] = [];

  const from = country(filters.from_country);
  const fromCounty = filters.from_county ? countyName(filters.from_county) : null;
  if (from !== null || fromCounty !== null) {
    parts.push(`Din ${[fromCounty, from].filter(Boolean).join(', ')}`);
  }

  const to = country(filters.to_country);
  const toCounty = filters.to_county ? countyName(filters.to_county) : null;
  if (to !== null || toCounty !== null) {
    parts.push(`Către ${[toCounty, to].filter(Boolean).join(', ')}`);
  }

  if (filters.category !== undefined && filters.category !== '') {
    parts.push(
      CARGO_CATEGORY_LABELS[filters.category as CargoCategory] ?? filters.category,
    );
  }

  if (filters.condition === 'ruleaza') parts.push('Doar cele care pornesc');
  if (filters.condition === 'nu-ruleaza') parts.push('Doar cele care nu pornesc');

  if (filters.service === 'expres') parts.push('Expres');
  if (filters.service === 'pe_sens') parts.push('Pe sens');

  if (filters.scope === 'intern') parts.push('Doar intern');
  if (filters.scope === 'international') parts.push('Doar internațional');

  return parts;
}

/** What a search with no criteria at all is: everything on the board. */
export const EVERYTHING = 'Toate cererile de pe panou';

export function describeSearch(filters: SearchFilters): string {
  const parts = describeFilters(filters);
  return parts.length === 0 ? EVERYTHING : parts.join(' · ');
}

export const FREQUENCY_LABELS: Record<AlertFrequency, string> = {
  immediate: 'Imediat, la fiecare potrivire',
  daily: 'O dată pe zi, grupat',
};

export const FREQUENCY_HINTS: Record<AlertFrequency, string> = {
  immediate: 'Un e-mail pentru fiecare cerere care se potrivește.',
  daily: 'Un singur e-mail dimineața, cu tot ce a apărut.',
};

/**
 * Turning the board's current filters into what `save_search` stores.
 *
 * Only the keys that are actually set: an empty string in the jsonb would
 * be read by the matcher as „must equal empty", which matches nothing.
 */
export function filtersFromBoard(params: Record<string, string | null>): SearchFilters {
  const out: SearchFilters = {};
  const put = (key: keyof SearchFilters, value: string | null) => {
    if (value !== null && value.trim() !== '') out[key] = value.trim();
  };
  put('from_country', params.fromCountry ?? null);
  put('from_county', params.fromCounty ?? null);
  put('to_country', params.toCountry ?? null);
  put('to_county', params.toCounty ?? null);
  put('category', params.category ?? null);
  put('condition', params.condition ?? null);
  put('service', params.service ?? null);
  put('scope', params.scope ?? null);
  return out;
}

/**
 * A name somebody has not typed yet.
 *
 * Built from the criteria, because „Căutarea 3" tells nobody anything and
 * an empty box is one more thing to fill in before the thing they wanted.
 */
export function suggestName(filters: SearchFilters): string {
  const parts = describeFilters(filters);
  if (parts.length === 0) return 'Toate cererile';
  return parts.slice(0, 2).join(' · ').slice(0, 60);
}

export interface QuotaState {
  used: number;
  /** Null is unlimited, as everywhere else in `plans`. */
  allowed: number | null;
  planName: string;
}

export function quotaReached(quota: QuotaState): boolean {
  return quota.allowed !== null && quota.used >= quota.allowed;
}

export function quotaMessage(quota: QuotaState): string | null {
  if (!quotaReached(quota)) return null;
  return quota.allowed === 1
    ? `Planul ${quota.planName} permite o singură căutare salvată.`
    : `Ai folosit toate cele ${quota.allowed} căutări salvate ale planului ${quota.planName}.`;
}
