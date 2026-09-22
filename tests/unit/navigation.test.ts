import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROUTES } from '@/config/routes';
import { FEATURES, type FeatureMap } from '@/lib/features';
import { NAV_ICONS, iconForRoute } from '@/lib/icons';
import { isDriverAllowed, isOpenWithoutTerms } from '@/lib/auth/guards';
import {
  BOTTOM_NAV_MAX,
  HEADER_SHORTCUT_MAX,
  NO_NAV_COUNTS,
  activeHref,
  badgeFor,
  bottomNav,
  buildNav,
  driverPaths,
  groupNav,
  headerMenu,
  publishActions,
  withBadges,
  type NavContext,
} from '@/lib/navigation';

/**
 * Navigation is where an application promises what it can do. These check
 * the two ways that promise goes wrong: offering something that is not
 * built, and offering something the person is not allowed to open.
 */

function context(over: Partial<NavContext> = {}): NavContext {
  return {
    accountType: 'company',
    companyType: 'transport',
    role: 'owner',
    isStaff: false,
    ...over,
  };
}

/** Everything on, to check the shape of a finished application. */
const ALL: FeatureMap = {
  requests: true,
  requestBoard: true,
  savedSearches: true,
  departures: true,
  offers: true,
  messages: true,
  transports: true,
  ratings: true,
  notifications: true,
  settings: true,
  fleet: true,
  documents: true,
  members: true,
  subscription: true,
  companyProfile: true,
};

/** Nothing on, to check that every kind of account still has a menu. */
const NONE: FeatureMap = {
  requests: false,
  requestBoard: false,
  savedSearches: false,
  departures: false,
  offers: false,
  messages: false,
  transports: false,
  ratings: false,
  notifications: false,
  settings: false,
  fleet: false,
  documents: false,
  members: false,
  subscription: false,
  companyProfile: false,
};

function hrefs(ctx: NavContext, features: FeatureMap = FEATURES): string[] {
  return buildNav(ctx, features).map((item) => item.href);
}

describe('a menu item exists only if the feature does', () => {
  it('offers nothing that is not built', () => {
    // Messaging used to be the example here: the tables existed, which
    // is not the same as a screen. It shipped at the end of Faza 2, and
    // with it the last false flag in the map — so the rule is stated
    // against the map itself instead of against one feature. Turn
    // anything off and its item goes with it.
    expect(hrefs(context(), { ...ALL, messages: false })).not.toContain(ROUTES.accountMessages);
    expect(hrefs(context(), { ...ALL, offers: false })).not.toContain(ROUTES.accountOffers);
    expect(hrefs(context(), { ...ALL, transports: false })).not.toContain(
      ROUTES.accountTransports,
    );
    expect(hrefs(context(), NONE)).not.toContain(ROUTES.accountMessages);
  });

  it('offers the ones that are', () => {
    // A carrier sends offers; a forwarder and an individual receive them.
    // Both ends of the flow exist now, so both sides get the item.
    expect(hrefs(context())).toContain(ROUTES.accountOffers);
    expect(hrefs(context({ companyType: 'expeditie' }))).toContain(ROUTES.accountOffers);
    expect(
      hrefs(context({ accountType: 'individual', companyType: null, role: null })),
    ).toContain(ROUTES.accountOffers);
  });

  it('offers them the moment they are built', () => {
    const items = hrefs(context(), ALL);
    expect(items).toContain(ROUTES.accountOffers);
    expect(items).toContain(ROUTES.accountMessages);
    expect(items).toContain(ROUTES.accountTransports);
  });

  it('gives every side of an order its way in', () => {
    // A client, a forwarder and a carrier all have orders now; so does
    // a driver, who is tested on their own above.
    expect(hrefs(context())).toContain(ROUTES.accountTransports);
    expect(hrefs(context({ companyType: 'expeditie' }))).toContain(ROUTES.accountTransports);
    expect(
      hrefs(context({ accountType: 'individual', companyType: null, role: null })),
    ).toContain(ROUTES.accountTransports);
  });

  it('never leaves somebody with nowhere to go', () => {
    for (const ctx of [
      context(),
      context({ companyType: 'expeditie' }),
      context({ companyType: 'both' }),
      context({ accountType: 'individual', companyType: null, role: null }),
      context({ role: 'driver' }),
    ]) {
      expect(buildNav(ctx, NONE).length).toBeGreaterThan(0);
    }
  });
});

