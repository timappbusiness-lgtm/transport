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
  // Two different pages, deliberately: /preturi is what a transport costs,
  // /abonamente is what the platform costs.
  prices: '/preturi',
  plans: '/abonamente',
  accountDepartures: '/cont/trasee',
  accountDepartureNew: '/cont/trasee/nou',
  terms: '/termeni',
  privacy: '/confidentialitate',
  cookies: '/cookies',
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
  accountSubscription: '/cont/abonament',
  accountRequests: '/cont/cereri',
  accountOffers: '/cont/oferte',
  accountMessages: '/cont/mesaje',
  accountTransports: '/cont/transporturi',
  accountNotifications: '/cont/notificari',
  accountSettings: '/cont/setari',
  // The notifications *settings*. `accountNotifications` above is the
  // notifications centre, which is a different screen and not built yet.
  accountNotificationSettings: '/cont/setari/notificari',
  // Data export and account deletion. Not feature-gated: the right to
  // take your data and the right to have it removed are not features.
  accountPersonalData: '/cont/setari/date-personale',
  /** The link in the deletion e-mail. Public: the account it rescues is held. */
  cancelDeletion: '/stergere/anuleaza',

  // Staff
  admin: '/admin',
  adminDocuments: '/admin/documente',
  adminActivity: '/admin/activitate',
  adminPrices: '/admin/preturi',
  adminSettings: '/admin/setari',
  adminPlans: '/admin/planuri',
  adminCompanies: '/admin/firme',
  adminSubscriptions: '/admin/abonamente',
  adminOptions: '/admin/optiuni',
  adminPages: '/admin/pagini',
  adminImport: '/admin/import',
  adminNotifications: '/admin/notificari',
  adminDeletions: '/admin/stergeri',
  adminPilot: '/admin/pilot',
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
export const UNBUILT_ROUTES: readonly Route[] = [] as const;
