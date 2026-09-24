import type { DepartureFilters } from './departure-filters';
import type { RequestFilters } from './request-filters';

/**
 * Which filters a dispatcher sees without asking, and which wait.
 *
 * A transport professional reviewed the boards and said the parts were
 * hard to connect. The measurement agreed: `/cereri` put thirteen form
 * fields on screen, twelve of them above the fold, under 461 words. The
 * competitor shows three filters and big cards, and a person sees value
 * before being asked anything.
 *
 * So: three filters stay — where from, where to, what kind of vehicle —
 * and everything else collapses behind one click. Nothing is removed.
 * The advanced panel holds exactly the filters that used to be on
 * screen, and they are still in the URL under the same keys. The panel
 * is closed on every first paint (`filter-disclosure.ts`); an old link
 * that applies advanced filters says so with the count on the button
 * and a chip for each, not by opening.
 *
 * The lists below are the single definition of that split. The count,
 * the chips (`filter-chips.ts`) and the tests all read them, so a filter
 * added to one board cannot quietly end up counted on neither side.
 */

/** The three a dispatcher answers without thinking. */
export const SIMPLE_REQUEST_KEYS = [
  'fromCity',
  'toCity',
  'category',
] as const satisfies readonly (keyof RequestFilters)[];

export const SIMPLE_DEPARTURE_KEYS = [
  'fromCounty',
  'toCounty',
  'vehicleType',
] as const satisfies readonly (keyof DepartureFilters)[];

/**
 * Everything else, in the order the panel shows it.
 *
 * `tab` is in here too. It was a strip of three links above the board —
 * „Toate / De la firme / De la persoane fizice" — which is a fourth
 * control competing with the three that matter, and most dispatchers
 * never touched it. It is a filter; it lives with the filters.
 */
export const ADVANCED_REQUEST_KEYS = [
  'tab',
  'service',
  'fromCountry',
  'toCountry',
  'dateFrom',
  'dateTo',
  'condition',
  'scope',
  'near',
  'radiusKm',
  'maxWeightKg',
] as const satisfies readonly (keyof RequestFilters)[];

/**
 * Neither simple nor advanced: `mine`, „Potrivite cu firma mea", is the
 * view switch above a carrier's list, not a field in the panel. It was
 * counted as an advanced filter, so a carrier's board — which opens on
 * that view — showed „Mai multe filtre 1" and spread the panel open on
 * every visit, over a panel with no control for it.
 */
export const REQUEST_VIEW_KEYS = ['mine'] as const satisfies readonly (keyof RequestFilters)[];

export const ADVANCED_DEPARTURE_KEYS = [
  'tab',
  'minSeats',
  'fromCountry',
  'toCountry',
  'dateFrom',
  'dateTo',
  'scope',
  'near',
  'radiusKm',
  'minCapacityKg',
] as const satisfies readonly (keyof DepartureFilters)[];

/** Set, absent or at its default — the question the badge answers. */
function isSet(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (value === false) return false;
  if (value === '') return false;
  // `tab` defaults to „toate", which is no filter at all.
  if (value === 'toate') return false;
  return true;
}

/**
 * How many advanced filters are doing something.
 *
 * The number on „Mai multe filtre", and the number of chips under the
 * main fields (`filter-chips.ts`; a test holds the two equal). It never
 * opens the panel: a person arriving on a link somebody sent them sees
 * the count and the chips, and the panel stays closed.
 *
 * `near` and `radiusKm` count as one: a radius without a locality does
 * nothing and the pair is always set together.
 */
export function countAdvanced(
  filters: Record<string, unknown>,
  keys: readonly string[],
): number {
  let n = 0;
  let countedRadius = false;
  for (const key of keys) {
    if (key === 'near' || key === 'radiusKm') {
      if (!countedRadius && isSet(filters.near)) {
        n += 1;
        countedRadius = true;
      }
      continue;
    }
    if (isSet(filters[key])) n += 1;
  }
  return n;
}

export const countAdvancedRequestFilters = (f: RequestFilters): number =>
  countAdvanced(f as unknown as Record<string, unknown>, ADVANCED_REQUEST_KEYS);

export const countAdvancedDepartureFilters = (f: DepartureFilters): number =>
  countAdvanced(f as unknown as Record<string, unknown>, ADVANCED_DEPARTURE_KEYS);

// ---------------------------------------------------------------------
// Sort
// ---------------------------------------------------------------------

/**
 * Three options per board, and no more.
 *
 * „Cele mai noi" is the default on both, because a board people check
 * twice a day is a feed: what changed since last time is the whole
 * question. The second is the same idea on both — the soonest date.
 *
 * The third differs, and honestly. A request carries an estimated
 * distance, so „cele mai lungi" is a real thing to sort by; a route
 * carries free seats and no distance at all, so it offers those
 * instead. Naming the routes option „distanță" to make the two boards
 * match would be a label for a number that does not exist.
 */
export const REQUEST_SORTS = ['noi', 'incarcare', 'distanta'] as const;
export const DEPARTURE_SORTS = ['noi', 'incarcare', 'locuri'] as const;

export const BOARD_SORTS = ['noi', 'incarcare', 'distanta', 'locuri'] as const;
export type BoardSort = (typeof BOARD_SORTS)[number];

export const BOARD_SORT_LABELS: Record<BoardSort, string> = {
  noi: 'Cele mai noi',
  incarcare: 'Încărcare apropiată',
  distanta: 'Distanță mare',
  locuri: 'Multe locuri libere',
};

export const DEFAULT_BOARD_SORT: BoardSort = 'noi';

/** The URL key, Romanian like the rest of them. */
export const SORT_KEY = 'ordine';

/**
 * Parse against the list the board actually offers.
 *
 * A value from another board — or from anywhere, this comes out of a
 * query string — falls back to the default rather than sorting by a key
 * the page has no column for.
 */
export function parseSort(
  raw: string | null | undefined,
  allowed: readonly BoardSort[] = BOARD_SORTS,
): BoardSort {
  return allowed.includes(raw as BoardSort) ? (raw as BoardSort) : DEFAULT_BOARD_SORT;
}
