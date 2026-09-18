import { describe, expect, it } from 'vitest';
import { ROUTES } from '@/config/routes';
import { FEATURES, type FeatureMap } from '@/lib/features';
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
    // As the application stands: no request flow, no offers, no messages,
    // no orders. None of them may appear.
    const items = hrefs(context());
    expect(items).not.toContain(ROUTES.accountRequests);
    expect(items).not.toContain(ROUTES.accountOffers);
    expect(items).not.toContain(ROUTES.accountMessages);
    expect(items).not.toContain(ROUTES.accountTransports);
  });

  it('offers them the moment they are built', () => {
    const items = hrefs(context(), ALL);
    expect(items).toContain(ROUTES.accountOffers);
    expect(items).toContain(ROUTES.accountMessages);
    expect(items).toContain(ROUTES.accountTransports);
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
    ]);
  });

  it('a driver keeps a home even before orders are built', () => {
    expect(hrefs(context({ role: 'driver' }))).toEqual([
      ROUTES.account,
      ROUTES.accountProfile,
      // A driver gets notifications like anybody else: their own documents
      // expire, and the account they work under can be suspended.
      ROUTES.accountNotificationSettings,
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
