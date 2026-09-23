import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Badge } from '@/components/ui/badge';
import { BoardRequestCard } from '@/components/requests/board-card';
import { DepartureCard } from '@/components/departures/departure-card';
import { NEW_WINDOW_MS, countLabel, isNew, pendingDocumentCount } from '@/lib/badges';
import { NO_NAV_COUNTS, badgeFor, withBadges } from '@/lib/navigation';
import { ROUTES } from '@/config/routes';
import type { PublicRequest } from '@/lib/requests';
import type { PublicDeparture } from '@/lib/departures';

/**
 * A badge appears when there is something real to show, and not
 * otherwise.
 *
 * The rules are small and the failures are the kind nobody reports: a
 * „Nou" on a request from last week, a „0" beside „Mesaje", „acum 2 zile"
 * on a route with no date at all. Each of those is the platform saying
 * something untrue in a font size nobody questions.
 */

const NOW = new Date('2026-09-23T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

describe('„Nou"', () => {
  it('on something published in the last 24 hours', () => {
    expect(isNew(hoursAgo(0), NOW)).toBe(true);
    expect(isNew(hoursAgo(1), NOW)).toBe(true);
    expect(isNew(hoursAgo(23.9), NOW)).toBe(true);
  });

  it('not at 24 hours, and not after', () => {
    expect(isNew(new Date(NOW.getTime() - NEW_WINDOW_MS).toISOString(), NOW)).toBe(false);
    expect(isNew(hoursAgo(30), NOW)).toBe(false);
    expect(isNew(hoursAgo(24 * 9), NOW)).toBe(false);
  });

  it('not on a date that is missing, empty or not a date', () => {
    // `published_at` is nullable on the routes view.
    expect(isNew(null, NOW)).toBe(false);
    expect(isNew(undefined, NOW)).toBe(false);
    expect(isNew('', NOW)).toBe(false);
    expect(isNew('ieri', NOW)).toBe(false);
  });

  it('forgives a clock a few minutes fast, not one a day fast', () => {
    expect(isNew(new Date(NOW.getTime() + 2 * 60_000).toISOString(), NOW)).toBe(true);
    expect(isNew(new Date(NOW.getTime() + 24 * 3_600_000).toISOString(), NOW)).toBe(false);
  });
});

describe('counts', () => {
  it('say nothing for zero, a negative or something that is not a number', () => {
    for (const value of [0, -1, 0.4, Number.NaN, Number.POSITIVE_INFINITY, null, undefined]) {
      expect(countLabel(value as number), String(value)).toBeNull();
    }
  });

  it('say the number up to nine, and „9+" past it', () => {
    expect(countLabel(1)).toBe('1');
    expect(countLabel(9)).toBe('9');
    expect(countLabel(10)).toBe('9+');
    expect(countLabel(250)).toBe('9+');
  });

  it('sit on messages, offers and documents, and nowhere else', () => {
    const counts = { messages: 2, offers: 3, documents: 1 };
    expect(badgeFor(ROUTES.accountMessages, counts)).toBe(2);
    expect(badgeFor(ROUTES.accountOffers, counts)).toBe(3);
    expect(badgeFor(ROUTES.accountDocuments, counts)).toBe(1);
    // A board is everybody's; a number on it would never reach zero.
    expect(badgeFor(ROUTES.requests, counts)).toBe(0);
    expect(badgeFor(ROUTES.routes, counts)).toBe(0);
  });

  it('and a menu with nothing waiting carries no number at all', () => {
    const items = withBadges(
      [
        { href: ROUTES.accountMessages, label: 'Mesaje', group: 'principal' },
        { href: ROUTES.accountDocuments, label: 'Documente', group: 'firma' },
      ] as never,
      NO_NAV_COUNTS,
    );
    for (const item of items) expect(countLabel(item.badge), item.href).toBeNull();
  });
});

describe('pending documents', () => {
  it('count blocking documents that are missing, rejected or expired', () => {
    expect(
      pendingDocumentCount([
        { is_blocking: true, state: 'missing' },
        { is_blocking: true, state: 'rejected' },
        { is_blocking: true, state: 'expired' },
        { is_blocking: true, state: 'ok' },
      ]),
    ).toBe(3);
  });

  it('but not one waiting on us, and never an optional one', () => {
    expect(
      pendingDocumentCount([
        { is_blocking: true, state: 'in_review' },
        { is_blocking: false, state: 'missing' },
        { is_blocking: null, state: 'missing' },
      ]),
    ).toBe(0);
  });
});

describe('the component', () => {
  it('names its kind, so a test and a stylesheet can find it', () => {
    const html = renderToStaticMarkup(<Badge kind="new">Nou</Badge>);
    expect(html).toContain('data-badge="new"');
  });

  it('carries no icon, so it can never read as a verification mark', () => {
    for (const kind of ['new', 'time', 'count', 'express', 'return'] as const) {
      expect(renderToStaticMarkup(<Badge kind={kind}>x</Badge>), kind).not.toContain('<svg');
    }
  });

  it('gives a count a sentence for a screen reader', () => {
    const html = renderToStaticMarkup(
      <Badge kind="count" label="care așteaptă">
        3
      </Badge>,
    );
    expect(html).toContain('sr-only');
    expect(html).toContain('care așteaptă');
  });
});

describe('on the cards, with real data and without it', () => {
  const request = (published_at: string): PublicRequest =>
    ({
      id: '11111111-1111-1111-1111-111111111111',
      category: 'autoturism',
      make: 'Opel',
      model: 'Combo',
      year: 2019,
      is_running: true,
      service_type: 'expres',
      from_city: 'Mizil',
      from_country: 'RO',
      to_city: 'Pamplona',
      to_country: 'ES',
      estimated_km: 2970,
      published_at,
      board: 'retur',
      loading_from: '2026-09-25',
      loading_to: null,
      weight_kg: null,
      needs_winch: false,
      photo_count: 0,
      is_domestic: false,
      from_county: null,
      to_county: null,
      from_lat: null,
      from_lng: null,
      to_lat: null,
      to_lng: null,
    }) as PublicRequest;

  const render = (published_at: string) =>
    renderToStaticMarkup(
      <ul>
        <BoardRequestCard request={request(published_at)} now={NOW} />
      </ul>,
    );

  it('a request from this morning says „Nou" and how long ago', () => {
    const html = render(hoursAgo(3));
    expect(html).toContain('data-badge="new"');
    expect(html).toContain('data-badge="time"');
    expect(html).toContain('acum 3 ore');
    expect(html).toContain('data-badge="express"');
  });

  it('a request from last week says how long ago and nothing more', () => {
    const html = render(hoursAgo(24 * 6));
    expect(html).not.toContain('data-badge="new"');
    expect(html).toContain('data-badge="time"');
  });

  const departure = (over: Partial<PublicDeparture>): PublicDeparture => ({
    truck_listing_id: '22222222-2222-2222-2222-222222222222',
    direction: 'retur',
    from_country: 'DE',
    from_county: null,
    from_city: 'München',
    to_country: 'RO',
    to_county: 'CJ',
    to_city: 'Cluj-Napoca',
    waypoints: [],
    available_from: '2026-09-28',
    available_to: null,
    service_types: ['pe_sens'],
    accepted_vehicle_types: ['autoturism'],
    platform_slots_total: 8,
    slots_taken: 5,
    slots_free: 3,
    price_indicative: null,
    currency: 'EUR',
    published_at: hoursAgo(2),
    is_domestic: false,
    from_locality_lat: null,
    from_locality_lng: null,
    free_capacity_kg: null,
    ...over,
  });

  it('a route with no date shows neither „Nou" nor a time', () => {
    const html = renderToStaticMarkup(
      <ul>
        <DepartureCard departure={departure({ published_at: null })} now={NOW} />
      </ul>,
    );
    expect(html).not.toContain('data-badge="new"');
    expect(html).not.toContain('data-badge="time"');
  });

  it('a return leg says so as a badge; a full platform keeps its status chip', () => {
    const open = renderToStaticMarkup(
      <ul>
        <DepartureCard departure={departure({})} now={NOW} />
      </ul>,
    );
    expect(open).toContain('data-badge="return"');

    const full = renderToStaticMarkup(
      <ul>
        <DepartureCard departure={departure({ slots_taken: 8, slots_free: 0 })} now={NOW} />
      </ul>,
    );
    expect(full).not.toContain('data-badge="return"');
  });
});
