import type { Point } from './pricing';

/**
 * A short list of cities with coordinates, for the price calculator.
 *
 * TEMPORARY, and deliberately small. The real thing is a `localities` table
 * seeded from SIRUTA plus major EU cities, with autocomplete — that belongs
 * to the request-form work (`feature/cerere-noua`), where it is needed for
 * every step rather than just this one.
 *
 * Until then the calculator offers the routes this marketplace actually
 * runs: Romanian county seats, and the European cities Romanians bring cars
 * home from. A person whose town is not here picks the nearest county seat,
 * which is the right precision for an estimate anyway — the range is ±15%,
 * and no two addresses in a county differ by that much on a 1.500 km trip.
 *
 * When `localities` lands, this file goes and the pickers read the table.
 */

export interface City extends Point {
  name: string;
  /** Shown after the name to separate the several Sfântu Gheorghe. */
  region: string;
}

/** Romanian county seats. Coordinates from public sources, 4 decimals. */
const ROMANIA: readonly City[] = [
  { name: 'București', region: 'București', country: 'RO', lat: 44.4268, lng: 26.1025 },
  { name: 'Cluj-Napoca', region: 'Cluj', country: 'RO', lat: 46.7712, lng: 23.6236 },
  { name: 'Timișoara', region: 'Timiș', country: 'RO', lat: 45.7489, lng: 21.2087 },
  { name: 'Iași', region: 'Iași', country: 'RO', lat: 47.1585, lng: 27.6014 },
  { name: 'Constanța', region: 'Constanța', country: 'RO', lat: 44.1598, lng: 28.6348 },
  { name: 'Craiova', region: 'Dolj', country: 'RO', lat: 44.3302, lng: 23.7949 },
  { name: 'Brașov', region: 'Brașov', country: 'RO', lat: 45.6427, lng: 25.5887 },
  { name: 'Galați', region: 'Galați', country: 'RO', lat: 45.4353, lng: 28.008 },
  { name: 'Ploiești', region: 'Prahova', country: 'RO', lat: 44.9367, lng: 26.0225 },
  { name: 'Oradea', region: 'Bihor', country: 'RO', lat: 47.0465, lng: 21.9189 },
  { name: 'Brăila', region: 'Brăila', country: 'RO', lat: 45.2692, lng: 27.9575 },
  { name: 'Arad', region: 'Arad', country: 'RO', lat: 46.1866, lng: 21.3123 },
  { name: 'Pitești', region: 'Argeș', country: 'RO', lat: 44.8565, lng: 24.8692 },
  { name: 'Sibiu', region: 'Sibiu', country: 'RO', lat: 45.7983, lng: 24.1256 },
  { name: 'Bacău', region: 'Bacău', country: 'RO', lat: 46.5670, lng: 26.9146 },
  { name: 'Târgu Mureș', region: 'Mureș', country: 'RO', lat: 46.5425, lng: 24.5579 },
  { name: 'Baia Mare', region: 'Maramureș', country: 'RO', lat: 47.6573, lng: 23.5681 },
  { name: 'Buzău', region: 'Buzău', country: 'RO', lat: 45.1500, lng: 26.8333 },
  { name: 'Botoșani', region: 'Botoșani', country: 'RO', lat: 47.7487, lng: 26.6694 },
  { name: 'Satu Mare', region: 'Satu Mare', country: 'RO', lat: 47.7900, lng: 22.8850 },
  { name: 'Râmnicu Vâlcea', region: 'Vâlcea', country: 'RO', lat: 45.1047, lng: 24.3754 },
  { name: 'Suceava', region: 'Suceava', country: 'RO', lat: 47.6514, lng: 26.2556 },
  { name: 'Piatra Neamț', region: 'Neamț', country: 'RO', lat: 46.9275, lng: 26.3708 },
  { name: 'Drobeta-Turnu Severin', region: 'Mehedinți', country: 'RO', lat: 44.6369, lng: 22.6597 },
  { name: 'Târgu Jiu', region: 'Gorj', country: 'RO', lat: 45.0353, lng: 23.2747 },
  { name: 'Târgoviște', region: 'Dâmbovița', country: 'RO', lat: 44.9250, lng: 25.4569 },
  { name: 'Focșani', region: 'Vrancea', country: 'RO', lat: 45.6960, lng: 27.1864 },
  { name: 'Bistrița', region: 'Bistrița-Năsăud', country: 'RO', lat: 47.1333, lng: 24.4833 },
  { name: 'Reșița', region: 'Caraș-Severin', country: 'RO', lat: 45.3008, lng: 21.8892 },
  { name: 'Slatina', region: 'Olt', country: 'RO', lat: 44.4306, lng: 24.3708 },
  { name: 'Alba Iulia', region: 'Alba', country: 'RO', lat: 46.0733, lng: 23.5805 },
  { name: 'Deva', region: 'Hunedoara', country: 'RO', lat: 45.8833, lng: 22.9000 },
  { name: 'Zalău', region: 'Sălaj', country: 'RO', lat: 47.1911, lng: 23.0572 },
  { name: 'Vaslui', region: 'Vaslui', country: 'RO', lat: 46.6407, lng: 27.7276 },
  { name: 'Giurgiu', region: 'Giurgiu', country: 'RO', lat: 43.9037, lng: 25.9699 },
  { name: 'Tulcea', region: 'Tulcea', country: 'RO', lat: 45.1667, lng: 28.8000 },
  { name: 'Călărași', region: 'Călărași', country: 'RO', lat: 44.2058, lng: 27.3306 },
  { name: 'Alexandria', region: 'Teleorman', country: 'RO', lat: 43.9833, lng: 25.3333 },
  { name: 'Sfântu Gheorghe', region: 'Covasna', country: 'RO', lat: 45.8667, lng: 25.7833 },
  { name: 'Miercurea Ciuc', region: 'Harghita', country: 'RO', lat: 46.3600, lng: 25.8022 },
  { name: 'Slobozia', region: 'Ialomița', country: 'RO', lat: 44.5639, lng: 27.3661 },
  { name: 'Țândărei', region: 'Ialomița', country: 'RO', lat: 44.6500, lng: 27.6667 },
];

