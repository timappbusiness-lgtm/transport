import { describe, expect, it } from 'vitest';
import {
  ADVANCED_DEPARTURE_KEYS,
  ADVANCED_REQUEST_KEYS,
  BOARD_SORTS,
  BOARD_SORT_LABELS,
  DEFAULT_BOARD_SORT,
  DEPARTURE_SORTS,
  REQUEST_SORTS,
  REQUEST_VIEW_KEYS,
  SIMPLE_DEPARTURE_KEYS,
  SIMPLE_REQUEST_KEYS,
  SORT_KEY,
  countAdvancedDepartureFilters,
  countAdvancedRequestFilters,
  parseSort,
} from '@/lib/board-simplicity';
import { sortDepartures, sortRequests, type SortableDeparture } from '@/lib/board-sort';
import {
  EMPTY_REQUEST_FILTERS,
  REQUEST_FILTER_KEYS,
  parseRequestFilters,
} from '@/lib/request-filters';
import { EMPTY_FILTERS, FILTER_KEYS, parseFilters } from '@/lib/departure-filters';
import type { City } from '@/lib/cities';
import type { PublicRequest } from '@/lib/requests';

/**
 * The simple/advanced split, checked where it can break silently.
 *
 * Three filters on screen and ten behind a click only helps if the ten
 * still work, still come out of the URL under the keys they always had,
 * and still announce themselves when a link carries them. Each `it` here
 * is one of those three, plus the sort model.
 */

describe('every filter is on exactly one side of the split', () => {
  // The guard that matters: a filter added to a board and to neither list
  // would be invisible on screen, uncounted by the badge, and would not
  // open the panel — narrowing the board with nothing to say it does.
  it('on the requests board', () => {
    // `mine` is the view switch above a carrier's list: on neither side.
    const declared = [...SIMPLE_REQUEST_KEYS, ...ADVANCED_REQUEST_KEYS, ...REQUEST_VIEW_KEYS];
    expect([...declared].sort()).toEqual(Object.keys(EMPTY_REQUEST_FILTERS).sort());
    expect(new Set(declared).size).toBe(declared.length);
  });

  it('on the routes board', () => {
    const declared = [...SIMPLE_DEPARTURE_KEYS, ...ADVANCED_DEPARTURE_KEYS];
    expect([...declared].sort()).toEqual(Object.keys(EMPTY_FILTERS).sort());
    expect(new Set(declared).size).toBe(declared.length);
  });
});

describe('the count on „Mai multe filtre"', () => {
  it('counts nothing on an empty board', () => {
    expect(countAdvancedRequestFilters(EMPTY_REQUEST_FILTERS)).toBe(0);
    expect(countAdvancedDepartureFilters(EMPTY_FILTERS)).toBe(0);
  });

  it('counts nothing for the three that are on screen', () => {
    const filters = parseRequestFilters({
      [REQUEST_FILTER_KEYS.fromCity]: 'Cluj-Napoca',
      [REQUEST_FILTER_KEYS.toCity]: 'București',
      [REQUEST_FILTER_KEYS.category]: 'autoturism',
    });
    expect(filters.fromCity).toBe('Cluj-Napoca');
    expect(countAdvancedRequestFilters(filters)).toBe(0);
  });

  it('does not count a tab left on „toate", which is no filter at all', () => {
    expect(countAdvancedRequestFilters({ ...EMPTY_REQUEST_FILTERS, tab: 'toate' })).toBe(0);
    expect(countAdvancedRequestFilters({ ...EMPTY_REQUEST_FILTERS, tab: 'curse' })).toBe(1);
    expect(countAdvancedDepartureFilters({ ...EMPTY_FILTERS, tab: 'retur' })).toBe(1);
  });

  it('never counts „Potrivite cu firma mea", the view a carrier\'s board opens on', () => {
    // Regression: counted, it showed „Mai multe filtre 1" and opened the
    // panel on every carrier's every visit — over a panel with no control
    // for it. It is the switch above the list, not an advanced filter.
    expect(countAdvancedRequestFilters({ ...EMPTY_REQUEST_FILTERS, mine: false })).toBe(0);
    expect(countAdvancedRequestFilters({ ...EMPTY_REQUEST_FILTERS, mine: true })).toBe(0);
    const carrier = parseRequestFilters({}, { mineByDefault: true });
    expect(carrier.mine).toBe(true);
    expect(countAdvancedRequestFilters(carrier)).toBe(0);
  });

  it('counts the country pair, which lives inside the panel', () => {
    // Regression: the countries were declared „simple" but drawn inside
    // the panel, so a country set there was neither counted nor visible.
    expect(countAdvancedRequestFilters({ ...EMPTY_REQUEST_FILTERS, fromCountry: 'DE' })).toBe(1);
    expect(countAdvancedDepartureFilters({ ...EMPTY_FILTERS, toCountry: 'IT' })).toBe(1);
  });

  it('counts a locality and its radius as one thing, because they are', () => {
    const near: City = { name: 'Cluj-Napoca', region: 'Cluj', country: 'RO', lat: 46.7712, lng: 23.6236 };
    expect(countAdvancedRequestFilters({ ...EMPTY_REQUEST_FILTERS, near, radiusKm: 100 })).toBe(1);
    // A radius with no locality does nothing, and says nothing.
    expect(countAdvancedRequestFilters({ ...EMPTY_REQUEST_FILTERS, radiusKm: 100 })).toBe(0);
  });
});