describe('what each kind of account sees', () => {
  it('a carrier gets routes and the fleet', () => {
    const items = hrefs(context());
    expect(items).toContain(ROUTES.accountDepartures);
    expect(items).toContain(ROUTES.accountFleet);
  });

  it('a forwarder does not get a fleet it does not have', () => {
    const items = hrefs(context({ companyType: 'expeditie' }));
    expect(items).not.toContain(ROUTES.accountFleet);
    expect(items).not.toContain(ROUTES.accountDepartures);
  });

  it('a company that does both gets each side, and each item once', () => {
    const items = hrefs(context({ companyType: 'both' }), ALL);
    expect(items).toContain(ROUTES.accountDepartures);
    expect(items).toContain(ROUTES.accountRequests);
    expect(new Set(items).size).toBe(items.length);
  });

  it('groups the two sides under their own headings', () => {
    const groups = groupNav(buildNav(context({ companyType: 'both' }), ALL)).map((g) => g.group);
    expect(groups).toContain('transport');
    expect(groups).toContain('expeditii');
  });

  it('drops a group with nothing in it', () => {
    const groups = groupNav(buildNav(context(), ALL)).map((g) => g.group);
    expect(groups).not.toContain('expeditii');
  });

  it('offers alerts to everybody who browses a board, whatever their role', () => {
    for (const ctx of [
      context(),
      context({ companyType: 'expeditie' }),
      context({ role: 'dispatcher' }),
      context({ accountType: 'individual', companyType: null, role: null }),
    ]) {
      expect(hrefs(ctx)).toContain(ROUTES.accountAlerts);
    }
    // A driver publishes nothing and searches nothing.
    expect(hrefs(context({ role: 'driver' }))).not.toContain(ROUTES.accountAlerts);
  });

  it('an individual gets the board, not a company section', () => {
    const items = hrefs(context({ accountType: 'individual', companyType: null, role: null }));
    expect(items).toContain(ROUTES.routes);
    expect(items).not.toContain(ROUTES.accountCompany);
    expect(items).not.toContain(ROUTES.accountDocuments);
  });
});

describe('what a role may see', () => {
  it('a dispatcher gets the work, not the billing or the team', () => {
    const items = hrefs(context({ role: 'dispatcher' }), ALL);
    expect(items).toContain(ROUTES.accountDepartures);
    expect(items).toContain(ROUTES.accountDocuments);
    expect(items).not.toContain(ROUTES.accountSubscription);
    expect(items).not.toContain(ROUTES.accountMembers);
    expect(items).not.toContain(ROUTES.accountCompany);
  });

  it('an owner and an admin see the same thing', () => {
    expect(hrefs(context({ role: 'owner' }), ALL)).toEqual(hrefs(context({ role: 'admin' }), ALL));
  });

  it('a driver sees their own work and nothing else', () => {
    const items = hrefs(context({ role: 'driver' }), ALL);
    expect(items).toEqual([
      ROUTES.account,
      ROUTES.accountTransports,
      ROUTES.accountMessages,
      // A driver has their own help section — „Ce văd eu, ca șofer?" —
      // and is the account type most likely to be handed a phone with
      // no explanation attached.
      ROUTES.accountHelp,
      ROUTES.accountProfile,
      ROUTES.accountNotificationSettings,
      ROUTES.accountPersonalData,
    ]);
  });

  it('ratings reach a client and a carrier, but never a driver', () => {
    // A rating is between the two firms. A driver has no counterparty to
    // rate and nobody rates them, so the item would open a page whose
    // three tabs are all empty for them, for ever.
    expect(
      hrefs(context({ accountType: 'individual', companyType: null, role: null })),
    ).toContain(ROUTES.accountRatings);
    expect(hrefs(context({ companyType: 'transport' }))).toContain(ROUTES.accountRatings);
    expect(hrefs(context({ companyType: 'expeditie' }))).toContain(ROUTES.accountRatings);
    expect(hrefs(context({ role: 'driver' }))).not.toContain(ROUTES.accountRatings);
  });

  it('messages reach everybody, drivers included', () => {
    // A driver is written to about the order they are on, and
    // `my_conversations()` gives them only those threads — so the item
    // opens something real rather than an empty inbox.
    expect(hrefs(context({ companyType: 'transport' }))).toContain(ROUTES.accountMessages);
    expect(hrefs(context({ companyType: 'expeditie' }))).toContain(ROUTES.accountMessages);
    expect(
      hrefs(context({ accountType: 'individual', companyType: null, role: null })),
    ).toContain(ROUTES.accountMessages);
    expect(hrefs(context({ role: 'driver' }))).toContain(ROUTES.accountMessages);
  });

  it('a driver gets the orders and nothing else', () => {
    // The whole of a driver's application, and the correct amount: the
    // work assigned to them, and the three things every account has.
    expect(hrefs(context({ role: 'driver' }))).toEqual([
      ROUTES.account,
      ROUTES.accountTransports,
      // The dispatcher writes to a driver about the order they are on.
      ROUTES.accountMessages,
      ROUTES.accountHelp,
      ROUTES.accountProfile,
      // A driver gets notifications like anybody else: their own documents
      // expire, and the account they work under can be suspended.
      ROUTES.accountNotificationSettings,
      // And leaves like anybody else. This one is never behind a flag.
      ROUTES.accountPersonalData,
    ]);
  });
});

