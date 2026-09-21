import type { Database } from './supabase/database.types';
import {
  estimate,
  formatAmount,
  type EstimateInput,
  type PriceRate,
  type PriceSettings,
  type VehicleClass,
} from './pricing';

/**
 * An offer, as the screens read and validate it.
 *
 * The rules here are a courtesy, not a boundary: every one of them is
 * enforced again by `guard_offer_terms()` in Postgres, which is what
 * actually decides. What this file buys is a person finding out about a
 * problem while they are still looking at the field, rather than after
 * pressing a button.
 *
 * Free of React and of the database, so the rule a form applies and the
 * rule a test states are the same rule.
 */

export type OfferStatus = Database['public']['Enums']['offer_status'];
export type Currency = Database['public']['Enums']['currency_code'];

export const OFFER_STATUS_LABELS: Record<OfferStatus, string> = {
  pending: 'În așteptare',
  accepted: 'Acceptată',
  rejected: 'Respinsă',
  withdrawn: 'Retrasă',
  expired: 'Expirată',
};

/**
 * The order a list is worked in: what still needs an answer first, then
 * what was agreed, then everything that is over.
 */
export const OFFER_STATUS_ORDER: readonly OfferStatus[] = [
  'pending',
  'accepted',
  'rejected',
  'withdrawn',
  'expired',
];

/** Only a pending offer can still be acted on, by either side. */
export function isLive(status: OfferStatus): boolean {
  return status === 'pending';
}

export const CURRENCIES: readonly Currency[] = ['RON', 'EUR'];

/**
 * The dials `offer_settings` holds, with the values the table ships.
 *
 * Passed in rather than imported by the form, so a test can state them
 * and so a change in the admin screen reaches the browser without a
 * deploy.
 */
export interface OfferSettings {
  maxPriceRon: number;
  maxPriceEur: number;
  defaultValidityHours: number;
  maxValidityDays: number;
}

export const DEFAULT_OFFER_SETTINGS: OfferSettings = {
  maxPriceRon: 200000,
  maxPriceEur: 40000,
  defaultValidityHours: 48,
  maxValidityDays: 14,
};

export function priceCeiling(currency: Currency, settings: OfferSettings): number {
  return currency === 'EUR' ? settings.maxPriceEur : settings.maxPriceRon;
}

/** What the form holds, all of it as typed. */
export interface OfferDraft {
  price: string;
  currency: Currency;
  pickupDate: string;
  deliveryDate: string;
  vehicleId: string;
  conditions: string;
  paymentTermDays: string;
  validityHours: string;
  message: string;
}

export const EMPTY_OFFER_DRAFT: OfferDraft = {
  price: '',
  currency: 'RON',
  pickupDate: '',
  deliveryDate: '',
  vehicleId: '',
  conditions: '',
  paymentTermDays: '',
  validityHours: '48',
  message: '',
};

export const MAX_TEXT = 1000;

export interface OfferContext {
  /** The earliest the request can be loaded, ISO `YYYY-MM-DD`. */
  loadingFrom: string;
  /** True when the firm carries: then a vehicle is required. */
  needsVehicle: boolean;
  settings: OfferSettings;
}

/**
 * What is wrong with this draft, field by field.
 *
 * Case for case against `guard_offer_terms()`, in the same order and
 * with the same thresholds. The Romanian differs on purpose: the
 * database writes for whoever reads a log, the form writes for whoever
 * is looking at the field.
 */
export function validateOffer(
  draft: OfferDraft,
  context: OfferContext,
): Record<string, string> {
  const errors: Record<string, string> = {};

  const price = Number(draft.price.replace(',', '.'));
  if (draft.price.trim() === '' || !Number.isFinite(price)) {
    errors.price = 'Scrie prețul.';
  } else if (price <= 0) {
    errors.price = 'Prețul trebuie să fie mai mare decât zero.';
  } else {
    const ceiling = priceCeiling(draft.currency, context.settings);
    if (price > ceiling) {
      errors.price = `Maximul este ${formatMoney(ceiling, draft.currency)}. Dacă chiar atât costă, scrie-ne.`;
    }
  }

  if (draft.pickupDate !== '' && draft.pickupDate < context.loadingFrom) {
    errors.pickupDate = `Vehiculul poate fi încărcat cel mai devreme pe ${formatDay(context.loadingFrom)}.`;
  }

  if (
    draft.pickupDate !== '' &&
    draft.deliveryDate !== '' &&
    draft.deliveryDate < draft.pickupDate
  ) {
    errors.deliveryDate = 'Livrarea nu poate fi înainte de ridicare.';
  }

  if (context.needsVehicle && draft.vehicleId === '') {
    errors.vehicleId = 'Alege vehiculul care face transportul.';
  }

  if (draft.conditions.length > MAX_TEXT) {
    errors.conditions = `Cel mult ${MAX_TEXT} de caractere.`;
  }
  if (draft.message.length > MAX_TEXT) {
    errors.message = `Cel mult ${MAX_TEXT} de caractere.`;
  }

  const hours = Number(draft.validityHours);
  if (!Number.isFinite(hours) || hours < 1) {
    errors.validityHours = 'Scrie câte ore este valabilă oferta.';
  } else if (hours > context.settings.maxValidityDays * 24) {
    errors.validityHours = `O ofertă poate fi valabilă cel mult ${context.settings.maxValidityDays} zile.`;
  }

  const term = draft.paymentTermDays.trim();
  if (term !== '' && (!Number.isFinite(Number(term)) || Number(term) < 0)) {
    errors.paymentTermDays = 'Termenul de plată se scrie în zile.';
  }

  return errors;
}

