import type { Database } from '@/lib/supabase/database.types';

/**
 * Turning a route into a range.
 *
 * Deliberately free of SQL and of React: every rule here is arithmetic on
 * numbers the database supplies, which is what makes it testable without a
 * database and reusable from the page, the calculator and the request form.
 *
 * The output is always a range. A single number reads as a quote, and we
 * are not the one quoting — the carrier is.
 */

export type VehicleClass = Database['public']['Enums']['vehicle_class'];

export const VEHICLE_CLASS_ORDER: readonly VehicleClass[] = [
  'motocicleta',
  'hatchback',
  'sedan',
  'suv',
  'autoutilitara',
];

export const VEHICLE_CLASS_LABELS: Record<VehicleClass, string> = {
  motocicleta: 'Motocicletă',
  hatchback: 'Hatchback',
  sedan: 'Sedan',
  suv: 'SUV',
  autoutilitara: 'Autoutilitară',
};

/** Which of the three rates applies. */
export type Zone = 'local' | 'national' | 'international';

export const ZONE_LABELS: Record<Zone, string> = {
  local: 'Local (sub 50 km)',
  national: 'Național',
  international: 'Internațional',
};

export type Currency = 'RON' | 'EUR';

export interface PriceRate {
  vehicle_class: VehicleClass;
  weight_label: string;
  local_ron_per_km: number;
  national_ron_per_km: number;
  international_eur_per_km: number;
  minimum_ron: number;
  minimum_eur: number;
}

export interface PriceSettings {
  not_running_surcharge_pct: number;
  express_surcharge_pct: number;
  road_distance_factor: number;
  range_spread_pct: number;
  valid_month: string | null;
  is_published: boolean;
}

export interface Point {
  country: string;
  lat: number;
  lng: number;
}

export interface EstimateInput {
  from: Point;
  to: Point;
  vehicleClass: VehicleClass;
  /** "Pornește și rulează?" — false adds the not-running surcharge. */
  isRunning: boolean;
  express: boolean;
}

export interface Estimate {
  zone: Zone;
  currency: Currency;
  /** Straight-line kilometres, before the road factor. */
  straightKm: number;
  /** What the estimate is actually built on, rounded. */
  roadKm: number;
  /** Before rounding to a range; kept so the admin preview can show it. */
  base: number;
  /** True when the per-kilometre total fell below the class minimum. */
  minimumApplied: boolean;
  low: number;
  high: number;
}

/** 50 km is where a move stops being a local job. */
export const LOCAL_ZONE_KM = 50;

/**
 * Great-circle distance, the same formula the database uses in
 * `distance_km` so the two never disagree about a route.
 */
export function straightLineKm(from: Point, to: Point): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const value =
    Math.cos(toRad(from.lat)) *
      Math.cos(toRad(to.lat)) *
      Math.cos(toRad(to.lng) - toRad(from.lng)) +
    Math.sin(toRad(from.lat)) * Math.sin(toRad(to.lat));
  // Floating point can push this a hair outside [-1, 1], where acos is NaN.
  const clamped = Math.min(1, Math.max(-1, value));
  return Math.round(R * Math.acos(clamped) * 10) / 10;
}

/**
 * Which rate applies.
 *
 * Different countries is international whatever the distance — Arad to
 * Szeged is 50 km and still a border crossing, with the paperwork and the
 * currency that go with one.
 */
export function zoneFor(from: Point, to: Point, roadKm: number): Zone {
  if (from.country !== to.country) return 'international';
  return roadKm < LOCAL_ZONE_KM ? 'local' : 'national';
}

function rateFor(rate: PriceRate, zone: Zone): number {
  if (zone === 'international') return rate.international_eur_per_km;
  return zone === 'local' ? rate.local_ron_per_km : rate.national_ron_per_km;
}

function minimumFor(rate: PriceRate, zone: Zone): number {
  return zone === 'international' ? rate.minimum_eur : rate.minimum_ron;
}

/**
 * Nearest 10, which is as precise as an estimate deserves to look.
 *
 * The `toFixed` is not decoration: 175 × 1.4 lands on 244.99999999999997,
 * which rounds down a whole step and shows a minimum of 240 where the table
 * one card away says 250. Settle the float before taking the step.
 */
