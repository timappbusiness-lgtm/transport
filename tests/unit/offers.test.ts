import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  COMPARE_LIMIT,
  DEFAULT_OFFER_SETTINGS,
  OFFER_STATUS_LABELS,
  OFFER_STATUS_ORDER,
  formatMoney,
  isLive,
  isUrgent,
  priceCeiling,
  indicativeRange,
  requestStateLabel,
  sortOffers,
  timeLeft,
  validateOffer,
  type OfferContext,
  type OfferDraft,
  type SortableOffer,
} from '@/lib/offers';

/**
 * The form's half of the rules. Every one of them is applied again by
 * `guard_offer_terms()` in Postgres, which is what actually decides —
 * these exist so a person finds out while they are still looking at the
 * field, and so the two halves can be compared.
 */

function draft(over: Partial<OfferDraft> = {}): OfferDraft {
  return {
    price: '2400',
    currency: 'RON',
    pickupDate: '2026-10-05',
    deliveryDate: '2026-10-07',
    vehicleId: 'v1',
    conditions: '',
    paymentTermDays: '',
    validityHours: '48',
    message: '',
    ...over,
  };
}

const CONTEXT: OfferContext = {
  loadingFrom: '2026-10-01',
  needsVehicle: true,
  settings: DEFAULT_OFFER_SETTINGS,
};

describe('what the form refuses', () => {
  it('accepts a complete, sensible offer', () => {
    expect(validateOffer(draft(), CONTEXT)).toEqual({});
  });

  it('needs a price', () => {
    expect(validateOffer(draft({ price: '' }), CONTEXT).price).toBeTruthy();
    expect(validateOffer(draft({ price: 'ceva' }), CONTEXT).price).toBeTruthy();
  });

  it('refuses an offer of nothing', () => {
    // `price_amount > 0` is a table constraint; this is the same rule
    // where somebody can still see the field they typed it in.
    expect(validateOffer(draft({ price: '0' }), CONTEXT).price).toBeTruthy();
    expect(validateOffer(draft({ price: '-5' }), CONTEXT).price).toBeTruthy();
  });

  it('accepts a comma as the decimal separator, which is what people type', () => {
    expect(validateOffer(draft({ price: '2400,50' }), CONTEXT)).toEqual({});
  });

  it('refuses a typo above the ceiling, and names the ceiling', () => {
    const error = validateOffer(draft({ price: '3200000' }), CONTEXT).price;
    expect(error).toContain('200.000 lei');
  });

  it('has a different ceiling per currency', () => {
    expect(priceCeiling('RON', DEFAULT_OFFER_SETTINGS)).toBe(200000);
    expect(priceCeiling('EUR', DEFAULT_OFFER_SETTINGS)).toBe(40000);
    expect(validateOffer(draft({ price: '50000', currency: 'EUR' }), CONTEXT).price).toBeTruthy();
    expect(validateOffer(draft({ price: '50000', currency: 'RON' }), CONTEXT).price).toBeUndefined();
  });

  it('refuses a pickup before the vehicle can be loaded', () => {
    const error = validateOffer(draft({ pickupDate: '2026-09-30' }), CONTEXT).pickupDate;
    expect(error).toContain('01.10.2026');
  });

  it('allows a pickup later than the client hoped', () => {
    // The carrier may offer to come later; whether that is acceptable is
    // the client's decision, not the form's.
    expect(validateOffer(draft({ pickupDate: '2026-11-20', deliveryDate: '2026-11-22' }), CONTEXT))
      .toEqual({});
  });

  it('refuses a delivery before the pickup', () => {
    expect(
      validateOffer(draft({ pickupDate: '2026-10-07', deliveryDate: '2026-10-05' }), CONTEXT)
        .deliveryDate,
    ).toBeTruthy();
  });

  it('allows delivery on the same day', () => {
    expect(
      validateOffer(draft({ pickupDate: '2026-10-05', deliveryDate: '2026-10-05' }), CONTEXT),
    ).toEqual({});
  });

  it('asks a firm that carries for a vehicle', () => {
    expect(validateOffer(draft({ vehicleId: '' }), CONTEXT).vehicleId).toBeTruthy();
  });

  it('does not ask a forwarder for one', () => {
    expect(
      validateOffer(draft({ vehicleId: '' }), { ...CONTEXT, needsVehicle: false }),
    ).toEqual({});
  });

  it('caps the two free-text boxes at a thousand characters', () => {
    expect(validateOffer(draft({ conditions: 'x'.repeat(1001) }), CONTEXT).conditions).toBeTruthy();
    expect(validateOffer(draft({ message: 'x'.repeat(1001) }), CONTEXT).message).toBeTruthy();
    expect(validateOffer(draft({ conditions: 'x'.repeat(1000) }), CONTEXT)).toEqual({});
  });

  it('caps the validity at the configured number of days', () => {
    expect(validateOffer(draft({ validityHours: '360' }), CONTEXT).validityHours).toBeTruthy();
    expect(validateOffer(draft({ validityHours: '336' }), CONTEXT)).toEqual({});
  });

  it('follows the settings rather than hardcoding them', () => {
    const tight: OfferContext = {
      ...CONTEXT,
      settings: { ...DEFAULT_OFFER_SETTINGS, maxPriceRon: 5000, maxValidityDays: 2 },
    };
    expect(validateOffer(draft({ price: '9000' }), tight).price).toBeTruthy();
    expect(validateOffer(draft({ price: '2400' }), tight).price).toBeUndefined();
    expect(validateOffer(draft({ price: '2400', validityHours: '72' }), tight).validityHours)
      .toBeTruthy();
  });

  it('takes a payment term in days, or none at all', () => {
    expect(validateOffer(draft({ paymentTermDays: '30' }), CONTEXT)).toEqual({});
    expect(validateOffer(draft({ paymentTermDays: '' }), CONTEXT)).toEqual({});
    expect(validateOffer(draft({ paymentTermDays: 'o lună' }), CONTEXT).paymentTermDays)
      .toBeTruthy();
  });
});

