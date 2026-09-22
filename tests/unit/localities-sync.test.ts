import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CITIES } from '@/lib/cities';

/**
 * `localities` and `src/lib/cities.ts` have to agree.
 *
 * The table is what stamps a listing's coordinates, because the series
 * generator is SQL and cannot read a TypeScript file. The file is what a
 * picker shows. Two lists of the same places drift — this is the guard
 * that says so on the pull request rather than a year later, when a
 * carrier picks „Sibiu" from a menu and lands in no radius at all.
 */

const MIGRATION = join(
  process.cwd(),
  'supabase/migrations/20261002100000_localitati_raza_greutate.sql',
);

interface Seeded {
  name: string;
  lat: number;
  lng: number;
}

function seededLocalities(): Map<string, Seeded> {
  const sql = readFileSync(MIGRATION, 'utf8');
  const rows = new Map<string, Seeded>();
  const pattern = /^ {2}\('(.+?)', '(.+?)', '([A-Z]{2})', (-?[\d.]+), (-?[\d.]+)\)/gm;
  for (const match of sql.matchAll(pattern)) {
    const [, name, , country, lat, lng] = match;
    rows.set(`${name}|${country}`, {
      name: name!,
      lat: Number(lat),
      lng: Number(lng),
    });
  }
  return rows;
}

describe('the gazetteer in the database', () => {
  const seeded = seededLocalities();

  it('was parsed at all, so a silent zero cannot pass this file', () => {
    expect(seeded.size).toBeGreaterThan(50);
  });

  it('has every city the picker offers', () => {
    const missing = CITIES.filter((city) => !seeded.has(`${city.name}|${city.country}`)).map(
      (city) => `${city.name} (${city.country})`,
    );
    expect(missing).toEqual([]);
  });

  it('agrees with the picker about where they are', () => {
    const disagreeing: string[] = [];
    for (const city of CITIES) {
      const row = seeded.get(`${city.name}|${city.country}`);
      if (row === undefined) continue;
      if (row.lat !== city.lat || row.lng !== city.lng) {
        disagreeing.push(
          `${city.name}: file ${city.lat},${city.lng} vs table ${row.lat},${row.lng}`,
        );
      }
    }
    expect(disagreeing).toEqual([]);
  });

  it('has nothing the picker does not, so a radius centre is always pickable', () => {
    const known = new Set(CITIES.map((city) => `${city.name}|${city.country}`));
    expect([...seeded.keys()].filter((key) => !known.has(key))).toEqual([]);
  });
});