describe('the bottom bar on a phone', () => {
  it('keeps everything when it fits', () => {
    // A driver's menu reached six items when messaging shipped, which is
    // one past the bar — so the example of „fits" is now an account with
    // nothing switched on. The rule under test is unchanged.
    const items = buildNav(context({ role: 'driver' }), NONE);
    expect(items.length).toBeLessThanOrEqual(BOTTOM_NAV_MAX);
    const { bar, more } = bottomNav(items);
    expect(bar).toHaveLength(items.length);
    expect(more).toEqual([]);
  });

  it('and a driver now has one more than fits', () => {
    const items = buildNav(context({ role: 'driver' }), ALL);
    const { bar, more } = bottomNav(items);
    expect(bar).toHaveLength(BOTTOM_NAV_MAX - 1);
    expect(more.length).toBeGreaterThan(0);
  });

  it('leaves a slot for "Mai mult" once it does not', () => {
    const items = buildNav(context({ companyType: 'both' }), ALL);
    expect(items.length).toBeGreaterThan(BOTTOM_NAV_MAX);

    const { bar, more } = bottomNav(items);
    expect(bar).toHaveLength(BOTTOM_NAV_MAX - 1);
    expect(bar.length + more.length).toBe(items.length);
  });

  it('puts the things people open in the bar, not the first five written', () => {
    const { bar } = bottomNav(buildNav(context({ companyType: 'both' }), ALL));
    expect(bar[0]?.href).toBe(ROUTES.account);
    // Profil is last by priority, so it belongs behind "Mai mult".
    expect(bar.map((i) => i.href)).not.toContain(ROUTES.accountProfile);
  });
});

describe('the publish button', () => {
  it('offers a carrier both directions, and a request as well', () => {
    // Subcontracting is ordinary in this market: a carrier with a leg it
    // cannot run itself posts the job rather than turning it down. The
    // schema has always allowed it — a firm's request goes on the curse
    // board — and the menu follows the feature map, not the company type.
    const actions = publishActions(context());
    expect(actions.map((a) => a.label)).toEqual([
      'Traseu pe tur',
      'Traseu pe retur',
      'Publică o cerere',
    ]);
  });

  it('calls it a cursă for a forwarder and a cerere for everyone else', () => {
    expect(publishActions(context({ companyType: 'expeditie' }), ALL)[0]?.label).toBe(
      'Publică o cursă',
    );
    expect(
      publishActions(context({ accountType: 'individual', companyType: null, role: null }), ALL)[0]
        ?.label,
    ).toBe('Publică o cerere');
  });

  it('offers a driver nothing: they publish nothing', () => {
    expect(publishActions(context({ role: 'driver' }), ALL)).toEqual([]);
  });

  it('offers nothing at all rather than a button that 404s', () => {
    expect(
      publishActions(context({ accountType: 'individual', companyType: null, role: null }), NONE),
    ).toEqual([]);
  });
});