describe('the countdown', () => {
  const now = new Date('2026-10-01T12:00:00.000Z');

  it('counts minutes under an hour', () => {
    expect(timeLeft('2026-10-01T12:40:00.000Z', now)).toBe('mai are 40 de minute');
    expect(timeLeft('2026-10-01T12:01:00.000Z', now)).toBe('mai are un minut');
  });

  it('counts hours under a day', () => {
    expect(timeLeft('2026-10-01T20:00:00.000Z', now)).toBe('mai are 8 ore');
    expect(timeLeft('2026-10-01T13:00:00.000Z', now)).toBe('mai are o oră');
  });

  it('counts days above that, with the Romanian „de"', () => {
    expect(timeLeft('2026-10-04T12:00:00.000Z', now)).toBe('mai are 3 zile');
    expect(timeLeft('2026-10-02T12:00:00.000Z', now)).toBe('mai are o zi');
    expect(timeLeft('2026-10-22T12:00:00.000Z', now)).toBe('mai are 21 de zile');
  });

  it('says „expirată" rather than running backwards', () => {
    // A countdown showing a negative number is a bug people report.
    expect(timeLeft('2026-10-01T11:00:00.000Z', now)).toBe('expirată');
    expect(timeLeft('2026-10-01T12:00:00.000Z', now)).toBe('expirată');
  });

  it('copes with no deadline and with nonsense', () => {
    expect(timeLeft(null, now)).toBe('fără termen');
    expect(timeLeft('nu e o dată', now)).toBe('fără termen');
  });

  it('marks the last few hours as urgent, and nothing else', () => {
    expect(isUrgent('2026-10-01T15:00:00.000Z', now)).toBe(true);
    expect(isUrgent('2026-10-01T20:00:00.000Z', now)).toBe(false);
    expect(isUrgent('2026-10-01T11:00:00.000Z', now)).toBe(false);
    expect(isUrgent(null, now)).toBe(false);
  });
});

