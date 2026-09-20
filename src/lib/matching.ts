import type { CoverageScope } from './company-profile';
import { countyCodeForCity } from './counties';
import { straightLineKm, type LatLng } from './pricing';
import type { PublicRequest } from './requests';

/**
 * Which published requests are worth showing a carrier.
 *
 * This is deliberately a weak rule, and it is labelled as one on screen:
 * "potrivire după traseu" rather than "cereri pentru tine". It compares
 * countries and date windows, nothing more. A carrier running
 * Timișoara–München does not want a Constanța–Sofia request in their
 * dashboard, and country-level matching is enough to keep it out; anything
 * cleverer would need distances from a corridor, which we do not compute
 * yet and should not pretend to.
 *
 * Since the company profile landed there is a second dimension, and it is
 * the stronger one: what the firm said it carries, where, and with what.
 * That half has a twin in Postgres — `public.company_matches_request`,
 * which decides who gets an e-mail — and the two are deliberately the same
 * rule. `carries()` below is written case for case against the FIRM block
 * of `supabase/tests/rls_test.sql`, so a change to one shows up as a
 * failure against the other.
 *
 * Everything here is a *filter*, never a score. A marketplace that ranks
 * carriers by a number it invented is a marketplace that has to defend the
 * number.
 *
 * Free of React and of SQL, so the rule can be argued about in a test.
 */

export interface CarrierRoute {
  fromCountry: string;
  toCountry: string;
  /** Inclusive, ISO `YYYY-MM-DD`. */
  availableFrom: string;
  /** null means open-ended. */
  availableTo: string | null;
  /** Where the route starts and ends, when both are known. */
  from?: LatLng | null;
  to?: LatLng | null;
  /** For the sentence: „față de traseul Timișoara — München". */
  fromCity?: string;
  toCity?: string;
  /**
   * `truck_listings.max_detour_km`. Null, or zero, means the carrier has
   * not said, and the platform default applies — see `DetourSettings`.
   */
  maxDetourKm?: number | null;
}

/**
 * The two dials the detour needs, mirroring `public.matching_settings`
 * and `price_settings.road_distance_factor`.
 *
 * Passed in rather than imported so a test can state them, and so the
 * one place that reads the tables reads them once per page rather than
 * once per row.
 */
export interface DetourSettings {
  /** `matching_settings.default_detour_km`. */
  defaultDetourKm: number;
  /** `price_settings.road_distance_factor`. */
  roadFactor: number;
}

/**
 * What the database ships with, for a page that could not read the
 * tables. Kept equal to the column defaults in
 * `20260921100000_faza1_final.sql` and `20260916120500_billing_access.sql`.
 */
export const DEFAULT_DETOUR_SETTINGS: DetourSettings = {
  defaultDetourKm: 50,
  roadFactor: 1.25,
};

/** What one route can do for one request. */
export interface DetourFit {
  /** Extra kilometres, already scaled by the road factor. */
  detourKm: number;
  /** The tolerance that was applied, whether the carrier's or the default. */
  toleranceKm: number;
  within: boolean;
  fromCity: string;
  toCity: string;
}

/**
 * What the firm said about itself, as matching reads it.
 *
 * The array fields are read with "empty means has not said", which is
 * taken as "all" rather than "none": a carrier that never opened the tab
 * must not silently stop being offered work.
 */
export interface CarrierProfile {
  companyType: 'transport' | 'expeditie' | 'both';
  coverageScope: CoverageScope;
  coverageCounties: readonly string[];
  coverageCountries: readonly string[];
  vehicleTypesAccepted: readonly string[];
  equipment: readonly string[];
  services: readonly string[];
}

/** Why a request was shown, for the chips on the card. */
export type MatchReason = 'ruta' | 'judet' | 'tara' | 'categorie' | 'troliu' | 'tractare';

/** Up to this many, because a dashboard is not a board. */
export const MATCH_LIMIT = 5;

export function matchingRequests(
  requests: readonly PublicRequest[],
  routes: readonly CarrierRoute[],
  limit: number = MATCH_LIMIT,
  profile: CarrierProfile | null = null,
  settings: DetourSettings = DEFAULT_DETOUR_SETTINGS,
): PublicRequest[] {
  // A firm with a profile is matched on it whether or not it has published
  // a route: the profile is the standing answer, a route is this week's.
  if (routes.length === 0 && profile === null) return [];

  return requests
    .filter((request) => {
      if (profile !== null && !carries(request, profile)) return false;
      if (!detourOk(request, routes, settings)) return false;
      if (routes.length === 0) return true;
      return routes.some((route) => matches(request, route));
    })
    .slice(0, limit);
}

