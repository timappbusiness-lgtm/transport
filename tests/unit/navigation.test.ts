import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ROUTES } from '@/config/routes';
import { FEATURES, type FeatureMap } from '@/lib/features';
import { NAV_ICONS, iconForRoute } from '@/lib/icons';
import { isDriverAllowed, isOpenWithoutTerms } from '@/lib/auth/guards';
import {
  BOTTOM_NAV_MAX,
  FOOTER_NAV,
  NO_NAV_COUNTS,
  PLATFORM_LINKS,
  PUBLIC_NAV,
  activeHref,
  badgeFor,
  barOrder,
  bottomNav,
  buildNav,
  driverPaths,
  groupNav,
  headerBar,
  headerMenu,
  publishActions,
  publishLabel,
  publishMenu,
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

  it('keeps the request available to a carrier, but lower and quieter', () => {
    // Available, not first: the only secondary action there is.
    const actions = publishActions(context());
    expect(actions.filter((a) => a.secondary === true).map((a) => a.href)).toEqual([
      ROUTES.newRequest,
    ]);
    expect(actions[0]?.secondary).toBeUndefined();
    expect(actions.at(-1)?.href).toBe(ROUTES.newRequest);
  });

  it('calls it „Publică o cerere" for a forwarder and for a private client alike', () => {
    // One word for what a client publishes, whoever the client is. The
    // forwarder's button used to say „Publică o cursă", which is a third
    // name for the same thing.
    for (const ctx of [
      context({ companyType: 'expeditie' }),
      context({ accountType: 'individual', companyType: null, role: null }),
    ]) {
      expect(publishActions(ctx, ALL)).toEqual([
        { href: ROUTES.newRequest, label: 'Publică o cerere' },
      ]);
      expect(publishLabel(ctx, ALL)).toBe('Publică o cerere');
    }
  });

  it('names the button after what the role publishes', () => {
    expect(publishLabel(context(), ALL)).toBe('Publică un traseu');
    expect(publishLabel(context({ companyType: 'both' }), ALL)).toBe('Publică un traseu');
    expect(publishLabel(context({ role: 'dispatcher' }), ALL)).toBe('Publică un traseu');
    expect(publishLabel(context({ role: 'driver' }), ALL)).toBeNull();
  });

  it('draws one menu for the header and the account, with a short label for a phone', () => {
    expect(publishMenu(context(), ALL)).toMatchObject({
      label: 'Publică un traseu',
      compactLabel: 'Traseu nou',
    });
    expect(publishMenu(context({ companyType: 'expeditie' }), ALL)).toMatchObject({
      label: 'Publică o cerere',
      compactLabel: 'Cerere nouă',
    });
    expect(publishMenu(context({ role: 'driver' }), ALL)).toBeNull();
  });

  it('points every action at a route that exists', () => {
    const known = new Set<string>(Object.values(ROUTES));
    for (const ctx of [
      context(),
      context({ companyType: 'both' }),
      context({ companyType: 'expeditie' }),
      context({ accountType: 'individual', companyType: null, role: null }),
    ]) {
      for (const action of publishActions(ctx, ALL)) {
        expect(known.has(action.href.split('?')[0]!), action.href).toBe(true);
      }
    }
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

/** What the bar offers a signed-in person, as labels, in the order read. */
function bar(ctx: NavContext, features: FeatureMap = FEATURES): string[] {
  return headerBar(ctx, NO_NAV_COUNTS, features).map((item) => item.label);
}

const CARRIER = context({ companyType: 'transport' });
const FORWARDER = context({ companyType: 'expeditie' });
const INDIVIDUAL = context({ accountType: 'individual', companyType: null, role: null });
const DRIVER = context({ role: 'driver' });

/** Every kind of account and role the header is drawn for. */
const EVERYONE: { name: string; ctx: NavContext }[] = [
  { name: 'carrier', ctx: CARRIER },
  { name: 'carrier dispatcher', ctx: context({ role: 'dispatcher' }) },
  { name: 'both', ctx: context({ companyType: 'both' }) },
  { name: 'forwarder', ctx: FORWARDER },
  { name: 'forwarder dispatcher', ctx: context({ companyType: 'expeditie', role: 'dispatcher' }) },
  { name: 'individual', ctx: INDIVIDUAL },
  { name: 'driver', ctx: DRIVER },
  { name: 'staff', ctx: context({ isStaff: true }) },
  { name: 'no firm yet', ctx: context({ companyType: null, role: null }) },
];

/** Hrefs that are a thing somebody does rather than a page of the sidebar. */
const NOT_SIDEBAR = new Set<string>([
  ROUTES.admin,
  ROUTES.newRequest,
  ...PLATFORM_LINKS.map((link) => link.href),
]);

describe('the bar a signed-in person sees', () => {
  it('a carrier: the board first, then its own work', () => {
    expect(bar(CARRIER)).toEqual([
      'Cereri de transport',
      'Traseele mele',
      'Oferte trimise',
      'Transporturi',
      'Mesaje',
    ]);
  });

  it('a dispatcher at a carrier reads the same bar as the owner', () => {
    expect(bar(context({ role: 'dispatcher' }))).toEqual(bar(CARRIER));
  });

  it('a firm that does both: a carrier first', () => {
    expect(bar(context({ companyType: 'both' }))).toEqual(bar(CARRIER));
  });

  it('a forwarder: its own requests, the offers on them, then the routes it can book', () => {
    expect(bar(FORWARDER)).toEqual([
      'Cursele mele',
      'Oferte primite',
      'Trasee disponibile',
      'Transporturi',
      'Mesaje',
    ]);
  });

  it('a private client: their requests, the offers, the messages, the routes', () => {
    expect(bar(INDIVIDUAL)).toEqual([
      'Cererile mele',
      'Oferte primite',
      'Mesaje',
      'Trasee disponibile',
    ]);
  });

  it('a driver: the transports assigned to them, and nothing else', () => {
    expect(bar(DRIVER)).toEqual(['Transporturile mele']);
  });

  it('staff: the bar of their account, and /admin in the menu', () => {
    const staff = context({ isStaff: true });
    expect(bar(staff)).toEqual(bar(CARRIER));
    expect(headerBar(staff).map((item) => item.href)).not.toContain(ROUTES.admin);
    expect(menu(staff)).toContain(ROUTES.admin);
  });

  it('a firm before its firm exists: the two boards', () => {
    expect(bar(context({ companyType: null, role: null }))).toEqual([
      'Cereri de transport',
      'Trasee disponibile',
      'Mesaje',
    ]);
  });

  it('never shows the shop window to somebody signed in', () => {
    for (const { name, ctx } of EVERYONE) {
      const hrefs = headerBar(ctx).map((item) => item.href);
      for (const href of [ROUTES.companies, ROUTES.plans, ROUTES.faq]) {
        expect(hrefs, `${name}: ${href}`).not.toContain(href);
      }
    }
  });

  it('is at most five, and every entry once', () => {
    for (const { name, ctx } of EVERYONE) {
      for (const features of [ALL, FEATURES, NONE]) {
        const hrefs = headerBar(ctx, NO_NAV_COUNTS, features).map((item) => item.href);
        expect(hrefs.length, name).toBeLessThanOrEqual(5);
        expect(new Set(hrefs).size, name).toBe(hrefs.length);
      }
    }
  });

  it('is a selection from the sidebar, with the sidebar\'s own labels', () => {
    // Built from `buildNav`, never written out beside it: the label and
    // whether the entry may exist at all stay the builder's.
    for (const { name, ctx } of EVERYONE) {
      const sidebar = new Map(buildNav(ctx, ALL).map((item) => [item.href, item.label]));
      for (const item of headerBar(ctx, NO_NAV_COUNTS, ALL)) {
        expect(sidebar.get(item.href), `${name}: ${item.href}`).toBe(item.label);
      }
    }
  });

  it('drops what is not built rather than offering it', () => {
    expect(bar(CARRIER, { ...ALL, departures: false })).not.toContain('Traseele mele');
    expect(bar(CARRIER, { ...ALL, requestBoard: false })).not.toContain('Cereri de transport');
    expect(bar(DRIVER, NONE)).toEqual([]);
  });

  it('names every entry in two or three words', () => {
    for (const { name, ctx } of EVERYONE) {
      for (const item of headerBar(ctx, NO_NAV_COUNTS, ALL)) {
        const words = item.label.split(/\s+/).length;
        expect(words, `${name}: „${item.label}"`).toBeLessThanOrEqual(3);
      }
    }
  });

  it('only names hrefs the builder knows how to build', () => {
    // A typo in `barOrder` would silently drop an entry; the builder is
    // the only source of an item, so every href named there has to be
    // one it can produce for somebody.
    const everything = new Set(EVERYONE.flatMap(({ ctx }) => buildNav(ctx, ALL).map((i) => i.href)));
    for (const { name, ctx } of EVERYONE) {
      for (const href of barOrder(ctx)) {
        expect(everything.has(href), `${name}: ${href}`).toBe(true);
      }
    }
  });
});

describe('the account menu holds everything the bar does not', () => {
  it('loses nothing: the bar and the menu together hold every page of the sidebar', () => {
    // Reordered by relevance, never removed.
    for (const { name, ctx } of EVERYONE) {
      for (const features of [ALL, FEATURES]) {
        const header = new Set([
          ...headerBar(ctx, NO_NAV_COUNTS, features).map((item) => item.href),
          ...headerMenu(ctx, NO_NAV_COUNTS, features).map((item) => item.href),
        ]);
        for (const item of buildNav(ctx, features)) {
          expect(header.has(item.href), `${name}: ${item.href}`).toBe(true);
        }
      }
    }
  });

  it('and every page of the signed-out bar, for everyone', () => {
    // Firme, Abonamente and Cum funcționează leave the bar once somebody
    // signs in; they stay one click away in the account menu.
    for (const { name, ctx } of EVERYONE) {
      const header = new Set([
        ...headerBar(ctx).map((item) => item.href),
        ...menu(ctx),
      ]);
      for (const link of PUBLIC_NAV) {
        expect(header.has(link.href), `${name}: ${link.href}`).toBe(true);
      }
      for (const href of [ROUTES.companies, ROUTES.plans, ROUTES.faq]) {
        expect(menu(ctx), `${name}: ${href}`).toContain(href);
      }
    }
  });

  it('offers each page once, across the bar and the menu', () => {
    for (const { name, ctx } of EVERYONE) {
      const hrefs = [...headerBar(ctx, NO_NAV_COUNTS, ALL).map((i) => i.href), ...menu(ctx, ALL)];
      expect(new Set(hrefs).size, `${name}: ${hrefs.join(', ')}`).toBe(hrefs.length);
    }
  });

  it('offers nothing the sidebar does not, apart from the public pages and the actions', () => {
    for (const { name, ctx } of EVERYONE) {
      const sidebar = new Set(hrefs(ctx));
      for (const href of menu(ctx)) {
        if (NOT_SIDEBAR.has(href)) continue;
        expect(sidebar.has(href), `${name}: ${href}`).toBe(true);
      }
    }
  });

  it('takes the label the sidebar uses, so the two cannot read differently', () => {
    for (const { name, ctx } of EVERYONE) {
      const sidebar = new Map(buildNav(ctx).map((item) => [item.href, item.label]));
      for (const item of headerMenu(ctx)) {
        if (NOT_SIDEBAR.has(item.href) && !sidebar.has(item.href)) continue;
        // Contul meu is the exception, and deliberately: the sidebar calls
        // the dashboard „Acasă", which means nothing in a menu opened from
        // a public page.
        if (item.href === ROUTES.account) {
          expect(item.label).toBe('Contul meu');
          continue;
        }
        expect(item.label, `${name}: ${item.href}`).toBe(sidebar.get(item.href));
      }
    }
  });

  it('opens with the dashboard for every kind of account', () => {
    for (const { ctx } of EVERYONE) {
      expect(menu(ctx)[0]).toBe(ROUTES.account);
    }
  });

  it('lets a carrier publish a request from it — second, never first', () => {
    for (const ctx of [CARRIER, context({ role: 'dispatcher' }), context({ companyType: 'both' })]) {
      const items = menu(ctx);
      expect(items).toContain(ROUTES.newRequest);
      // After the carrier's own work, before the public pages.
      expect(items.indexOf(ROUTES.newRequest)).toBeLessThan(items.indexOf(ROUTES.companies));
      expect(items.indexOf(ROUTES.newRequest)).toBeGreaterThan(items.indexOf(ROUTES.accountRatings));
    }
    // A client's button is the request itself; the menu does not repeat it.
    expect(menu(FORWARDER)).not.toContain(ROUTES.newRequest);
    expect(menu(INDIVIDUAL)).not.toContain(ROUTES.newRequest);
    expect(menu(DRIVER)).not.toContain(ROUTES.newRequest);
  });

  it('never offers a page that is not built', () => {
    // Everything off: the pages behind no flag survive, and the public
    // pages, which are not the account's to switch off. Nothing else does.
    expect(menu(CARRIER, NONE)).toEqual([
      ROUTES.account,
      ROUTES.accountHelp,
      ROUTES.accountProfile,
      ROUTES.accountNotificationSettings,
      ROUTES.accountPersonalData,
      ...PLATFORM_LINKS.map((link) => link.href),
    ]);
  });

  it('leaves Setări out, because /cont/setari is not a page', () => {
    // `FEATURES.settings` is false and nothing is served at that path —
    // the two settings screens that exist are /cont/setari/notificari and
    // /cont/setari/date-personale, and the sidebar lists them by name. An
    // item here would 404, which is the exact thing the feature map
    // exists to prevent.
    expect(menu(CARRIER, ALL)).not.toContain(ROUTES.accountSettings);
    expect(hrefs(CARRIER, ALL)).not.toContain(ROUTES.accountSettings);
  });

  it('points every entry at a route that exists', () => {
    const known = new Set<string>(Object.values(ROUTES));
    for (const { name, ctx } of EVERYONE) {
      for (const href of [...headerBar(ctx, NO_NAV_COUNTS, ALL).map((i) => i.href), ...menu(ctx, ALL)]) {
        expect(known.has(href), `${name}: ${href}`).toBe(true);
      }
    }
  });

  it('points every entry at a page the app serves', () => {
    // A route in ROUTES is a promise; a page file is the promise kept.
    // The menus once offered /cont/setari, which was in ROUTES and served
    // nothing.
    for (const { name, ctx } of EVERYONE) {
      for (const href of [...headerBar(ctx, NO_NAV_COUNTS, ALL).map((i) => i.href), ...menu(ctx, ALL)]) {
        expect(pageExists(href), `${name}: ${href} has no page`).toBe(true);
      }
    }
    for (const link of [...PUBLIC_NAV, ...FOOTER_NAV]) {
      expect(pageExists(link.href), `${link.href} has no page`).toBe(true);
    }
  });
});

describe('what each kind of account gets in the account menu', () => {
  it('a private client: the dashboard, then the rest of their account, then the public pages', () => {
    expect(menu(INDIVIDUAL)).toEqual([
      ROUTES.account,
      ROUTES.accountTransports,
      ROUTES.accountRatings,
      ROUTES.accountAlerts,
      ROUTES.accountHelp,
      ROUTES.accountProfile,
      ROUTES.accountNotificationSettings,
      ROUTES.accountPersonalData,
      ROUTES.requests,
      ROUTES.companies,
      ROUTES.plans,
      ROUTES.faq,
    ]);
  });

  it('a carrier: the rest of its work, the firm, the account, then the public pages', () => {
    expect(menu(CARRIER)).toEqual([
      ROUTES.account,
      ROUTES.accountRatings,
      ROUTES.newRequest,
      ROUTES.accountFleet,
      ROUTES.accountDocuments,
      ROUTES.accountMembers,
      ROUTES.accountSubscription,
      ROUTES.accountCompany,
      ROUTES.accountAlerts,
      ROUTES.accountHelp,
      ROUTES.accountProfile,
      ROUTES.accountNotificationSettings,
      ROUTES.accountPersonalData,
      ROUTES.routes,
      ROUTES.companies,
      ROUTES.plans,
      ROUTES.faq,
    ]);
  });

  it('a forwarder: no fleet it does not have', () => {
    const items = menu(FORWARDER);
    expect(items).not.toContain(ROUTES.accountFleet);
    expect(items).toContain(ROUTES.accountFavourites);
    expect(items).toContain(ROUTES.requests);
  });

  it('a driver: their own account and the public pages, nothing of the firm', () => {
    expect(menu(DRIVER)).toEqual([
      ROUTES.account,
      ROUTES.accountMessages,
      ROUTES.accountHelp,
      ROUTES.accountProfile,
      ROUTES.accountNotificationSettings,
      ROUTES.accountPersonalData,
      ...PLATFORM_LINKS.map((link) => link.href),
    ]);
  });

  it('a dispatcher gets the work without the billing', () => {
    const items = menu(context({ role: 'dispatcher' }));
    expect(items).not.toContain(ROUTES.accountSubscription);
    expect(items).not.toContain(ROUTES.accountMembers);
    // The public plans page is not billing: anybody can read it.
    expect(items).toContain(ROUTES.plans);
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

  it('count what is new on the request board since the last look, and only that', () => {
    expect(badgeFor(ROUTES.requests, { messages: 0, offers: 0, newRequests: 12 })).toBe(12);
    expect(badgeFor(ROUTES.requests, { messages: 0, offers: 0 })).toBe(0);
    expect(badgeFor(ROUTES.requests, { messages: 0, offers: 0, newRequests: -1 })).toBe(0);
  });

  it('put the new requests on the carrier\'s first entry', () => {
    const counts = { messages: 2, offers: 1, newRequests: 12 };
    const items = headerBar(CARRIER, counts);
    expect(items[0]).toMatchObject({ href: ROUTES.requests, badge: 12 });
    expect(items.find((item) => item.href === ROUTES.accountMessages)?.badge).toBe(2);
    expect(items.find((item) => item.href === ROUTES.accountOffers)?.badge).toBe(1);
    // And nowhere else: the menu holds no second copy of the board.
    expect(headerMenu(CARRIER, counts).some((item) => item.href === ROUTES.requests)).toBe(false);
  });

  it('show no board badge at zero', () => {
    expect(headerBar(CARRIER, { messages: 0, offers: 0, newRequests: 0 })[0]?.badge).toBe(0);
  });

  it('never put the board count in front of somebody it is not for', () => {
    // The count is zero for them at the source; even a stray number would
    // have nothing to sit on, because the board is not in their bar.
    const counts = { messages: 0, offers: 0, newRequests: 5 };
    for (const ctx of [FORWARDER, INDIVIDUAL, DRIVER]) {
      expect(headerBar(ctx, counts).every((item) => item.badge === 0)).toBe(true);
    }
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
    for (const item of [...headerBar(ctx, counts), ...headerMenu(ctx, counts)]) {
      if (NOT_SIDEBAR.has(item.href)) continue;
      expect(item.badge, item.href).toBe(sidebar.get(item.href));
    }
  });

  it('show nothing at all when there is nothing waiting', () => {
    const items = [...headerBar(CARRIER), ...headerMenu(CARRIER)];
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
      for (const item of headerBar(ctx, NO_NAV_COUNTS, ALL)) {
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

/**
 * Whether the App Router serves a page at this path: a `page.tsx` or a
 * `route.ts` under `src/app`, with route groups — `(panou)` — skipped.
 */
function pageExists(href: string): boolean {
  const segments = href.split('?')[0]!.split('/').filter(Boolean);

  function walk(dir: string, rest: string[]): boolean {
    if (rest.length === 0) {
      if (existsSync(`${dir}/page.tsx`) || existsSync(`${dir}/route.ts`)) return true;
      return groups(dir).some((group) => walk(`${dir}/${group}`, rest));
    }
    const [head, ...tail] = rest;
    if (existsSync(`${dir}/${head}`) && walk(`${dir}/${head}`, tail)) return true;
    return groups(dir).some((group) => walk(`${dir}/${group}`, rest));
  }

  function groups(dir: string): string[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^\(.+\)$/.test(entry.name))
      .map((entry) => entry.name);
  }

  return walk('src/app', segments);
}
