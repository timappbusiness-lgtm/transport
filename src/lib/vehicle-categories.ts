import type { CargoCategory } from './departures';
import type { VehicleClass } from './pricing';

/**
 * What this exchange carries, in one list.
 *
 * The niche is a vehicle that goes up on a car transporter. Boats,
 * containers, agricultural and construction machinery, lorries, coaches,
 * tractor units and semi-trailers are not here and are not coming: they
 * need different equipment and different authorisations, and a board that
 * offers what its carriers cannot take loses the carriers before it wins
 * the clients.
 *
 * Several of those are still in the `cargo_category` enum, because
 * Postgres cannot drop an enum value and because rows published under
 * them are real rows that must stay readable. `RETIRED_CATEGORIES` is
 * that list. The difference between the two is the difference between
 * what the database can hold and what the application offers, and it is
 * deliberate: this file is the offer.
 *
 * Everything about a category lives on one row — the label, the weight
 * hint, the price class it starts from, whether it needs a description,
 * whether it suggests closed transport. A second list somewhere else is
 * how a category comes to exist on the form and not in the filter, so
 * there is no second list; `tests/unit/vehicle-categories.test.ts` fails
 * if one appears.
 */

export interface VehicleCategory {
  code: CargoCategory;
  label: string;
  /**
   * Typical kerb weight in kilograms, used as the weight field's
   * placeholder. A hint, never a default: nothing is written into the
   * form, because a number somebody did not type is a number they will
   * not check.
   */
  weightHintKg: number;
  /** The same figure as a sentence, for the text under the field. */
  weightHint: string;
  /**
   * Where the price estimate starts when the team publishes the table.
   * `price_rates` is keyed by `vehicle_class`, a vocabulary of its own
   * that already separates a saloon from an SUV; this is the bridge.
   */
  priceClass: VehicleClass;
  /**
   * Asks for a short description, and is never matched automatically.
   * Nobody can say what equipment an unknown thing needs.
   */
  needsDescription?: true;
  /**
   * Suggests closed transport on the form, and ranks carriers with a
   * closed platform first. A suggestion, not a rule: somebody who wants
   * their classic on an open transporter may still ask for one.
   */
  suggestsClosed?: true;
}

/**
 * SUV is not a category of its own, and that is a decision rather than an
 * omission.
 *
 * It would be one if it changed something the system does. It does not,
 * twice over. The thing that actually differs — weight — is already a
 * field on the form, asked in kilograms, filtered on both boards and far
 * more precise than a word: a 1.500 kg crossover and a 2.600 kg full-size
 * SUV are one category and two different jobs. And the price side already
 * separates them, in `price_rates.vehicle_class`, which has had `suv`
 * beside `sedan` since the rates table was written; `resolvePriceClass`
 * below reads the weight and picks between them.
 *
 * What splitting would cost is worse than what it would buy: a carrier
 * who ticks Autoturism and not SUV disappears from half the market
 * without ever being told, and the most common capability mistake is
 * under-ticking. One category cannot be half-ticked.
 */
export const VEHICLE_CATEGORIES: readonly VehicleCategory[] = [
  {
    code: 'autoturism',
    label: 'Autoturism / SUV',
    weightHintKg: 1500,
    weightHint: 'De obicei între 1.100 și 2.300 kg.',
    priceClass: 'sedan',
  },
  {
    code: 'autoutilitara',
    label: 'Autoutilitară',
    weightHintKg: 2000,
    weightHint: 'De obicei între 1.800 și 3.500 kg.',
    priceClass: 'autoutilitara',
  },
  {
    code: 'microbuz',
    label: 'Microbuz',
    weightHintKg: 2600,
    weightHint: 'De obicei între 2.200 și 3.500 kg.',
    priceClass: 'autoutilitara',
  },
  {
    code: 'motocicleta',
    label: 'Motocicletă',
    weightHintKg: 200,
    weightHint: 'De obicei între 120 și 350 kg.',
    priceClass: 'motocicleta',
  },
  {
    code: 'atv_quad',
    label: 'ATV sau quad',
    weightHintKg: 350,
    weightHint: 'De obicei între 250 și 450 kg.',
    priceClass: 'motocicleta',
  },
  {
    code: 'rulota',
    label: 'Rulotă',
    weightHintKg: 1200,
    weightHint: 'De obicei între 700 și 1.800 kg.',
    priceClass: 'autoutilitara',
  },
  {
    code: 'remorca',
    label: 'Remorcă ușoară (până la 750 kg)',
    weightHintKg: 500,
    weightHint: 'Până la 750 kg — peste, este altă categorie de transport.',
    priceClass: 'hatchback',
  },
  {
    code: 'cvadriciclu',
    label: 'Cvadriciclu sau vehicul electric mic',
    weightHintKg: 450,
    weightHint: 'De obicei între 350 și 600 kg.',
    priceClass: 'motocicleta',
  },
  {
    code: 'istoric',
    label: 'Vehicul istoric sau de colecție',
    weightHintKg: 1200,
    weightHint: 'De obicei între 900 și 1.800 kg.',
    priceClass: 'sedan',
    suggestsClosed: true,
  },
  {
    code: 'altele',
    label: 'Altceva',
    weightHintKg: 1000,
    weightHint: 'Scrie greutatea în descriere dacă o știi.',
    priceClass: 'sedan',
    needsDescription: true,
  },
];