describe('which item is the current one', () => {
  it('marks the section a detail page belongs to', () => {
    const items = buildNav(context(), ALL);
    expect(activeHref(items, '/cont/firma/flota/abc')).toBe(ROUTES.accountFleet);
  });

  it('prefers the longest match, so a child does not mark its parent', () => {
    const items = buildNav(context(), ALL);
    expect(activeHref(items, ROUTES.accountFleet)).toBe(ROUTES.accountFleet);
    expect(activeHref(items, ROUTES.accountCompany)).toBe(ROUTES.accountCompany);
  });

  it('marks nothing on a page that is not in the menu', () => {
    expect(activeHref(buildNav(context(), ALL), '/cont/ceva-nou')).toBeNull();
  });

  it('does not mark Acasă on every page under /cont', () => {
    const items = buildNav(context(), ALL);
    expect(activeHref(items, '/cont/firma/documente')).toBe(ROUTES.accountDocuments);
  });
});

describe('what stays open to somebody who has not accepted the terms', () => {
  it('lets them reach the page that exports and deletes', () => {
    // „You may leave" is worth nothing if the page that lets you leave is
    // behind the thing you are refusing.
    expect(isOpenWithoutTerms(ROUTES.accountPersonalData)).toBe(true);
    expect(isOpenWithoutTerms(`${ROUTES.accountPersonalData}/descarca/abc`)).toBe(true);
  });

  it('and nothing else in the account', () => {
    for (const route of [
      ROUTES.account,
      ROUTES.accountRequests,
      ROUTES.accountCompany,
      ROUTES.accountNotificationSettings,
      ROUTES.accountSettings,
    ]) {
      expect(isOpenWithoutTerms(route), route).toBe(false);
    }
  });

  it('does not open a route that merely starts with the same letters', () => {
    expect(isOpenWithoutTerms('/cont/setari/date-personale-altceva')).toBe(false);
  });
});

/** What the header menu offers, as hrefs, in the order it offers them. */
function menu(ctx: NavContext, features: FeatureMap = FEATURES): string[] {
  return headerMenu(ctx, NO_NAV_COUNTS, features).map((item) => item.href);
}

describe('the header menu is a selection from the sidebar, never a second list', () => {
  it('offers nothing the sidebar does not', () => {
    // The whole point of building it from `buildNav`: two hand-written
    // lists drift, and the one that drifts is the one nobody tests.
    for (const ctx of [
      context({ accountType: 'individual', companyType: null, role: null }),
      context({ companyType: 'transport' }),
      context({ companyType: 'expeditie' }),
      context({ companyType: 'both' }),
      context({ role: 'dispatcher' }),
      context({ role: 'driver' }),
    ]) {
      const sidebar = new Set(hrefs(ctx));
      for (const href of menu(ctx)) {
        // /admin is the one item that is not the sidebar's: it belongs to
        // a different application with its own shell.
        if (href === ROUTES.admin) continue;
        expect(sidebar.has(href), href).toBe(true);
      }
    }
  });

  it('takes the label the sidebar uses, so the two cannot read differently', () => {
    const ctx = context({ companyType: 'expeditie' });
    const sidebar = new Map(buildNav(ctx).map((item) => [item.href, item.label]));
    for (const item of headerMenu(ctx)) {
      if (item.href === ROUTES.admin) continue;
      // Contul meu is the exception, and deliberately: the sidebar calls
      // the dashboard „Acasă", which means nothing in a menu opened from
      // a public page.
      if (item.href === ROUTES.account) {
        expect(item.label).toBe('Contul meu');
        continue;
      }
      expect(item.label, item.href).toBe(sidebar.get(item.href));
    }
  });

  it('opens with the dashboard for every kind of account', () => {
    for (const ctx of [
      context({ accountType: 'individual', companyType: null, role: null }),
      context({ companyType: 'transport' }),
      context({ companyType: 'expeditie' }),
      context({ role: 'driver' }),
      context({ isStaff: true }),
    ]) {
      expect(menu(ctx)[0]).toBe(ROUTES.account);
    }
  });

  it('never offers a page that is not built', () => {
    // Everything off: the dashboard and the profile survive, because
    // neither is behind a flag. Nothing else does.
    const items = menu(context({ companyType: 'transport' }), NONE);
    expect(items).toEqual([ROUTES.account, ROUTES.accountProfile]);
  });

  it('leaves Setări out, because /cont/setari is not a page', () => {
    // `FEATURES.settings` is false and nothing is served at that path —
    // the two settings screens that exist are /cont/setari/notificari and
    // /cont/setari/date-personale, and the sidebar lists them by name. An
    // item here would 404, which is the exact thing the feature map
    // exists to prevent.
    //
    // Not gated in this function either: `buildNav` has no item for it at
    // all, and the header only ever selects from what `buildNav` built. So
    // whoever writes that page adds it there, once, and this menu picks it
    // up with no edit here — which is the whole arrangement working.
    expect(menu(context({ companyType: 'transport' }), ALL)).not.toContain(
      ROUTES.accountSettings,
    );
    expect(hrefs(context({ companyType: 'transport' }), ALL)).not.toContain(
      ROUTES.accountSettings,
    );
  });

  it('stays short enough to be a menu', () => {
    for (const ctx of [
      context({ companyType: 'both', isStaff: true }),
      context({ companyType: 'transport' }),
      context({ accountType: 'individual', companyType: null, role: null }),
    ]) {
      // The shortcuts, plus the dashboard, the profile and at most the
      // two tail items. A dropdown longer than that is a sidebar.
      expect(menu(ctx, ALL).length).toBeLessThanOrEqual(HEADER_SHORTCUT_MAX + 4);
    }
  });
});

