import { describe, expect, it } from 'vitest';
import {
  AUDIENCE_LABELS,
  BILLING_MONTHS,
  audienceParam,
  cardFeatures,
  comparisonRows,
  featureStatus,
  formatLei,
  freeMonths,
  freeMonthsLabel,
  highlightedPlan,
  limitLabel,
  parseAudience,
  parseMonths,
  plansFor,
  priceAt,
  savingLabel,
  toFeatures,
  toPlan,
  totalLabel,
  type Plan,
} from '@/lib/plans';

/**
 * A discount is the one number on a pricing page nobody can check by eye,
 * which is why the reference site can print "-49%" beside a price that
 * saves nothing. Ours is arithmetic on two figures the database holds, so
 * these tests are the arithmetic — and, as much as anything, the cases
 * where the page must say a plain number instead of a round claim.
 */

function plan(over: Partial<Plan> = {}): Plan {
  return {
    code: 'carrier',
    name: 'Transportator',
    description: 'Pentru firmele de transport.',
    audience: 'carrier',
    monthlyPrice: 149,
    highlight: true,
    features: [
      { key: 'board', label: 'Acces la cereri', status: 'included' },
      { key: 'promoted', label: 'Anunțuri promovate', status: 'coming_soon' },
      { key: 'seats', label: 'Dispeceri nelimitați', status: 'not_included' },
    ],
    periods: [
      { months: 1, total: 149 },
      { months: 6, total: 804 },
      { months: 12, total: 1490 },
    ],
    limits: {
      contactsPerMonth: null,
      activeTruckListings: null,
      activeCargoListings: 10,
      savedSearches: 10,
    },
    ...over,
  };
}

describe('what a period costs', () => {
  it('shows the monthly equivalent and the total', () => {
    const price = priceAt(plan(), 12);
    expect(price?.perMonth).toBe(124);
    expect(price?.total).toBe(1490);
    expect(totalLabel(price!)).toBe('1.490 lei la 12 luni');
  });

  it('reads the monthly rate as a monthly rate, not a total', () => {
    const price = priceAt(plan(), 1);
    expect(price?.perMonth).toBe(149);
    expect(price?.saving).toBe(0);
    expect(totalLabel(price!)).toBe('149 lei pe lună');
  });

  it('computes the saving rather than storing one', () => {
    // 149 × 12 = 1.788, and the twelve-month total is 1.490.
    expect(priceAt(plan(), 12)?.saving).toBe(298);
    expect(priceAt(plan(), 6)?.saving).toBe(90);
  });

  it('survives the float artefact that a saving in lei would expose', () => {
    // 149 * 12 - 1490 lands on 298.00000000000006 in binary floating point.
    expect(Number.isInteger(priceAt(plan(), 12)?.saving)).toBe(true);
  });

  it('says nothing about a period the plan does not sell', () => {
    expect(priceAt(plan({ periods: [{ months: 1, total: 149 }] }), 12)).toBeNull();
  });

  it('never reports a negative saving as a saving', () => {
    const dearer = plan({ periods: [{ months: 6, total: 1000 }] });
    expect(priceAt(dearer, 6)?.saving).toBe(0);
  });
});

describe('"2 luni gratuite", but only when it is true', () => {
  it('claims it when the total is exactly ten monthly payments', () => {
    expect(freeMonths(149, 1490, 12)).toBe(2);
    expect(freeMonths(449, 4490, 12)).toBe(2);
    expect(freeMonths(249, 2490, 12)).toBe(2);
  });

  it('claims nothing when the arithmetic does not divide cleanly', () => {
    // 804 / 149 is 5.395…, so there is a saving but not a free month.
    expect(freeMonths(149, 804, 6)).toBeNull();
    expect(priceAt(plan(), 6)?.saving).toBeGreaterThan(0);
  });

  it('claims nothing at the monthly rate, where there is nothing to claim', () => {
    expect(freeMonths(149, 149, 1)).toBeNull();
  });

  it('claims nothing for a free plan', () => {
    expect(freeMonths(0, 0, 12)).toBeNull();
  });

  it('writes the Romanian plural', () => {
    expect(freeMonthsLabel(1)).toBe('o lună gratuită');
    expect(freeMonthsLabel(2)).toBe('2 luni gratuite');
  });
});

describe('the figures as a visitor reads them', () => {
  it('groups thousands the Romanian way', () => {
    expect(formatLei(1490)).toBe('1.490 lei');
    expect(formatLei(149)).toBe('149 lei');
  });

  it('states the saving in lei, never as a percentage', () => {
    const label = savingLabel(298);
    expect(label).toBe('Economisești 298 lei față de plata lunară.');
    expect(label).not.toMatch(/%/);
  });

  it('says "nelimitat" where a limit would go', () => {
    expect(limitLabel(null, 'contacte')).toBe('Nelimitat');
    expect(limitLabel(3, 'contacte')).toBe('3 contacte');
  });
});

