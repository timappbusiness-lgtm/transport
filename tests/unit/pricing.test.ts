import { describe, expect, it } from 'vitest';
import {
  LOCAL_ZONE_KM,
  VEHICLE_CLASS_LABELS,
  VEHICLE_CLASS_ORDER,
  ZONE_LABELS,
  estimate,
  formatAmount,
  formatMinimums,
  formatRange,
  formatRatePerKm,
  formatValidMonth,
  roundToTen,
  straightLineKm,
  withExpress,
  withExpressRate,
  zoneFor,
  type Point,
  type PriceRate,
  type PriceSettings,
} from '@/lib/pricing';

/**
 * The estimate is the number a person decides on, so every step of it is
 * pinned: which rate applies, the road factor, the floor, the surcharges,
 * and the rounding that keeps it a range rather than a quote.
 */

const SEDAN: PriceRate = {
  vehicle_class: 'sedan',
  weight_label: 'aprox. 1.500 kg',
  local_ron_per_km: 5.4,
  national_ron_per_km: 3.4,
  international_eur_per_km: 0.55,
  minimum_ron: 380,
  minimum_eur: 175,
};

const SETTINGS: PriceSettings = {
  not_running_surcharge_pct: 30,
  express_surcharge_pct: 40,
  road_distance_factor: 1.25,
  range_spread_pct: 15,
  valid_month: '2026-03-01',
  is_published: true,
};

const MUNICH: Point = { country: 'DE', lat: 48.1351, lng: 11.582 };
const CLUJ: Point = { country: 'RO', lat: 46.7712, lng: 23.6236 };
const BUCHAREST: Point = { country: 'RO', lat: 44.4268, lng: 26.1025 };
// ~32 km apart, same country.
const PLOIESTI: Point = { country: 'RO', lat: 44.9367, lng: 26.0225 };
const CAMPINA: Point = { country: 'RO', lat: 45.1272, lng: 25.7361 };

describe('distance', () => {
  it('measures a known route within a few percent', () => {
    // München → Cluj-Napoca is about 900 km straight line.
    const km = straightLineKm(MUNICH, CLUJ);
    expect(km).toBeGreaterThan(850);
    expect(km).toBeLessThan(950);
  });

  it('is zero for a point to itself, not NaN', () => {
    // acos of a value a hair above 1 is NaN without the clamp.
    expect(straightLineKm(CLUJ, CLUJ)).toBe(0);
  });

  it('is symmetric', () => {
    expect(straightLineKm(MUNICH, CLUJ)).toBe(straightLineKm(CLUJ, MUNICH));
  });
});

describe('which rate applies', () => {
  it('is local under 50 km in the same country', () => {
    expect(zoneFor(PLOIESTI, CAMPINA, 40)).toBe('local');
  });

  it('is national at exactly 50 km', () => {
    expect(zoneFor(BUCHAREST, CLUJ, LOCAL_ZONE_KM)).toBe('national');
  });

  it('is national above 50 km in the same country', () => {
    expect(zoneFor(BUCHAREST, CLUJ, 400)).toBe('national');
  });

  it('is international across a border however short the trip', () => {
    const arad: Point = { country: 'RO', lat: 46.1866, lng: 21.3123 };
    const szeged: Point = { country: 'HU', lat: 46.253, lng: 20.1414 };
    // 50 km and still a border crossing.
    expect(zoneFor(arad, szeged, 50)).toBe('international');
    expect(zoneFor(arad, szeged, 5)).toBe('international');
  });
});