describe('what each kind of account gets in the header menu', () => {
  it('an individual: their requests, the offers on them, the messages', () => {
    expect(menu(context({ accountType: 'individual', companyType: null, role: null }))).toEqual([
      ROUTES.account,
      ROUTES.accountRequests,
      ROUTES.accountOffers,
      ROUTES.accountMessages,
      ROUTES.accountProfile,
    ]);
  });

  it('a carrier: its routes first, then the board', () => {
    // The board is everybody's; the routes are theirs. A carrier opening
    // this menu is far likelier to want what it published than what the
    // whole market did.
    expect(menu(context({ companyType: 'transport' }))).toEqual([
      ROUTES.account,
      ROUTES.accountDepartures,
      ROUTES.requests,
      ROUTES.accountOffers,
      ROUTES.accountMessages,
      ROUTES.accountDocuments,
      ROUTES.accountProfile,
    ]);
  });

  it('a forwarder: its own runs, not a fleet it does not have', () => {
    expect(menu(context({ companyType: 'expeditie' }))).toEqual([
      ROUTES.account,
      ROUTES.accountRequests,
      ROUTES.accountOffers,
      ROUTES.accountMessages,
      ROUTES.accountDocuments,
      ROUTES.accountProfile,
    ]);
    expect(menu(context({ companyType: 'expeditie' }))).not.toContain(ROUTES.accountFleet);
  });

  it('a driver: the work assigned to them, and nothing else', () => {
    expect(menu(context({ role: 'driver' }))).toEqual([
      ROUTES.account,
      ROUTES.accountTransports,
      ROUTES.accountProfile,
    ]);
  });

  it('a dispatcher gets the work without the billing', () => {
    const items = menu(context({ role: 'dispatcher' }));
    expect(items).toContain(ROUTES.accountDepartures);
    expect(items).not.toContain(ROUTES.accountSubscription);
    expect(items).not.toContain(ROUTES.accountMembers);
  });

  it('staff get a way across to /admin, and nobody else does', () => {
    expect(menu(context({ isStaff: true }))).toContain(ROUTES.admin);
    expect(menu(context({ isStaff: false }))).not.toContain(ROUTES.admin);
    // Never in the account sidebar: /admin is a different application.
    expect(hrefs(context({ isStaff: true }))).not.toContain(ROUTES.admin);
  });

  it('gives each item once to a company that does both', () => {
    const items = menu(context({ companyType: 'both' }));
    expect(new Set(items).size).toBe(items.length);
  });
});

