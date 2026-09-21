import 'server-only';
import type { Currency, OfferStatus } from './offers';
import { createClient } from './supabase/server';
import { isSupabaseConfigured } from './supabase/env';

/**
 * What the staff offer screens read.
 *
 * Separate from `offers-source.ts` because the boundary is different:
 * everything here goes through an RPC that begins by refusing anybody
 * who is not `is_platform_admin()`. A page that forgot the check would
 * still get nothing.
 *
 * There is no writer in this file, and that is deliberate: staff read
 * offers and may hide a message, and `offers` has no update policy they
 * could write through even if a screen tried.
 */

export const ADMIN_OFFERS_PAGE_SIZE = 50;

export interface AdminOfferQuery {
  status: OfferStatus | null;
  companyId: string | null;
  /** Inclusive day, ISO. */
  from: string | null;
  /** Inclusive day, ISO — turned into an exclusive bound by the loader. */
  to: string | null;
  page: number;
}

export interface AdminOfferRow {
  id: string;
  created_at: string;
  status: OfferStatus;
  price_amount: number;
  currency: Currency;
  valid_until: string | null;
  company_id: string | null;
  company_name: string | null;
  bidder_name: string | null;
  request_id: string | null;
  request_title: string | null;
  from_city: string | null;
  to_city: string | null;
  messages_count: number;
  total_count: number;
}

export interface AdminOfferPage {
  rows: AdminOfferRow[];
  total: number;
  /** Set when the read failed, so the screen can say so instead of "none". */
  error: string | null;
}

export async function loadAdminOffers(query: AdminOfferQuery): Promise<AdminOfferPage> {
  if (!isSupabaseConfigured()) return { rows: [], total: 0, error: null };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_offers', {
    p_status: query.status ?? undefined,
    p_company_id: query.companyId ?? undefined,
    p_from: query.from === null ? undefined : `${query.from}T00:00:00Z`,
    // The filter reads as "up to and including this day", and the RPC
    // compares with `<`, so the bound is the next midnight.
    p_to: query.to === null ? undefined : `${nextDay(query.to)}T00:00:00Z`,
    p_limit: ADMIN_OFFERS_PAGE_SIZE,
    p_offset: (query.page - 1) * ADMIN_OFFERS_PAGE_SIZE,
  });

  if (error) {
    console.error('[admin/oferte] list failed', { code: error.code, message: error.message });
    return { rows: [], total: 0, error: error.message };
  }

  const rows = ((data ?? []) as AdminOfferRow[]).map((row) => ({
    ...row,
    price_amount: Number(row.price_amount),
    total_count: Number(row.total_count),
  }));
  return { rows, total: rows[0]?.total_count ?? 0, error: null };
}

export interface AdminOfferCompany {
  company_id: string;
  company_name: string;
  offers_count: number;
}

export async function loadAdminOfferCompanies(): Promise<AdminOfferCompany[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_offer_companies', {});
  if (error) {
    console.error('[admin/oferte] companies failed', { message: error.message });
    return [];
  }
  return ((data ?? []) as AdminOfferCompany[]).map((row) => ({
    ...row,
    offers_count: Number(row.offers_count),
  }));
}

export interface AdminOfferDetail {
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
  expired_at: string | null;
  company_id: string | null;
  company_name: string | null;
  bidder_name: string | null;
  vehicle_plate: string | null;
  request_id: string | null;
  request_title: string | null;
  from_city: string | null;
  to_city: string | null;
  loading_from: string | null;
  request_status: string | null;
  client_name: string | null;
  client_company: string | null;
  transport_id: string | null;
}

export async function loadAdminOffer(id: string): Promise<AdminOfferDetail | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_offer', { p_offer_id: id });
  if (error) {
    console.error('[admin/oferte] detail failed', { message: error.message });
    return null;
  }
  const row = (Array.isArray(data) ? data[0] : null) as AdminOfferDetail | null;
  if (!row) return null;
  return { ...row, price_amount: Number(row.price_amount) };
}

/** The day after an ISO day, without a timezone anywhere near it. */
function nextDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
