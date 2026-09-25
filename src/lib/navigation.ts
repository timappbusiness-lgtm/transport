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

export type NavGroup = 'principal' | 'transport' | 'expeditii' | 'firma' | 'cont' | 'platforma';

export const GROUP_LABELS: Record<NavGroup, string> = {
  principal: 'Principal',
  transport: 'Transport',
  expeditii: 'Expediții',
  firma: 'Firmă',
  cont: 'Cont',
  // Only in the header's account menu: the public pages everybody can
  // open, which the account sidebar has no reason to repeat.
  platforma: 'Platformă',
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
    items.push({
      href: ROUTES.accountOffers,
      label: 'Oferte primite',
      group: 'principal',
      priority: 80,
    });
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
  // A firm's account before the firm is created: nothing of its own yet,
  // and the two boards are what it signed up to look at.
  if (type === null) {
    if (features.requestBoard) {
      items.push({
        href: ROUTES.requests,
        label: 'Cereri de transport',
        group: 'principal',
        priority: 90,
      });
    }
    items.push({
      href: ROUTES.routes,
      label: 'Trasee disponibile',
      group: 'principal',
      priority: 60,
    });
  }

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
  /**
   * Requests a carrier can take that were published since they last
   * opened the board: matching their coverage, vehicle types, equipment
   * and routes, by the same rule as the board's own „Potrivite cu firma
   * mea". Opening the board brings it back to zero. Optional, because
   * only a carrier has a board of its own work.
   */
  newRequests?: number;
}

export const NO_NAV_COUNTS: NavCounts = { messages: 0, offers: 0 };

/**
 * The badge for one item, or 0 when it carries none.
 *
 * Four items take one. „Trasee disponibile" never does: everything there
 * is somebody else's and nothing on it waits for this person. „Cereri de
 * transport" does for a carrier, and only with what is new since their
 * last look — a count of the whole board would never reach zero, and a
 * number that never reaches zero is furniture.
 */