describe('the badges', () => {
  it('count the two things that wait on somebody', () => {
    const counts = { messages: 3, offers: 2 };
    expect(badgeFor(ROUTES.accountMessages, counts)).toBe(3);
    expect(badgeFor(ROUTES.accountOffers, counts)).toBe(2);
  });

  it('and nothing else, however busy the board is', () => {
    // A board is everybody's. A number there would never reach zero, and
    // a badge that never clears is one people stop reading.
    const counts = { messages: 3, offers: 2 };
    for (const href of [
      ROUTES.account,
      ROUTES.requests,
      ROUTES.routes,
      ROUTES.accountRequests,
      ROUTES.accountDepartures,
      ROUTES.accountProfile,
    ]) {
      expect(badgeFor(href, counts), href).toBe(0);
    }
  });

  it('are the same number in the header as in the sidebar', () => {
    // One count, two menus. Two counts of one thing is how a badge stops
    // being believed.
    const counts = { messages: 4, offers: 1 };
    const ctx = context({ companyType: 'expeditie' });
    const sidebar = new Map(
      withBadges(buildNav(ctx), counts).map((item) => [item.href, item.badge]),
    );
    for (const item of headerMenu(ctx, counts)) {
      if (item.href === ROUTES.admin) continue;
      expect(item.badge, item.href).toBe(sidebar.get(item.href));
    }
  });

  it('show nothing at all when there is nothing waiting', () => {
    const items = headerMenu(context({ companyType: 'transport' }));
    expect(items.every((item) => item.badge === 0)).toBe(true);
  });

  it('never go negative, whatever the database returned', () => {
    expect(badgeFor(ROUTES.accountMessages, { messages: -2, offers: 0 })).toBe(0);
  });
});

describe('what a driver may open', () => {
  it('is exactly the menu they are given', () => {
    // These drifted once: the list was written out beside the builder as
    // two paths while the menu grew to seven, so five items would have
    // 404'd. It is the builder's output now.
    for (const path of driverPaths()) {
      expect(isDriverAllowed(path), path).toBe(true);
    }
    for (const item of buildNav(context({ role: 'driver' }))) {
      expect(isDriverAllowed(item.href), item.href).toBe(true);
    }
  });

  it('and not the rest of the account', () => {
    // The bug this replaces: `/cont` sat in a list matched as prefixes, so
    // `/cont/anything`.startsWith(`/cont/`) was true and the guard refused
    // nothing at all — a driver could open the firm's fleet, its documents
    // and its published routes.
    for (const path of [
      ROUTES.accountFleet,
      ROUTES.accountDocuments,
      ROUTES.accountDepartures,
      ROUTES.accountSubscription,
      ROUTES.accountMembers,
      ROUTES.accountCompany,
      ROUTES.accountRequests,
      ROUTES.accountAlerts,
      ROUTES.accountFavourites,
      ROUTES.accountRatings,
    ]) {
      expect(isDriverAllowed(path), path).toBe(false);
    }
  });

  it('covers the pages beneath an item they may open', () => {
    expect(isDriverAllowed(`${ROUTES.accountTransports}/abc`)).toBe(true);
    expect(isDriverAllowed(`${ROUTES.accountMessages}/abc`)).toBe(true);
    expect(isDriverAllowed(`${ROUTES.accountPersonalData}/descarca/abc`)).toBe(true);
  });

  it('treats /cont as the dashboard, not as the parent of everything', () => {
    expect(isDriverAllowed(ROUTES.account)).toBe(true);
    expect(isDriverAllowed('/cont/orice-altceva')).toBe(false);
  });

  it('does not open a route that merely starts with the same letters', () => {
    expect(isDriverAllowed('/cont/transporturi-altceva')).toBe(false);
  });
});

describe('a source with no database configured returns nothing, never throws', () => {
  it('holds for every loader in src/lib', async () => {
    // Three of the thirty source files called `createClient()` without the
    // guard the rest open with, so on a checkout or a preview build with
    // no .env they threw where the others return an empty screen.
    //
    // They surfaced through the header, which is why they are in this
    // change: the bar lives in the root layout, so it renders on every
    // page, and a layout and the page under it render together. A staff
    // page 404s an anonymous visitor, but not before the loader has run
    // and logged. „Not on the path the header touches" was the wrong
    // reading — the header touches everything.
    //
    // Checked by reading the files rather than calling them, because
    // calling one needs a request scope. The guard is one line, and the
    // check is that it is still there.
    const { readFileSync, readdirSync } = await import('node:fs');
    const dir = new URL('../../src/lib/', import.meta.url).pathname;

    const unguarded = readdirSync(dir)
      .filter((name) => name.endsWith('-source.ts'))
      .filter((name) => {
        const body = readFileSync(`${dir}${name}`, 'utf8');
        // A file that never builds a client needs no guard.
        if (!body.includes('createClient(')) return false;
        return !body.includes('isSupabaseConfigured');
      });

    expect(unguarded, 'these call createClient() with no configuration guard').toEqual([]);
  });
});

