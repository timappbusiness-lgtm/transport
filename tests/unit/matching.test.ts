import { describe, expect, it } from 'vitest';
import {
  MATCH_LIMIT,
  carries,
  matchReasons,
  matches,
  matchingRequests,
  type CarrierProfile,
  type CarrierRoute,
} from '@/lib/matching';
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
