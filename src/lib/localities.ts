/**
 * What the locality picker needs, without a database.
 *
 * The search itself is `search_localities()` in Postgres — 2.750 rows
 * with an index, answering in well under the 150 ms the picker allows
 * itself. Nothing here downloads a list: that would be 200 KB on every
 * visit, on a phone, to find one town.
 *
 * This file is the shape of a result, the grouping, and the two numbers
 * the input behaves by. All of it is pure, so `tests/unit/localities.
 * test.ts` can check it without a browser or a server.
 */

/** How a row matched, in the order the ranking trusts them. */
export type MatchKind = 'exact' | 'alias' | 'prefix' | 'word' | 'contains' | 'fuzzy';

export const MATCH_ORDER: readonly MatchKind[] = [
  'exact',
  'alias',
  'prefix',
  'word',
  'contains',
  'fuzzy',
];

export interface Locality {
  id: string;
  name: string;
  /** Județ in Romania, the country elsewhere — see the import script. */
  region: string;
  country: string;
  lat: number;
  lng: number;
  population: number | null;
  is_county_seat: boolean;
  match_kind: MatchKind;
}

/**
 * Two characters before anything is asked of the server.
 *
 * One letter matches a tenth of the gazetteer and tells nobody anything;
 * it is also the keystroke people pass through on their way to typing a
 * name, so asking on it is a request nobody wanted.
 */
export const MIN_QUERY_LENGTH = 2;

/**
 * 150 ms of quiet before asking.
 *
 * Short enough that the list feels like it is keeping up, long enough
 * that typing „Timișoara" is one request rather than nine.
 */
export const SEARCH_DEBOUNCE_MS = 150;

/** At most this many suggestions: a list you scroll is a list you ignore. */
export const SUGGESTION_LIMIT = 8;

export type Group = 'ro' | 'international';

export const GROUP_LABELS: Record<Group, string> = {
  ro: 'România',
  international: 'Internațional',
};

export function groupOf(locality: Locality): Group {
  return locality.country === 'RO' ? 'ro' : 'international';
}

/**
 * Romania first, then everything else, each group keeping the order the
 * server returned — that order is the ranking, and re-sorting here would
 * quietly throw it away.
 *
 * Empty groups are dropped rather than rendered as a heading with
 * nothing under it.
 */
export function groupSuggestions(
  localities: readonly Locality[],
): { group: Group; items: Locality[] }[] {
  const order: Group[] = ['ro', 'international'];
  return order
    .map((group) => ({ group, items: localities.filter((l) => groupOf(l) === group) }))
    .filter((section) => section.items.length > 0);
}

/**
 * The second line of a suggestion: „Timiș" at home, „Germania" abroad.
 *
 * The country code is a separate badge, so it is not repeated here.
 */
export function subtitleOf(locality: Locality): string {
  return locality.region;
}

/** Whether the query is worth sending. */
export function shouldSearch(query: string): boolean {
  return query.trim().length >= MIN_QUERY_LENGTH;
}

/**
 * How a chosen locality is written into a form field.
 *
 * The listing stores a city name as text, which is what the board shows
 * and what the coordinate trigger looks up. The country travels beside
 * it in its own field.
 */
export function toFieldValue(locality: Locality): { city: string; country: string } {
  return { city: locality.name, country: locality.country };
}
