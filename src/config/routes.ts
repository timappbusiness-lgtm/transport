/**
 * Every internal link comes from here, so a route rename is one edit and a
 * dead link is a type error rather than a 404 someone finds in production.
 */
export const ROUTES = {
  home: '/',
  newRequest: '/cerere/noua',
  routes: '/trasee',
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
  accountInvitations: '/cont/invitatii',

  // Staff
  admin: '/admin',
  adminDocuments: '/admin/documente',
} as const;

export type RouteKey = keyof typeof ROUTES;
export type Route = (typeof ROUTES)[RouteKey];

/**
 * Routes that still have only a "Pagină în lucru" placeholder. Kept in sync
 * by a unit test so a route cannot quietly stay a stub after it is built.
 */
export const UNBUILT_ROUTES: readonly Route[] = [
  ROUTES.newRequest,
  ROUTES.routes,
  ROUTES.terms,
  ROUTES.privacy,
  ROUTES.contact,
] as const;
