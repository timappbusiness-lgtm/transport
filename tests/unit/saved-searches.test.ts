import { describe, expect, it } from 'vitest';
import {
  EVERYTHING,
  FREQUENCY_HINTS,
  FREQUENCY_LABELS,
  describeFilters,
  describeSearch,
  filtersFromBoard,
  quotaMessage,
  quotaReached,
  suggestName,
} from '@/lib/saved-searches';

describe('describing a saved search', () => {
  it('says where from and where to, in that order', () => {
    expect(describeFilters({ from_country: 'DE', to_country: 'RO' })).toEqual([
      'Din Germania',
      'Către România',
    ]);
  });

  it('puts the county in front of the country', () => {
    expect(describeFilters({ from_county: 'CJ', from_country: 'RO' })).toEqual([
      'Din Cluj, România',
    ]);
  });

  it('names the vehicle category in Romanian', () => {
    expect(describeFilters({ category: 'autoturism' })).toContain('Autoturism / SUV');
    expect(describeFilters({ category: 'utilaj_constructii' })).toContain(
      'Utilaj de construcții',
    );
  });

  it('spells out the condition rather than echoing the code', () => {
    expect(describeFilters({ condition: 'nu-ruleaza' })).toEqual(['Doar cele care nu pornesc']);
    expect(describeFilters({ condition: 'ruleaza' })).toEqual(['Doar cele care pornesc']);
  });

  it('says what a search with no criteria actually is', () => {
    expect(describeSearch({})).toBe(EVERYTHING);
    expect(describeSearch({})).not.toContain('undefined');
  });

  it('joins the parts into one readable line', () => {
    expect(describeSearch({ from_country: 'IT', category: 'motocicleta', service: 'expres' })).toBe(
      'Din Italia · Motocicletă · Expres',
    );
  });

  it('falls back to the code for a country nobody has named', () => {
    expect(describeFilters({ from_country: 'XX' })).toEqual(['Din XX']);
  });
});

describe('taking the board filters into a saved search', () => {
  it('keeps only what was actually set', () => {
    expect(
      filtersFromBoard({
        fromCountry: 'DE',
        fromCity: 'München',
        toCountry: null,
        category: '',
        service: 'expres',
      }),
    ).toEqual({ from_country: 'DE', service: 'expres' });
  });

  it('drops an empty string rather than storing it', () => {
    // An empty string in the jsonb is read by the matcher as "must equal
    // empty", which matches nothing — a saved search that silently never
    // fires is the worst outcome here.
    expect(filtersFromBoard({ from_country: '   ' })).toEqual({});
  });

  it('trims what it keeps', () => {
    expect(filtersFromBoard({ category: ' autoturism ' })).toEqual({ category: 'autoturism' });
  });
});

describe('suggesting a name', () => {
  it('uses the first two criteria', () => {
    expect(suggestName({ from_country: 'DE', to_country: 'RO', category: 'autoturism' })).toBe(
      'Din Germania · Către România',
    );
  });

  it('has something to say even with no criteria', () => {
    expect(suggestName({})).toBe('Toate cererile');
  });

  it('never runs past a length a list can show', () => {
    expect(suggestName({ from_county: 'CJ', from_country: 'RO', to_county: 'TM' }).length)
      .toBeLessThanOrEqual(60);
  });
});

describe('the plan limit', () => {
  it('is not reached while there is room', () => {
    expect(quotaReached({ used: 1, allowed: 10, planName: 'Transportator' })).toBe(false);
    expect(quotaMessage({ used: 1, allowed: 10, planName: 'Transportator' })).toBeNull();
  });

  it('is reached exactly at the limit', () => {
    expect(quotaReached({ used: 10, allowed: 10, planName: 'Transportator' })).toBe(true);
  });

  it('is never reached when the plan has no limit', () => {
    expect(quotaReached({ used: 900, allowed: null, planName: 'Business' })).toBe(false);
  });

  it('names the plan, because a refusal that does not is one somebody writes to support about', () => {
    const message = quotaMessage({ used: 10, allowed: 10, planName: 'Transportator' });
    expect(message).toContain('Transportator');
    expect(message).toContain('10');
  });

  it('says "o singură" rather than "1 căutări"', () => {
    expect(quotaMessage({ used: 1, allowed: 1, planName: 'Gratuit' })).toContain('o singură');
  });
});

describe('the two frequencies', () => {
  it('has a Romanian label and a hint for each', () => {
    for (const frequency of ['immediate', 'daily'] as const) {
      expect(FREQUENCY_LABELS[frequency].length).toBeGreaterThan(5);
      expect(FREQUENCY_HINTS[frequency]).toMatch(/e-mail/);
    }
  });

  it('says plainly which one groups', () => {
    expect(FREQUENCY_HINTS.daily).toMatch(/un singur e-mail/i);
  });
});

describe('the radius and weight criteria', () => {
  it('reads back as a sentence, naming the locality', () => {
    expect(describeFilters({ near: 'Cluj-Napoca|RO', radius_km: '100' })).toContain(
      'La 100 km de Cluj-Napoca',
    );
  });

  it('defaults to fifty kilometres, the same as the board and the matcher', () => {
    expect(describeFilters({ near: 'Cluj-Napoca|RO' })).toContain('La 50 km de Cluj-Napoca');
  });

  it('says the weight in kilograms', () => {
    expect(describeFilters({ max_weight_kg: '2400' })).toContain('Cel mult 2400 kg');
  });

  it('stores the distance only with a centre to measure from', () => {
    expect(filtersFromBoard({ near: 'Cluj-Napoca|RO', radiusKm: '25' })).toEqual({
      near: 'Cluj-Napoca|RO',
      radius_km: '25',
    });
    expect(filtersFromBoard({ near: null, radiusKm: '25' })).toEqual({});
  });

  it('carries the weight through on its own', () => {
    expect(filtersFromBoard({ maxWeightKg: '2400' })).toEqual({ max_weight_kg: '2400' });
  });
});
