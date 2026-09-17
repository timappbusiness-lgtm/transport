import { cityFromValue, cityValue, type City } from './cities';
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
} as const;

export interface Prefill {
  from: City | null;
  to: City | null;
  vehicleClass: VehicleClass | null;
  /** null when the link said nothing about it. */
  isRunning: boolean | null;
  express: boolean | null;
}

export const EMPTY_PREFILL: Prefill = {
  from: null,
  to: null,
  vehicleClass: null,
  isRunning: null,
  express: null,
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

  return {
    from: cityFromValue(one(params, PREFILL_KEYS.from)),
    to: cityFromValue(one(params, PREFILL_KEYS.to)),
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
    prefill.vehicleClass !== null ||
    prefill.isRunning !== null ||
    prefill.express !== null
  );
}