/** The European cities this market actually brings cars home from. */
const EUROPE: readonly City[] = [
  { name: 'München', region: 'Bavaria', country: 'DE', lat: 48.1351, lng: 11.582 },
  { name: 'Berlin', region: 'Berlin', country: 'DE', lat: 52.52, lng: 13.405 },
  { name: 'Frankfurt', region: 'Hesse', country: 'DE', lat: 50.1109, lng: 8.6821 },
  { name: 'Hamburg', region: 'Hamburg', country: 'DE', lat: 53.5511, lng: 9.9937 },
  { name: 'Köln', region: 'Renania', country: 'DE', lat: 50.9375, lng: 6.9603 },
  { name: 'Stuttgart', region: 'Baden-Württemberg', country: 'DE', lat: 48.7758, lng: 9.1829 },
  { name: 'Düsseldorf', region: 'Renania', country: 'DE', lat: 51.2277, lng: 6.7735 },
  { name: 'Milano', region: 'Lombardia', country: 'IT', lat: 45.4642, lng: 9.19 },
  { name: 'Roma', region: 'Lazio', country: 'IT', lat: 41.9028, lng: 12.4964 },
  { name: 'Torino', region: 'Piemonte', country: 'IT', lat: 45.0703, lng: 7.6869 },
  { name: 'Verona', region: 'Veneto', country: 'IT', lat: 45.4384, lng: 10.9916 },
  { name: 'Napoli', region: 'Campania', country: 'IT', lat: 40.8518, lng: 14.2681 },
  { name: 'Viena', region: 'Viena', country: 'AT', lat: 48.2082, lng: 16.3738 },
  { name: 'Graz', region: 'Stiria', country: 'AT', lat: 47.0707, lng: 15.4395 },
  { name: 'Budapesta', region: 'Budapesta', country: 'HU', lat: 47.4979, lng: 19.0402 },
  { name: 'Amsterdam', region: 'Olanda de Nord', country: 'NL', lat: 52.3676, lng: 4.9041 },
  { name: 'Rotterdam', region: 'Olanda de Sud', country: 'NL', lat: 51.9244, lng: 4.4777 },
  { name: 'Bruxelles', region: 'Bruxelles', country: 'BE', lat: 50.8503, lng: 4.3517 },
  { name: 'Anvers', region: 'Flandra', country: 'BE', lat: 51.2194, lng: 4.4025 },
  { name: 'Paris', region: 'Île-de-France', country: 'FR', lat: 48.8566, lng: 2.3522 },
  { name: 'Lyon', region: 'Rhône', country: 'FR', lat: 45.764, lng: 4.8357 },
  { name: 'Marsilia', region: 'Provence', country: 'FR', lat: 43.2965, lng: 5.3698 },
  { name: 'Madrid', region: 'Madrid', country: 'ES', lat: 40.4168, lng: -3.7038 },
  { name: 'Barcelona', region: 'Catalonia', country: 'ES', lat: 41.3851, lng: 2.1734 },
  { name: 'Valencia', region: 'Valencia', country: 'ES', lat: 39.4699, lng: -0.3763 },
  { name: 'Londra', region: 'Anglia', country: 'GB', lat: 51.5074, lng: -0.1278 },
  { name: 'Varșovia', region: 'Mazovia', country: 'PL', lat: 52.2297, lng: 21.0122 },
  { name: 'Praga', region: 'Praga', country: 'CZ', lat: 50.0755, lng: 14.4378 },
  { name: 'Zürich', region: 'Zürich', country: 'CH', lat: 47.3769, lng: 8.5417 },
  { name: 'Copenhaga', region: 'Capitala', country: 'DK', lat: 55.6761, lng: 12.5683 },
  { name: 'Stockholm', region: 'Stockholm', country: 'SE', lat: 59.3293, lng: 18.0686 },
  { name: 'Sofia', region: 'Sofia', country: 'BG', lat: 42.6977, lng: 23.3219 },
  { name: 'Chișinău', region: 'Chișinău', country: 'MD', lat: 47.0105, lng: 28.8638 },
];

