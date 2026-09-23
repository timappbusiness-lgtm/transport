import { ROUTES } from '@/config/routes';
import { accountCopy } from '@/content/account';
import { FEATURES, type FeatureMap } from './features';
import type { Database } from '@/lib/supabase/database.types';

/**
 * The navigation, built rather than written out.
 *
 * Three things decide what a person sees: what kind of account it is, what
 * the company does, and what role they hold in it. A fourth decides whether
 * an item may exist at all — `FEATURES` — so a menu never leads anywhere
 * that is not built. The rules are here, free of React, because "why can a
 * dispatcher not see billing" should be answerable by reading one file and
 * running its tests.
 *
 * Hiding is never the protection. Every route this file omits is also
 * refused on the server and by RLS; the menu only spares people the
 * disappointment of clicking.
 */

export type MemberRole = Database['public']['Enums']['company_member_role'];
export type AccountType = Database['public']['Enums']['account_type'];
export type CompanyType = Database['public']['Enums']['company_type'];

export interface NavItem {
  href: string;
  label: string;
  /** Which bucket it belongs to on a wide screen. */
  group: NavGroup;
  /** Shown in the bottom bar on a phone, highest first. */
  priority: number;
}

export type NavGroup = 'principal' | 'transport' | 'expeditii' | 'firma' | 'cont';

export const GROUP_LABELS: Record<NavGroup, string> = {
  principal: 'Principal',
  transport: 'Transport',
  expeditii: 'Expediții',
  firma: 'Firmă',
  cont: 'Cont',
};

export interface NavContext {
  accountType: AccountType;
  /** null when the person has no company yet. */
  companyType: CompanyType | null;
  role: MemberRole | null;
  isStaff: boolean;
}

/**
 * A driver sees almost nothing, and that is the correct amount.
 *
 * They are not a dispatcher with fewer buttons: the only thing a driver
 * does in this application is look at what they have been assigned. Until
 * `transports` has a screen, that is a page explaining as much — which is
 * still better than a menu full of things they may not open.
 */
function driverNav(features: FeatureMap): NavItem[] {
  const items: NavItem[] = [
    { href: ROUTES.account, label: 'Acasă', group: 'principal', priority: 100 },
  ];
  if (features.transports) {
    items.push({
      href: ROUTES.accountTransports,
      label: 'Transporturile mele',
      group: 'principal',
      priority: 90,
    });
  }
  // A driver never rates and is never rated — a rating is between the two
  // firms — so there is no item there. Messages are different: the
  // dispatcher writes to them about the order they are on, and
  // `my_conversations()` gives them only those threads.
  if (features.messages) {
    items.push({
      href: ROUTES.accountMessages,
      label: 'Mesaje',
      group: 'principal',
      priority: 85,
    });
  }
  items.push({ href: ROUTES.accountHelp, label: 'Ajutor', group: 'cont', priority: 5 });
  items.push({ href: ROUTES.accountProfile, label: 'Profil', group: 'cont', priority: 10 });
  items.push({
    href: ROUTES.accountNotificationSettings,
    label: 'Notificări',
    group: 'cont',
    priority: 9,
  });
  // Not behind a feature flag: taking your data and asking for it to be
  // removed are not features, and a menu that hides them is a menu that
  // makes somebody write to support to leave.
  items.push({
    href: ROUTES.accountPersonalData,
    label: 'Date personale',
    group: 'cont',
    priority: 8,
  });
  return items;
}

