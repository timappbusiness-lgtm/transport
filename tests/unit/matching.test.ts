import { describe, expect, it } from 'vitest';
import {
  MATCH_LIMIT,
  bestRouteDetour,
  carries,
  detourKm,
  detourOk,
  matchReasons,
  matches,
  matchingRequests,
  toleranceFor,
  type CarrierProfile,
  type CarrierRoute,
  type DetourSettings,
} from '@/lib/matching';
import type { LatLng } from '@/lib/pricing';
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
    from_county: null,
    to_county: null,
    // München and Cluj-Napoca, the two cities named above.
    from_lat: 48.1351,
    from_lng: 11.582,
    to_lat: 46.7712,
    to_lng: 23.6236,
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

/**
 * The profile half of matching, which is the half that decides who gets an
 * e-mail. Every case below has a twin in the FIRM block of
 * `supabase/tests/rls_test.sql`, where `company_matches_request` is
 * checked against the same situation — so if one of these ever needs
 * changing, the other one does too.
 */

function profile(over: Partial<CarrierProfile> = {}): CarrierProfile {
  return {
    companyType: 'transport',
    coverageScope: 'national',
    coverageCounties: [],
    coverageCountries: [],
    vehicleTypesAccepted: [],
    equipment: [],
    services: [],
    ...over,
  };
}

/** A Cluj-Napoca to Timișoara request, both counties on the row. */
function domestic(over: Partial<PublicRequest> = {}): PublicRequest {
  return request({
    from_city: 'Cluj-Napoca',
    from_country: 'RO',
    from_county: 'CJ',
    to_city: 'Timișoara',
    to_country: 'RO',
    to_county: 'TM',
    is_domestic: true,
    ...over,
  });
}

describe('what the firm said it carries', () => {
  it('sends a national carrier anything inside the country', () => {
    expect(carries(domestic(), profile())).toBe(true);
  });

  it('does not send it across a border it never mentioned', () => {
    expect(carries(request(), profile({ coverageScope: 'national' }))).toBe(false);
  });

  it('sends the same request to a firm that named the country', () => {
    expect(
      carries(request(), profile({ coverageScope: 'international', coverageCountries: ['DE'] })),
    ).toBe(true);
  });

  it('never asks anybody to tick Romania', () => {
    // Every route on this board has one end at home.
    expect(
      carries(request(), profile({ coverageScope: 'international', coverageCountries: ['DE'] })),
    ).toBe(true);
  });

  it('keeps a county carrier inside its counties', () => {
    const inside = profile({ coverageScope: 'judetean', coverageCounties: ['CJ', 'TM'] });
    expect(carries(domestic(), inside)).toBe(true);
    expect(carries(domestic({ to_county: 'IS', to_city: 'Iași' }), inside)).toBe(false);
  });

  it('declines rather than guesses when the county is not known', () => {
    // A county-only carrier is exactly the firm that must not be sent a job
    // on the other side of the country on a guess.
    const unknown = domestic({ from_county: null, from_city: 'Sat Necunoscut' });
    expect(
      carries(unknown, profile({ coverageScope: 'judetean', coverageCounties: ['CJ', 'TM'] })),
    ).toBe(false);
  });

  it('falls back on the city list for a request published before the column existed', () => {
    const old = domestic({ from_county: null, to_county: null });
    expect(
      carries(old, profile({ coverageScope: 'judetean', coverageCounties: ['CJ', 'TM'] })),
    ).toBe(true);
  });

  it('reads an empty list of categories as "all", not "none"', () => {
    // A carrier that never opened the tab must not silently stop being
    // offered work.
    expect(carries(domestic({ category: 'camion' }), profile())).toBe(true);
  });

  it('respects the categories once there are some', () => {
    const cars = profile({ vehicleTypesAccepted: ['autoturism'] });
    expect(carries(domestic({ category: 'autoturism' }), cars)).toBe(true);
    expect(carries(domestic({ category: 'camion' }), cars)).toBe(false);
  });

  it('sends a car that does not roll only to a firm with a winch', () => {
    const stuck = domestic({ needs_winch: true, is_running: false });
    expect(carries(stuck, profile())).toBe(false);
    expect(carries(stuck, profile({ equipment: ['troliu'] }))).toBe(true);
  });

  it('does not hold a forwarder to the kit it does not own', () => {
    const stuck = domestic({ needs_winch: true, is_running: false });
    expect(carries(stuck, profile({ companyType: 'expeditie' }))).toBe(true);
  });

  it('sends a recovery only to a firm that took recovery on', () => {
    const tow = domestic({ service_type: 'tractare' });
    expect(carries(tow, profile({ services: ['transport_platforma'] }))).toBe(false);
    expect(carries(tow, profile({ services: ['tractare'] }))).toBe(true);
    // Said nothing, so not ruled out.
    expect(carries(tow, profile())).toBe(true);
  });
});

