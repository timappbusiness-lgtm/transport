import { findCity } from './cities';

/**
 * The counties of Romania, as ISO 3166-2:RO codes.
 *
 * The same 42 the database holds in `public.ro_county_codes()`, which is
 * what the CHECK on `companies.coverage_counties` calls. Two lists of the
 * same thing is a drift risk, so `tests/unit/counties.test.ts` pins the
 * count and the codes, and the RLS suite refuses a code that is not in the
 * database's copy — a county added here and nowhere else fails on save
 * rather than silently storing something matching cannot read.
 *
 * București is `B` rather than `BU`: it is a municipality, not a county,
 * and `B` is what ISO gives it.
 */

export interface County {
  code: string;
  name: string;
}

export const COUNTIES: readonly County[] = [
  { code: 'AB', name: 'Alba' },
  { code: 'AR', name: 'Arad' },
  { code: 'AG', name: 'Argeș' },
  { code: 'BC', name: 'Bacău' },
  { code: 'BH', name: 'Bihor' },
  { code: 'BN', name: 'Bistrița-Năsăud' },
  { code: 'BT', name: 'Botoșani' },
  { code: 'BV', name: 'Brașov' },
  { code: 'BR', name: 'Brăila' },
  { code: 'B', name: 'București' },
  { code: 'BZ', name: 'Buzău' },
  { code: 'CS', name: 'Caraș-Severin' },
  { code: 'CL', name: 'Călărași' },
  { code: 'CJ', name: 'Cluj' },
  { code: 'CT', name: 'Constanța' },
  { code: 'CV', name: 'Covasna' },
  { code: 'DB', name: 'Dâmbovița' },
  { code: 'DJ', name: 'Dolj' },
  { code: 'GL', name: 'Galați' },
  { code: 'GR', name: 'Giurgiu' },
  { code: 'GJ', name: 'Gorj' },
  { code: 'HR', name: 'Harghita' },
  { code: 'HD', name: 'Hunedoara' },
  { code: 'IL', name: 'Ialomița' },
  { code: 'IS', name: 'Iași' },
  { code: 'IF', name: 'Ilfov' },
  { code: 'MM', name: 'Maramureș' },
  { code: 'MH', name: 'Mehedinți' },
  { code: 'MS', name: 'Mureș' },
  { code: 'NT', name: 'Neamț' },
  { code: 'OT', name: 'Olt' },
  { code: 'PH', name: 'Prahova' },
  { code: 'SM', name: 'Satu Mare' },
  { code: 'SJ', name: 'Sălaj' },
  { code: 'SB', name: 'Sibiu' },
  { code: 'SV', name: 'Suceava' },
  { code: 'TR', name: 'Teleorman' },
  { code: 'TM', name: 'Timiș' },
  { code: 'TL', name: 'Tulcea' },
  { code: 'VS', name: 'Vaslui' },
  { code: 'VL', name: 'Vâlcea' },
  { code: 'VN', name: 'Vrancea' },
];

const BY_CODE = new Map(COUNTIES.map((county) => [county.code, county]));

/** The county's name, or the code itself when it is not one of the 42. */
export function countyName(code: string): string {
  return BY_CODE.get(code.trim().toUpperCase())?.name ?? code;
}

export function isCountyCode(code: string): boolean {
  return BY_CODE.has(code.trim().toUpperCase());
}

/**
 * The county a Romanian city sits in, by name.
 *
 * `src/lib/cities.ts` carries the county seats with their county in
 * `region`; this maps that name back to a code so a request published from
 * a known city can be matched against a county carrier's coverage. A city
 * that is not on the list gives null, and county matching then declines
 * rather than guesses — which is the same thing `company_matches_request`
 * does with a null `loading_county`.
 */
const BY_NAME = new Map(COUNTIES.map((county) => [fold(county.name), county.code]));

export function countyCodeFor(name: string | null | undefined): string | null {
  if (!name) return null;
  return BY_NAME.get(fold(name)) ?? null;
}

/** Diacritics and case removed, so `Timis` finds `Timiș`. */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[șşȘŞ]/g, 's')
    .replace(/[țţȚŢ]/g, 't')
    .toLowerCase()
    .trim();
}

/**
 * The county a known Romanian city sits in, as a code.
 *
 * `cities.ts` carries the county seats with their county in `region`; this
 * maps that back to a code, which is what `companies.coverage_counties`
 * holds. A city outside the list — most of them — gives null, and county
 * matching then declines rather than guesses, exactly as
 * `company_matches_request` does with a null `loading_county`.
 *
 * This is the temporary shape of it. When the `localities` table lands,
 * the county comes with the row and this goes.
 */
export function countyCodeForCity(city: string, country: string): string | null {
  if (country.trim().toUpperCase() !== 'RO') return null;
  const found = findCity(city, country);
  return found ? countyCodeFor(found.region) : null;
}