function individualNav(features: FeatureMap): NavItem[] {
  const items: NavItem[] = [
    { href: ROUTES.account, label: 'Acasă', group: 'principal', priority: 100 },
  ];

  if (features.requests) {
    items.push({
      href: ROUTES.accountRequests,
      label: 'Cererile mele',
      group: 'principal',
      priority: 90,
    });
  }
  if (features.offers) {
    items.push({ href: ROUTES.accountOffers, label: 'Oferte', group: 'principal', priority: 80 });
  }
  // An individual who accepts an offer has an order like anybody else,
  // and until Faza 2 had no way to reach it from the menu.
  if (features.transports) {
    items.push({
      href: ROUTES.accountTransports,
      label: 'Transporturi',
      group: 'principal',
      priority: 78,
    });
  }
  if (features.ratings) {
    items.push({
      href: ROUTES.accountRatings,
      label: 'Evaluări',
      group: 'principal',
      priority: 77,
    });
  }
  if (features.messages) {
    items.push({ href: ROUTES.accountMessages, label: 'Mesaje', group: 'principal', priority: 70 });
  }

  // The public board is not a feature of the account, but for somebody with
  // nothing else to look at yet it is the one useful destination.
  items.push({ href: ROUTES.routes, label: 'Trasee disponibile', group: 'principal', priority: 60 });
  if (features.savedSearches) {
    items.push({ href: ROUTES.accountAlerts, label: 'Alerte', group: 'cont', priority: 11 });
  }
  // Help belongs to every account type: the page itself decides which
  // answers to show, and an account with nothing switched on is exactly
  // the one whose owner has questions.
  items.push({ href: ROUTES.accountHelp, label: 'Ajutor', group: 'cont', priority: 5 });
  items.push({ href: ROUTES.accountProfile, label: 'Profil', group: 'cont', priority: 10 });
  items.push({
    href: ROUTES.accountNotificationSettings,
    label: 'Notificări',
    group: 'cont',
    priority: 9,
  });
  // Not behind a feature flag: taking your data and asking for it to be
  // removed are not features, and a menu that hides them is a menu that
  // makes somebody write to support to leave.
  items.push({
    href: ROUTES.accountPersonalData,
    label: 'Date personale',
    group: 'cont',
    priority: 8,
  });
  return items;
}

/** What a carrier does: routes, the bookings on them, and the fleet behind them. */
function carrierItems(features: FeatureMap, role: MemberRole | null): NavItem[] {
  const items: NavItem[] = [];

  if (features.requestBoard) {
    items.push({
      href: ROUTES.requests,
      label: 'Cereri de transport',
      group: 'transport',
      priority: 90,
    });
  }
  if (features.departures) {
    items.push({
      href: ROUTES.accountDepartures,
      label: 'Traseele mele',
      group: 'transport',
      priority: 85,
    });
  }
  if (features.offers) {
    items.push({
      href: ROUTES.accountOffers,
      label: 'Oferte trimise',
      group: 'transport',
      priority: 70,
    });
  }
  if (features.transports) {
    items.push({
      href: ROUTES.accountTransports,
      label: 'Transporturi',
      group: 'transport',
      priority: 78,
    });
  }
  if (features.ratings) {
    items.push({
      href: ROUTES.accountRatings,
      label: 'Evaluări',
      group: 'transport',
      priority: 77,
    });
  }
  if (features.fleet) {
    // A dispatcher reads the fleet but does not change it, which is a rule
    // the page enforces; the item is the same either way.
    items.push({ href: ROUTES.accountFleet, label: 'Flotă', group: 'firma', priority: 50 });
  }
  void role;
  return items;
}

/** What a forwarder does: put work out, and see who answers. */
function forwarderItems(features: FeatureMap): NavItem[] {
  const items: NavItem[] = [];

  if (features.requests) {
    items.push({
      href: ROUTES.accountRequests,
      label: 'Cursele mele',
      group: 'expeditii',
      priority: 90,
    });
  }
  if (features.offers) {
    items.push({
      href: ROUTES.accountOffers,
      label: 'Oferte primite',
      group: 'expeditii',
      priority: 80,
    });
  }
  if (features.transports) {
    items.push({
      href: ROUTES.accountTransports,
      label: 'Transporturi',
      group: 'expeditii',
      priority: 78,
    });
  }
  if (features.ratings) {
    items.push({
      href: ROUTES.accountRatings,
      label: 'Evaluări',
      group: 'expeditii',
      priority: 77,
    });
  }
  // Favourites sit with the work, not with the account settings: they
  // are what a forwarder reaches for while deciding who to ask.
  items.push({
    href: ROUTES.accountFavourites,
    label: 'Favoriți',
    group: 'expeditii',
    priority: 70,
  });
  items.push({
    href: ROUTES.routes,
    label: 'Trasee disponibile',
    group: 'expeditii',
    priority: 60,
  });
  return items;
}

