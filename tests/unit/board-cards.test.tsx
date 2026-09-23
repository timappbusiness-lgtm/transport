import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { BoardRequestCard } from '@/components/requests/board-card';
import { DepartureCard } from '@/components/departures/departure-card';
import { requestsCopy } from '@/content/cereri';
import { departuresCopy } from '@/content/departures';
import type { PublicDeparture } from '@/lib/departures';
import type { PublicRequest } from '@/lib/requests';

/**
 * What „scannable in one second" means, as properties rather than taste.
 *
 * A transport professional said the boards were hard to connect. The
 * shape both cards now take answers that: the route is the biggest line
 * and the only link, the publication time is on the card because a board
 * people check twice a day is a feed, and there is one visible action.
 *
 * The trap these checks exist for is the action button. A card that is
 * wholly a link and also contains a second link to the same place is two
 * stops on a keyboard and two announcements in a screen reader for one
 * destination. The button is therefore drawn as `aria-hidden` text under
 * a stretched link — and „exactly one `<a>`" is what keeps somebody from
 * turning it back into a real one.
 */

const NOW = new Date('2026-09-17T12:00:00.000Z');

function request(over: Partial<PublicRequest> = {}): PublicRequest {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    category: 'autoturism',
    make: 'Opel',
    model: 'Combo',
    year: 2019,
    is_running: true,
    service_type: 'pe_sens',
    from_city: 'Mizil',
    from_country: 'RO',
    to_city: 'Pamplona',
    to_country: 'ES',
    estimated_km: 2970,
    published_at: '2026-09-17T11:54:00.000Z',
    board: 'retur',
    loading_from: '2026-09-25',
    loading_to: null,
    weight_kg: 1400,
    needs_winch: false,
    photo_count: 0,
    is_domestic: false,
    from_county: null,
    to_county: null,
    from_lat: null,
    from_lng: null,
    to_lat: null,
    to_lng: null,
    ...over,
  };
}

function departure(over: Partial<PublicDeparture> = {}): PublicDeparture {
  return {
    truck_listing_id: '22222222-2222-2222-2222-222222222222',
    direction: 'tur',
    from_country: 'RO',
    from_county: 'Cluj',
    from_city: 'Cluj-Napoca',
    to_country: 'DE',
    to_county: 'Bayern',
    to_city: 'München',
    waypoints: [],
    available_from: '2026-09-28',
    available_to: '2026-09-30',
    service_types: ['pe_sens'],
    accepted_vehicle_types: ['autoturism'],
    platform_slots_total: 8,
    slots_taken: 5,
    slots_free: 3,
    price_indicative: 1200,
    currency: 'RON',
    published_at: '2026-09-17T11:00:00.000Z',
    is_domestic: false,
    from_locality_lat: null,
    from_locality_lng: null,
    free_capacity_kg: null,
    ...over,
  };
}

const cardOf = {
  request: (over: Partial<PublicRequest> = {}) =>
    renderToStaticMarkup(
      <ul>
        <BoardRequestCard request={request(over)} now={NOW} />
      </ul>,
    ),
  departure: (over: Partial<PublicDeparture> = {}) =>
    renderToStaticMarkup(
      <ul>
        <DepartureCard departure={departure(over)} now={NOW} />
      </ul>,
    ),
};

/** The heading's opening tag and its text, without the markup inside. */
function heading(html: string): { tag: string; text: string } {
  const match = /<h3\b([^>]*)>([\s\S]*?)<\/h3>/.exec(html);
  if (match === null) return { tag: '', text: '' };
  return { tag: match[1] ?? '', text: (match[2] ?? '').replace(/<[^>]+>/g, ' ') };
}

describe.each([
  ['the request card', cardOf.request, requestsCopy.card.open, 'Mizil', 'Pamplona', 'RO', 'ES'],
  [
    'the route card',
    cardOf.departure,
    departuresCopy.card.open,
    'Cluj-Napoca',
    'München',
    'RO',
    'DE',
  ],
] as const)('%s', (_name, render, action, from, to, fromCc, toCc) => {
  it('makes the route the biggest line on it', () => {
    const { tag, text } = heading(render());
    expect(tag, 'the route is not the card heading').toContain('text-h3');
    expect(text).toContain(from);
    expect(text).toContain(to);
  });

  it('puts the only link on that route', () => {
    const html = render();
    const links = html.match(/<a\b/g) ?? [];
    expect(links, 'a card has more than one link in it').toHaveLength(1);
    expect(heading(html).text).not.toBe('');
    // The link covers the card, so clicking anywhere on it works.
    expect(html).toContain('after:absolute');
  });

  it('draws the action, and hides it from a screen reader', () => {
    const html = render();
    expect(html).toContain(action);
    const button = new RegExp(`<span aria-hidden="true"[^>]*>${action}</span>`);
    expect(html, `„${action}" is not the hidden duplicate of the link`).toMatch(button);
  });

  it('says when it was published', () => {
    expect(render()).toMatch(/<time\b[^>]*datetime=/i);
  });

  it('names both countries beside their cities', () => {
    const html = render();
    expect(html).toContain(`>${fromCc}<`);
    expect(html).toContain(`>${toCc}<`);
  });
});

describe('what the two cards do not share', () => {
  it('a route with no publication date shows no time at all', () => {
    // `published_at` is nullable on `v_departures_public`. „chiar acum"
    // for a missing date would be an invented fact on a public board.
    expect(cardOf.departure({ published_at: null })).not.toMatch(/<time\b/i);
  });

  it('a route lists at most three categories and counts the rest', () => {
    const html = cardOf.departure({
      accepted_vehicle_types: ['autoturism', 'autoutilitara', 'motocicleta', 'rulota', 'atv_quad'],
    });
    expect(html).toContain('+2');
  });

  it('a request that needs a winch says so on the card', () => {
    // The one fact that changes what a carrier has to bring.
    expect(cardOf.request({ needs_winch: true })).toContain(requestsCopy.card.winch);
    expect(cardOf.request({ needs_winch: false })).toContain(requestsCopy.card.running);
  });
});
