#!/usr/bin/env node
/**
 * Regenerates the localities seed migration from open data.
 *
 *   node scripts/import-localities.mjs > supabase/migrations/<ts>_localitati_import.sql
 *
 * Sources, both open and both credited in docs/14-localitati.md:
 *
 *   - GeoNames cities1000, through the `all-the-cities` npm package.
 *     Every settlement above 1.000 inhabitants, with population,
 *     coordinates, the GeoNames admin1 code and a feature code.
 *     GeoNames data is CC BY 4.0; the package is MIT.
 *
 * One source, deliberately. A second — `dr5hn/countries-states-cities-
 * database`, joined on (country, FIPS code) — was tried for the name of
 * the admin1 division and dropped: GeoNames admin1 codes are not FIPS
 * codes for every country, and the join produced Brno in „Praha-východ",
 * Plzeň in „Vsetín", Barcelona in „Tarragona" and Lyon in „Occitanie".
 * A gazetteer with confidently wrong regions is worse than one with
 * none, so a foreign city carries its country and nothing else.
 *
 * What it selects:
 *
 *   - Romania, every locality at or above 3.000 inhabitants, deduplicated
 *     by name — the table's key is (name, country) and Romania has seven
 *     Slobozia. All 41 county seats survive that, by sorting seats first.
 *   - The eighteen corridor countries, every city at or above 50.000,
 *     plus every capital whatever its size.
 *
 * What it excludes: `PPLX`, a section of a city. Those are Bucharest's
 * sectors, Hamburg's boroughs and London's — a person asking for
 * transport to „Sector 3" means Bucharest, and a gazetteer that offers
 * both makes them choose between two right answers.
 *
 * Two corrections the data needs:
 *
 *   - Romanian text uses the comma-below ș and ț. GeoNames carries the
 *     Turkish cedilla ş and ţ in places, so `Iaşi` becomes `Iași`.
 *   - GeoNames stores the English exonym as the primary name for major
 *     cities: Munich, Rome, Vienna, Prague, Bucharest. The local name is
 *     what a person types and what a carrier reads, so LOCAL_NAMES below
 *     puts it back — and the English form is kept as an alias, which is
 *     exactly what the alias column is for.
 *
 * The 75 rows written by hand first keep their name, region and
 * coordinates: those were checked, and published listings point at them.
 * What they gain is the data they never had — population, the county-seat
 * flag, aliases — because `on conflict do nothing` left them without it,
 * and a gazetteer where 72 of the largest Romanian cities have no
 * population sorts them last. `source` stays `manual` on those and is
 * `geonames` on the rest, so a later re-import knows what it may touch.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

/** The corridors this exchange runs, besides Romania. */
const CORRIDOR = [
  'DE', 'IT', 'NL', 'BE', 'FR', 'ES', 'AT', 'HU',
  'PL', 'CZ', 'SK', 'CH', 'GB', 'BG', 'GR', 'PT', 'SE', 'DK',
];

const RO_MIN_POPULATION = 3000;
const FOREIGN_MIN_POPULATION = 50000;

/** A section of a city — a sector, a borough. Never its own locality. */
const EXCLUDED_FEATURES = new Set(['PPLX']);

/**
 * GeoNames admin1 code to Romanian county, written out because it is
 * forty-two rows that never change and because the joined source spells
 * several of them without their diacritics.
 */
const RO_COUNTIES = {
  '01': 'Alba', '02': 'Arad', '03': 'Argeș', '04': 'Bacău', '05': 'Bihor',
  '06': 'Bistrița-Năsăud', '07': 'Botoșani', '08': 'Brăila', '09': 'Brașov',
  10: 'București', 11: 'Buzău', 12: 'Caraș-Severin', 13: 'Cluj',
  14: 'Constanța', 15: 'Covasna', 16: 'Dâmbovița', 17: 'Dolj', 18: 'Galați',
  19: 'Gorj', 20: 'Harghita', 21: 'Hunedoara', 22: 'Ialomița', 23: 'Iași',
  25: 'Maramureș', 26: 'Mehedinți', 27: 'Mureș', 28: 'Neamț', 29: 'Olt',
  30: 'Prahova', 31: 'Sălaj', 32: 'Satu Mare', 33: 'Sibiu', 34: 'Suceava',
  35: 'Teleorman', 36: 'Timiș', 37: 'Tulcea', 38: 'Vaslui', 39: 'Vâlcea',
  40: 'Vrancea', 41: 'Călărași', 42: 'Giurgiu', 51: 'Ilfov',
};

