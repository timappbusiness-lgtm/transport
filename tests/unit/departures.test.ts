import { describe, expect, it } from 'vitest';
import {
  EMPTY_FILTERS,
  FILTER_KEYS,
  filtersToQuery,
  hasActiveFilters,
  parseFilters,
  tabDirection,
} from '@/lib/departure-filters';
import {
  CARGO_CATEGORY_LABELS,
  DIRECTION_LABELS,
  SERVICE_TYPE_LABELS,
  SERVICE_TYPE_NOTES,
  formatWindow,
  hasDeparted,
  isFull,
  priceSentence,
  readWaypoints,
  routeCities,
  seatsSentence,
  type PublicDeparture,
} from '@/lib/departures';

/**
 * The board's filters come out of a query string, which is to say out of
 * anyone's hands, and the same object is written into saved_searches. So
 * parsing is pinned here rather than trusted.
 */

function departure(overrides: Partial<PublicDeparture> = {}): PublicDeparture {
  return {
    truck_listing_id: '00000000-0000-0000-0000-000000000001',
    direction: 'retur',
    from_country: 'DE',
    from_county: 'Bayern',
    from_city: 'München',
    to_country: 'RO',
    to_county: 'Cluj',
    to_city: 'Cluj-Napoca',
    waypoints: [],
    available_from: '2026-03-14',
    available_to: '2026-03-18',
    service_types: ['pe_sens'],
    accepted_vehicle_types: ['autoturism'],
    platform_slots_total: 8,
    slots_taken: 5,
    slots_free: 3,
    price_indicative: 650,
    currency: 'EUR',
    published_at: '2026-03-01T10:00:00Z',
    ...overrides,
  };
}

describe('the scope filter', () => {
  it('reads intern and internațional, and nothing else', () => {
    expect(parseFilters({ acoperire: 'intern' }).scope).toBe('intern');
    expect(parseFilters({ acoperire: 'international' }).scope).toBe('international');
    expect(parseFilters({ acoperire: 'pe-lună' }).scope).toBeNull();
  });

  it('survives a round trip through the query string', () => {
    const filters = parseFilters({ acoperire: 'international' });
    expect(filtersToQuery(filters)).toContain('acoperire=international');
    expect(hasActiveFilters(filters)).toBe(true);
  });
});

describe('filters from the URL', () => {
  it('defaults to everything when the query is empty', () => {
    expect(parseFilters({})).toEqual(EMPTY_FILTERS);
  });

  it('reads a full query', () => {
    const filters = parseFilters({
      [FILTER_KEYS.tab]: 'retur',
      [FILTER_KEYS.fromCountry]: 'de',
      [FILTER_KEYS.toCountry]: 'RO',
      [FILTER_KEYS.dateFrom]: '2026-03-01',
      [FILTER_KEYS.dateTo]: '2026-03-31',
      [FILTER_KEYS.minSeats]: '2',
      [FILTER_KEYS.vehicleType]: 'motocicleta',
    });
    expect(filters.tab).toBe('retur');
    expect(filters.fromCountry).toBe('DE');
    expect(filters.minSeats).toBe(2);
    expect(filters.vehicleType).toBe('motocicleta');
  });

  it('drops values that are not what they claim to be', () => {
    const filters = parseFilters({
      [FILTER_KEYS.tab]: 'drop table',
      [FILTER_KEYS.fromCountry]: 'ROMANIA',
      [FILTER_KEYS.dateFrom]: '14.03.2026',
      [FILTER_KEYS.minSeats]: '99',
      [FILTER_KEYS.vehicleType]: 'elicopter',
    });
    expect(filters).toEqual(EMPTY_FILTERS);
  });

  it('rejects a date that matches the shape but is not a date', () => {
    expect(parseFilters({ [FILTER_KEYS.dateFrom]: '2026-02-31' }).dateFrom).toBeNull();
    expect(parseFilters({ [FILTER_KEYS.dateFrom]: '2026-02-28' }).dateFrom).toBe('2026-02-28');
  });

  it('drops a window that runs backwards rather than returning nothing', () => {
    const filters = parseFilters({
      [FILTER_KEYS.dateFrom]: '2026-03-20',
      [FILTER_KEYS.dateTo]: '2026-03-10',
    });
    expect(filters.dateFrom).toBe('2026-03-20');
    expect(filters.dateTo).toBeNull();
  });

  it('takes the first value when a key repeats', () => {
    expect(parseFilters({ [FILTER_KEYS.fromCountry]: ['DE', 'IT'] }).fromCountry).toBe('DE');
  });

  it('round-trips through the query string', () => {
    const filters = parseFilters({
      [FILTER_KEYS.tab]: 'tur',
      [FILTER_KEYS.fromCountry]: 'IT',
      [FILTER_KEYS.minSeats]: '3',
    });
    const query = filtersToQuery(filters);
    const parsed = parseFilters(Object.fromEntries(new URLSearchParams(query.slice(1))));
    expect(parsed).toEqual(filters);
  });

  it('writes nothing for defaults, so a clean board has a clean URL', () => {
    expect(filtersToQuery(EMPTY_FILTERS)).toBe('');
  });

  it('does not count the tab as a filter', () => {
    expect(hasActiveFilters({ ...EMPTY_FILTERS, tab: 'retur' })).toBe(false);
    expect(hasActiveFilters({ ...EMPTY_FILTERS, fromCountry: 'DE' })).toBe(true);
  });

  it('maps a tab to a direction', () => {
    expect(tabDirection('toate')).toBeNull();
    expect(tabDirection('tur')).toBe('tur');
    expect(tabDirection('retur')).toBe('retur');
  });
});