describe('the chips on a matched card', () => {
  it('names the winch when the winch is why', () => {
    const stuck = domestic({ needs_winch: true, is_running: false });
    expect(matchReasons(stuck, profile({ equipment: ['troliu'] }))).toContain('troliu');
  });

  it('names the route when a published route is why', () => {
    const reasons = matchReasons(request(), profile({ coverageScope: 'international' }), [route()]);
    expect(reasons).toContain('ruta');
  });

  it('says nothing it cannot back up', () => {
    expect(matchReasons(domestic(), profile())).not.toContain('troliu');
    expect(matchReasons(domestic(), profile())).not.toContain('ruta');
  });
});

describe('the profile and the routes together', () => {
  it('matches on the profile alone when no route is published', () => {
    // A firm's standing answer about itself outlives this week's route.
    expect(matchingRequests([domestic()], [], undefined, profile())).toHaveLength(1);
  });

  it('still returns nothing when there is neither', () => {
    expect(matchingRequests([domestic()], [])).toHaveLength(0);
  });

  it('applies both when there are both', () => {
    const stuck = domestic({ needs_winch: true, is_running: false });
    expect(matchingRequests([stuck], [], undefined, profile())).toHaveLength(0);
  });
});

/**
 * The detour, which is what `max_detour_km` was always about and what
 * nothing read until 20260921100000.
 *
 * The measure is the insertion cost — how much further the truck drives
 * to pick the vehicle up and drop it off — not how near the request
 * passes. A request sitting exactly on the corridor costs nothing; one
 * that needs a hundred kilometres each way costs two hundred.
 *
 * Cities, so the numbers can be checked against a map: Timișoara
 * (45.7489, 21.2087), Arad (46.1866, 21.3123), Budapest (47.4979,
 * 19.0402), Constanța (44.1598, 28.6348), München (48.1351, 11.5820).
 */
const TIMISOARA = { lat: 45.7489, lng: 21.2087 };
const ARAD = { lat: 46.1866, lng: 21.3123 };
const BUDAPEST = { lat: 47.4979, lng: 19.0402 };
const CONSTANTA = { lat: 44.1598, lng: 28.6348 };
const MUNCHEN = { lat: 48.1351, lng: 11.582 };

function corridor(over: Partial<CarrierRoute> = {}): CarrierRoute {
  return {
    ...route(),
    fromCountry: 'RO',
    toCountry: 'HU',
    from: TIMISOARA,
    to: BUDAPEST,
    fromCity: 'Timișoara',
    toCity: 'Budapesta',
    maxDetourKm: 40,
    ...over,
  };
}

function at(pickup: LatLng, dropoff: LatLng, over: Partial<PublicRequest> = {}): PublicRequest {
  return request({
    from_lat: pickup.lat,
    from_lng: pickup.lng,
    to_lat: dropoff.lat,
    to_lng: dropoff.lng,
    ...over,
  });
}

describe('the detour a route has to take', () => {
  it('is nothing when the request is the route', () => {
    expect(detourKm(corridor(), TIMISOARA, BUDAPEST)).toBe(0);
  });

  it('is small for a pickup a little off the line', () => {
    // Arad sits roughly between Timișoara and Budapest.
    const km = detourKm(corridor(), ARAD, BUDAPEST);
    expect(km).not.toBeNull();
    expect(km!).toBeGreaterThan(0);
    expect(km!).toBeLessThan(60);
  });

  it('is large for a request on the other side of the country', () => {
    const km = detourKm(corridor(), CONSTANTA, MUNCHEN);
    expect(km!).toBeGreaterThan(500);
  });

  it('scales with the road factor, because a tolerance is in road kilometres', () => {
    const straight = detourKm(corridor(), ARAD, BUDAPEST, 1);
    const roads = detourKm(corridor(), ARAD, BUDAPEST, 2);
    expect(roads!).toBe(straight! * 2);
  });

  it('cannot tell without coordinates, and says so rather than saying zero', () => {
    expect(detourKm(corridor({ from: null }), ARAD, BUDAPEST)).toBeNull();
    expect(detourKm(corridor(), null, BUDAPEST)).toBeNull();
    expect(detourKm(corridor(), ARAD, null)).toBeNull();
  });
});