describe('the order the cards come in', () => {
  const offers: SortableOffer[] = [
    { price_amount: 2900, currency: 'RON', estimated_pickup_date: '2026-10-03', estimated_delivery_date: '2026-10-04' },
    { price_amount: 2400, currency: 'RON', estimated_pickup_date: '2026-10-08', estimated_delivery_date: '2026-10-12' },
    { price_amount: 2600, currency: 'RON', estimated_pickup_date: '2026-10-05', estimated_delivery_date: '2026-10-06' },
  ];

  it('sorts by price by default, cheapest first', () => {
    expect(sortOffers(offers, 'pret').map((o) => o.price_amount)).toEqual([2400, 2600, 2900]);
  });

  it('sorts by the earliest pickup', () => {
    expect(sortOffers(offers, 'ridicare').map((o) => o.estimated_pickup_date)).toEqual([
      '2026-10-03', '2026-10-05', '2026-10-08',
    ]);
  });

  it('sorts by the earliest delivery', () => {
    expect(sortOffers(offers, 'livrare').map((o) => o.estimated_delivery_date)).toEqual([
      '2026-10-04', '2026-10-06', '2026-10-12',
    ]);
  });

  it('sorts by rating, best first', () => {
    const rated: SortableOffer[] = [
      { price_amount: 2900, currency: 'RON', estimated_pickup_date: null, estimated_delivery_date: null, company_rating_avg: 4.2, company_rating_count: 8 },
      { price_amount: 2400, currency: 'RON', estimated_pickup_date: null, estimated_delivery_date: null, company_rating_avg: 4.9, company_rating_count: 5 },
      { price_amount: 2600, currency: 'RON', estimated_pickup_date: null, estimated_delivery_date: null, company_rating_avg: 3.1, company_rating_count: 12 },
    ];
    expect(sortOffers(rated, 'evaluare').map((o) => o.company_rating_avg)).toEqual([4.9, 4.2, 3.1]);
  });

  it('a firm below the threshold goes to the bottom, not to either extreme', () => {
    // Giving an unrated firm a zero would bury it for a reason that is
    // not true, and a five would float it for one that is not true
    // either. It sits after the rated ones, among its equals by price.
    const mixed: SortableOffer[] = [
      { price_amount: 2900, currency: 'RON', estimated_pickup_date: null, estimated_delivery_date: null, company_rating_avg: null, company_rating_count: 0 },
      { price_amount: 2400, currency: 'RON', estimated_pickup_date: null, estimated_delivery_date: null, company_rating_avg: 3.0, company_rating_count: 4 },
      // Two ratings: it has an average in the table, but not one we show.
      { price_amount: 2100, currency: 'RON', estimated_pickup_date: null, estimated_delivery_date: null, company_rating_avg: 5.0, company_rating_count: 2 },
    ];
    expect(sortOffers(mixed, 'evaluare').map((o) => o.price_amount)).toEqual([2400, 2100, 2900]);
  });

  it('never invents an exchange rate to compare two currencies', () => {
    // Sorting 480 € against 2400 lei needs a rate, and a rate we made up
    // is a number we cannot defend. RON first, then EUR, each by its own
    // amount.
    const mixed: SortableOffer[] = [
      { price_amount: 480, currency: 'EUR', estimated_pickup_date: null, estimated_delivery_date: null },
      { price_amount: 2400, currency: 'RON', estimated_pickup_date: null, estimated_delivery_date: null },
      { price_amount: 420, currency: 'EUR', estimated_pickup_date: null, estimated_delivery_date: null },
    ];
    expect(sortOffers(mixed, 'pret').map((o) => `${o.price_amount} ${o.currency}`)).toEqual([
      '2400 RON', '420 EUR', '480 EUR',
    ]);
  });

  it('puts „did not say" last rather than first', () => {
    const some: SortableOffer[] = [
      { price_amount: 1, currency: 'RON', estimated_pickup_date: null, estimated_delivery_date: null },
      { price_amount: 2, currency: 'RON', estimated_pickup_date: '2026-10-05', estimated_delivery_date: null },
    ];
    expect(sortOffers(some, 'ridicare').map((o) => o.price_amount)).toEqual([2, 1]);
  });

  it('does not modify the list it was given', () => {
    const original = [...offers];
    sortOffers(offers, 'pret');
    expect(offers).toEqual(original);
  });

  it('compares at most five side by side', () => {
    expect(COMPARE_LIMIT).toBe(5);
  });
});