export function buildNav(
  context: NavContext,
  features: FeatureMap = FEATURES,
): NavItem[] {
  if (context.role === 'driver') return driverNav(features);
  if (context.accountType === 'individual' && context.companyType === null) {
    return individualNav(features);
  }

  const items: NavItem[] = [
    { href: ROUTES.account, label: 'Acasă', group: 'principal', priority: 100 },
  ];

  const type = context.companyType;
  if (type === 'transport' || type === 'both') items.push(...carrierItems(features, context.role));
  if (type === 'expeditie' || type === 'both') items.push(...forwarderItems(features));

  if (features.messages) {
    items.push({ href: ROUTES.accountMessages, label: 'Mesaje', group: 'principal', priority: 75 });
  }
  // Saved searches belong to the person, not to the firm, so every account
  // that can browse a board gets the item — a dispatcher watches a corridor
  // as readily as an owner does.
  if (features.savedSearches) {
    items.push({ href: ROUTES.accountAlerts, label: 'Alerte', group: 'cont', priority: 11 });
  }
  // Help belongs to every account type: the page itself decides which
  // answers to show, and an account with nothing switched on is exactly
  // the one whose owner has questions.
  items.push({ href: ROUTES.accountHelp, label: 'Ajutor', group: 'cont', priority: 5 });
  if (features.documents) {
    items.push({ href: ROUTES.accountDocuments, label: 'Documente', group: 'firma', priority: 45 });
  }

  // Billing and the team are the owner's and the admin's. A dispatcher runs
  // the day-to-day and does not commit the firm to anything.
  if (isManagerRole(context.role)) {
    if (features.members) {
      items.push({ href: ROUTES.accountMembers, label: 'Echipă', group: 'firma', priority: 40 });
    }
    if (features.subscription) {
      items.push({
        href: ROUTES.accountSubscription,
        label: 'Abonament',
        group: 'firma',
        priority: 35,
      });
    }
    if (features.companyProfile) {
      items.push({ href: ROUTES.accountCompany, label: 'Profil firmă', group: 'firma', priority: 30 });
    }
  }

  items.push({ href: ROUTES.accountProfile, label: 'Profil', group: 'cont', priority: 10 });
  items.push({
    href: ROUTES.accountNotificationSettings,
    label: 'Notificări',
    group: 'cont',
    priority: 9,
  });
  // Not behind a feature flag: taking your data and asking for it to be
  // removed are not features, and a menu that hides them is a menu that
  // makes somebody write to support to leave.
  items.push({
    href: ROUTES.accountPersonalData,
    label: 'Date personale',
    group: 'cont',
    priority: 8,
  });
  return dedupe(items);
}

/**
 * The whole of a driver's application, as hrefs.
 *
 * `guards.ts` refuses a driver anything outside this list, and it is taken
 * from the same builder that draws their menu rather than written out
 * beside it. Written out, the two drifted: the menu offered
 * /cont/transporturi, /cont/mesaje, /cont/ajutor and the two settings
 * pages while the guard allowed only /cont and /cont/profil, so every item
 * but one 404'd for the account type least able to work out why.
 */
export function driverPaths(features: FeatureMap = FEATURES): string[] {
  return driverNav(features).map((item) => item.href);
}

/**
 * How many things on a page are waiting for this person.
 *
 * Read once per request and handed to both menus, so the number in the
 * header and the number in the sidebar cannot disagree — two counts of the
 * same thing is how a badge stops being believed.
 */
export interface NavCounts {
  /** Messages nobody has read, across every thread. */
  messages: number;
  /** Offers received and still unanswered. */
  offers: number;
  /**
   * Blocking documents the firm still has to upload: missing, rejected
   * or expired. Optional, because only a firm has any — a private
   * person's menu has no documents item for it to sit on.
   */
  documents?: number;
}

export const NO_NAV_COUNTS: NavCounts = { messages: 0, offers: 0 };

/**
 * The badge for one item, or 0 when it carries none.
 *
 * Three items take one. An item that is a shortcut to a board — Cereri
 * de transport, Trasee disponibile — has nothing waiting on it: everything
 * there is somebody else's, and a number that never reaches zero is
 * furniture.
 */
export function badgeFor(href: string, counts: NavCounts = NO_NAV_COUNTS): number {
  if (href === ROUTES.accountMessages) return Math.max(0, counts.messages);
  if (href === ROUTES.accountOffers) return Math.max(0, counts.offers);
  if (href === ROUTES.accountDocuments) return Math.max(0, counts.documents ?? 0);
  return 0;
}

/** A menu item with the number waiting on it, which is usually none. */
export interface BadgedNavItem extends NavItem {
  badge: number;
}

export function withBadges(
  items: readonly NavItem[],
  counts: NavCounts = NO_NAV_COUNTS,
): BadgedNavItem[] {
  return items.map((item) => ({ ...item, badge: badgeFor(item.href, counts) }));
}

/**
 * The shortcuts in the header menu, per kind of account, most used first.
 *
 * Hrefs rather than items: the label, and whether the item may exist at
 * all, stay `buildNav`'s to decide. This list only says which of the pages
 * it already built are worth a place in a menu that has room for a
 * handful. Anything named here that `buildNav` leaves out — a feature not
 * built, a role not allowed — is simply absent, which is why the header
 * cannot offer something the sidebar does not.
 */
