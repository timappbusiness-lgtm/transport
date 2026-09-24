import { describe, expect, it } from 'vitest';
import {
  countAdvancedDepartureFilters,
  countAdvancedRequestFilters,
} from '@/lib/board-simplicity';
import { parseFilters as parseDepartureFilters } from '@/lib/departure-filters';
import { departureAdvancedChips, requestAdvancedChips } from '@/lib/filter-chips';
import { parseRequestFilters } from '@/lib/request-filters';
import { OFFERED_CATEGORIES } from '@/lib/vehicle-categories';

type Params = Record<string, string>;

function query(href: string): Params {
  const at = href.indexOf('?');
  return at === -1 ? {} : Object.fromEntries(new URLSearchParams(href.slice(at + 1)));
}

const category = OFFERED_CATEGORIES[0] ?? 'autoturism';

/** Every advanced filter on /cereri, set, plus the three main ones. */
const ALL_REQUEST: Params = {
  'oras-plecare': 'Cluj-Napoca',
  'oras-sosire': 'București',
  categorie: category,
  cine: 'curse',
  serviciu: 'expres',
  'tara-plecare': 'DE',
  'tara-sosire': 'RO',
  'de-la': '2026-10-01',
  'pana-la': '2026-10-15',
  stare: 'ruleaza',
  acoperire: 'international',
  langa: 'Cluj-Napoca|RO',
  raza: '100',
  greutate: '2500',
};
const REQUEST_MAIN = ['oras-plecare', 'oras-sosire', 'categorie'];

/** Every advanced filter on /trasee, set, plus the three main ones. */
const ALL_DEPARTURE: Params = {
  'judet-plecare': 'Cluj',
  'judet-sosire': 'Timiș',
  vehicul: category,
  directie: 'tur',
  locuri: '2',
  'tara-plecare': 'RO',
  'tara-sosire': 'DE',
  'de-la': '2026-10-01',
  'pana-la': '2026-10-15',
  acoperire: 'intern',
  langa: 'Cluj-Napoca|RO',
  raza: '50',
  capacitate: '1500',
};
const DEPARTURE_MAIN = ['judet-plecare', 'judet-sosire', 'vehicul'];

