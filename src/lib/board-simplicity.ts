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
 * screen, they are still in the URL under the same keys, and an old link
 * still applies them and opens the panel so a person can see why the
 * board looks the way it does.
 *
 * The lists below are the single definition of that split. The panel's
 * count badge, the „should it start open" decision and the tests all
 * read them, so a filter added to one board cannot quietly end up
 * counted on neither side.
 */

/** The three a dispatcher answers without thinking. */
export const SIMPLE_REQUEST_KEYS = [
  'fromCountry',
  'fromCity',
  'toCountry',
  'toCity',
  'category',
] as const satisfies readonly (keyof RequestFilters)[];

export const SIMPLE_DEPARTURE_KEYS = [
  'fromCountry',
  'fromCounty',
  'toCountry',
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
  'near',
  'radiusKm',
  'dateFrom',
  'dateTo',
  'service',
  'condition',
  'scope',
  'maxWeightKg',
  'mine',
] as const satisfies readonly (keyof RequestFilters)[];

export const ADVANCED_DEPARTURE_KEYS = [
  'tab',
  'near',
  'radiusKm',
  'dateFrom',
  'dateTo',
  'minSeats',
  'scope',
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
 * Drives the badge on „Mai multe filtre" and, when it is above zero, the
 * decision to open the panel on load. A person arriving on a link
 * somebody sent them sees which extra filters are narrowing the board
 * rather than wondering why it is nearly empty.
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
