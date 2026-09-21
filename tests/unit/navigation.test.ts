import { describe, expect, it } from 'vitest';
import { ROUTES } from '@/config/routes';
import { FEATURES, type FeatureMap } from '@/lib/features';
import { isOpenWithoutTerms } from '@/lib/auth/guards';
import {
  BOTTOM_NAV_MAX,
  activeHref,
  bottomNav,
  buildNav,
  groupNav,
  publishActions,
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
    // Offers and orders both went live with Faza 2. General messaging
    // has not: the tables exist, which is not the same thing, and a
    // menu item called „Mesaje" that opens one offer thread would be a
    // promise the product does not keep.
    expect(hrefs(context())).not.toContain(ROUTES.accountMessages);
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
      ROUTES.accountProfile,
      ROUTES.accountNotificationSettings,
      ROUTES.accountPersonalData,
    ]);
  });

  it('a driver gets the orders and nothing else', () => {
    // The whole of a driver's application, and the correct amount: the
    // work assigned to them, and the three things every account has.
    expect(hrefs(context({ role: 'driver' }))).toEqual([
      ROUTES.account,
      ROUTES.accountTransports,
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
    const items = buildNav(context({ role: 'driver' }), ALL);
    const { bar, more } = bottomNav(items);
    expect(bar).toHaveLength(items.length);
    expect(more).toEqual([]);
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
