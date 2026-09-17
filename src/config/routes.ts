/**
 * Every internal link comes from here, so a route rename is one edit and a
 * dead link is a type error rather than a 404 someone finds in production.
 */
export const ROUTES = {
  home: '/',
  newRequest: '/cerere/noua',
  routes: '/trasee',
  requests: '/cereri',
  verification: '/verificare',
  companies: '/firme',
  faq: '/intrebari-frecvente',
  accountDepartures: '/cont/trasee',
  accountDepartureNew: '/cont/trasee/nou',
  terms: '/termeni',
  privacy: '/confidentialitate',
  contact: '/contact',

  // Authentication
  signIn: '/autentificare',
  signUp: '/inregistrare',
  signUpIndividual: '/inregistrare/persoana-fizica',
  signUpCompany: '/inregistrare/firma',
  confirmEmail: '/confirmare-email',
  resetPassword: '/resetare-parola',
  newPassword: '/parola-noua',

  /**
   * Kept for links already in the wild. Redirects to the company sign-up
   * with the carrier type preselected.
   */
  carrierSignup: '/transportatori/inscriere',

  // Account area
  account: '/cont',
  accountProfile: '/cont/profil',
  accountCompany: '/cont/firma',
  accountCompanyCreate: '/cont/firma/creeaza',
  accountMembers: '/cont/firma/membri',
  accountDocuments: '/cont/firma/documente',
  accountFleet: '/cont/firma/flota',
  accountInvitations: '/cont/invitatii',

  // Staff
  admin: '/admin',
  adminDocuments: '/admin/documente',
  adminActivity: '/admin/activitate',
  adminSettings: '/admin/setari',
  adminPlans: '/admin/planuri',
  adminCompanies: '/admin/firme',
} as const;

export type RouteKey = keyof typeof ROUTES;
export type Route = (typeof ROUTES)[RouteKey];

/**
 * One vehicle's page. A function rather than an entry in ROUTES, which
 * holds literal paths so `Route` stays a union of strings.
 */
export function vehicleRoute(vehicleId: string): string {
  return `${ROUTES.accountFleet}/${vehicleId}`;
}

/** One departure on the public board. */
export function departureRoute(id: string): string {
  return `${ROUTES.routes}/${id}`;
}

/** One transport request. */
export function requestRoute(id: string): string {
  return `${ROUTES.requests}/${id}`;
}

/** One company's public profile. */
export function companyRoute(slug: string): string {
  return `${ROUTES.companies}/${slug}`;
}


/**
 * Routes that still have only a "Pagină în lucru" placeholder. Kept in sync
 * by a unit test so a route cannot quietly stay a stub after it is built.
 */
export const UNBUILT_ROUTES: readonly Route[] = [
  ROUTES.newRequest,
  ROUTES.requests,
  ROUTES.terms,
  ROUTES.privacy,
  ROUTES.contact,
] as const;