/**
 * The extra kilometres of taking a request while running a route.
 *
 *     d(A,P) + d(P,Q) + d(Q,B) − d(A,B)
 *
 * That is what a dispatcher means by „ocol": not how near the request
 * passes, but how much further the truck drives to pick it up and drop
 * it off. Straight-line legs from `straightLineKm`, the same formula as
 * `public.distance_km`, scaled by the road factor so the answer is
 * comparable to a tolerance somebody typed while thinking about roads.
 *
 * Null when a coordinate is missing, and every caller reads null as
 * „cannot tell" rather than as zero: a request whose city never resolved
 * must not be declared a perfect fit.
 *
 * The twin of `public.detour_km`. The two are kept the same on purpose —
 * `tests/unit/matching.test.ts` states the numbers, the DET block of
 * `supabase/tests/rls_test.sql` states them again against the database.
 */
export function detourKm(
  route: CarrierRoute,
  pickup: LatLng | null,
  dropoff: LatLng | null,
  roadFactor: number = DEFAULT_DETOUR_SETTINGS.roadFactor,
): number | null {
  const a = route.from ?? null;
  const b = route.to ?? null;
  if (a === null || b === null || pickup === null || dropoff === null) return null;

  const extra =
    straightLineKm(a, pickup) +
    straightLineKm(pickup, dropoff) +
    straightLineKm(dropoff, b) -
    straightLineKm(a, b);

  return Math.max(0, Math.round(extra * roadFactor));
}

/** The tolerance a route allows: its own, or the platform default. */
export function toleranceFor(route: CarrierRoute, settings: DetourSettings): number {
  const own = route.maxDetourKm ?? 0;
  return own > 0 ? own : settings.defaultDetourKm;
}

/**
 * The best any of these routes can do for this request.
 *
 * Null when no route could be measured — no coordinates on either end —
 * which is a real answer and not a zero. `public.best_route_detour` is
 * the twin, and returns no rows in the same case.
 */
export function bestRouteDetour(
  request: PublicRequest,
  routes: readonly CarrierRoute[],
  settings: DetourSettings = DEFAULT_DETOUR_SETTINGS,
): DetourFit | null {
  const pickup = pointOf(request.from_lat, request.from_lng);
  const dropoff = pointOf(request.to_lat, request.to_lng);
  if (pickup === null || dropoff === null) return null;

  let best: DetourFit | null = null;
  for (const route of routes) {
    const km = detourKm(route, pickup, dropoff, settings.roadFactor);
    if (km === null) continue;
    if (best !== null && km >= best.detourKm) continue;
    const toleranceKm = toleranceFor(route, settings);
    best = {
      detourKm: km,
      toleranceKm,
      within: km <= toleranceKm,
      fromCity: route.fromCity ?? '',
      toCity: route.toCity ?? '',
    };
  }
  return best;
}

/**
 * Whether the detour rules this request out.
 *
 * False only when a route could be measured and every one of them is
 * further off than its own tolerance allows. Nothing measurable is true:
 * unmeasured is not the same as unsuitable, and refusing it would empty
 * the dashboard of every carrier who has not published a route yet.
 * `public.company_detour_ok` says the same thing to the e-mails.
 */
export function detourOk(
  request: PublicRequest,
  routes: readonly CarrierRoute[],
  settings: DetourSettings = DEFAULT_DETOUR_SETTINGS,
): boolean {
  return bestRouteDetour(request, routes, settings)?.within ?? true;
}

function pointOf(lat: number | null | undefined, lng: number | null | undefined): LatLng | null {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  return { lat, lng };
}

/**
 * Whether this firm carries this request, from its profile alone.
 *
 * The same five tests as `public.company_matches_request`, in the same
 * order, for the same reasons — the comments there are the argument; these
 * are the implementation the browser can run without a round trip.
 */