/** „2.400 lei" / „480 €", the way a price is written here. */
export function formatMoney(amount: number, currency: Currency): string {
  // Whole amounts are written whole — „2.400 lei", not „2.400,00 lei" —
  // but the bani are never dropped. `price_amount` is numeric(10,2) and
  // a carrier may well quote 2.400,50: rounding it on the card the
  // client accepts would show one price and create an order for
  // another.
  const hasBani = Math.round(amount * 100) % 100 !== 0;
  const n = new Intl.NumberFormat('ro-RO', {
    minimumFractionDigits: hasBani ? 2 : 0,
    maximumFractionDigits: hasBani ? 2 : 0,
  }).format(amount);
  return currency === 'EUR' ? `${n} €` : `${n} lei`;
}

/** `2026-09-25` as „25.09.2026", which is how a date is read here. */
export function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

/**
 * How long an offer still stands.
 *
 * `now` is a parameter so the server and the browser can be asked the
 * same question and a test can ask it without waiting. Anything past is
 * „expirată" rather than a negative number, because a countdown that
 * runs backwards is a bug people report.
 */
export function timeLeft(validUntil: string | null, now: Date = new Date()): string {
  if (validUntil === null) return 'fără termen';
  const ms = new Date(validUntil).getTime() - now.getTime();
  if (!Number.isFinite(ms)) return 'fără termen';
  if (ms <= 0) return 'expirată';

  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `mai are ${plural(minutes, 'minut', 'minute', 'un')}`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `mai are ${plural(hours, 'oră', 'ore')}`;

  return `mai are ${plural(Math.floor(hours / 24), 'zi', 'zile')}`;
}

/** True once the countdown is under this many hours: the card says so. */
export const URGENT_HOURS = 6;

export function isUrgent(validUntil: string | null, now: Date = new Date()): boolean {
  if (validUntil === null) return false;
  const ms = new Date(validUntil).getTime() - now.getTime();
  return Number.isFinite(ms) && ms > 0 && ms < URGENT_HOURS * 3_600_000;
}

function plural(n: number, one: string, many: string, article: 'o' | 'un' = 'o'): string {
  if (n === 1) return `${article} ${one}`;
  const lastTwo = Math.abs(n) % 100;
  return lastTwo >= 1 && lastTwo <= 19 ? `${n} ${many}` : `${n} de ${many}`;
}

export type OfferSort = 'pret' | 'ridicare' | 'livrare' | 'evaluare';

export const SORT_LABELS: Record<OfferSort, string> = {
  pret: 'Cel mai mic preț',
  ridicare: 'Cea mai apropiată ridicare',
  livrare: 'Cea mai apropiată livrare',
  evaluare: 'Cea mai bună evaluare',
};

export interface SortableOffer {
  price_amount: number;
  currency: Currency;
  estimated_pickup_date: string | null;
  estimated_delivery_date: string | null;
  company_rating_avg?: number | null;
  company_rating_count?: number;
}

/**
 * The order the cards are shown in.
 *
 * Price is the default because it is the question everybody opens the
 * list with. Two currencies are NOT converted to compare them: an
 * invented exchange rate is an invented number, and the list would be
 * sorted by a claim we cannot defend. RON sorts before EUR, and each
 * group sorts by its own amount — which is honest and still useful,
 * because a request almost always attracts one currency.
 *
 * A missing date sorts last rather than first: „did not say" is not
 * „tomorrow".
 */
/** The average, or -1 for a firm that has none to show. */
function ratedValue(offer: SortableOffer): number {
  const count = offer.company_rating_count ?? 0;
  const avg = offer.company_rating_avg;
  return avg === null || avg === undefined || count < MIN_PUBLIC_RATINGS ? -1 : avg;
}

/** Same threshold as `rating_settings.min_public_ratings`, and the same default. */
const MIN_PUBLIC_RATINGS = 3;

