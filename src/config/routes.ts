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
  signUp: '/inregistrare',
  authConfirm: '/auth/confirm',
  account: '/cont',
  newCompany: '/cont/firma/noua',
  phone: '/cont/telefon',
  adminDocuments: '/admin/documente',
  adminStaff: '/admin/personal',
  terms: '/termeni',
  privacy: '/confidentialitate',
  contact: '/contact',
} as const;

/** Company pages carry the company id. */
export const companyRoutes = (companyId: string) => ({
  overview: `/cont/firma/${companyId}`,
  documents: `/cont/firma/${companyId}/documente`,
  fleet: `/cont/firma/${companyId}/flota`,
  vehicle: (vehicleId: string) => `/cont/firma/${companyId}/flota/${vehicleId}`,
});

export type RouteKey = keyof typeof ROUTES;
export type Route = (typeof ROUTES)[RouteKey];

/** Routes that still need a placeholder page. Kept in sync by a unit test. */
export const UNBUILT_ROUTES: readonly Route[] = [
  ROUTES.newRequest,
  ROUTES.routes,
  ROUTES.terms,
  ROUTES.privacy,
  ROUTES.contact,
] as const;
