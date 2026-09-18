import { findCity, type City } from './cities';
import { COUNTIES, countyName } from './counties';
import { CARGO_CATEGORY_LABELS, type CargoCategory } from './departures';
import { EMPTY_PREFILL, prefillQuery, type Prefill } from './price-prefill';

/**
 * Landing pages for organic search.
 *
 * The rule that shapes this file: **a landing page stores words and reads
 * numbers.** The row in `seo_pages` carries a title, a heading, an intro
 * and its questions; the price, the distance, the count of verified firms
 * and what is on the board today are all read live at render time. A
 * figure written into a row is a figure that goes stale silently, and a
 * stale price on a page built to be found by strangers is the most
 * expensive kind of lie a marketplace can tell.
 *
 * Free of React and of Supabase, so the URL shapes and the prefills can be
 * argued about in a test.
 */

export type SeoPageType =
  | 'corridor_international'
  | 'route_internal'
  | 'county'
  | 'vehicle_type';

export interface FaqItem {
  q: string;
  a: string;
}

export interface SeoPage {
  id: string;
  type: SeoPageType;
  slug: string;
  title: string;
  /** The ink half of the two-tone heading. */
  h1: string;
  /** The grey half, or null. */
  h1Soft: string | null;
  intro: string;
  /**
   * What the page is about, in codes:
   *   corridor_international  origin = country code, destination = 'RO'
   *   route_internal          origin, destination = city names
   *   county                  origin = ISO 3166-2:RO county code
   *   vehicle_type            vehicleType set, origin and destination null
   */
  origin: string | null;
  destination: string | null;
  vehicleType: string | null;
  faq: FaqItem[];
  isPublished: boolean;
  publishedAt: string | null;
  updatedAt: string;
}

export const SEO_PAGE_TYPES: readonly SeoPageType[] = [
  'corridor_international',
  'route_internal',
  'county',
  'vehicle_type',
];

/** The root every landing page hangs off. One place, so it can move. */
export const SEO_ROOT = '/transport-auto';
export const SEO_COUNTY_SEGMENT = 'judet';

/**
 * Counties live one segment deeper so a county slug can never collide with
 * a corridor or a vehicle type — `arad` the county and `arad` in a city
 * pair are different pages, and a namespace that has to be checked by hand
 * is a namespace that breaks the first time somebody adds a row.
 */
export function pageHref(page: Pick<SeoPage, 'type' | 'slug'>): string {
  return page.type === 'county'
    ? `${SEO_ROOT}/${SEO_COUNTY_SEGMENT}/${page.slug}`
    : `${SEO_ROOT}/${page.slug}`;
}

/** The ten countries this market runs to, in Romanian. */
export const CORRIDOR_COUNTRIES: Record<string, string> = {
  DE: 'Germania',
  IT: 'Italia',
  NL: 'Țările de Jos',
  BE: 'Belgia',
  FR: 'Franța',
  ES: 'Spania',
  AT: 'Austria',
  HU: 'Ungaria',
  GB: 'Marea Britanie',
  RO: 'România',
};

export function corridorCountryName(code: string): string {
  return CORRIDOR_COUNTRIES[code.trim().toUpperCase()] ?? code.toUpperCase();
}

/**
 * The five vehicle-type pages.
 *
 * `nefunctional` is not a category but a condition, and it is the one with
 * the clearest search intent on this market: somebody whose car will not
 * start is looking for a winch, not for a taxonomy.
 */
export const VEHICLE_TYPE_PAGES: Record<
  string,
  { label: string; category: CargoCategory | null; isRunning: boolean | null }
> = {
  autoturism: { label: 'Autoturism', category: 'autoturism', isRunning: null },
  autoutilitara: { label: 'Autoutilitară', category: 'autoutilitara', isRunning: null },
  motocicleta: { label: 'Motocicletă', category: 'motocicleta', isRunning: null },
  microbuz: { label: 'Microbuz', category: 'microbuz', isRunning: null },
  nefunctional: {
    label: 'Vehicul care nu pornește',
    category: 'autoturism',
    isRunning: false,
  },
};

export function vehicleTypeLabel(code: string): string {
  return (
    VEHICLE_TYPE_PAGES[code]?.label ??
    CARGO_CATEGORY_LABELS[code as CargoCategory] ??
    code
  );
}

// ---------------------------------------------------------------------
// What a page hands the request form
//
// Only what the page actually knows. A corridor page knows the country and
// not the town — the car is somewhere in Germany, and which somewhere is
// the visitor's to type — and a county page knows neither, so it prefills
// nothing rather than guessing at the county seat. A guess here costs
// somebody a wrong pickup address they did not notice was filled in.
// ---------------------------------------------------------------------

