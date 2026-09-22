import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  GROUP_LABELS,
  MATCH_ORDER,
  MIN_QUERY_LENGTH,
  SEARCH_DEBOUNCE_MS,
  SUGGESTION_LIMIT,
  groupOf,
  groupSuggestions,
  shouldSearch,
  subtitleOf,
  toFieldValue,
  type Locality,
} from '@/lib/localities';

/**
 * The half of the locality picker that has no database.
 *
 * The search itself — diacritics, typos, aliases, ranking — is
 * `search_localities()` in Postgres, and it is checked where it runs, in
 * the LOC block of `supabase/tests/rls_test.sql`. Testing it twice, once
 * against a mock, would only prove the mock agrees with itself.
 *
 * What is here is the grouping, the two numbers the input behaves by,
 * and — the part worth having — that the SQL function and this file
 * still agree about the shape of a row.
 */

function locality(over: Partial<Locality> = {}): Locality {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Cluj-Napoca',
    region: 'Cluj',
    country: 'RO',
    lat: 46.7712,
    lng: 23.6236,
    population: 324576,
    is_county_seat: true,
    match_kind: 'exact',
    ...over,
  };
}

function searchFunctionBody(): string {
  const dir = 'supabase/migrations';
  const sql = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(`${dir}/${f}`, 'utf8'))
    .join('\n');
  const at = sql.lastIndexOf('create or replace function public.search_localities');
  if (at === -1) throw new Error('no migration defines search_localities');
  return sql.slice(at, sql.indexOf('$fn$;', at));
}

describe('when the picker asks the server', () => {
  it('not before two characters', () => {
    expect(shouldSearch('')).toBe(false);
    expect(shouldSearch('c')).toBe(false);
    expect(shouldSearch('cl')).toBe(true);
    expect(MIN_QUERY_LENGTH).toBe(2);
  });

  it('nor on whitespace that looks like typing', () => {
    expect(shouldSearch('   ')).toBe(false);
    expect(shouldSearch(' c ')).toBe(false);
  });

  it('after 150 ms of quiet, which is one request for „Timișoara" rather than nine', () => {
    expect(SEARCH_DEBOUNCE_MS).toBe(150);
  });

  it('and asks for a list somebody will read rather than scroll', () => {
    expect(SUGGESTION_LIMIT).toBeLessThanOrEqual(10);
  });
});

describe('the two groups', () => {
  it('put Romania first and keep the server order inside each', () => {
    const rows = [
      locality({ id: 'a', name: 'Wien', country: 'AT', region: 'Austria' }),
      locality({ id: 'b', name: 'Cluj-Napoca' }),
      locality({ id: 'c', name: 'München', country: 'DE', region: 'Bavaria' }),
      locality({ id: 'd', name: 'Turda', is_county_seat: false }),
    ];
    const groups = groupSuggestions(rows);
    expect(groups.map((g) => g.group)).toEqual(['ro', 'international']);
    // Inside a group nothing is re-sorted: that order is the ranking.
    expect(groups[0]?.items.map((l) => l.name)).toEqual(['Cluj-Napoca', 'Turda']);
    expect(groups[1]?.items.map((l) => l.name)).toEqual(['Wien', 'München']);
  });

  it('drop a heading with nothing under it', () => {
    const groups = groupSuggestions([locality()]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.group).toBe('ro');
  });

  it('and are labelled in Romanian', () => {
    expect(GROUP_LABELS.ro).toBe('România');
    expect(GROUP_LABELS.international).toBe('Internațional');
  });

  it('sort a locality by its country, not by its name', () => {
    expect(groupOf(locality({ country: 'RO' }))).toBe('ro');
    expect(groupOf(locality({ country: 'MD' }))).toBe('international');
  });
});

describe('what a suggestion says on its second line', () => {
  it('the județ at home', () => {
    expect(subtitleOf(locality({ region: 'Timiș' }))).toBe('Timiș');
  });

  it('and the country abroad, because the region there is unreliable', () => {
    // The admin1 join was dropped from the import: it put Brno in
    // „Praha-východ" and Lyon in „Occitanie".
    expect(subtitleOf(locality({ country: 'CZ', region: 'Cehia' }))).toBe('Cehia');
  });
});

describe('what a chosen locality writes into the form', () => {
  it('the name and the country, which is what the listing stores', () => {
    expect(toFieldValue(locality({ name: 'München', country: 'DE' }))).toEqual({
      city: 'München',
      country: 'DE',
    });
  });
});

describe('this file and the SQL still agree', () => {
  it('about every column a row has', () => {
    // A column added in SQL and not here arrives as `undefined` and
    // renders as a blank, which is the quiet kind of wrong.
    const body = searchFunctionBody();
    for (const column of Object.keys(locality())) {
      expect(body, column).toContain(column);
    }
  });

  it('about the kinds of match, and their order', () => {
    const body = searchFunctionBody();
    for (const kind of MATCH_ORDER) {
      expect(body, kind).toContain(`'${kind}'`);
    }

    // „fuzzy" is the `else` of both CASEs and so has no `when` of its
    // own — it is last by being the fallback, which is the same thing.
    const ranked = MATCH_ORDER.filter((kind) => kind !== 'fuzzy');
    const positions = ranked.map((kind) => body.lastIndexOf(`when '${kind}' then`));
    expect(positions.every((at) => at > -1), 'a ranked kind is missing').toBe(true);

    // The order here is the order the SQL ranks by; the `case` in the
    // ORDER BY lists them in the same sequence.
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(MATCH_ORDER[MATCH_ORDER.length - 1]).toBe('fuzzy');
  });

  it('that the server, not the browser, holds the gazetteer', () => {
    // 2.750 rows is around 200 KB. Downloading it on every visit, on a
    // phone, to find one town is the thing this design refuses.
    const source = readFileSync('src/lib/localities.ts', 'utf8');
    expect(source).not.toContain('localities.json');
    const picker = readFileSync('src/components/ui/locality-picker.tsx', 'utf8');
    expect(picker).toContain('searchLocalitiesAction');
  });
});