describe('a link saved before the panel existed still works', () => {
  // The compatibility rule: the keys did not change, so an old URL parses
  // into the same filters. The panel stays closed; the count on its
  // button and a chip for each say what is narrowing the board.
  it('on the requests board', () => {
    const filters = parseRequestFilters({
      [REQUEST_FILTER_KEYS.tab]: 'curse',
      [REQUEST_FILTER_KEYS.fromCity]: 'Arad',
      [REQUEST_FILTER_KEYS.service]: 'expres',
      [REQUEST_FILTER_KEYS.condition]: 'nu-ruleaza',
      [REQUEST_FILTER_KEYS.scope]: 'international',
      [REQUEST_FILTER_KEYS.maxWeightKg]: '2500',
      [REQUEST_FILTER_KEYS.dateFrom]: '2026-10-01',
    });
    expect(filters.service).toBe('expres');
    expect(filters.condition).toBe('nu-ruleaza');
    expect(filters.maxWeightKg).toBe(2500);
    // tab, service, condition, scope, weight, dateFrom — the city is one
    // of the three on screen and is not counted.
    expect(countAdvancedRequestFilters(filters)).toBe(6);
  });

  it('on the routes board', () => {
    const filters = parseFilters({
      [FILTER_KEYS.tab]: 'retur',
      [FILTER_KEYS.toCounty]: 'Timiș',
      [FILTER_KEYS.minSeats]: '3',
      [FILTER_KEYS.minCapacityKg]: '1800',
      [FILTER_KEYS.dateTo]: '2026-10-20',
    });
    expect(filters.minSeats).toBe(3);
    expect(filters.minCapacityKg).toBe(1800);
    expect(countAdvancedDepartureFilters(filters)).toBe(4);
  });
});

describe('three sort options per board, and no more', () => {
  it('each board offers exactly three', () => {
    expect(REQUEST_SORTS).toHaveLength(3);
    expect(DEPARTURE_SORTS).toHaveLength(3);
  });

  it('both start on „cele mai noi"', () => {
    expect(REQUEST_SORTS[0]).toBe(DEFAULT_BOARD_SORT);
    expect(DEPARTURE_SORTS[0]).toBe(DEFAULT_BOARD_SORT);
  });

  it('every option a board offers has a label', () => {
    for (const sort of BOARD_SORTS) {
      expect(BOARD_SORT_LABELS[sort], sort).toBeTruthy();
    }
  });

  it('a board never accepts the other board’s option', () => {
    // „distanța" is a column requests have and routes do not. Accepting
    // it on /trasee would sort by a number that is not there.
    expect(parseSort('distanta', REQUEST_SORTS)).toBe('distanta');
    expect(parseSort('distanta', DEPARTURE_SORTS)).toBe('noi');
    expect(parseSort('locuri', DEPARTURE_SORTS)).toBe('locuri');
    expect(parseSort('locuri', REQUEST_SORTS)).toBe('noi');
  });

  it('and anything else out of a query string falls back to the default', () => {
    for (const raw of [null, undefined, '', 'pret', '../../etc/passwd', 'NOI']) {
      expect(parseSort(raw, REQUEST_SORTS), String(raw)).toBe('noi');
    }
  });

  it('under a key that reads like the rest of the URL', () => {
    expect(SORT_KEY).toBe('ordine');
  });
});