/**
 * English exonym to the name people actually use, with the exonym kept
 * as an alias. Only where the two differ — Köln, Łódź and Zürich already
 * arrive local and are not here.
 */
const LOCAL_NAMES = {
  'RO:Bucharest': 'București',
  'DE:Munich': 'München',
  'DE:Cologne': 'Köln',
  'DE:Nuremberg': 'Nürnberg',
  'DE:Hanover': 'Hannover',
  'DE:Brunswick': 'Braunschweig',
  'AT:Vienna': 'Wien',
  'CZ:Prague': 'Praha',
  'CZ:Pilsen': 'Plzeň',
  'PL:Warsaw': 'Warszawa',
  'PL:Cracow': 'Kraków',
  'IT:Rome': 'Roma',
  'IT:Milan': 'Milano',
  'IT:Naples': 'Napoli',
  'IT:Turin': 'Torino',
  'IT:Genoa': 'Genova',
  'IT:Florence': 'Firenze',
  'IT:Venice': 'Venezia',
  'IT:Padua': 'Padova',
  'IT:Leghorn': 'Livorno',
  'IT:Syracuse': 'Siracusa',
  'IT:Mantua': 'Mantova',
  'BE:Brussels': 'Bruxelles',
  'BE:Antwerp': 'Antwerpen',
  'BE:Ghent': 'Gent',
  'BE:Bruges': 'Brugge',
  'NL:The Hague': 'Den Haag',
  'DK:Copenhagen': 'København',
  'DK:Aarhus': 'Århus',
  'SE:Gothenburg': 'Göteborg',
  'GR:Athens': 'Athína',
  'GR:Salonica': 'Thessaloníki',
  'PT:Lisbon': 'Lisboa',
  'ES:Seville': 'Sevilla',
  'ES:Saragossa': 'Zaragoza',
  'CH:Geneva': 'Genève',
  'CH:Basle': 'Basel',
  'BG:Sofiya': 'Sofia',
  'SK:Kosice': 'Košice',
  'HU:Bekescsaba': 'Békéscsaba',
};

/** The Romanian name of each corridor country, for a region fallback. */
const COUNTRY_NAMES = {
  RO: 'România', DE: 'Germania', IT: 'Italia', NL: 'Țările de Jos',
  BE: 'Belgia', FR: 'Franța', ES: 'Spania', AT: 'Austria', HU: 'Ungaria',
  PL: 'Polonia', CZ: 'Cehia', SK: 'Slovacia', CH: 'Elveția',
  GB: 'Regatul Unit', BG: 'Bulgaria', GR: 'Grecia', PT: 'Portugalia',
  SE: 'Suedia', DK: 'Danemarca',
};

/** Cedilla to comma-below, which is the correct Romanian letter. */
function fixDiacritics(name) {
  return name.replace(/ş/g, 'ș').replace(/Ş/g, 'Ș').replace(/ţ/g, 'ț').replace(/Ţ/g, 'Ț');
}

function inScope(city) {
  if (EXCLUDED_FEATURES.has(city.featureCode)) return false;
  if (city.country === 'RO') return city.population >= RO_MIN_POPULATION;
  if (!CORRIDOR.includes(city.country)) return false;
  return city.population >= FOREIGN_MIN_POPULATION || city.featureCode === 'PPLC';
}

/**
 * The județ for a Romanian locality, the country for anything else.
 *
 * Romania is exact: `RO_COUNTIES` is forty-two rows written out by hand
 * against the GeoNames admin1 codes. Abroad there is no source here that
 * gets the division right often enough to be worth showing — see the
 * note at the top — and „Praha · Cehia" is what a Romanian reader needs
 * from that line anyway.
 */
