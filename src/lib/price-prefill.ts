import { cityFromValue, cityValue, type City } from './cities';
import { CARGO_CATEGORIES, type CargoCategory } from './departures';
import { VEHICLE_CLASS_ORDER, type VehicleClass } from './pricing';

/**
 * What the calculator hands to the request form.
 *
 * The estimate and the request are two screens apart, and the thing people
 * lose in between is what they already typed. These keys carry it in the
 * URL: shareable, bookmarkable, and readable by whoever builds the form
 * next — the same choice the departures board made for its filters.
 *
 * Romanian keys, so a shared link reads like the site.
 */
export const PREFILL_KEYS = {
  from: 'plecare',
  to: 'sosire',
  vehicleClass: 'categorie',
  running: 'porneste',
  service: 'serviciu',
  // Added with the landing pages. A corridor page knows the country and
  // not the town — the car is somewhere in Germany, and which somewhere is
  // the visitor's to type — so the country travels on its own. The names
  // match the board's filters, which already use `tara-plecare`.
  fromCountry: 'tara-plecare',
  toCountry: 'tara-sosire',
  // The cargo category, which is what the request form actually asks for.
  // `categorie` above is the calculator's *price* class, a different and
  // coarser thing: a hatchback and a saloon cost differently and are both
  // `autoturism` on a request.
  category: 'vehicul',
} as const;

export interface Prefill {
  from: City | null;
  to: City | null;
  vehicleClass: VehicleClass | null;
  /** null when the link said nothing about it. */
  isRunning: boolean | null;
  express: boolean | null;
  /** ISO 3166-1 alpha-2, when a link named a country but no town. */
  fromCountry: string | null;
  toCountry: string | null;
  category: CargoCategory | null;
}

export const EMPTY_PREFILL: Prefill = {
  from: null,
  to: null,
  vehicleClass: null,
  isRunning: null,
  express: null,
  fromCountry: null,
  toCountry: null,
  category: null,
};

type SearchParams = Record<string, string | string[] | undefined>;

function one(params: SearchParams, key: string): string | null {
  const value = params[key];
  const text = Array.isArray(value) ? value[0] : value;
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  return trimmed === '' ? null : trimmed;
}

/** Everything is parsed defensively: this arrives from a query string. */
export function parsePrefill(params: SearchParams): Prefill {
  const vehicleClass = one(params, PREFILL_KEYS.vehicleClass);
  const running = one(params, PREFILL_KEYS.running);
  const service = one(params, PREFILL_KEYS.service);
  const category = one(params, PREFILL_KEYS.category);

  return {
    from: cityFromValue(one(params, PREFILL_KEYS.from)),
    to: cityFromValue(one(params, PREFILL_KEYS.to)),
    fromCountry: countryCode(one(params, PREFILL_KEYS.fromCountry)),
    toCountry: countryCode(one(params, PREFILL_KEYS.toCountry)),
    category: CARGO_CATEGORIES.includes(category as CargoCategory)
      ? (category as CargoCategory)
      : null,
    vehicleClass: VEHICLE_CLASS_ORDER.includes(vehicleClass as VehicleClass)
      ? (vehicleClass as VehicleClass)
      : null,
    isRunning: running === 'da' ? true : running === 'nu' ? false : null,
    express: service === 'expres' ? true : service === 'standard' ? false : null,
  };
}

/**
 * The query string for a prefilled request, empty when there is nothing
 * worth carrying — a link with a lone `?` is a link someone has to explain.
 */
export function prefillQuery(prefill: Prefill): string {
  const params = new URLSearchParams();
  if (prefill.from) params.set(PREFILL_KEYS.from, cityValue(prefill.from));
  if (prefill.to) params.set(PREFILL_KEYS.to, cityValue(prefill.to));
  // A named town already carries its country, so the bare country is only
  // written when there is no town to carry it.
  if (!prefill.from && prefill.fromCountry) {
    params.set(PREFILL_KEYS.fromCountry, prefill.fromCountry);
  }
  if (!prefill.to && prefill.toCountry) {
    params.set(PREFILL_KEYS.toCountry, prefill.toCountry);
  }
  if (prefill.category) params.set(PREFILL_KEYS.category, prefill.category);
  if (prefill.vehicleClass) params.set(PREFILL_KEYS.vehicleClass, prefill.vehicleClass);
  if (prefill.isRunning !== null) {
    params.set(PREFILL_KEYS.running, prefill.isRunning ? 'da' : 'nu');
  }
  if (prefill.express !== null) {
    params.set(PREFILL_KEYS.service, prefill.express ? 'expres' : 'standard');
  }
  const query = params.toString();
  return query === '' ? '' : `?${query}`;
}

/** True when a link carried enough to be worth showing back to a person. */
export function hasPrefill(prefill: Prefill): boolean {
  return (
    prefill.from !== null ||
    prefill.to !== null ||
    prefill.fromCountry !== null ||
    prefill.toCountry !== null ||
    prefill.category !== null ||
    prefill.vehicleClass !== null ||
    prefill.isRunning !== null ||
    prefill.express !== null
  );
}

/** Two upper-case letters, or null. This arrives from a query string. */
function countryCode(value: string | null): string | null {
  if (value === null) return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code) ? code : null;
}
