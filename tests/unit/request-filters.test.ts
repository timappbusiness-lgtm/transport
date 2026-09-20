import { describe, expect, it } from 'vitest';
import {
  EMPTY_REQUEST_FILTERS,
  REQUEST_FILTER_KEYS,
  conditionIsRunning,
  hasActiveRequestFilters,
  parseRequestFilters,
  requestFiltersToQuery,
  tabBoard,
  type RequestFilters,
} from '@/lib/request-filters';

/**
 * The board's filters arrive from a query string, which is to say from
 * anyone. These pin what is believed and what is thrown away, and that a
 * search survives being written out and read back — which is what makes a
 * link shareable.
 */

describe('parseRequestFilters', () => {
  it('returns the defaults for an empty query', () => {
    expect(parseRequestFilters({})).toEqual(EMPTY_REQUEST_FILTERS);
  });

  it('reads a full query', () => {
    const filters = parseRequestFilters({
      [REQUEST_FILTER_KEYS.tab]: 'retur',
      [REQUEST_FILTER_KEYS.fromCountry]: 'de',
      [REQUEST_FILTER_KEYS.fromCity]: 'München',
      [REQUEST_FILTER_KEYS.toCountry]: 'RO',
      [REQUEST_FILTER_KEYS.toCity]: 'Cluj-Napoca',
      [REQUEST_FILTER_KEYS.dateFrom]: '2026-09-20',
      [REQUEST_FILTER_KEYS.dateTo]: '2026-09-30',
      [REQUEST_FILTER_KEYS.category]: 'autoturism',
      [REQUEST_FILTER_KEYS.condition]: 'nu-ruleaza',
      [REQUEST_FILTER_KEYS.scope]: 'international',
    });
    expect(filters.tab).toBe('retur');
    expect(filters.fromCountry).toBe('DE');
    expect(filters.fromCity).toBe('München');
    expect(filters.dateTo).toBe('2026-09-30');
    expect(filters.category).toBe('autoturism');
    expect(filters.condition).toBe('nu-ruleaza');
    expect(filters.scope).toBe('international');
  });

  it('throws away what it does not recognise', () => {
    const filters = parseRequestFilters({
      [REQUEST_FILTER_KEYS.tab]: 'oricine',
      [REQUEST_FILTER_KEYS.fromCountry]: 'Germania',
      [REQUEST_FILTER_KEYS.category]: 'elicopter',
      [REQUEST_FILTER_KEYS.condition]: 'poate',
      [REQUEST_FILTER_KEYS.scope]: 'galactic',
      [REQUEST_FILTER_KEYS.dateFrom]: 'maine',
    });
    expect(filters).toEqual(EMPTY_REQUEST_FILTERS);
  });

  it('rejects a date that matches the shape but is not one', () => {
    expect(parseRequestFilters({ [REQUEST_FILTER_KEYS.dateFrom]: '2026-02-31' }).dateFrom).toBeNull();
  });

  it('drops the end of a window that runs backwards rather than showing nothing', () => {
    const filters = parseRequestFilters({
      [REQUEST_FILTER_KEYS.dateFrom]: '2026-09-30',
      [REQUEST_FILTER_KEYS.dateTo]: '2026-09-20',
    });
    expect(filters.dateFrom).toBe('2026-09-30');
    expect(filters.dateTo).toBeNull();
  });

  it('takes the first value when a key is repeated', () => {
    expect(parseRequestFilters({ [REQUEST_FILTER_KEYS.tab]: ['curse', 'retur'] }).tab).toBe('curse');
  });

  it('refuses a city name nobody would type', () => {
    expect(parseRequestFilters({ [REQUEST_FILTER_KEYS.fromCity]: 'x'.repeat(61) }).fromCity).toBeNull();
  });
});

describe('requestFiltersToQuery', () => {
  it('writes nothing when nothing is narrowed', () => {
    expect(requestFiltersToQuery(EMPTY_REQUEST_FILTERS)).toBe('');
  });

  it('survives a round trip', () => {
    const filters: RequestFilters = {
      tab: 'curse',
      fromCountry: 'IT',
      fromCity: 'Milano',
      toCountry: 'RO',
      toCity: 'Timișoara',
      dateFrom: '2026-10-01',
      dateTo: '2026-10-15',
      category: 'motocicleta',
      condition: 'ruleaza',
      scope: 'international',
      service: 'expres',
    };
    const query = requestFiltersToQuery(filters);
    const params = Object.fromEntries(new URLSearchParams(query.replace(/^\?/, '')));
    expect(parseRequestFilters(params)).toEqual(filters);
  });
});

describe('hasActiveRequestFilters', () => {
  it('does not count the tab, which is navigation', () => {
    expect(hasActiveRequestFilters({ ...EMPTY_REQUEST_FILTERS, tab: 'retur' })).toBe(false);
    expect(hasActiveRequestFilters({ ...EMPTY_REQUEST_FILTERS, toCity: 'Arad' })).toBe(true);
  });
});

describe('what the query means', () => {
  it('maps a tab onto a board', () => {
    expect(tabBoard('toate')).toBeNull();
    expect(tabBoard('curse')).toBe('curse');
    expect(tabBoard('retur')).toBe('retur');
  });

  it('maps the condition onto is_running', () => {
    expect(conditionIsRunning(null)).toBeNull();
    expect(conditionIsRunning('ruleaza')).toBe(true);
    expect(conditionIsRunning('nu-ruleaza')).toBe(false);
  });
});

describe('the service filter', () => {
  it('defaults to nothing, so the board shows both', () => {
    expect(parseRequestFilters({}).service).toBeNull();
  });

  it('accepts the two levels a client can choose', () => {
    expect(parseRequestFilters({ [REQUEST_FILTER_KEYS.service]: 'expres' }).service).toBe('expres');
    expect(parseRequestFilters({ [REQUEST_FILTER_KEYS.service]: 'pe_sens' }).service).toBe('pe_sens');
  });

  it('refuses tractare, which the interface hides at launch', () => {
    expect(parseRequestFilters({ [REQUEST_FILTER_KEYS.service]: 'tractare' }).service).toBeNull();
  });

  it('refuses anything else somebody puts in the address bar', () => {
    expect(parseRequestFilters({ [REQUEST_FILTER_KEYS.service]: 'gratis' }).service).toBeNull();
  });
});

describe('the category filter covers the whole schema', () => {
  it('accepts a category the old six-item list left out', () => {
    for (const category of ['camion', 'remorca', 'container', 'ambarcatiune', 'cap_tractor']) {
      expect(parseRequestFilters({ [REQUEST_FILTER_KEYS.category]: category }).category).toBe(
        category,
      );
    }
  });

  it('still refuses one that does not exist', () => {
    expect(parseRequestFilters({ [REQUEST_FILTER_KEYS.category]: 'elicopter' }).category).toBeNull();
  });
});