describe('every menu item carries an icon', () => {
  /**
   * The check that would have caught the whole thing.
   *
   * The icon map is keyed by route, so a destination added to the menu
   * without a line in `NAV_ICONS` renders a label with a hole where its
   * icon should be — and nothing anywhere else fails. This walks every
   * item the builder can produce, for every kind of account and both
   * extremes of the feature map, and names the route that has none.
   */
  const CONTEXTS: { name: string; ctx: NavContext }[] = [
    { name: 'transport company owner', ctx: context() },
    { name: 'forwarder', ctx: context({ companyType: 'expeditie' }) },
    { name: 'both', ctx: context({ companyType: 'both' }) },
    { name: 'dispatcher', ctx: context({ role: 'dispatcher' }) },
    { name: 'driver', ctx: context({ role: 'driver' }) },
    { name: 'individual', ctx: context({ accountType: 'individual', companyType: null, role: null }) },
    { name: 'staff', ctx: context({ isStaff: true }) },
    { name: 'no company yet', ctx: context({ companyType: null, role: null }) },
  ];

  for (const { name, ctx } of CONTEXTS) {
    for (const [featureName, features] of [['everything on', ALL], ['nothing on', NONE]] as const) {
      it(`${name}, ${featureName}`, () => {
        const items = buildNav(ctx, features);
        expect(items.length, 'an account with no menu at all').toBeGreaterThan(0);
        for (const item of items) {
          expect(iconForRoute(item.href), `${item.href} („${item.label}") has no icon`).toBeTruthy();
        }
      });
    }
  }

  it('including every entry in the header menu', () => {
    for (const { name, ctx } of CONTEXTS) {
      // Staff get /admin appended here, outside `buildNav`, so this
      // covers a route the loop above never sees.
      for (const item of headerMenu(ctx, NO_NAV_COUNTS, ALL)) {
        expect(iconForRoute(item.href), `${name}: ${item.href} has no icon`).toBeTruthy();
      }
    }
  });

  it('and both halves of the bottom bar on a phone', () => {
    for (const { name, ctx } of CONTEXTS) {
      const { bar, more } = bottomNav(buildNav(ctx, ALL));
      for (const item of [...bar, ...more]) {
        expect(iconForRoute(item.href), `${name}: ${item.href} has no icon`).toBeTruthy();
      }
    }
  });

  it('and every entry in the staff sidebar, which is its own list', () => {
    // /admin/layout.tsx writes its own NAV array rather than using the
    // builder — twenty-three routes that no other check walks. Read it
    // from the source so adding a screen there fails here until it has
    // an icon.
    const layout = readFileSync('src/app/admin/layout.tsx', 'utf8');
    const block = layout.slice(layout.indexOf('const NAV = ['), layout.indexOf('] as const;'));
    const keys = [...block.matchAll(/ROUTES\.(\w+)/g)].map((m) => m[1]!);
    expect(keys.length, 'the admin NAV array moved or changed shape').toBeGreaterThan(15);
    for (const key of keys) {
      const href = ROUTES[key as keyof typeof ROUTES];
      expect(iconForRoute(href as string), `/admin sidebar: ${key} has no icon`).toBeTruthy();
    }
  });

  it('and no icon points at a route that no longer exists', () => {
    // The other direction: a key in the map that ROUTES does not have is
    // a rename nobody finished.
    const known = new Set<string>(Object.values(ROUTES));
    for (const href of Object.keys(NAV_ICONS)) {
      expect(known.has(href), `NAV_ICONS has ${href}, ROUTES does not`).toBe(true);
    }
  });
});