describe('what the status line says', () => {
  it('counts the offers waiting rather than reading a status column', () => {
    expect(requestStateLabel('active', 0)).toBe('Așteaptă oferte');
    expect(requestStateLabel('active', 1)).toBe('O ofertă primită');
    expect(requestStateLabel('active', 3)).toBe('3 oferte primite');
  });

  it('says „Transportator ales" for what accept_offer actually writes', () => {
    // 20260917180000 rewrote accept_offer to set `carrier_selected`;
    // `assigned` is the older spelling and still reads correctly, for a
    // dump restored from before that migration.
    expect(requestStateLabel('carrier_selected', 0)).toBe('Transportator ales');
    expect(requestStateLabel('assigned', 0)).toBe('Transportator ales');
  });

  it('reads a row carrying offers_received from the count, not the column', () => {
    // The value exists in the enum and nothing sets it. If one ever
    // arrives — a hand-written row, an older dump — the words still
    // come from the offers that are actually live.
    expect(requestStateLabel('offers_received', 0)).toBe('Așteaptă oferte');
    expect(requestStateLabel('offers_received', 2)).toBe('2 oferte primite');
  });

  it('has a word for every state the enum holds', () => {
    for (const status of [
      'draft', 'active', 'offers_received', 'carrier_selected', 'in_progress',
      'delivered', 'assigned', 'completed', 'cancelled', 'expired', 'suspended',
      'disputed',
    ]) {
      expect(requestStateLabel(status, 0)).toBeTruthy();
    }
  });
});

describe('the status words themselves', () => {
  it('has Romanian for every status the enum holds', () => {
    for (const status of OFFER_STATUS_ORDER) {
      expect(OFFER_STATUS_LABELS[status]).toBeTruthy();
    }
  });

  it('puts what still needs an answer first', () => {
    expect(OFFER_STATUS_ORDER[0]).toBe('pending');
  });

  it('treats only a pending offer as live', () => {
    expect(isLive('pending')).toBe(true);
    for (const status of ['accepted', 'rejected', 'withdrawn', 'expired'] as const) {
      expect(isLive(status)).toBe(false);
    }
  });
});

describe('money, written the Romanian way', () => {
  it('keeps the bani when there are any, and drops them when there are not', () => {
    // numeric(10,2): a carrier may quote 2.400,50, and rounding it on
    // the card the client accepts would show one price and create an
    // order for another.
    expect(formatMoney(2400, 'RON')).not.toMatch(/,/);
    expect(formatMoney(2400.5, 'RON')).toBe('2.400,50 lei');
    expect(formatMoney(499.99, 'EUR')).toBe('499,99 €');
    expect(formatMoney(500, 'EUR')).toBe('500 €');
  });

  it('groups thousands with a full stop', () => {
    expect(formatMoney(2400, 'RON')).toBe('2.400 lei');
    expect(formatMoney(480, 'EUR')).toBe('480 €');
  });
});

describe('the form and the database agree', () => {
  // The rules exist twice on purpose: the browser so somebody finds out
  // early, Postgres because the browser is not a boundary. These read
  // the migration and fail when the two stop matching.
  const migration = readFileSync(
    'supabase/migrations/20260922100000_faza2_oferte.sql',
    'utf8',
  );

  it('ships the same defaults the settings table does', () => {
    expect(migration).toContain(`max_price_ron numeric(10,2) not null default ${DEFAULT_OFFER_SETTINGS.maxPriceRon}`);
    expect(migration).toContain(`max_price_eur numeric(10,2) not null default ${DEFAULT_OFFER_SETTINGS.maxPriceEur}`);
    expect(migration).toContain(`default_validity_hours integer not null default ${DEFAULT_OFFER_SETTINGS.defaultValidityHours}`);
    expect(migration).toContain(`max_validity_days integer not null default ${DEFAULT_OFFER_SETTINGS.maxValidityDays}`);
  });

  it('caps the same two text fields at the same length', () => {
    expect(migration).toContain('length(message) <= 1000');
    expect(migration).toContain('length(conditions) <= 1000');
  });

  it('refuses a price of zero in the table, not only in the form', () => {
    expect(migration).toContain('check (price_amount > 0)');
  });
});