describe('the controls in the URL', () => {
  it('reads the audience, and falls back rather than erroring', () => {
    expect(parseAudience('transportatori')).toBe('carrier');
    expect(parseAudience('expeditii')).toBe('forwarder');
    expect(parseAudience('altceva')).toBe('carrier');
    expect(parseAudience(undefined)).toBe('carrier');
  });

  it('reads the period, and falls back to monthly', () => {
    expect(parseMonths('12')).toBe(12);
    expect(parseMonths('6')).toBe(6);
    expect(parseMonths('3')).toBe(1);
    expect(parseMonths(undefined)).toBe(1);
  });

  it('round-trips the audience', () => {
    for (const audience of ['carrier', 'forwarder'] as const) {
      expect(parseAudience(audienceParam(audience))).toBe(audience);
      expect(AUDIENCE_LABELS[audience].length).toBeGreaterThan(0);
    }
  });

  it('offers exactly the three periods the control has positions for', () => {
    expect([...BILLING_MONTHS]).toEqual([1, 6, 12]);
  });
});

describe('what a card lists and what the table lists', () => {
  it('keeps the absent ones off the card', () => {
    expect(cardFeatures(plan()).map((f) => f.key)).toEqual(['board', 'promoted']);
  });

  it('gives the table one row per feature, across every plan', () => {
    const other = plan({
      code: 'business',
      features: [
        { key: 'board', label: 'Acces la cereri', status: 'included' },
        { key: 'support', label: 'Suport prioritar', status: 'coming_soon' },
      ],
    });
    expect(comparisonRows([plan(), other]).map((f) => f.key)).toEqual([
      'board',
      'promoted',
      'seats',
      'support',
    ]);
  });

  it('treats a feature a plan never mentions as not included', () => {
    expect(featureStatus(plan(), 'support')).toBe('not_included');
    expect(featureStatus(plan(), 'promoted')).toBe('coming_soon');
  });
});

describe('which plan the page recommends', () => {
  it('is the one marked, not the dearest', () => {
    const cheap = plan({ code: 'free', monthlyPrice: 0, highlight: true });
    const dear = plan({ code: 'business', monthlyPrice: 449, highlight: false });
    expect(highlightedPlan([cheap, dear], 'carrier')?.code).toBe('free');
  });

  it('falls back to the dearest when nothing is marked', () => {
    const cheap = plan({ code: 'free', monthlyPrice: 0, highlight: false });
    const dear = plan({ code: 'business', monthlyPrice: 449, highlight: false });
    expect(highlightedPlan([cheap, dear], 'carrier')?.code).toBe('business');
  });

  it('never crosses the audience', () => {
    const forwarder = plan({ code: 'forwarder', audience: 'forwarder', highlight: true });
    expect(highlightedPlan([forwarder], 'carrier')).toBeNull();
    expect(plansFor([plan(), forwarder], 'forwarder').map((p) => p.code)).toEqual(['forwarder']);
  });
});

describe('rows that cannot be rendered are dropped, not patched', () => {
  it('keeps only the feature entries it can draw', () => {
    expect(
      toFeatures([
        { key: 'a', label: 'A', status: 'included' },
        { key: 'b', label: 'B', status: 'maybe' },
        { key: 'c', status: 'included' },
        'nope',
        null,
      ]),
    ).toEqual([{ key: 'a', label: 'A', status: 'included' }]);
  });

  it('treats a column that is not an array as no features', () => {
    expect(toFeatures(null)).toEqual([]);
    expect(toFeatures({ key: 'a' })).toEqual([]);
  });

  it('coerces the numbers PostgREST may hand back as strings', () => {
    const mapped = toPlan(
      {
        code: 'carrier',
        name: 'Transportator',
        short_description: null,
        audience: 'carrier',
        price_ron_month: '149.00',
        highlight: true,
        features: [],
        max_contact_reveals_month: null,
        max_active_truck_listings: null,
        max_active_cargo_listings: 10,
        max_saved_searches: 10,
      } as never,
      [
        { plan_code: 'carrier', months: 12, total_price_ron: '1490.00' },
        { plan_code: 'carrier', months: 1, total_price_ron: '149.00' },
        { plan_code: 'business', months: 1, total_price_ron: '449.00' },
      ] as never,
    );
    expect(mapped.monthlyPrice).toBe(149);
    // Its own periods only, cheapest period first.
    expect(mapped.periods).toEqual([
      { months: 1, total: 149 },
      { months: 12, total: 1490 },
    ]);
  });
});
