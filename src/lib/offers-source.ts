import 'server-only';
import type { Currency, OfferSettings, OfferStatus } from './offers';
import { DEFAULT_OFFER_SETTINGS } from './offers';
import { createClient } from './supabase/server';
import { isSupabaseConfigured } from './supabase/env';

/**
 * What the offer screens read.
 *
 * Every RPC behind these is SECURITY DEFINER and re-checks who is
 * asking, so nothing here adds an access rule of its own — the pages
 * are a convenience, the functions are the boundary.
 */

export interface OfferForRequest {
  id: string;
  created_at: string;
  status: OfferStatus;
  price_amount: number;
  currency: Currency;
  estimated_pickup_date: string | null;
  estimated_delivery_date: string | null;
  conditions: string | null;
  payment_term_days: number | null;
  message: string | null;
  valid_until: string | null;
  company_id: string | null;
  company_name: string | null;
  company_slug: string | null;
  company_verified: boolean | null;
  company_verified_at: string | null;
  vehicle_type: string | null;
  vehicle_plate: string | null;
  conversation_id: string | null;
  unread_messages: number;
}

export async function loadOffersForRequest(listingId: string): Promise<OfferForRequest[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('offers_for_request', { p_listing_id: listingId });
  if (error) {
    console.error('[oferte] request query failed', { code: error.code, message: error.message });
    return [];
  }
  return ((data ?? []) as OfferForRequest[]).map(normaliseNumbers);
}

export interface MyOffer {
  id: string;
  created_at: string;
  status: OfferStatus;
  price_amount: number;
  currency: Currency;
  estimated_pickup_date: string | null;
  estimated_delivery_date: string | null;
  valid_until: string | null;
  request_id: string;
  request_title: string | null;
  from_city: string;
  to_city: string;
  loading_from: string;
  counterparty: string | null;
  conversation_id: string | null;
  unread_messages: number;
  transport_id: string | null;
}

export type OfferBox = 'trimise' | 'primite';

export async function loadMyOffers(
  box: OfferBox,
  status: OfferStatus | null = null,
): Promise<MyOffer[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('my_offers', {
    p_box: box,
    p_status: status ?? undefined,
  });
  if (error) {
    console.error('[oferte] box query failed', { code: error.code, message: error.message });
    return [];
  }
  return ((data ?? []) as MyOffer[]).map(normaliseNumbers);
}

export interface EligibleVehicle {
  id: string;
  plate_number: string;
  vehicle_type: string;
  make: string | null;
  model: string | null;
}

export async function loadEligibleVehicles(companyId: string): Promise<EligibleVehicle[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('eligible_vehicles', { p_company_id: companyId });
  if (error) {
    console.error('[oferte] fleet query failed', { message: error.message });
    return [];
  }
  return (data ?? []) as EligibleVehicle[];
}

export interface ThreadMessage {
  id: string;
  created_at: string;
  sender_user_id: string;
  sender_name: string;
  body: string;
  was_masked: boolean;
  is_hidden: boolean;
  is_mine: boolean;
}

export async function loadOfferThread(offerId: string): Promise<ThreadMessage[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('offer_thread', { p_offer_id: offerId });
  if (error) {
    console.error('[oferte] thread query failed', { message: error.message });
    return [];
  }
  return (data ?? []) as ThreadMessage[];
}

/**
 * The ceilings the form prints beside its fields.
 *
 * A failed read falls back to what the table ships rather than throwing:
 * a form with a slightly stale ceiling is worth more than no form, and
 * the database applies the real one either way.
 */
export async function loadOfferSettings(): Promise<OfferSettings> {
  if (!isSupabaseConfigured()) return DEFAULT_OFFER_SETTINGS;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('offer_settings')
    .select('max_price_ron, max_price_eur, default_validity_hours, max_validity_days')
    .maybeSingle();

  if (error || data === null) {
    if (error) console.error('[oferte] settings query failed', { message: error.message });
    return DEFAULT_OFFER_SETTINGS;
  }
  return {
    maxPriceRon: Number(data.max_price_ron),
    maxPriceEur: Number(data.max_price_eur),
    defaultValidityHours: data.default_validity_hours,
    maxValidityDays: data.max_validity_days,
  };
}

export interface OfferQuota {
  used: number;
  allowed: number | null;
  planName: string;
}

export async function loadOfferQuota(): Promise<OfferQuota | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('offer_quota', {});
  if (error) {
    console.error('[oferte] quota query failed', { message: error.message });
    return null;
  }
  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return null;
  return { used: row.used, allowed: row.allowed, planName: row.plan_name };
}

/**
 * `numeric` comes back from PostgREST as a string when it does not fit a
 * JavaScript number, so the price is coerced once here rather than
 * trusted in a component.
 */
function normaliseNumbers<T extends { price_amount: number }>(row: T): T {
  return { ...row, price_amount: Number(row.price_amount) };
}

/**
 * Which of these requests the caller already has a live offer on.
 *
 * Used to turn „Trimite ofertă" into „Ai deja o ofertă" before somebody
 * fills nine fields and meets the unique index. RLS lets a bidder read
 * their own offers, so this asks only about the caller's own rows.
 *
 * `pending` only: an offer that was refused, withdrawn or has expired
 * leaves the way clear for a new one, which is exactly what the index
 * says too.
 */
export async function loadMyPendingOffers(
  listingIds: readonly string[],
): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  if (!isSupabaseConfigured() || listingIds.length === 0) return found;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('offers')
    .select('id, cargo_listing_id')
    .in('cargo_listing_id', [...listingIds])
    .eq('status', 'pending');

  if (error) {
    console.error('[oferte] pending lookup failed', { message: error.message });
    return found;
  }
  for (const row of (data ?? []) as { id: string; cargo_listing_id: string | null }[]) {
    if (row.cargo_listing_id !== null) found.set(row.cargo_listing_id, row.id);
  }
  return found;
}

/**
 * How many live offers sit on each of these requests.
 *
 * For the request's own side. RLS shows the listing owner every offer on
 * their listing and a bidder only their own, so the same query means
 * „how many I received" to a client and „mine" to a carrier — which is
 * why only the client's screens call it.
 */
export async function loadPendingOfferCounts(
  listingIds: readonly string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!isSupabaseConfigured() || listingIds.length === 0) return counts;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('offers')
    .select('cargo_listing_id')
    .in('cargo_listing_id', [...listingIds])
    .eq('status', 'pending');

  if (error) {
    console.error('[oferte] count query failed', { message: error.message });
    return counts;
  }
  for (const row of (data ?? []) as { cargo_listing_id: string | null }[]) {
    if (row.cargo_listing_id === null) continue;
    counts.set(row.cargo_listing_id, (counts.get(row.cargo_listing_id) ?? 0) + 1);
  }
  return counts;
}