describe('the indicative range beside the price field', () => {
  const RATES = [
    rate('hatchback', 4, 3, 0.5, 400, 100),
    rate('sedan', 5, 4, 0.6, 500, 120),
    rate('suv', 6, 5, 0.7, 600, 140),
    rate('autoutilitara', 7, 6, 0.8, 700, 160),
    rate('motocicleta', 3, 2, 0.4, 300, 80),
  ];
  const SETTINGS = {
    not_running_surcharge_pct: 20,
    express_surcharge_pct: 30,
    road_distance_factor: 1.25,
    range_spread_pct: 15,
    valid_month: '2026-09-01',
    is_published: true,
  };
  // Bucharest and Cluj, near enough for a national job.
  const REQUEST = {
    category: 'autoturism',
    is_running: true,
    service_type: 'pe_sens',
    from_lat: 44.43,
    from_lng: 26.1,
    from_country: 'RO',
    to_lat: 46.77,
    to_lng: 23.59,
    to_country: 'RO',
  };

  function rate(
    vehicle_class: string,
    local: number,
    national: number,
    international: number,
    minimum_ron: number,
    minimum_eur: number,
  ) {
    return {
      vehicle_class,
      weight_label: '',
      local_ron_per_km: local,
      national_ron_per_km: national,
      international_eur_per_km: international,
      minimum_ron,
      minimum_eur,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
  }

  it('says nothing while the table is unpublished', () => {
    expect(indicativeRange(REQUEST, RATES, { ...SETTINGS, is_published: false })).toBeNull();
    expect(indicativeRange(REQUEST, RATES, null)).toBeNull();
  });

  it('says nothing for a category the price table does not price', () => {
    expect(indicativeRange({ ...REQUEST, category: 'utilaj_agricol' }, RATES, SETTINGS)).toBeNull();
    expect(indicativeRange({ ...REQUEST, category: 'camion' }, RATES, SETTINGS)).toBeNull();
  });

  it('says nothing when a city never resolved to a point', () => {
    expect(indicativeRange({ ...REQUEST, from_lat: null }, RATES, SETTINGS)).toBeNull();
    expect(indicativeRange({ ...REQUEST, to_lng: null }, RATES, SETTINGS)).toBeNull();
  });

  it('spans the three classes an „autoturism" can be, rather than picking one', () => {
    const range = indicativeRange(REQUEST, RATES, SETTINGS);
    expect(range).not.toBeNull();

    // The low is the hatchback's low and the high is the SUV's, so the
    // sentence covers the whole of what the category can mean.
    const onlyHatchback = indicativeRange(REQUEST, [RATES[0]!], SETTINGS);
    const onlySuv = indicativeRange(REQUEST, [RATES[2]!], SETTINGS);
    expect(range?.low).toBe(onlyHatchback?.low);
    expect(range?.high).toBe(onlySuv?.high);
  });

  it('prices a single-class category on its own row', () => {
    const range = indicativeRange({ ...REQUEST, category: 'motocicleta' }, RATES, SETTINGS);
    const alone = indicativeRange({ ...REQUEST, category: 'motocicleta' }, [RATES[4]!], SETTINGS);
    expect(range).toEqual(alone);
  });

  it('charges the surcharges the calculator charges', () => {
    const running = indicativeRange(REQUEST, RATES, SETTINGS);
    const stopped = indicativeRange({ ...REQUEST, is_running: false }, RATES, SETTINGS);
    const express = indicativeRange({ ...REQUEST, service_type: 'expres' }, RATES, SETTINGS);

    expect(amount(stopped?.high)).toBeGreaterThan(amount(running?.high));
    expect(amount(express?.high)).toBeGreaterThan(amount(running?.high));
  });

  it('writes lei for a domestic route and euro for a crossing', () => {
    expect(indicativeRange(REQUEST, RATES, SETTINGS)?.high).toMatch(/lei$/);
    // Munich: a different country, so the international rate and the euro.
    const abroad = indicativeRange(
      { ...REQUEST, to_lat: 48.14, to_lng: 11.58, to_country: 'DE' },
      RATES,
      SETTINGS,
    );
    expect(abroad?.high).toMatch(/€$/);
  });
});

/** „1.200 lei" back to 1200, so two ranges can be compared. */
function amount(text: string | undefined): number {
  return Number((text ?? '0').replace(/[^0-9]/g, ''));
}