export function badgeFor(href: string, counts: NavCounts = NO_NAV_COUNTS): number {
  if (href === ROUTES.accountMessages) return Math.max(0, counts.messages);
  if (href === ROUTES.accountOffers) return Math.max(0, counts.offers);
  if (href === ROUTES.accountDocuments) return Math.max(0, counts.documents ?? 0);
  if (href === ROUTES.requests) return Math.max(0, counts.newRequests ?? 0);
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
 * What the bar itself shows a signed-in person, in the order they read it.
 *
 * A carrier and a client want opposite things. A carrier opens the
 * platform to see requests they can bid on, so the board comes first and
 * everything else is the work that follows from it. A client opens it to
 * publish and follow their own request. Before, both saw the public menu
 * — Cereri, Trasee, Firme, Abonamente, Cum funcționează — which is the
 * shop window, not the work.
 *
 * Hrefs, not items: the label and whether the item may exist stay
 * `buildNav`'s, so the bar, the sidebar, the phone's bottom bar and the
 * account menu read one list and cannot drift. Anything named here that
 * `buildNav` did not build — a feature off, a role not allowed — is simply
 * absent. Nothing is removed by this list: whatever is not in the bar is
 * in the account menu (`headerMenu`).
 */
export function barOrder(context: NavContext): string[] {
  if (context.role === 'driver') return [ROUTES.accountTransports];

  if (context.accountType === 'individual' && context.companyType === null) {
    return [ROUTES.accountRequests, ROUTES.accountOffers, ROUTES.accountMessages, ROUTES.routes];
  }

  const type = context.companyType;
  // A firm that does both is a carrier first: the board of work it can
  // take is what it opens the platform for, and its own requests are in
  // the account menu, one click away.
  if (type === 'transport' || type === 'both') {
    return [
      ROUTES.requests,
      ROUTES.accountDepartures,
      ROUTES.accountOffers,
      ROUTES.accountTransports,
      ROUTES.accountMessages,
    ];
  }
  if (type === 'expeditie') {
    return [
      ROUTES.accountRequests,
      ROUTES.accountOffers,
      ROUTES.routes,
      ROUTES.accountTransports,
      ROUTES.accountMessages,
    ];
  }
  // A firm's account before the firm exists.
  return [ROUTES.requests, ROUTES.routes, ROUTES.accountMessages];
}

/** The bar's entries, built by `buildNav` and badged. */
export function headerBar(
  context: NavContext,
  counts: NavCounts = NO_NAV_COUNTS,
  features: FeatureMap = FEATURES,
): BadgedNavItem[] {
  const byHref = new Map(buildNav(context, features).map((item) => [item.href, item]));
  const items = barOrder(context)
    .map((href) => byHref.get(href))
    .filter((item): item is NavItem => item !== undefined);
  return withBadges(dedupe(items), counts);
}

/**
 * The public pages every signed-in person keeps in reach.
 *
 * The signed-out bar's five, under their full names. They leave the bar
 * for somebody signed in — a carrier has no use for the shop window
 * between two bids — but nothing is taken away: whichever of them the
 * bar does not already show is in the account menu, for everyone, and
 * all of them are in the footer.
 */
export const PLATFORM_LINKS: readonly PublicLink[] = [
  { href: ROUTES.requests, label: 'Cereri de transport' },
  { href: ROUTES.routes, label: 'Trasee disponibile' },
  { href: ROUTES.companies, label: 'Firme' },
  { href: ROUTES.plans, label: 'Abonamente' },
  { href: ROUTES.faq, label: 'Cum funcționează' },
];

/**
 * What the header's account menu offers: everything the bar does not.
 *
 * In this order: the dashboard, then every other page `buildNav` built for
 * this person, in the sidebar's own groups — with a carrier's quieter
 * publish action, „Publică o cerere", after its work; then the public
 * pages the bar does not show; then, for staff, the way across to /admin.
 * The sign-out sits below them and is not a link, so it is the
 * component's and not this function's.
 *
 * Between the bar and this menu, every page in the sidebar and every page
 * of the signed-out bar is reachable from the header exactly once —
 * reordered by relevance, never removed.
 */
export function headerMenu(
  context: NavContext,
  counts: NavCounts = NO_NAV_COUNTS,
  features: FeatureMap = FEATURES,
): BadgedNavItem[] {
  const built = buildNav(context, features);
  const inBar = new Set(headerBar(context, counts, features).map((item) => item.href));

  // Contul meu is always first and always present: `buildNav` opens every
  // menu with it, whatever the account type, and it is the destination the
  // name in the bar is a shortcut to.
  const items: NavItem[] = [];
  const dashboard = built.find((item) => item.href === ROUTES.account);
  if (dashboard) items.push({ ...dashboard, label: accountCopy.nav.dashboard });

  // A carrier's request is second on its button, so it is not first
  // anywhere; but it is a thing the carrier does, not a page it reads, and
  // it sits with the rest of that work rather than below the public pages.
  const quiet: NavItem[] = publishActions(context, features)
    .filter((action) => action.secondary === true)
    .map((action) => ({ href: action.href, label: action.label, group: 'transport', priority: 0 }));

  for (const section of groupNav([...built, ...quiet])) {
    for (const item of section.items) {
      if (item.href === ROUTES.account || inBar.has(item.href)) continue;
      items.push(item);
    }
  }

  for (const link of PLATFORM_LINKS) {
    if (inBar.has(link.href)) continue;
    items.push({ href: link.href, label: link.label, group: 'platforma', priority: 0 });
  }

  // Staff is not part of `buildNav`: /admin is a different application
  // with its own shell, and an item for it does not belong in the account
  // sidebar. It belongs here, where somebody moves between the two.
  if (context.isStaff) {
    items.push({
      href: ROUTES.admin,
      label: accountCopy.nav.admin,
      group: 'platforma',
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
  const order: NavGroup[] = ['principal', 'transport', 'expeditii', 'firma', 'cont', 'platforma'];
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

/** One thing the „Publică" button offers. */
export interface PublishAction {
  href: string;
  label: string;
  /**
   * Offered, but lower and quieter: available without being the first
   * thing somebody reaches for. A carrier publishing a request — a
   * subcontract — is normal and stays one click away; it is just not what
   * the carrier's button is for.
   */
  secondary?: boolean;
}

/**
 * What the „Publică" button offers, in the order it is read.
 *
 * A carrier publishes routes: a tour and a return, then — lower, and
 * clearly second — a request, because subcontracting is normal. A client,
 * a forwarder included, publishes a request. A driver publishes nothing,
 * and gets no button at all rather than one that leads nowhere.
 */
export function publishActions(
  context: NavContext,
  features: FeatureMap = FEATURES,
): PublishAction[] {
  if (context.role === 'driver') return [];

  const actions: PublishAction[] = [];
  const type = context.companyType;
  const carrier = features.departures && (type === 'transport' || type === 'both');

  if (carrier) {
    actions.push(
      { href: `${ROUTES.accountDepartureNew}?directie=tur`, label: 'Traseu pe tur' },
      { href: `${ROUTES.accountDepartureNew}?directie=retur`, label: 'Traseu pe retur' },
    );
  }
  if (features.requests) {
    // One word for what a client publishes, whoever the client is: a
    // „cerere de transport". A forwarder's list is still „Cursele mele",
    // but the button says the same thing the board calls it.
    actions.push({
      href: ROUTES.newRequest,
      label: 'Publică o cerere',
      ...(carrier ? { secondary: true } : {}),
    });
  }
  return actions;
}

/**
 * The words on the button itself, or null when there is no button.
 *
 * A carrier's reads „Publică un traseu" and opens the menu above; with a
 * single action the button is that action, under its own label.
 */
export function publishLabel(
  context: NavContext,
  features: FeatureMap = FEATURES,
): string | null {
  const actions = publishActions(context, features);
  if (actions.length === 0) return null;
  const type = context.companyType;
  if (features.departures && (type === 'transport' || type === 'both')) return 'Publică un traseu';
  return actions[0]?.label ?? null;
}

/** The button and its menu, as the header and the account's top bar draw it. */
export interface PublishMenuSpec {
  label: string;
  /** Two words for a phone's bar, where the full label does not fit. */
  compactLabel?: string;
  actions: PublishAction[];
}

export function publishMenu(
  context: NavContext,
  features: FeatureMap = FEATURES,
): PublishMenuSpec | null {
  const label = publishLabel(context, features);
  if (label === null) return null;
  const type = context.companyType;
  const carrier = features.departures && (type === 'transport' || type === 'both');
  return {
    label,
    compactLabel: carrier ? 'Traseu nou' : 'Cerere nouă',
    actions: publishActions(context, features),
  };
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
 *
 * Two groups, drawn as two rows: what the platform does, then who we are
 * and the documents. As one list the last two or three links wrapped onto
 * a line of their own at every width, which read as an accident.
 */
export const FOOTER_NAV_PLATFORM: readonly PublicLink[] = [
  { href: ROUTES.requests, label: 'Cereri de transport' },
  { href: ROUTES.routes, label: 'Trasee disponibile' },
  // The three the bar gives up once somebody is signed in, kept here for
  // everyone: a footer is where people look when the bar did not have it.
  { href: ROUTES.companies, label: 'Firme' },
  { href: ROUTES.plans, label: 'Abonamente' },
  { href: ROUTES.faq, label: 'Cum funcționează' },
  { href: ROUTES.prices, label: 'Prețuri orientative' },
  { href: ROUTES.verification, label: 'Cum verificăm firmele' },
  { href: ROUTES.carrierSignup, label: 'Pentru transportatori' },
];

export const FOOTER_NAV_LEGAL: readonly PublicLink[] = [
  { href: ROUTES.contact, label: 'Contact' },
  { href: ROUTES.terms, label: 'Termeni' },
  { href: ROUTES.privacy, label: 'Confidențialitate' },
  { href: ROUTES.cookies, label: 'Cookie-uri' },
];

export const FOOTER_NAV: readonly PublicLink[] = [...FOOTER_NAV_PLATFORM, ...FOOTER_NAV_LEGAL];

/** The link in `PUBLIC_NAV` a path belongs to, or null. One at most. */
export function currentPublicHref(pathname: string | null): string | null {
  if (pathname === null) return null;
  const match = PUBLIC_NAV.find(
    (link) => pathname === link.href || pathname.startsWith(`${link.href}/`),
  );
  return match?.href ?? null;
}