export function sortOffers<T extends SortableOffer>(offers: readonly T[], by: OfferSort): T[] {
  const copy = [...offers];
  if (by === 'pret') {
    return copy.sort((a, b) => {
      if (a.currency !== b.currency) return a.currency === 'RON' ? -1 : 1;
      return a.price_amount - b.price_amount;
    });
  }
  if (by === 'evaluare') {
    // A firm below the publication threshold has no average to sort by,
    // and giving it one — zero, or five — would put it either last or
    // first for a reason that is not true. They keep their place at the
    // bottom of the rated ones, in price order among themselves.
    return copy.sort((a, b) => {
      const x = ratedValue(a);
      const y = ratedValue(b);
      if (x !== y) return y - x;
      if (a.currency !== b.currency) return a.currency === 'RON' ? -1 : 1;
      return a.price_amount - b.price_amount;
    });
  }
  const key = by === 'ridicare' ? 'estimated_pickup_date' : 'estimated_delivery_date';
  return copy.sort((a, b) => {
    const x = a[key];
    const y = b[key];
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

/** At most this many side by side: a sixth column is unreadable. */
export const COMPARE_LIMIT = 5;

/**
 * What the request's status line says.
 *
 * `listing_status` does carry `offers_received` and `carrier_selected`
 * — 20260917090000 added them — and `carrier_selected` is what
 * `accept_offer()` has written since 20260917180000. `offers_received`
 * is the one nothing has ever set, and this deliberately keeps it that
 * way: the count is derived from live offers instead, so it cannot
 * drift from them. Four paths would otherwise have to keep it in step
 * — insert, withdraw, reject, expire — and the fourth is a job.
 *
 * A row that somehow arrives carrying `offers_received` still reads
 * correctly, because the derivation is what decides the words.
 */
export function requestStateLabel(status: string, pendingOffers: number): string {
  // `assigned` is the pre-20260917180000 spelling; rows were migrated,
  // but a dump restored from before that would still hold it.
  if (status === 'carrier_selected' || status === 'assigned') return 'Transportator ales';
  if (status === 'in_progress') return 'În curs';
  if (status === 'delivered' || status === 'completed') return 'Livrată';
  if (status === 'disputed') return 'În dispută';
  if (status === 'cancelled') return 'Anulată';
  if (status === 'expired') return 'Expirată';
  if (status === 'suspended') return 'Suspendată';
  if (status !== 'active' && status !== 'offers_received') return 'Ciornă';
  if (pendingOffers === 0) return 'Așteaptă oferte';
  return pendingOffers === 1 ? 'O ofertă primită' : `${pendingOffers} oferte primite`;
}

/**
 * The indicative range for a request, when the team has published one.
 *
 * The board files fourteen categories; the price table prices five
 * classes. Only three categories map onto it at all, and `autoturism`
 * maps onto three classes at once — a hatchback and a SUV are the same
 * request and not the same job. Rather than pick one of the three and
 * print a number nobody chose, the range spans them: the cheapest low
 * and the dearest high. Every other category returns null, which the
 * form renders as nothing.
 *
 * Coordinates are the city centroids the request was published with.
 * Without both, there is no distance and therefore no estimate.
 */
export function indicativeRange(
  request: {
    category: string;
    is_running: boolean;
    service_type: string;
    from_lat: number | null;
    from_lng: number | null;
    from_country: string;
    to_lat: number | null;
    to_lng: number | null;
    to_country: string;
  },
  rates: readonly PriceRate[],
  settings: PriceSettings | null,
): { low: string; high: string } | null {
  if (settings === null || !settings.is_published || rates.length === 0) return null;
  if (request.from_lat === null || request.from_lng === null) return null;
  if (request.to_lat === null || request.to_lng === null) return null;

  const classes = CLASSES_FOR_CATEGORY[request.category];
  if (classes === undefined) return null;

  const usable = rates.filter((rate) => classes.includes(rate.vehicle_class));
  if (usable.length === 0) return null;

  const input: EstimateInput = {
    from: { lat: request.from_lat, lng: request.from_lng, country: request.from_country },
    to: { lat: request.to_lat, lng: request.to_lng, country: request.to_country },
    vehicleClass: usable[0]!.vehicle_class,
    isRunning: request.is_running,
    express: request.service_type === 'expres',
  };

  const results = usable.map((rate) => estimate(input, rate, settings));
  const first = results[0]!;
  const low = Math.min(...results.map((result) => result.low));
  const high = Math.max(...results.map((result) => result.high));
  return { low: formatAmount(low, first.currency), high: formatAmount(high, first.currency) };
}

/** Which price classes a board category can be priced as, if any. */
const CLASSES_FOR_CATEGORY: Record<string, readonly VehicleClass[]> = {
  autoturism: ['hatchback', 'sedan', 'suv'],
  autoutilitara: ['autoutilitara'],
  motocicleta: ['motocicleta'],
};