describe('the tolerance that applies', () => {
  const settings: DetourSettings = { defaultDetourKm: 50, roadFactor: 1.25 };

  it('is the carrier’s own when they set one', () => {
    expect(toleranceFor(corridor({ maxDetourKm: 120 }), settings)).toBe(120);
  });

  it('is the configured default when they never said', () => {
    expect(toleranceFor(corridor({ maxDetourKm: null }), settings)).toBe(50);
    // Zero is a row written before the column had a default, not a
    // carrier insisting on no detour at all.
    expect(toleranceFor(corridor({ maxDetourKm: 0 }), settings)).toBe(50);
  });

  it('follows the default wherever an administrator moves it', () => {
    expect(toleranceFor(corridor({ maxDetourKm: null }), { ...settings, defaultDetourKm: 200 }))
      .toBe(200);
  });
});

describe('whether the detour rules a request out', () => {
  const settings: DetourSettings = { defaultDetourKm: 50, roadFactor: 1.25 };

  it('keeps one inside the tolerance', () => {
    const near = at(ARAD, BUDAPEST);
    expect(detourOk(near, [corridor({ maxDetourKm: 100 })], settings)).toBe(true);
  });

  it('drops one outside it', () => {
    const far = at(CONSTANTA, MUNCHEN);
    expect(detourOk(far, [corridor({ maxDetourKm: 40 })], settings)).toBe(false);
  });

  it('keeps a firm that has published no route we can measure', () => {
    // Unmeasured is not unsuitable: refusing here would empty the board
    // for every carrier who has not published a route yet.
    expect(detourOk(at(CONSTANTA, MUNCHEN), [], settings)).toBe(true);
    expect(detourOk(at(CONSTANTA, MUNCHEN), [corridor({ from: null })], settings)).toBe(true);
  });

  it('keeps a request whose cities never resolved', () => {
    const noCoords = request({ from_lat: null, from_lng: null, to_lat: null, to_lng: null });
    expect(detourOk(noCoords, [corridor()], settings)).toBe(true);
  });

  it('takes the best of several routes, not the first', () => {
    const far = at(CONSTANTA, MUNCHEN);
    const routes = [corridor({ maxDetourKm: 40 }), corridor({ from: CONSTANTA, to: MUNCHEN })];
    expect(detourOk(far, routes, settings)).toBe(true);
  });

  it('falls back to the platform default when nobody set a tolerance', () => {
    const far = at(CONSTANTA, MUNCHEN);
    expect(detourOk(far, [corridor({ maxDetourKm: null })], settings)).toBe(false);
    // Loosen the default far enough and the same request passes.
    expect(detourOk(far, [corridor({ maxDetourKm: null })], { ...settings, defaultDetourKm: 5000 }))
      .toBe(true);
  });
});

describe('what the screen is told about the detour', () => {
  const settings: DetourSettings = { defaultDetourKm: 50, roadFactor: 1.25 };

  it('names the route it measured against and the tolerance it applied', () => {
    const fit = bestRouteDetour(at(ARAD, BUDAPEST), [corridor({ maxDetourKm: 90 })], settings);
    expect(fit).not.toBeNull();
    expect(fit!.fromCity).toBe('Timișoara');
    expect(fit!.toCity).toBe('Budapesta');
    expect(fit!.toleranceKm).toBe(90);
    expect(fit!.within).toBe(true);
  });

  it('says nothing at all when there was nothing to measure', () => {
    expect(bestRouteDetour(at(ARAD, BUDAPEST), [], settings)).toBeNull();
  });

  it('reports the fit even when it is a bad one, so a screen can explain', () => {
    const fit = bestRouteDetour(at(CONSTANTA, MUNCHEN), [corridor({ maxDetourKm: 40 })], settings);
    expect(fit!.within).toBe(false);
    expect(fit!.detourKm).toBeGreaterThan(40);
  });
});

describe('the detour inside matchingRequests', () => {
  const settings: DetourSettings = { defaultDetourKm: 50, roadFactor: 1.25 };

  it('drops a request the firm covers but cannot reach', () => {
    const wide = profile({ coverageScope: 'international', coverageCountries: ['HU', 'DE'] });
    const far = at(CONSTANTA, MUNCHEN, { from_country: 'RO', to_country: 'DE' });
    const routes = [corridor({ fromCountry: 'RO', toCountry: 'DE', maxDetourKm: 40 })];
    expect(matchingRequests([far], routes, undefined, wide, settings)).toHaveLength(0);
  });

  it('keeps the same request once the carrier widens the tolerance', () => {
    const wide = profile({ coverageScope: 'international', coverageCountries: ['HU', 'DE'] });
    const far = at(CONSTANTA, MUNCHEN, { from_country: 'RO', to_country: 'DE' });
    const routes = [corridor({ fromCountry: 'RO', toCountry: 'DE', maxDetourKm: 5000 })];
    expect(matchingRequests([far], routes, undefined, wide, settings)).toHaveLength(1);
  });
});