describe('reading a departure', () => {
  it('keeps only usable waypoints', () => {
    expect(
      readWaypoints([
        { city: 'Viena', country: 'AT' },
        { city: '   ' },
        'Budapesta',
        null,
        42,
        { country: 'HU' },
      ]),
    ).toEqual([{ city: 'Viena', country: 'AT' }, { city: 'Budapesta' }]);
  });

  it('survives waypoints that are not an array at all', () => {
    expect(readWaypoints(null)).toEqual([]);
    expect(readWaypoints('München')).toEqual([]);
    expect(readWaypoints({ city: 'Viena' })).toEqual([]);
  });

  it('lists the cities in travel order', () => {
    expect(routeCities(departure({ waypoints: [{ city: 'Viena' }] }))).toEqual([
      'München',
      'Viena',
      'Cluj-Napoca',
    ]);
  });
});

describe('the date window, the way a dispatcher says it', () => {
  it('writes one day when there is only one', () => {
    expect(formatWindow('2026-03-14', null)).toBe('14.03');
    expect(formatWindow('2026-03-14', '2026-03-14')).toBe('14.03');
  });

  it('shares the month when it can', () => {
    expect(formatWindow('2026-03-14', '2026-03-18')).toBe('14–18.03');
  });

  it('spells both months when the window crosses one', () => {
    expect(formatWindow('2026-03-28', '2026-04-02')).toBe('28.03 – 02.04');
  });

  it('reads a date column as a calendar date, not UTC midnight', () => {
    // Would be 13.03 west of Greenwich if parsed with new Date().
    expect(formatWindow('2026-03-14', null)).toBe('14.03');
  });
});

describe('seats and price', () => {
  it('counts free seats in Romanian, singular and plural', () => {
    expect(seatsSentence(departure())).toBe('3 locuri libere din 8');
    expect(seatsSentence(departure({ slots_free: 1 }))).toBe('1 loc liber din 8');
  });

  it('says so when the platform is full', () => {
    expect(seatsSentence(departure({ slots_free: 0 }))).toBe('Platformă plină');
    expect(isFull(departure({ slots_free: 0 }))).toBe(true);
  });

  it('says nothing about seats when no deck was declared', () => {
    const noDeck = departure({ platform_slots_total: null, slots_free: 0 });
    expect(seatsSentence(noDeck)).toBeNull();
    // A departure with no deck is never "full": there is nothing to fill.
    expect(isFull(noDeck)).toBe(false);
  });

  it('always labels the price as an estimate', () => {
    expect(priceSentence(departure())).toContain('orientativ');
    expect(priceSentence(departure({ price_indicative: null }))).toBeNull();
  });
});

describe('whether a departure has gone', () => {
  const today = new Date(2026, 2, 20); // 20.03.2026

  it('is gone the day after its window closes', () => {
    expect(hasDeparted(departure({ available_to: '2026-03-19' }), today)).toBe(true);
    expect(hasDeparted(departure({ available_to: '2026-03-20' }), today)).toBe(false);
  });

  it('falls back to the start when there is no end', () => {
    expect(hasDeparted(departure({ available_from: '2026-03-01', available_to: null }), today)).toBe(
      true,
    );
  });
});

describe('every database value has Romanian words', () => {
  it('names both directions', () => {
    expect(Object.keys(DIRECTION_LABELS).sort()).toEqual(['retur', 'tur']);
  });

  it('names every service type and explains it in one line', () => {
    expect(Object.keys(SERVICE_TYPE_LABELS).sort()).toEqual(['expres', 'pe_sens', 'tractare']);
    for (const note of Object.values(SERVICE_TYPE_NOTES)) {
      expect(note.length).toBeGreaterThan(20);
      expect(note).not.toContain('!');
    }
  });

  it('names every cargo category, with diacritics where Romanian needs them', () => {
    const labels = Object.values(CARGO_CATEGORY_LABELS);
    expect(labels.length).toBeGreaterThanOrEqual(14);
    expect(labels).toContain('Autoutilitară');
    expect(labels).toContain('Motocicletă');
    for (const label of labels) expect(label.trim()).not.toBe('');
  });
});
