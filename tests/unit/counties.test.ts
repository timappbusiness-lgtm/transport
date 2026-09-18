import { describe, expect, it } from 'vitest';
import {
  COUNTIES,
  countyCodeFor,
  countyCodeForCity,
  countyName,
  isCountyCode,
} from '@/lib/counties';

/**
 * Two copies of this list exist — here and in
 * `public.ro_county_codes()`, which is what the CHECK on
 * `companies.coverage_counties` calls. A county added to one and not the
 * other fails on save, which is a bad way to find out, so the sorted codes
 * are pinned in both: this test and the `FIRM the two county lists agree`
 * check in `supabase/tests/rls_test.sql` hold the same literal.
 */

const SORTED = [
  'AB', 'AG', 'AR', 'B', 'BC', 'BH', 'BN', 'BR', 'BT', 'BV', 'BZ', 'CJ',
  'CL', 'CS', 'CT', 'CV', 'DB', 'DJ', 'GJ', 'GL', 'GR', 'HD', 'HR', 'IF',
  'IL', 'IS', 'MH', 'MM', 'MS', 'NT', 'OT', 'PH', 'SB', 'SJ', 'SM', 'SV',
  'TL', 'TM', 'TR', 'VL', 'VN', 'VS',
];

describe('the counties of Romania', () => {
  it('has all 41 and the capital', () => {
    expect(COUNTIES).toHaveLength(42);
  });

  it('holds exactly the codes the database will accept', () => {
    expect([...COUNTIES.map((c) => c.code)].sort()).toEqual(SORTED);
  });

  it('gives București the code ISO gives it', () => {
    // It is a municipality, not a county, and `B` is what ISO 3166-2:RO
    // assigns it — not `BU`.
    expect(COUNTIES.find((c) => c.name === 'București')?.code).toBe('B');
  });

  it('says every name with its diacritics', () => {
    expect(countyName('TM')).toBe('Timiș');
    expect(countyName('BZ')).toBe('Buzău');
    expect(countyName('BN')).toBe('Bistrița-Năsăud');
  });

  it('hands back a code it does not know rather than an empty string', () => {
    expect(countyName('ZZ')).toBe('ZZ');
  });

  it('recognises a code however it was typed', () => {
    expect(isCountyCode('cj')).toBe(true);
    expect(isCountyCode(' TM ')).toBe(true);
    expect(isCountyCode('ZZ')).toBe(false);
  });
});

describe('finding a county by name', () => {
  it('reads a name with diacritics', () => {
    expect(countyCodeFor('Timiș')).toBe('TM');
  });

  it('reads one without, because that is how people type', () => {
    expect(countyCodeFor('Timis')).toBe('TM');
    expect(countyCodeFor('bistrita-nasaud')).toBe('BN');
  });

  it('gives null for something that is not a county', () => {
    expect(countyCodeFor('Vestul Țării')).toBeNull();
    expect(countyCodeFor(null)).toBeNull();
  });
});

describe('finding a county from a city', () => {
  it('resolves the county seats the city list carries', () => {
    expect(countyCodeForCity('Cluj-Napoca', 'RO')).toBe('CJ');
    expect(countyCodeForCity('Timișoara', 'RO')).toBe('TM');
    expect(countyCodeForCity('București', 'RO')).toBe('B');
  });

  it('gives null for a town that is not on the list', () => {
    // Most of them, which is why county matching declines rather than
    // guesses when it gets null.
    expect(countyCodeForCity('Jibou', 'RO')).toBeNull();
  });

  it('gives null abroad, where a Romanian county means nothing', () => {
    expect(countyCodeForCity('München', 'DE')).toBeNull();
  });
});