describe('/cereri chips', () => {
  it('the count on the button and the number of chips are the same number', () => {
    const cases: Params[] = [
      {},
      ALL_REQUEST,
      { 'tara-plecare': 'DE' },
      { langa: 'Cluj-Napoca|RO' },
      { 'oras-plecare': 'Cluj-Napoca', categorie: category },
      { cine: 'toate', greutate: '900' },
    ];
    for (const params of cases) {
      for (const mineByDefault of [false, true]) {
        const filters = parseRequestFilters(params, { mineByDefault });
        expect(requestAdvancedChips(filters, 'noi', { mineByDefault })).toHaveLength(
          countAdvancedRequestFilters(filters),
        );
      }
    }
  });

  it('every advanced filter gets a chip; locality and radius are one', () => {
    const chips = requestAdvancedChips(parseRequestFilters(ALL_REQUEST), 'noi');
    expect(chips.map((c) => c.id)).toEqual([
      'tab',
      'service',
      'fromCountry',
      'toCountry',
      'dateFrom',
      'dateTo',
      'condition',
      'scope',
      'near',
      'maxWeightKg',
    ]);
    expect(chips.find((c) => c.id === 'fromCountry')?.label).toContain('Germania');
    expect(chips.find((c) => c.id === 'dateFrom')?.label).toContain('01.10.2026');
    expect(chips.find((c) => c.id === 'near')?.label).toContain('100 km');
  });

  it('the three main fields never make a chip', () => {
    const main = Object.fromEntries(REQUEST_MAIN.map((k) => [k, ALL_REQUEST[k] ?? '']));
    expect(requestAdvancedChips(parseRequestFilters(main), 'noi')).toEqual([]);
  });

  it('a chip removes its own filter and keeps everything else, the sort included', () => {
    const chips = requestAdvancedChips(parseRequestFilters(ALL_REQUEST), 'distanta');
    for (const chip of chips) {
      const after = query(chip.href);
      expect(after.ordine).toBe('distanta');
      for (const key of REQUEST_MAIN) expect(after[key]).toBe(ALL_REQUEST[key]);
      const remaining = requestAdvancedChips(parseRequestFilters(after), 'distanta');
      expect(remaining.map((c) => c.id)).toEqual(
        chips.filter((c) => c.id !== chip.id).map((c) => c.id),
      );
    }
    const near = chips.find((c) => c.id === 'near');
    expect(query(near?.href ?? '')).not.toHaveProperty('raza');
  });

  it('the default sort is not written into the address', () => {
    const [chip] = requestAdvancedChips(parseRequestFilters({ 'tara-plecare': 'DE' }), 'noi');
    expect(chip?.href).toBe('/cereri');
  });

  it('„Potrivite cu firma mea" is the view, never a chip — and a chip keeps the view', () => {
    // A carrier's board opens on „mine"; that used to read as „1 activ".
    const carrierDefault = parseRequestFilters({}, { mineByDefault: true });
    expect(carrierDefault.mine).toBe(true);
    expect(requestAdvancedChips(carrierDefault, 'noi', { mineByDefault: true })).toEqual([]);
    expect(countAdvancedRequestFilters(carrierDefault)).toBe(0);

    // On „Toate cererile", removing a chip stays on „Toate cererile".
    const all = parseRequestFilters({ doar: 'toate', acoperire: 'intern' }, { mineByDefault: true });
    const [chip] = requestAdvancedChips(all, 'noi', { mineByDefault: true });
    expect(chip?.id).toBe('scope');
    expect(query(chip?.href ?? '')).toEqual({ doar: 'toate' });
  });

  it('a filter the parser rejected draws no chip', () => {
    const filters = parseRequestFilters({ 'de-la': '31.12.2026', greutate: '-3', cine: 'nimeni' });
    expect(requestAdvancedChips(filters, 'noi')).toEqual([]);
  });

  it('a filter that is applied but has no option in the panel still gets a chip', () => {
    // „XX" is a well-formed code the select cannot show: without the chip
    // the board would be empty for a reason written nowhere on screen.
    const [chip] = requestAdvancedChips(parseRequestFilters({ 'tara-plecare': 'XX' }), 'noi');
    expect(chip?.label).toContain('XX');
    expect(chip?.href).toBe('/cereri');
  });
});

describe('/trasee chips', () => {
  it('the count on the button and the number of chips are the same number', () => {
    const cases: Params[] = [
      {},
      ALL_DEPARTURE,
      { 'tara-sosire': 'DE' },
      { locuri: '3', capacitate: '700' },
      { 'judet-plecare': 'Cluj', vehicul: category },
    ];
    for (const params of cases) {
      const filters = parseDepartureFilters(params);
      expect(departureAdvancedChips(filters, 'noi')).toHaveLength(
        countAdvancedDepartureFilters(filters),
      );
    }
  });

  it('every advanced filter gets a chip, in the panel’s order', () => {
    const chips = departureAdvancedChips(parseDepartureFilters(ALL_DEPARTURE), 'noi');
    expect(chips.map((c) => c.id)).toEqual([
      'tab',
      'minSeats',
      'fromCountry',
      'toCountry',
      'dateFrom',
      'dateTo',
      'scope',
      'near',
      'minCapacityKg',
    ]);
  });

  it('the three main fields never make a chip', () => {
    const main = Object.fromEntries(DEPARTURE_MAIN.map((k) => [k, ALL_DEPARTURE[k] ?? '']));
    expect(departureAdvancedChips(parseDepartureFilters(main), 'noi')).toEqual([]);
  });

  it('a chip removes its own filter and keeps everything else, the sort included', () => {
    const chips = departureAdvancedChips(parseDepartureFilters(ALL_DEPARTURE), 'locuri');
    for (const chip of chips) {
      const after = query(chip.href);
      expect(after.ordine).toBe('locuri');
      for (const key of DEPARTURE_MAIN) expect(after[key]).toBe(ALL_DEPARTURE[key]);
      const remaining = departureAdvancedChips(parseDepartureFilters(after), 'locuri');
      expect(remaining.map((c) => c.id)).toEqual(
        chips.filter((c) => c.id !== chip.id).map((c) => c.id),
      );
    }
  });
});
