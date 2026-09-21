import 'server-only';
import type { RatingSide } from './ratings';
import { isSupabaseConfigured } from './supabase/env';
import { createPublicClient } from './supabase/public';
import { createClient } from './supabase/server';

/**
 * Ce citesc ecranele de evaluări.
 *
 * Fiecare funcție de dedesubt verifică singură cine întreabă —
 * `order_rating_state()` trece prin `can_see_order()`, `my_ratings()`
 * pleacă de la `auth.uid()`, iar `admin_ratings()` refuză pe loc pe
 * oricine nu este din echipă. Fișierul ăsta nu adaugă nicio regulă de
 * acces; o pagină care ar uita să verifice primește un refuz, nu datele
 * altcuiva.
 *
 * `company_ratings()` este singura citită cu cheia anonimă: profilul
 * public se vede fără cont.
 */

export interface PendingRating {
  order_id: string;
  rating_id: string | null;
  created_at: string | null;
  deadline: string | null;
  score: number | null;
  comment: string | null;
  after_dispute: boolean;
  hidden: boolean;
  from_city: string | null;
  to_city: string | null;
  counterparty_name: string | null;
  counterparty_slug: string | null;
  rater_name: string | null;
  reply_body: string | null;
  can_reply: boolean;
  can_edit: boolean;
}

export type RatingBox = 'de-dat' | 'date' | 'primite';

export function parseBox(value: string | null): RatingBox {
  return value === 'date' || value === 'primite' ? value : 'de-dat';
}

function report(where: string, error: { message: string } | null) {
  if (error) console.error(`[ratings:${where}]`, error.message);
}

export async function loadMyRatings(box: RatingBox = 'de-dat'): Promise<PendingRating[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('my_ratings', { p_box: box });
  report('my_ratings', error);
  return (data ?? []) as PendingRating[];
}

/** Câte comenzi așteaptă o evaluare de la persoana asta. Pentru insigne. */
export async function countPendingRatings(): Promise<number> {
  if (!isSupabaseConfigured()) return 0;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('pending_rating_count');
  report('pending_rating_count', error);
  return Number(data ?? 0);
}

export interface OrderRatingState {
  side: RatingSide | null;
  can_rate: boolean;
  blocked_reason: string | null;
  deadline: string | null;
  rating_id: string | null;
  score: number | null;
  punctuality: number | null;
  communication: number | null;
  vehicle_care: number | null;
  info_accuracy: number | null;
  handover_availability: number | null;
  comment: string | null;
  can_edit: boolean;
  edit_deadline: string | null;
  rated_company_name: string | null;
  rated_company_slug: string | null;
}

export async function loadOrderRatingState(orderId: string): Promise<OrderRatingState | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('order_rating_state', { p_order_id: orderId });
  report('order_rating_state', error);
  const rows = (data ?? []) as OrderRatingState[];
  return rows[0] ?? null;
}

export interface PublicRating {
  id: string;
  created_at: string;
  score: number;
  punctuality: number | null;
  communication: number | null;
  vehicle_care: number | null;
  info_accuracy: number | null;
  handover_availability: number | null;
  comment: string | null;
  after_dispute: boolean;
  edited: boolean;
  rater_name: string | null;
  reply_body: string | null;
  reply_at: string | null;
  total_count: number;
}

export const RATINGS_PAGE_SIZE = 10;

/**
 * Evaluările de pe un profil public.
 *
 * Cu cheia anonimă, pentru că profilul se vede fără cont. Funcția din
 * bază scoate conturile de test, evaluările ascunse și răspunsurile
 * ascunse — nu ecranul.
 */
export async function loadCompanyRatings(
  slug: string,
  page: number = 1,
): Promise<{ rows: PublicRating[]; total: number }> {
  if (!isSupabaseConfigured()) return { rows: [], total: 0 };

  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc('company_ratings', {
    p_slug: slug,
    p_limit: RATINGS_PAGE_SIZE,
    p_offset: (Math.max(1, page) - 1) * RATINGS_PAGE_SIZE,
  });
  report('company_ratings', error);

  const rows = (data ?? []) as PublicRating[];
  return { rows, total: Number(rows[0]?.total_count ?? 0) };
}

export interface AdminRating {
  id: string;
  created_at: string;
  order_id: string;
  score: number;
  comment: string | null;
  after_dispute: boolean;
  hidden_at: string | null;
  hidden_reason: string | null;
  was_masked: boolean;
  edited_at: string | null;
  rater_name: string | null;
  rated_name: string | null;
  rated_slug: string | null;
  reply_body: string | null;
  reply_id: string | null;
  reply_hidden_at: string | null;
  report_count: number;
  total_count: number;
}

export interface AdminRatingQuery {
  score: number | null;
  companyId: string | null;
  hidden: boolean | null;
  afterDispute: boolean | null;
  page: number;
}

export const ADMIN_RATINGS_PAGE_SIZE = 50;

export async function loadAdminRatings(
  query: AdminRatingQuery,
): Promise<{ rows: AdminRating[]; total: number; error: string | null }> {
  if (!isSupabaseConfigured()) return { rows: [], total: 0, error: null };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_ratings', {
    p_score: query.score ?? undefined,
    p_company_id: query.companyId ?? undefined,
    p_hidden: query.hidden ?? undefined,
    p_after_dispute: query.afterDispute ?? undefined,
    p_limit: ADMIN_RATINGS_PAGE_SIZE,
    p_offset: (Math.max(1, query.page) - 1) * ADMIN_RATINGS_PAGE_SIZE,
  });
  if (error) return { rows: [], total: 0, error: error.message };

  const rows = (data ?? []) as AdminRating[];
  return { rows, total: Number(rows[0]?.total_count ?? 0), error: null };
}

export interface RatingThresholds {
  window_days: number;
  edit_hours: number;
  min_public_ratings: number;
  punctuality_grace_days: number;
  min_punctuality_orders: number;
  response_window_hours: number;
  response_lookback_days: number;
  min_response_sample: number;
}

/**
 * Pragurile, de la sursă.
 *
 * Citite cu cheia anonimă pentru că profilul public are nevoie de ele ca
 * să știe dacă are voie să arate o medie, iar profilul public se vede
 * fără cont.
 */
export async function loadRatingThresholds(): Promise<RatingThresholds | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = createPublicClient();
  const { data, error } = await supabase
    .from('rating_settings')
    .select(
      'window_days, edit_hours, min_public_ratings, punctuality_grace_days, min_punctuality_orders, response_window_hours, response_lookback_days, min_response_sample',
    )
    .maybeSingle();
  report('rating_settings', error);
  return (data as RatingThresholds | null) ?? null;
}