export function prefillFor(page: SeoPage): Prefill {
  const prefill: Prefill = { ...EMPTY_PREFILL };

  switch (page.type) {
    case 'corridor_international':
      prefill.fromCountry = page.origin;
      prefill.toCountry = page.destination;
      break;

    case 'route_internal': {
      // Both ends are county seats, so both resolve — and if one ever does
      // not, the form gets the country and the visitor types the town.
      prefill.from = page.origin ? findCity(page.origin, 'RO') : null;
      prefill.to = page.destination ? findCity(page.destination, 'RO') : null;
      if (!prefill.from) prefill.fromCountry = 'RO';
      if (!prefill.to) prefill.toCountry = 'RO';
      break;
    }

    case 'vehicle_type': {
      const type = page.vehicleType ? VEHICLE_TYPE_PAGES[page.vehicleType] : undefined;
      if (type) {
        prefill.category = type.category;
        prefill.isRunning = type.isRunning;
      }
      break;
    }

    case 'county':
      // Nothing. A county is not a pickup address, and filling the county
      // seat in would put a town in the box that nobody chose.
      break;
  }

  return prefill;
}

/** `/cerere/noua?…` for this page's call to action. */
export function requestHref(page: SeoPage, newRequestRoute: string): string {
  return `${newRequestRoute}${prefillQuery(prefillFor(page))}`;
}

/** `/cereri?…` — the board, filtered to what this page is about. */
export function boardHref(page: SeoPage, boardRoute: string): string {
  const params = new URLSearchParams();
  if (page.type === 'corridor_international') {
    if (page.origin) params.set('tara-plecare', page.origin);
    if (page.destination) params.set('tara-sosire', page.destination);
  }
  if (page.type === 'vehicle_type') {
    const type = page.vehicleType ? VEHICLE_TYPE_PAGES[page.vehicleType] : undefined;
    if (type?.category) params.set('categorie', type.category);
    if (type?.isRunning === false) params.set('stare', 'nu-ruleaza');
  }
  const query = params.toString();
  return query === '' ? boardRoute : `${boardRoute}?${query}`;
}

// ---------------------------------------------------------------------
// The two cities of a route page
// ---------------------------------------------------------------------

export interface RouteEnds {
  from: City;
  to: City;
}

/** Both ends with coordinates, or null when either is not on the list. */
export function routeEnds(page: SeoPage): RouteEnds | null {
  if (page.type !== 'route_internal' || !page.origin || !page.destination) return null;
  const from = findCity(page.origin, 'RO');
  const to = findCity(page.destination, 'RO');
  return from && to ? { from, to } : null;
}

/**
 * The reference pair for a corridor: the busiest city we know in that
 * country, and Bucharest.
 *
 * Used only to put a distance and an indicative price on a corridor page.
 * It is labelled on screen as what it is — an example route — because a
 * corridor is not a route and a single number pretending otherwise would
 * be wrong for most visitors.
 */
export const CORRIDOR_REFERENCE_CITY: Record<string, string> = {
  DE: 'München',
  IT: 'Milano',
  NL: 'Amsterdam',
  BE: 'Bruxelles',
  FR: 'Paris',
  ES: 'Madrid',
  AT: 'Viena',
  HU: 'Budapesta',
  GB: 'Londra',
};

export function corridorEnds(page: SeoPage): RouteEnds | null {
  if (page.type !== 'corridor_international' || !page.origin) return null;
  const cityName = CORRIDOR_REFERENCE_CITY[page.origin.toUpperCase()];
  const from = cityName ? findCity(cityName, page.origin.toUpperCase()) : null;
  const to = findCity('București', 'RO');
  return from && to ? { from, to } : null;
}

// ---------------------------------------------------------------------
// Internal linking
//
// Related pages of the same kind, because a visitor on a corridor page is
// looking for corridors. Bounded, ordered and never including the page
// itself — a "see also" list that links to the page you are on is the
// clearest possible sign that nobody read it.
// ---------------------------------------------------------------------

export const RELATED_LIMIT = 6;

export function relatedPages(
  page: SeoPage,
  all: readonly SeoPage[],
  limit: number = RELATED_LIMIT,
): SeoPage[] {
  const others = all.filter((p) => p.slug !== page.slug && p.type === page.type);

  if (page.type === 'route_internal' && page.origin) {
    // Routes that share an end come first: somebody reading about
    // București–Cluj is more likely to want București–Timișoara than
    // Arad–Sibiu.
    const shares = (p: SeoPage) =>
      p.origin === page.origin ||
      p.destination === page.origin ||
      p.origin === page.destination ||
      p.destination === page.destination;
    return [...others.filter(shares), ...others.filter((p) => !shares(p))].slice(0, limit);
  }

  if (page.type === 'county' && page.origin) {
    const neighbours = COUNTY_NEIGHBOURS[page.origin] ?? [];
    const rank = (p: SeoPage) =>
      p.origin && neighbours.includes(p.origin) ? 0 : 1;
    return [...others].sort((a, b) => rank(a) - rank(b)).slice(0, limit);
  }

  return others.slice(0, limit);
}

/**
 * Which counties touch which.
 *
 * Hand-written from the map rather than computed: there is no geometry in
 * this database and there does not need to be for a "see also" list. Only
 * the pairs that share a border are here, and the list is symmetric by
 * construction below.
 */
