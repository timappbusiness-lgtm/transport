/**
 * Every internal link comes from here, so a route rename is one edit and
 * a dead link is a type error rather than a 404 someone finds in
 * production.
 *
 * Routes marked `built: false` have no page yet. The homepage task adds a
 * minimal "Pagină în lucru" placeholder for each so nothing dead ships.
 */
export const ROUTES = {
  home: '/',
  newRequest: '/cerere/noua',
  routes: '/trasee',
  carrierSignup: '/transportatori/inscriere',
  signIn: '/autentificare',
  terms: '/termeni',
  privacy: '/confidentialitate',
  contact: '/contact',
} as const;

export type RouteKey = keyof typeof ROUTES;
export type Route = (typeof ROUTES)[RouteKey];

/** Routes that still need a placeholder page. Kept in sync by a unit test. */
export const UNBUILT_ROUTES: readonly Route[] = [
  ROUTES.newRequest,
  ROUTES.routes,
  ROUTES.carrierSignup,
  ROUTES.signIn,
  ROUTES.terms,
  ROUTES.privacy,
  ROUTES.contact,
] as const;
