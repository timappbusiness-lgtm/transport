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

/** Up to this many, because a dashboard is not a board. */
export const MATCH_LIMIT = 5;

export function matchingRequests(
  requests: readonly PublicRequest[],
  routes: readonly CarrierRoute[],
  limit: number = MATCH_LIMIT,
): PublicRequest[] {
  if (routes.length === 0) return [];

  return requests.filter((request) => routes.some((route) => matches(request, route))).slice(0, limit);
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
