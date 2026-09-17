import { describe, expect, it } from 'vitest';
import { CITIES, cityFromValue, cityLabel, cityValue } from '@/lib/cities';
import { EMPTY_PREFILL, hasPrefill, parsePrefill, prefillQuery } from '@/lib/price-prefill';

/**
 * The handoff from the calculator to the request form.
 *
 * It travels in a query string, which means it arrives from anyone: the
 * tests that matter here are the ones where the link is wrong.
 */

const MUNICH = CITIES.find((city) => city.name === 'München');
const CLUJ = CITIES.find((city) => city.name === 'Cluj-Napoca');

describe('the city list', () => {
  it('has both a Romanian and a European half', () => {
    expect(CITIES.filter((city) => city.country === 'RO').length).toBeGreaterThan(30);
    expect(CITIES.filter((city) => city.country !== 'RO').length).toBeGreaterThan(20);
  });

  it('names no city twice in the same country', () => {
    const keys = CITIES.map(cityValue);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps every coordinate on the planet', () => {
    for (const city of CITIES) {
      expect(Math.abs(city.lat)).toBeLessThanOrEqual(90);
      expect(Math.abs(city.lng)).toBeLessThanOrEqual(180);
    }
  });

  it('reads a value back to the same city', () => {
    for (const city of CITIES) {
      expect(cityFromValue(cityValue(city))).toBe(city);
    }
  });

  it('forgives diacritics and case in a link someone retyped', () => {
    expect(cityFromValue('cluj-napoca|RO')).toBe(CLUJ);
    expect(cityFromValue('Munchen|DE')).toBe(MUNICH);
  });

  it('returns nothing for a value that names nothing', () => {
    expect(cityFromValue('Atlantida|XX')).toBeNull();
    expect(cityFromValue('')).toBeNull();
    expect(cityFromValue(null)).toBeNull();
    expect(cityFromValue('fără bară')).toBeNull();
  });

  it('separates the several cities that share a name', () => {
    expect(cityLabel(CLUJ!)).toBe('Cluj-Napoca, Cluj (RO)');
    // Bucharest is its own county, so the label does not say it twice.
    const bucharest = CITIES.find((city) => city.name === 'București');
    expect(cityLabel(bucharest!)).toBe('București (RO)');
  });
});

describe('reading a prefilled link', () => {
  it('reads a complete one', () => {
    const prefill = parsePrefill({
      plecare: 'München|DE',
      sosire: 'Cluj-Napoca|RO',
      categorie: 'suv',
      porneste: 'nu',
      serviciu: 'expres',
    });
    expect(prefill.from).toBe(MUNICH);
    expect(prefill.to).toBe(CLUJ);
    expect(prefill.vehicleClass).toBe('suv');
    expect(prefill.isRunning).toBe(false);
    expect(prefill.express).toBe(true);
  });

  it('drops a vehicle class that is not one of ours', () => {
    expect(parsePrefill({ categorie: 'elicopter' }).vehicleClass).toBeNull();
  });

  it('leaves the yes/no answers null when the link did not say', () => {
    const prefill = parsePrefill({ plecare: 'Cluj-Napoca|RO' });
    expect(prefill.isRunning).toBeNull();
    expect(prefill.express).toBeNull();
  });

  it('ignores a value repeated in the query string', () => {
    expect(parsePrefill({ categorie: ['sedan', 'suv'] }).vehicleClass).toBe('sedan');
  });

  it('treats an empty parameter as absent', () => {
    expect(parsePrefill({ plecare: '   ' }).from).toBeNull();
  });
});

describe('writing one', () => {
  it('round-trips everything it wrote', () => {
    const prefill = {
      from: MUNICH ?? null,
      to: CLUJ ?? null,
      vehicleClass: 'suv' as const,
      isRunning: false,
      express: true,
    };
    const query = prefillQuery(prefill);
    const params = Object.fromEntries(new URLSearchParams(query.replace(/^\?/, '')).entries());
    expect(parsePrefill(params)).toEqual(prefill);
  });

  it('writes nothing at all when there is nothing to carry', () => {
    expect(prefillQuery(EMPTY_PREFILL)).toBe('');
    expect(hasPrefill(EMPTY_PREFILL)).toBe(false);
  });

  it('carries a half-filled form rather than losing it', () => {
    const query = prefillQuery({ ...EMPTY_PREFILL, from: MUNICH ?? null });
    expect(query).toContain('plecare=');
    expect(query).not.toContain('sosire=');
    expect(hasPrefill(parsePrefill({ plecare: 'München|DE' }))).toBe(true);
  });
});
