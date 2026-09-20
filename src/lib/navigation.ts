import { ROUTES } from '@/config/routes';
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
  if (features.messages) {
    items.push({ href: ROUTES.accountMessages, label: 'Mesaje', group: 'principal', priority: 70 });
  }

  // The public board is not a feature of the account, but for somebody with
  // nothing else to look at yet it is the one useful destination.
  items.push({ href: ROUTES.routes, label: 'Trasee disponibile', group: 'principal', priority: 60 });
  if (features.savedSearches) {
    items.push({ href: ROUTES.accountAlerts, label: 'Alerte', group: 'cont', priority: 11 });
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
    items.push({ href: ROUTES.accountTransports, label: 'Comenzi', group: 'transport', priority: 65 });
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
      label: 'Comenzi',
      group: 'expeditii',
      priority: 65,
    });
  }
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