export function roundToTen(value: number): number {
  return Math.round(Number(value.toFixed(6)) / 10) * 10;
}

/**
 * The estimate.
 *
 * Order matters: the minimum is a floor on the distance-based price, and
 * the surcharges apply after it. A car that will not roll is more work
 * even on a job that was already at the floor.
 */
export function estimate(
  input: EstimateInput,
  rate: PriceRate,
  settings: PriceSettings,
): Estimate {
  const straightKm = straightLineKm(input.from, input.to);
  const roadKm = Math.round(straightKm * settings.road_distance_factor);
  const zone = zoneFor(input.from, input.to, roadKm);
  const currency: Currency = zone === 'international' ? 'EUR' : 'RON';

  const perKm = rateFor(rate, zone) * roadKm;
  const minimum = minimumFor(rate, zone);
  const minimumApplied = perKm < minimum;
  let base = Math.max(perKm, minimum);

  if (!input.isRunning) base *= 1 + settings.not_running_surcharge_pct / 100;
  if (input.express) base *= 1 + settings.express_surcharge_pct / 100;

  const spread = settings.range_spread_pct / 100;
  return {
    zone,
    currency,
    straightKm,
    roadKm,
    base,
    minimumApplied,
    low: roundToTen(base * (1 - spread)),
    high: roundToTen(base * (1 + spread)),
  };
}

/**
 * A per-kilometre rate as the table shows it: "5,1 lei/km", "0,57 €/km".
 *
 * Romanian uses a comma for the decimal separator, so `toFixed` alone would
 * print a number no Romanian price list would.
 */
export function formatRatePerKm(value: number, currency: Currency): string {
  const digits = currency === 'EUR' ? 2 : 1;
  const number = new Intl.NumberFormat('ro-RO', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
  return currency === 'EUR' ? `${number} €/km` : `${number} lei/km`;
}

/** A whole amount: "520 lei", "160 €". */
export function formatAmount(value: number, currency: Currency): string {
  const number = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 }).format(value);
  return currency === 'EUR' ? `${number} €` : `${number} lei`;
}

/** The range, which is the only shape an estimate is ever shown in. */
export function formatRange(estimateResult: Estimate): string {
  const { low, high, currency } = estimateResult;
  const lowNumber = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 }).format(low);
  return `${lowNumber}–${formatAmount(high, currency)}`;
}

/** "Actualizat: martie 2026". */
export function formatValidMonth(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, 1);
  return new Intl.DateTimeFormat('ro-RO', { month: 'long', year: 'numeric' }).format(date);
}

/** The minimum line under a table row: "Minimum 380 lei / 175 €". */
export function formatMinimums(rate: PriceRate): string {
  return `Minimum ${formatAmount(rate.minimum_ron, 'RON')} / ${formatAmount(rate.minimum_eur, 'EUR')}`;
}

/**
 * The express rate for the table's Standard/Expres toggle.
 *
 * The toggle changes the per-kilometre figures rather than showing a
 * separate table, so the comparison is where a person is already looking.
 */
export function withExpress(value: number, settings: PriceSettings, express: boolean): number {
  return express ? value * (1 + settings.express_surcharge_pct / 100) : value;
}

/**
 * A whole row as the Expres toggle shows it.
 *
 * The rates and the minimums move together, because the estimate raises
 * both: a floor that stayed at the Standard figure would contradict the
 * calculator two cards away. Minimums are rounded to ten so the table keeps
 * reading like a price list rather than a spreadsheet.
 */
export function withExpressRate(
  rate: PriceRate,
  settings: PriceSettings,
  express: boolean,
): PriceRate {
  if (!express) return rate;
  return {
    ...rate,
    local_ron_per_km: withExpress(rate.local_ron_per_km, settings, true),
    national_ron_per_km: withExpress(rate.national_ron_per_km, settings, true),
    international_eur_per_km: withExpress(rate.international_eur_per_km, settings, true),
    minimum_ron: roundToTen(withExpress(rate.minimum_ron, settings, true)),
    minimum_eur: roundToTen(withExpress(rate.minimum_eur, settings, true)),
  };
}
