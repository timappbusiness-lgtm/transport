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