function shortcutOrder(context: NavContext): string[] {
  if (context.role === 'driver') return [ROUTES.accountTransports];

  if (context.accountType === 'individual' && context.companyType === null) {
    return [ROUTES.accountRequests, ROUTES.accountOffers, ROUTES.accountMessages];
  }

  const type = context.companyType;
  const carrier = type === 'transport' || type === 'both';
  const forwarder = type === 'expeditie' || type === 'both';

  return [
    // A carrier's own routes come before the board: the board is everyone's,
    // the routes are theirs.
    ...(carrier ? [ROUTES.accountDepartures, ROUTES.requests] : []),
    ...(forwarder ? [ROUTES.accountRequests] : []),
    ROUTES.accountOffers,
    ROUTES.accountMessages,
    ROUTES.accountDocuments,
  ];
}

/** At most this many shortcuts, before the account section. */
export const HEADER_SHORTCUT_MAX = 5;

/**
 * What the header's account menu offers.
 *
 * Three sections, in this order: the dashboard, the shortcuts, and the
 * account itself. The sign-out sits below them and is not a link, so it is
 * the component's and not this function's.
 *
 * `group` carries the section, reusing `NavGroup` rather than inventing a
 * second vocabulary: `principal` is the work, `cont` is the account.
 */
export function headerMenu(
  context: NavContext,
  counts: NavCounts = NO_NAV_COUNTS,
  features: FeatureMap = FEATURES,
): BadgedNavItem[] {
  const built = buildNav(context, features);
  const byHref = new Map(built.map((item) => [item.href, item]));

  // Contul meu is always first and always present: `buildNav` opens every
  // menu with it, whatever the account type, and it is the destination the
  // name in the bar is a shortcut to.
  const items: NavItem[] = [];
  const dashboard = byHref.get(ROUTES.account);
  if (dashboard) items.push({ ...dashboard, label: accountCopy.nav.dashboard });

  for (const href of shortcutOrder(context)) {
    if (items.length > HEADER_SHORTCUT_MAX) break;
    const item = byHref.get(href);
    if (item && item.href !== ROUTES.account) items.push(item);
  }

  const profile = byHref.get(ROUTES.accountProfile);
  if (profile) items.push(profile);
  // Settings is one page, /cont/setari, and it is not built — `FEATURES`
  // says so and there is nothing at that path. The two settings screens
  // that do exist are in the sidebar under Cont; putting a menu item here
  // that 404s is the exact thing `FEATURES` exists to prevent.
  const settings = byHref.get(ROUTES.accountSettings);
  if (settings) items.push(settings);

  // Staff is not part of `buildNav`: /admin is a different application
  // with its own shell, and an item for it does not belong in the account
  // sidebar. It belongs here, where somebody moves between the two.
  if (context.isStaff) {
    items.push({
      href: ROUTES.admin,
      label: accountCopy.nav.admin,
      group: 'cont',
      priority: 0,
    });
  }

  return withBadges(dedupe(items), counts);
}

/**
 * A company that does both gets each item once.
 *
 * "Trasee disponibile" and "Comenzi" are reachable from either side of such
 * a firm, and a menu that lists one of them twice looks broken.
 */
function dedupe(items: readonly NavItem[]): NavItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.href)) return false;
    seen.add(item.href);
    return true;
  });
}

export function isManagerRole(role: MemberRole | null): boolean {
  return role === 'owner' || role === 'admin';
}

/** Groups in the order a sidebar reads them, empty ones dropped. */
export function groupNav(items: readonly NavItem[]): { group: NavGroup; items: NavItem[] }[] {
  const order: NavGroup[] = ['principal', 'transport', 'expeditii', 'firma', 'cont'];
  return order
    .map((group) => ({ group, items: items.filter((item) => item.group === group) }))
    .filter((section) => section.items.length > 0);
}

/**
 * The bottom bar on a phone: at most five, the rest behind "Mai mult".
 *
 * Five is where a row of labels stops being readable at 390px. The cut is
 * by priority rather than by order, so the items somebody actually opens
 * are the ones in the bar.
 */
export const BOTTOM_NAV_MAX = 5;

export function bottomNav(
  items: readonly NavItem[],
  max: number = BOTTOM_NAV_MAX,
): { bar: NavItem[]; more: NavItem[] } {
  const ranked = [...items].sort((a, b) => b.priority - a.priority);
  // One slot is the "Mai mult" button itself once there is an overflow.
  if (ranked.length <= max) return { bar: ranked, more: [] };
  return { bar: ranked.slice(0, max - 1), more: ranked.slice(max - 1) };
}