export const CITIES: readonly City[] = [...ROMANIA, ...EUROPE];

/**
 * The two groups a picker shows, in that order: a Romanian visitor is more
 * often moving a car inside the country than across a border.
 */
export const CITY_GROUPS: ReadonlyArray<{ key: 'ro' | 'eu'; cities: readonly City[] }> = [
  { key: 'ro', cities: ROMANIA },
  { key: 'eu', cities: EUROPE },
];

/** "cluj napoca" and "Cluj-Napoca" are the same name. */
function normalise(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

const BY_KEY = new Map(CITIES.map((city) => [normalise(`${city.name}${city.country}`), city]));

/** The value a picker submits, and the one a shared link carries. */
export function cityValue(city: City): string {
  return `${city.name}|${city.country}`;
}

/** How the picker and the result read it back: "Cluj-Napoca, Cluj (RO)". */
export function cityLabel(city: City): string {
  return city.name === city.region
    ? `${city.name} (${city.country})`
    : `${city.name}, ${city.region} (${city.country})`;
}

/**
 * Back from a value, or null when it names nothing we know.
 *
 * Forgiving about spelling and diacritics because this also parses a query
 * string, which is to say anything at all.
 */
export function cityFromValue(value: string | null | undefined): City | null {
  if (!value) return null;
  const [name, country] = value.split('|');
  if (!name || !country) return null;
  return BY_KEY.get(normalise(`${name}${country}`)) ?? null;
}