export function carries(request: PublicRequest, profile: CarrierProfile): boolean {
  const from = request.from_country.trim().toUpperCase();
  const to = request.to_country.trim().toUpperCase();
  const domestic = from === to;

  if (domestic && from === 'RO') {
    if (profile.coverageScope === 'judetean') {
      const fromCounty = countyOf(request.from_county, request.from_city, from);
      const toCounty = countyOf(request.to_county, request.to_city, to);
      // An unknown county cannot be proved to be inside the coverage, and a
      // county-only carrier is exactly the firm that should not be sent a
      // job on the other side of the country on a guess.
      if (fromCounty === null || toCounty === null) return false;
      const counties = upper(profile.coverageCounties);
      if (!counties.includes(fromCounty) || !counties.includes(toCounty)) return false;
    }
  } else if (domestic) {
    if (profile.coverageScope !== 'international') return false;
    if (!upper(profile.coverageCountries).includes(from)) return false;
  } else {
    if (profile.coverageScope !== 'international') return false;
    const countries = upper(profile.coverageCountries);
    // Romania is always one of the two ends a Romanian carrier serves, so
    // it never has to be ticked.
    if (from !== 'RO' && !countries.includes(from)) return false;
    if (to !== 'RO' && !countries.includes(to)) return false;
  }

  if (
    profile.vehicleTypesAccepted.length > 0 &&
    !profile.vehicleTypesAccepted.includes(request.category)
  ) {
    return false;
  }

  // A forwarder subcontracts the kit, so the two rules below are about the
  // vehicle that turns up, and a forwarder is not it.
  if (profile.companyType !== 'expeditie') {
    if (request.needs_winch && !profile.equipment.includes('troliu')) return false;
    if (
      request.service_type === 'tractare' &&
      profile.services.length > 0 &&
      !profile.services.includes('tractare')
    ) {
      return false;
    }
  }

  return true;
}

/**
 * The chips a matched card carries: why this one, in at most three words
 * each. Codes, not Romanian — the copy lives in `src/content/`.
 */
export function matchReasons(
  request: PublicRequest,
  profile: CarrierProfile,
  routes: readonly CarrierRoute[] = [],
): MatchReason[] {
  const reasons: MatchReason[] = [];
  if (routes.some((route) => matches(request, route))) reasons.push('ruta');

  const from = request.from_country.trim().toUpperCase();
  const to = request.to_country.trim().toUpperCase();
  if (from === to && from === 'RO') {
    if (profile.coverageScope === 'judetean') reasons.push('judet');
  } else if (profile.coverageScope === 'international') {
    reasons.push('tara');
  }

  if (profile.vehicleTypesAccepted.includes(request.category)) reasons.push('categorie');
  if (request.needs_winch && profile.equipment.includes('troliu')) reasons.push('troliu');
  if (request.service_type === 'tractare' && profile.services.includes('tractare')) {
    reasons.push('tractare');
  }
  return reasons;
}

/**
 * The county a request loads in: the column when the database has it, the
 * city list when it does not.
 *
 * Requests published before migration 20260918090000 have no county on the
 * row, because nothing ever passed one. The city list closes most of that
 * gap without a migration to backfill.
 */
function countyOf(county: string | null, city: string, country: string): string | null {
  const stored = (county ?? '').trim().toUpperCase();
  if (stored !== '') return stored;
  return countyCodeForCity(city, country);
}

function upper(codes: readonly string[]): string[] {
  return codes.map((code) => code.trim().toUpperCase());
}

/**
 * A request matches a route when it runs between the same two countries, in
 * the same direction, and was published while the route is still open.
 *
 * The date test is the request's publication against the route's window: a
 * request published today is relevant to a route leaving next week, but not
 * to one that left last month.
 */
export function matches(request: PublicRequest, route: CarrierRoute): boolean {
  if (!sameCountry(request.from_country, route.fromCountry)) return false;
  if (!sameCountry(request.to_country, route.toCountry)) return false;

  const publishedOn = dayOf(request.published_at);
  if (publishedOn === null) return false;

  // Open-ended routes stay relevant; a closed one stops at its last day.
  if (route.availableTo !== null && publishedOn > route.availableTo) return false;

  return true;
}

/** Country codes arrive from the database as typed; compare them as codes. */
function sameCountry(a: string, b: string): boolean {
  return a.trim().toUpperCase() === b.trim().toUpperCase();
}

/** The `YYYY-MM-DD` part of a timestamp, or null when it is not one. */
function dayOf(iso: string): string | null {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : (date.toISOString().slice(0, 10) ?? null);
}