describe('the estimate', () => {
  it('bills road kilometres, not straight-line ones', () => {
    const result = estimate(
      { from: BUCHAREST, to: CLUJ, vehicleClass: 'sedan', isRunning: true, express: false },
      SEDAN,
      SETTINGS,
    );
    expect(result.roadKm).toBe(Math.round(result.straightKm * 1.25));
    expect(result.roadKm).toBeGreaterThan(result.straightKm);
  });

  it('uses EUR across a border and RON inside one', () => {
    const abroad = estimate(
      { from: MUNICH, to: CLUJ, vehicleClass: 'sedan', isRunning: true, express: false },
      SEDAN,
      SETTINGS,
    );
    expect(abroad.zone).toBe('international');
    expect(abroad.currency).toBe('EUR');

    const home = estimate(
      { from: BUCHAREST, to: CLUJ, vehicleClass: 'sedan', isRunning: true, express: false },
      SEDAN,
      SETTINGS,
    );
    expect(home.currency).toBe('RON');
  });

  it('applies the class minimum on a short trip', () => {
    const result = estimate(
      { from: PLOIESTI, to: CAMPINA, vehicleClass: 'sedan', isRunning: true, express: false },
      SEDAN,
      SETTINGS,
    );
    expect(result.zone).toBe('local');
    expect(result.minimumApplied).toBe(true);
    expect(result.base).toBe(SEDAN.minimum_ron);
  });

  it('does not apply the minimum when the distance already beats it', () => {
    const result = estimate(
      { from: BUCHAREST, to: CLUJ, vehicleClass: 'sedan', isRunning: true, express: false },
      SEDAN,
      SETTINGS,
    );
    expect(result.minimumApplied).toBe(false);
    expect(result.base).toBeGreaterThan(SEDAN.minimum_ron);
  });

  it('adds the not-running surcharge', () => {
    const rolling = estimate(
      { from: BUCHAREST, to: CLUJ, vehicleClass: 'sedan', isRunning: true, express: false },
      SEDAN,
      SETTINGS,
    );
    const stuck = estimate(
      { from: BUCHAREST, to: CLUJ, vehicleClass: 'sedan', isRunning: false, express: false },
      SEDAN,
      SETTINGS,
    );
    expect(stuck.base).toBeCloseTo(rolling.base * 1.3, 5);
  });

  it('adds the express surcharge', () => {
    const standard = estimate(
      { from: BUCHAREST, to: CLUJ, vehicleClass: 'sedan', isRunning: true, express: false },
      SEDAN,
      SETTINGS,
    );
    const express = estimate(
      { from: BUCHAREST, to: CLUJ, vehicleClass: 'sedan', isRunning: true, express: true },
      SEDAN,
      SETTINGS,
    );
    expect(express.base).toBeCloseTo(standard.base * 1.4, 5);
  });

  it('compounds both surcharges', () => {
    const plain = estimate(
      { from: BUCHAREST, to: CLUJ, vehicleClass: 'sedan', isRunning: true, express: false },
      SEDAN,
      SETTINGS,
    );
    const both = estimate(
      { from: BUCHAREST, to: CLUJ, vehicleClass: 'sedan', isRunning: false, express: true },
      SEDAN,
      SETTINGS,
    );
    expect(both.base).toBeCloseTo(plain.base * 1.3 * 1.4, 5);
  });

  it('surcharges apply on top of the minimum, not instead of it', () => {
    const result = estimate(
      { from: PLOIESTI, to: CAMPINA, vehicleClass: 'sedan', isRunning: false, express: false },
      SEDAN,
      SETTINGS,
    );
    expect(result.minimumApplied).toBe(true);
    expect(result.base).toBeCloseTo(SEDAN.minimum_ron * 1.3, 5);
  });

  it('always returns a range, never a single number', () => {
    const result = estimate(
      { from: MUNICH, to: CLUJ, vehicleClass: 'sedan', isRunning: true, express: false },
      SEDAN,
      SETTINGS,
    );
    expect(result.high).toBeGreaterThan(result.low);
    expect(result.low).toBeLessThan(result.base);
    expect(result.high).toBeGreaterThan(result.base);
  });

  it('rounds the range to the nearest ten', () => {
    const result = estimate(
      { from: MUNICH, to: CLUJ, vehicleClass: 'sedan', isRunning: true, express: false },
      SEDAN,
      SETTINGS,
    );
    expect(result.low % 10).toBe(0);
    expect(result.high % 10).toBe(0);
  });

  it('honours a spread of zero without inverting the range', () => {
    const result = estimate(
      { from: MUNICH, to: CLUJ, vehicleClass: 'sedan', isRunning: true, express: false },
      SEDAN,
      { ...SETTINGS, range_spread_pct: 0 },
    );
    expect(result.low).toBe(result.high);
  });
});

describe('rounding', () => {
  it('goes to the nearest ten, halves upward', () => {
    expect(roundToTen(524)).toBe(520);
    expect(roundToTen(525)).toBe(530);
    expect(roundToTen(0)).toBe(0);
  });

  it('is not fooled by a float that lands a hair under a half', () => {
    // 175 * 1.4 is 244.99999999999997 in binary floating point. Rounded
    // naively that is 240, a whole step below what anyone doing the sum on
    // paper gets.
    expect(roundToTen(175 * 1.4)).toBe(250);
  });
});