const BORDERS: ReadonlyArray<readonly [string, string]> = [
  ['AB', 'CJ'], ['AB', 'MS'], ['AB', 'SB'], ['AB', 'VL'], ['AB', 'HD'], ['AB', 'BH'], ['AB', 'AR'],
  ['AR', 'BH'], ['AR', 'TM'], ['AR', 'HD'], ['AR', 'CS'],
  ['AG', 'DB'], ['AG', 'VL'], ['AG', 'SB'], ['AG', 'BV'], ['AG', 'OT'], ['AG', 'TR'], ['AG', 'GR'],
  ['BC', 'NT'], ['BC', 'IS'], ['BC', 'VS'], ['BC', 'VN'], ['BC', 'CV'], ['BC', 'HR'],
  ['BH', 'SM'], ['BH', 'SJ'], ['BH', 'CJ'],
  ['BN', 'CJ'], ['BN', 'MS'], ['BN', 'SV'], ['BN', 'MM'],
  ['BT', 'SV'], ['BT', 'IS'],
  ['BV', 'CV'], ['BV', 'HR'], ['BV', 'MS'], ['BV', 'SB'], ['BV', 'DB'], ['BV', 'PH'], ['BV', 'BZ'],
  ['BR', 'GL'], ['BR', 'VN'], ['BR', 'BZ'], ['BR', 'IL'], ['BR', 'TL'],
  ['B', 'IF'],
  ['BZ', 'VN'], ['BZ', 'PH'], ['BZ', 'IL'], ['BZ', 'CL'],
  ['CS', 'TM'], ['CS', 'HD'], ['CS', 'GJ'], ['CS', 'MH'],
  ['CL', 'IL'], ['CL', 'IF'], ['CL', 'GR'], ['CT', 'IL'], ['CT', 'CL'], ['CT', 'TL'],
  ['CJ', 'SJ'], ['CJ', 'MS'],
  ['CV', 'HR'], ['CV', 'VN'], ['CV', 'BZ'],
  ['DB', 'PH'], ['DB', 'IF'], ['DB', 'GR'], ['DB', 'TR'],
  ['DJ', 'MH'], ['DJ', 'GJ'], ['DJ', 'VL'], ['DJ', 'OT'],
  ['GL', 'VN'], ['GL', 'VS'], ['GL', 'TL'],
  ['GR', 'IF'], ['GR', 'TR'],
  ['GJ', 'HD'], ['GJ', 'VL'], ['GJ', 'MH'],
  ['HR', 'MS'], ['HR', 'NT'], ['HR', 'SV'],
  ['HD', 'SB'], ['HD', 'VL'],
  ['IL', 'IF'],
  ['IS', 'NT'], ['IS', 'VS'], ['IS', 'SV'],
  ['MM', 'SM'], ['MM', 'SJ'], ['MM', 'SV'],
  ['MH', 'VL'],
  ['MS', 'SB'], ['MS', 'SJ'],
  ['NT', 'SV'],
  ['OT', 'VL'], ['OT', 'TR'], ['OT', 'DJ'],
  ['PH', 'IF'], ['PH', 'BZ'],
  ['SM', 'SJ'],
  ['SB', 'VL'],
  ['VS', 'VN'],
];

export const COUNTY_NEIGHBOURS: Record<string, string[]> = (() => {
  const map: Record<string, string[]> = {};
  for (const county of COUNTIES) map[county.code] = [];
  for (const [a, b] of BORDERS) {
    map[a]?.push(b);
    map[b]?.push(a);
  }
  for (const code of Object.keys(map)) map[code] = [...new Set(map[code])].sort();
  return map;
})();

// ---------------------------------------------------------------------
// What a page is called, in prose
// ---------------------------------------------------------------------

/** "Germania — România", "București — Cluj-Napoca", "județul Cluj", … */
export function pageSubject(page: SeoPage): string {
  switch (page.type) {
    case 'corridor_international':
      return `${corridorCountryName(page.origin ?? '')} — ${corridorCountryName(page.destination ?? 'RO')}`;
    case 'route_internal':
      return `${page.origin ?? ''} — ${page.destination ?? ''}`;
    case 'county':
      return page.origin === 'B' ? 'București' : `județul ${countyName(page.origin ?? '')}`;
    case 'vehicle_type':
      return vehicleTypeLabel(page.vehicleType ?? '');
  }
}

/** The breadcrumb trail, deepest last. `href` is null on the current page. */
export function breadcrumbs(
  page: SeoPage,
  homeLabel: string,
): { label: string; href: string | null }[] {
  const trail: { label: string; href: string | null }[] = [
    { label: homeLabel, href: '/' },
    { label: 'Transport auto', href: SEO_ROOT },
  ];
  if (page.type === 'county') {
    trail.push({ label: 'Județe', href: `${SEO_ROOT}/${SEO_COUNTY_SEGMENT}` });
  }
  trail.push({ label: pageSubject(page), href: null });
  return trail;
}