/** The offered list, in the order the form and the filters show it. */
export const OFFERED_CATEGORIES: readonly CargoCategory[] = VEHICLE_CATEGORIES.map(
  (category) => category.code,
);

/**
 * In the enum, readable on old rows, never offered again.
 *
 * Out of the niche — each needs equipment or authorisations a car
 * transporter does not carry. A listing published under one of these
 * still renders with its label; nothing new can be created on one.
 */
export const RETIRED_CATEGORIES: readonly CargoCategory[] = [
  'utilaj_agricol',
  'utilaj_constructii',
  'cap_tractor',
  'camion',
  'utilaj_manipulare',
  'container',
  'ambarcatiune',
];

const BY_CODE = new Map(VEHICLE_CATEGORIES.map((category) => [category.code, category]));

export function categoryMeta(code: CargoCategory): VehicleCategory | null {
  return BY_CODE.get(code) ?? null;
}

export function isOffered(code: CargoCategory): boolean {
  return BY_CODE.has(code);
}

/** „Altceva" — needs a description, and is never matched automatically. */
export function needsDescription(code: CargoCategory): boolean {
  return categoryMeta(code)?.needsDescription === true;
}

/** A historic vehicle: closed transport is suggested, never imposed. */
export function suggestsClosedTransport(code: CargoCategory): boolean {
  return categoryMeta(code)?.suggestsClosed === true;
}

/**
 * Nothing is matched automatically for a category nobody can describe.
 *
 * Matching decides equipment from the category — a winch for something
 * that does not roll, a closed trailer for something fragile — and for
 * „Altceva" there is nothing to decide from. The request still appears on
 * the board, labelled, where a carrier can read the description and
 * answer; what it does not do is fan out to people whose profile says
 * they carry it, because no profile says that.
 */
export function matchesAutomatically(code: CargoCategory): boolean {
  return isOffered(code) && !needsDescription(code);
}

/** The weight placeholder for a category, in kilograms. */
export function weightHintKg(code: CargoCategory): number | null {
  return categoryMeta(code)?.weightHintKg ?? null;
}

/**
 * Which price class an estimate starts from.
 *
 * For a car the weight decides, which is the whole of the SUV argument
 * made concrete: under 1.300 kg is a hatchback, up to 1.900 a saloon,
 * above that an SUV. The boundaries are the ones `price_rates` was
 * written against. Without a weight the category's own default stands.
 */
export function resolvePriceClass(
  code: CargoCategory,
  weightKg: number | null,
): VehicleClass {
  const meta = categoryMeta(code);
  const fallback = meta?.priceClass ?? 'sedan';
  if (code !== 'autoturism' || weightKg === null || weightKg <= 0) return fallback;

  if (weightKg < 1300) return 'hatchback';
  if (weightKg <= 1900) return 'sedan';
  return 'suv';
}

/**
 * The equipment a closed-transport request should prefer.
 *
 * Two codes, not one, because the vocabulary has both: `remorca_inchisa`
 * is a piece of equipment a firm owns, `transport_inchis` is a service it
 * says it offers. A firm that has ticked either is ahead of one that has
 * ticked neither.
 */
export const CLOSED_TRANSPORT_EQUIPMENT = 'remorca_inchisa';
export const CLOSED_TRANSPORT_SERVICE = 'transport_inchis';