describe('Romanian formatting', () => {
  it('writes a rate with a comma, the way a Romanian price list does', () => {
    expect(formatRatePerKm(5.1, 'RON')).toBe('5,1 lei/km');
    expect(formatRatePerKm(0.57, 'EUR')).toBe('0,57 €/km');
  });

  it('writes whole amounts without decimals', () => {
    expect(formatAmount(520, 'RON')).toBe('520 lei');
    expect(formatAmount(160, 'EUR')).toBe('160 €');
  });

  it('writes a range with the unit only once', () => {
    const result = estimate(
      { from: MUNICH, to: CLUJ, vehicleClass: 'sedan', isRunning: true, express: false },
      SEDAN,
      SETTINGS,
    );
    expect(formatRange(result)).toMatch(/^[\d.]+–[\d.]+ €$/);
  });

  it('writes the month in Romanian', () => {
    expect(formatValidMonth('2026-03-01')).toBe('martie 2026');
    expect(formatValidMonth(null)).toBeNull();
    expect(formatValidMonth('not a date')).toBeNull();
  });

  it('shows both minimums on a row', () => {
    expect(formatMinimums(SEDAN)).toBe('Minimum 380 lei / 175 €');
  });
});

describe('the Standard / Expres toggle', () => {
  it('leaves the rate alone on Standard', () => {
    expect(withExpress(3.4, SETTINGS, false)).toBe(3.4);
  });

  it('raises it by the express surcharge on Expres', () => {
    expect(withExpress(3.4, SETTINGS, true)).toBeCloseTo(4.76, 5);
  });
});

describe('labels cover every value', () => {
  it('names every vehicle class exactly once', () => {
    expect([...VEHICLE_CLASS_ORDER].sort()).toEqual(Object.keys(VEHICLE_CLASS_LABELS).sort());
    expect(new Set(VEHICLE_CLASS_ORDER).size).toBe(VEHICLE_CLASS_ORDER.length);
  });

  it('names all three zones', () => {
    expect(Object.keys(ZONE_LABELS).sort()).toEqual(['international', 'local', 'national']);
  });
});

describe('a whole row on Expres', () => {
  it('is the row itself on Standard', () => {
    expect(withExpressRate(SEDAN, SETTINGS, false)).toBe(SEDAN);
  });

  it('raises every rate by the express surcharge', () => {
    const row = withExpressRate(SEDAN, SETTINGS, true);
    expect(row.local_ron_per_km).toBeCloseTo(SEDAN.local_ron_per_km * 1.4, 5);
    expect(row.national_ron_per_km).toBeCloseTo(SEDAN.national_ron_per_km * 1.4, 5);
    expect(row.international_eur_per_km).toBeCloseTo(SEDAN.international_eur_per_km * 1.4, 5);
  });

  it('raises the minimums too, so the table agrees with the calculator', () => {
    const row = withExpressRate(SEDAN, SETTINGS, true);
    // 380 * 1.4 = 532 -> 530; 175 * 1.4 = 245 -> 250.
    expect(row.minimum_ron).toBe(530);
    expect(row.minimum_eur).toBe(250);
  });

  it('keeps the class and the weight hint', () => {
    const row = withExpressRate(SEDAN, SETTINGS, true);
    expect(row.vehicle_class).toBe('sedan');
    expect(row.weight_label).toBe(SEDAN.weight_label);
  });
});

/**
 * The example the page is demonstrated with, worked end to end.
 *
 * It uses the seeded SUV figures, so if anybody changes the migration's
 * placeholders this test says so rather than the number quietly moving on a
 * screenshot nobody re-reads.
 */
describe('München to Cluj-Napoca, SUV, does not start, Expres', () => {
  const SUV: PriceRate = {
    vehicle_class: 'suv',
    weight_label: 'aprox. 2.000 kg',
    local_ron_per_km: 6.2,
    national_ron_per_km: 3.9,
    international_eur_per_km: 0.63,
    minimum_ron: 430,
    minimum_eur: 200,
  };

  const result = estimate(
    { from: MUNICH, to: CLUJ, vehicleClass: 'suv', isRunning: false, express: true },
    SUV,
    SETTINGS,
  );

  it('crosses a border, so it is priced in euro', () => {
    expect(result.zone).toBe('international');
    expect(result.currency).toBe('EUR');
  });

  it('bills 1.146 road kilometres for 917 in a straight line', () => {
    expect(result.straightKm).toBe(917);
    expect(result.roadKm).toBe(1146);
  });

  it('is well past the minimum, so both surcharges compound on the distance', () => {
    expect(result.minimumApplied).toBe(false);
    expect(result.base).toBeCloseTo(1146 * 0.63 * 1.3 * 1.4, 3);
  });

  it('shows 1.120–1.510 €', () => {
    expect(result.low).toBe(1120);
    expect(result.high).toBe(1510);
    expect(formatRange(result)).toBe('1.120–1.510 €');
  });
});