function regionOf(city) {
  if (city.country === 'RO') {
    return RO_COUNTIES[city.adminCode] ?? COUNTRY_NAMES.RO;
  }
  return COUNTRY_NAMES[city.country] ?? city.country;
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function main() {
  const cities = require('all-the-cities');

  const rows = [];
  const seen = new Set();

  /**
   * Deduplicated by (name, country), because that is the table's unique
   * key — Romania has seven Slobozia and four Călărași.
   *
   * Which one survives is not arbitrary and must not be: sorted so a
   * county seat wins, then the larger population. Written in source
   * order first, three county seats — Slatina, Satu Mare, Slobozia —
   * lost to a village of the same name that GeoNames happened to list
   * earlier, and the gazetteer came out with 38 seats instead of 41.
   */
  const ordered = [...cities].sort((a, b) => {
    const seat = (c) => (c.featureCode === 'PPLA' || c.featureCode === 'PPLC' ? 1 : 0);
    return seat(b) - seat(a) || b.population - a.population;
  });

  for (const city of ordered) {
    if (!inScope(city)) continue;

    const raw = fixDiacritics(city.name);
    const local = LOCAL_NAMES[`${city.country}:${city.name}`] ?? raw;
    const key = `${local.toLowerCase()}|${city.country}`;
    if (seen.has(key)) continue;
    seen.add(key);

    // The English form is an alias when we replaced it, never a second row.
    const aliases = local === raw ? [] : [raw];

    rows.push({
      name: local,
      region: fixDiacritics(regionOf(city)),
      country: city.country,
      lat: city.loc.coordinates[1],
      lng: city.loc.coordinates[0],
      population: city.population,
      isCountySeat: city.country === 'RO' && (city.featureCode === 'PPLA' || city.featureCode === 'PPLC'),
      aliases,
    });
  }

  rows.sort((a, b) =>
    a.country === b.country ? b.population - a.population : a.country.localeCompare(b.country),
  );

  const ro = rows.filter((r) => r.country === 'RO').length;
  const seats = rows.filter((r) => r.isCountySeat).length;

  const out = [];
  out.push('-- Generat de scripts/import-localities.mjs. Nu se editează de mână.');
  out.push('--');
  out.push('-- Sursă: GeoNames cities1000 (CC BY 4.0), prin pachetul npm');
  out.push('-- `all-the-cities` (MIT). Vezi docs/14-localitati.md pentru');
  out.push('-- licență, prag și cum se rulează din nou.');
  out.push('--');
  out.push(`-- ${rows.length} localități: ${ro} din România (peste ${RO_MIN_POPULATION}`);
  out.push(`-- de locuitori, între ele toate cele ${seats} reședințe de județ) și`);
  out.push(`-- ${rows.length - ro} din cele ${CORRIDOR.length} țări de pe coridoarele noastre`);
  out.push(`-- (peste ${FOREIGN_MIN_POPULATION} de locuitori, plus fiecare capitală).`);
  out.push('--');
  out.push('-- Rândurile scrise de mână își păstrează numele, regiunea și');
  out.push('-- coordonatele — au fost verificate și sunt referite de anunțuri.');
  out.push('-- Primesc doar ce nu aveau: populație, reședință de județ, aliasuri.');
  out.push('');
  out.push('insert into public.localities');
  out.push('  (name, region, country, lat, lng, population, is_county_seat,');
  out.push('   aliases, source)');
  out.push('values');

  const values = rows.map((r) => {
    const aliases = r.aliases.length === 0
      ? "'{}'"
      : `array[${r.aliases.map(sqlString).join(', ')}]`;
    return `  (${sqlString(r.name)}, ${sqlString(r.region)}, ${sqlString(r.country)}, `
      + `${r.lat.toFixed(6)}, ${r.lng.toFixed(6)}, ${r.population}, `
      + `${r.isCountySeat}, ${aliases}, 'geonames')`;
  });
  out.push(values.join(',\n'));
  out.push('on conflict (name, country) do update set');
  out.push('  -- Numele, regiunea și coordonatele rândului existent rămân: au');
  out.push('  -- fost verificate de mână și sunt referite de anunțuri publicate.');
  out.push('  -- Restul se completează, fiindcă lipsea.');
  out.push('  population = coalesce(excluded.population, localities.population),');
  out.push('  is_county_seat = localities.is_county_seat or excluded.is_county_seat,');
  out.push("  aliases = (select array(select distinct e from unnest(localities.aliases || excluded.aliases) e where e <> ''));");
  out.push('');

  process.stdout.write(`${out.join('\n')}\n`);
  process.stderr.write(`${rows.length} rows (${ro} RO, ${seats} county seats)\n`);
}

main();