describe('the orders themselves', () => {
  const request = (over: Partial<PublicRequest>): PublicRequest =>
    ({
      id: over.id ?? 'x',
      published_at: '2026-09-01T00:00:00Z',
      loading_from: '2026-10-01',
      estimated_km: null,
      ...over,
    }) as PublicRequest;

  it('newest first, by publication date', () => {
    const rows = [
      request({ id: 'old', published_at: '2026-09-01T00:00:00Z' }),
      request({ id: 'new', published_at: '2026-09-20T00:00:00Z' }),
    ];
    expect(sortRequests(rows, 'noi').map((r) => r.id)).toEqual(['new', 'old']);
  });

  it('soonest loading first, newest breaking a tie', () => {
    const rows = [
      request({ id: 'tarziu', loading_from: '2026-12-01' }),
      request({
        id: 'curand-vechi',
        loading_from: '2026-09-25',
        published_at: '2026-09-01T00:00:00Z',
      }),
      request({
        id: 'curand-nou',
        loading_from: '2026-09-25',
        published_at: '2026-09-20T00:00:00Z',
      }),
    ];
    expect(sortRequests(rows, 'incarcare').map((r) => r.id)).toEqual([
      'curand-nou',
      'curand-vechi',
      'tarziu',
    ]);
  });

  it('longest distance first, with an unknown distance last', () => {
    const rows = [
      request({ id: 'scurt', estimated_km: 120 }),
      request({ id: 'necunoscut', estimated_km: null }),
      request({ id: 'lung', estimated_km: 1400 }),
    ];
    expect(sortRequests(rows, 'distanta').map((r) => r.id)).toEqual([
      'lung',
      'scurt',
      'necunoscut',
    ]);
  });

  it('leaves the rows it was given alone', () => {
    // Both boards re-rank a list they did not create.
    const rows = [
      request({ id: 'a', published_at: '2026-09-01T00:00:00Z' }),
      request({ id: 'b', published_at: '2026-09-20T00:00:00Z' }),
    ];
    sortRequests(rows, 'noi');
    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
  });

  const departure = (id: string, over: Partial<SortableDeparture>): SortableDeparture & { id: string } => ({
    id,
    published_at: '2026-09-01T00:00:00Z',
    available_from: '2026-10-01',
    slots_free: 1,
    ...over,
  });

  it('routes: most free seats first', () => {
    const rows = [departure('unu', { slots_free: 1 }), departure('sase', { slots_free: 6 })];
    expect(sortDepartures(rows, 'locuri').map((r) => r.id)).toEqual(['sase', 'unu']);
  });

  it('routes: a route never published sorts oldest, not newest', () => {
    // `published_at` is nullable on the routes view. Treating a missing
    // date as an empty string keeps such a row at the bottom instead of
    // throwing it to the top of the board.
    const rows = [
      departure('fara', { published_at: null }),
      departure('cu', { published_at: '2026-09-10T00:00:00Z' }),
    ];
    expect(sortDepartures(rows, 'noi').map((r) => r.id)).toEqual(['cu', 'fara']);
  });

  it('routes: soonest departure first', () => {
    const rows = [
      departure('tarziu', { available_from: '2026-11-01' }),
      departure('curand', { available_from: '2026-09-25' }),
    ];
    expect(sortDepartures(rows, 'incarcare').map((r) => r.id)).toEqual(['curand', 'tarziu']);
  });
});
