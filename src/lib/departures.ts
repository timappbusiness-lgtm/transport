import type { Database } from '@/lib/supabase/database.types';

/**
 * Reading a departure the way the board shows it.
 *
 * Everything here works from `v_departures_public`, which is city-level and
 * carries no company. The carrier's identity is added separately, and only
 * for a signed-in visitor — see `src/app/trasee/page.tsx`.
 */

export type Direction = Database['public']['Enums']['truck_direction'];
export type ServiceType = Database['public']['Enums']['service_type'];
export type CargoCategory = Database['public']['Enums']['cargo_category'];

/** One row of `v_departures_public`. */
export interface PublicDeparture {
  truck_listing_id: string;
  direction: Direction;
  from_country: string;
  from_county: string | null;
  from_city: string;
  to_country: string;
  to_county: string | null;
  to_city: string;
  waypoints: unknown;
  available_from: string;
  available_to: string | null;
  service_types: ServiceType[];
  accepted_vehicle_types: CargoCategory[];
  platform_slots_total: number | null;
  slots_taken: number;
  slots_free: number;
  price_indicative: number | null;
  currency: string;
  published_at: string | null;
  is_domestic: boolean | null;
  /**
   * The centroid of `from_city`, read from `localities` by the view.
   *
   * Not the listing's own coordinates: the public board has never
   * carried those and still does not. This is the same fact as
   * `from_city`, in numbers, so the radius filter has something to
   * measure against.
   */
  from_locality_lat: number | null;
  from_locality_lng: number | null;
  /** Kilograms still free on the platform. Null when nobody said. */
  free_capacity_kg: number | null;
}

export const DIRECTION_LABELS: Record<Direction, string> = {
  tur: 'Pe tur',
  retur: 'Pe retur',
};

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  pe_sens: 'Pe sens',
  expres: 'Expres',
  tractare: 'Tractare',
};

/** One line each, because a person choosing between them needs the difference. */
export const SERVICE_TYPE_NOTES: Record<ServiceType, string> = {
  pe_sens: 'Merge cu platforma pe ruta ei obișnuită. Cel mai ieftin, dar depinde de program.',
  expres: 'Transport direct, la data cerută. Costă mai mult și pleacă mai repede.',
  tractare: 'Pentru vehicule care nu pot fi urcate pe platformă.',
};

/**
 * Every category the enum has, as a runtime list.
 *
 * `CARGO_CATEGORY_LABELS` has the same keys, but a `Record` is not a value
 * a query-string parser can check membership against without an
 * `Object.keys` cast at every call site.
 */
export const CARGO_CATEGORIES: readonly CargoCategory[] = [
  'autoturism',
  'autoutilitara',
  'motocicleta',
  'utilaj_agricol',
  'microbuz',
  'utilaj_constructii',
  'rulota',
  'cap_tractor',
  'camion',
  'remorca',
  'utilaj_manipulare',
  'container',
  'ambarcatiune',
  'altele',
];

export const CARGO_CATEGORY_LABELS: Record<CargoCategory, string> = {
  autoturism: 'Autoturism',
  autoutilitara: 'Autoutilitară',
  motocicleta: 'Motocicletă',
  utilaj_agricol: 'Utilaj agricol',
  microbuz: 'Microbuz',
  utilaj_constructii: 'Utilaj de construcții',
  rulota: 'Rulotă',
  cap_tractor: 'Cap tractor',
  camion: 'Camion',
  remorca: 'Remorcă',
  utilaj_manipulare: 'Utilaj de manipulare',
  container: 'Container',
  ambarcatiune: 'Ambarcațiune',
  altele: 'Altele',
};

/**
 * The categories offered on the board's filter, in the order a person
 * scanning them expects. Anything else stays available on a departure but
 * does not clutter the filter.
 */
export const FILTERABLE_CATEGORIES: readonly CargoCategory[] = [
  'autoturism',
  'autoutilitara',
  'motocicleta',
  'microbuz',
  'rulota',
  'utilaj_agricol',
];

/** A waypoint as the carrier form stores it. */
export interface Waypoint {
  city: string;
  country?: string;
}

/**
 * `waypoints` is jsonb, so it arrives as `unknown` and anything could be in
 * there — including rows written before this shape existed. Everything that
 * is not a usable `{ city }` is dropped rather than rendered as `[object
 * Object]`.
 */
export function readWaypoints(value: unknown): Waypoint[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry === 'string') {
      return entry.trim() === '' ? [] : [{ city: entry.trim() }];
    }
    if (entry === null || typeof entry !== 'object') return [];
    const record = entry as Record<string, unknown>;
    const city = typeof record.city === 'string' ? record.city.trim() : '';
    if (city === '') return [];
    const country = typeof record.country === 'string' ? record.country.trim() : '';
    return [country === '' ? { city } : { city, country }];
  });
}

/** "München → Cluj-Napoca", with the stops in between when there are any. */
export function routeCities(departure: PublicDeparture): string[] {
  return [
    departure.from_city,
    ...readWaypoints(departure.waypoints).map((w) => w.city),
    departure.to_city,
  ];
}

/**
 * The date window, written the way a dispatcher says it.
 *
 * A single day is "14.03", a window is "14–18.03" when the month is shared
 * and "28.03 – 2.04" when it is not.
 */
export function formatWindow(from: string, to: string | null): string {
  const start = parseDateOnly(from);
  if (!to || to === from) return formatDay(start);

  const end = parseDateOnly(to);
  if (start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()) {
    return `${start.getDate()}–${formatDay(end)}`;
  }
  return `${formatDay(start)} – ${formatDay(end)}`;
}

function formatDay(date: Date): string {
  return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** A `date` column is a calendar date; `new Date()` would read it as UTC. */
export function parseDateOnly(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return new Date(value);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/** True when the window has closed and the departure is history. */
export function hasDeparted(departure: PublicDeparture, today: Date = new Date()): boolean {
  const last = parseDateOnly(departure.available_to ?? departure.available_from);
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return last < midnight;
}

/** No free seats left. A departure with no declared deck is never "full". */
export function isFull(departure: PublicDeparture): boolean {
  return departure.platform_slots_total !== null && departure.slots_free <= 0;
}

/** "3 locuri libere din 8", or nothing when the carrier declared no deck. */
export function seatsSentence(departure: PublicDeparture): string | null {
  if (departure.platform_slots_total === null) return null;
  if (departure.slots_free <= 0) return 'Platformă plină';
  const noun = departure.slots_free === 1 ? 'loc liber' : 'locuri libere';
  return `${departure.slots_free} ${noun} din ${departure.platform_slots_total}`;
}

/**
 * The indicative price, always labelled. Never a bare number: the copy rule
 * is that an estimate says it is an estimate.
 */
export function priceSentence(departure: PublicDeparture): string | null {
  if (departure.price_indicative === null) return null;
  const amount = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 }).format(
    departure.price_indicative,
  );
  return `${amount} ${departure.currency} orientativ`;
}
