import type { CoverageScope } from './company-profile';
import { countyCodeForCity } from './counties';
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
): PublicRequest[] {
  // A firm with a profile is matched on it whether or not it has published
  // a route: the profile is the standing answer, a route is this week's.
  if (routes.length === 0 && profile === null) return [];

  return requests
    .filter((request) => {
      if (profile !== null && !carries(request, profile)) return false;
      if (routes.length === 0) return true;
      return routes.some((route) => matches(request, route));
    })
    .slice(0, limit);
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
