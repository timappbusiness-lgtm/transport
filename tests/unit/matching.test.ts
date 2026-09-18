import { describe, expect, it } from 'vitest';
import { MATCH_LIMIT, matches, matchingRequests, type CarrierRoute } from '@/lib/matching';
import type { PublicRequest } from '@/lib/requests';

/**
 * A dashboard that shows a Timișoara carrier a Constanța–Sofia request
 * teaches them to ignore the section. The rule is weak on purpose — country
 * and date, nothing more — and these pin both what it catches and what it
 * honestly does not.
 */

function request(over: Partial<PublicRequest> = {}): PublicRequest {
  return {
    id: 'r1',
    category: 'autoturism',
    make: 'Opel',
    model: 'Combo',
    year: 2019,
    is_running: true,
    service_type: 'pe_sens',
    from_city: 'München',
    from_country: 'DE',
    to_city: 'Cluj-Napoca',
    to_country: 'RO',
    estimated_km: 1100,
    published_at: '2026-09-17T09:00:00Z',
    board: 'retur',
    loading_from: '2026-09-25',
    loading_to: null,
    weight_kg: 1400,
    needs_winch: false,
    photo_count: 0,
    is_domestic: false,
    ...over,
  };
}

function route(over: Partial<CarrierRoute> = {}): CarrierRoute {
  return {
    fromCountry: 'DE',
    toCountry: 'RO',
    availableFrom: '2026-09-20',
    availableTo: '2026-09-24',
    ...over,
  };
}

describe('what counts as a match', () => {
  it('the same two countries, in the same direction', () => {
    expect(matches(request(), route())).toBe(true);
  });

  it('not the other direction: a return leg is a different route', () => {
    expect(matches(request(), route({ fromCountry: 'RO', toCountry: 'DE' }))).toBe(false);
  });

  it('not a different origin', () => {
    expect(matches(request(), route({ fromCountry: 'IT' }))).toBe(false);
  });

  it('compares country codes as codes, whatever their case', () => {
    expect(matches(request({ from_country: 'de' }), route())).toBe(true);
  });

  it('keeps a request published before an open-ended route', () => {
    expect(matches(request(), route({ availableTo: null }))).toBe(true);
  });

  it('drops a request published after the route has closed', () => {
    expect(matches(request({ published_at: '2026-10-01T09:00:00Z' }), route())).toBe(false);
  });

  it('drops a request with a timestamp it cannot read', () => {
    expect(matches(request({ published_at: 'nu e o dată' }), route())).toBe(false);
  });
});

describe('what the dashboard shows', () => {
  it('nothing at all when the carrier has published no routes', () => {
    expect(matchingRequests([request()], [])).toEqual([]);
  });

  it('a request matching any one of the routes', () => {
    const italian = request({ from_country: 'IT', to_country: 'RO' });
    const found = matchingRequests([italian], [route(), route({ fromCountry: 'IT' })]);
    expect(found).toHaveLength(1);
  });

  it('caps the list, because a dashboard is not a board', () => {
    const many = Array.from({ length: 12 }, (_, i) => request({ id: `r${i}` }));
    expect(matchingRequests(many, [route()])).toHaveLength(MATCH_LIMIT);
  });

  it('returns each request once even when several routes match it', () => {
    const found = matchingRequests([request()], [route(), route({ availableTo: null })]);
    expect(found).toHaveLength(1);
  });
});