/** What the "Publică" button offers, which is never nothing. */
export interface PublishAction {
  href: string;
  label: string;
}

export function publishActions(
  context: NavContext,
  features: FeatureMap = FEATURES,
): PublishAction[] {
  if (context.role === 'driver') return [];

  const actions: PublishAction[] = [];
  const type = context.companyType;

  if (features.departures && (type === 'transport' || type === 'both')) {
    actions.push(
      { href: `${ROUTES.accountDepartureNew}?directie=tur`, label: 'Traseu pe tur' },
      { href: `${ROUTES.accountDepartureNew}?directie=retur`, label: 'Traseu pe retur' },
    );
  }
  if (features.requests) {
    actions.push({
      href: ROUTES.newRequest,
      label: type === 'expeditie' || type === 'both' ? 'Publică o cursă' : 'Publică o cerere',
    });
  }
  return actions;
}

/**
 * Which nav item a path belongs to, for `aria-current`.
 *
 * A detail page marks the section it belongs to, so /cont/firma/flota/abc
 * lights up Flotă. The exception is an item that is a prefix of another
 * one: /cont is the dashboard and /cont/firma is the company profile, and
 * neither is the parent of the pages beneath it as far as a menu is
 * concerned — they match exactly or not at all. Without that, Acasă would
 * be current on every page in the account.
 */
export function activeHref(items: readonly NavItem[], pathname: string): string | null {
  const isPrefixOfAnother = (href: string) =>
    items.some((other) => other.href !== href && other.href.startsWith(`${href}/`));

  const matches = items
    .filter((item) =>
      pathname === item.href ||
      (!isPrefixOfAnother(item.href) && pathname.startsWith(`${item.href}/`)),
    )
    // The longest match wins where two still apply.
    .sort((a, b) => b.href.length - a.href.length);
  return matches[0]?.href ?? null;
}

// ---------------------------------------------------------------------
// The public bar and the footer
// ---------------------------------------------------------------------

/** A link on a public page: a destination and the word for it. */
export interface PublicLink {
  href: string;
  label: string;
}

/**
 * The public bar, in the order it is read. Built here once, drawn by the
 * header, and checked for duplicates by `tests/unit/navigation.test.ts`.
 *
 * Five and no more. The two boards first, because they are the product;
 * then the directory and the plans; then one „Cum funcționează" — the
 * explanation a first-time visitor looks for before deciding anything.
 *
 * It used to be longer on the homepage, where three in-page anchors sat
 * in front of these: „Cum funcționează" was one of them, so the bar said
 * „Cum funcționează" twice, and at 1280 with a name on the right the row
 * did not fit. The sections are still on the homepage, a scroll away,
 * and the footer links the pages they summarise.
 *
 * Prețuri is not here. The page exists and the footer links it, but
 * `price_settings.is_published` is false and a menu item that opens onto
 * „nimic publicat" teaches people not to trust the menu.
 */
export const PUBLIC_NAV: readonly PublicLink[] = [
  { href: ROUTES.requests, label: 'Cereri' },
  { href: ROUTES.routes, label: 'Trasee' },
  { href: ROUTES.companies, label: 'Firme' },
  { href: ROUTES.plans, label: 'Abonamente' },
  { href: ROUTES.faq, label: 'Cum funcționează' },
];

/**
 * The footer: everything the bar leaves out, plus the two boards again
 * under their longer names, because a footer is where somebody looks
 * when the bar did not have what they wanted.
 */
export const FOOTER_NAV: readonly PublicLink[] = [
  { href: ROUTES.requests, label: 'Cereri de transport' },
  { href: ROUTES.routes, label: 'Trasee disponibile' },
  { href: ROUTES.prices, label: 'Prețuri orientative' },
  { href: ROUTES.verification, label: 'Cum verificăm firmele' },
  { href: ROUTES.plans, label: 'Abonamente' },
  { href: ROUTES.carrierSignup, label: 'Pentru transportatori' },
  { href: ROUTES.contact, label: 'Contact' },
  { href: ROUTES.terms, label: 'Termeni' },
  { href: ROUTES.privacy, label: 'Confidențialitate' },
  { href: ROUTES.cookies, label: 'Cookie-uri' },
];

/** The link in `PUBLIC_NAV` a path belongs to, or null. One at most. */
export function currentPublicHref(pathname: string | null): string | null {
  if (pathname === null) return null;
  const match = PUBLIC_NAV.find(
    (link) => pathname === link.href || pathname.startsWith(`${link.href}/`),
  );
  return match?.href ?? null;
}
