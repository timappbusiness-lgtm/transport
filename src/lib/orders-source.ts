import 'server-only';
import type { EvidenceKind, OrderSide, OrderStatus } from './orders';
import { createClient } from './supabase/server';
import { isSupabaseConfigured } from './supabase/env';

/**
 * What the order screens read.
 *
 * Every RPC behind these begins by asking `can_see_order()`, so nothing
 * here adds an access rule of its own — the pages are a convenience and
 * the functions are the boundary. A page that forgot to check would get
 * a refusal rather than somebody else's order.
 */

export interface OrderRow {
  id: string;
  created_at: string;
  status: OrderStatus;
  agreed_price: number;
  currency: string;
  from_city: string | null;
  to_city: string | null;
  pickup_from: string | null;
  delivery_from: string | null;
  delivered_at: string | null;
  request_id: string | null;
  carrier_company_id: string | null;
  carrier_name: string | null;
  client_name: string | null;
  driver_name: string | null;
  plate_number: string | null;
  my_side: OrderSide | null;
  needs_me: boolean;
  vehicle_flagged: boolean;
  evidence_count: number;
}

export async function loadMyOrders(
  box: string = 'active',
  role: OrderSide | null = null,
): Promise<OrderRow[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('my_orders', {
    p_box: box,
    p_role: role ?? undefined,
  });
  if (error) {
    console.error('[comenzi] list failed', { code: error.code, message: error.message });
    return [];
  }
  return ((data ?? []) as OrderRow[]).map((row) => ({
    ...row,
    agreed_price: Number(row.agreed_price),
  }));
}

export interface OrderDetail {
  id: string;
  created_at: string;
  status: OrderStatus;
  agreed_price: number;
  currency: string;
  payment_term_days: number | null;
  pickup_from: string | null;
  pickup_to: string | null;
  delivery_from: string | null;
  delivery_to: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  closed_at: string | null;
  auto_completed: boolean;
  cancelled_at: string | null;
  cancel_reason: string | null;
  disputed_at: string | null;
  dispute_category: string | null;
  dispute_reason: string | null;
  dispute_resolved_at: string | null;
  dispute_resolution: string | null;
  vehicle_flagged: boolean;
  /** Null for everybody but the client and staff — the database decides. */
  confirmation_code: string | null;
  request_id: string | null;
  request_title: string | null;
  from_city: string | null;
  to_city: string | null;
  loading_from: string | null;
  request_photos: string[] | null;
  carrier_company_id: string | null;
  carrier_name: string | null;
  carrier_slug: string | null;
  client_name: string | null;
  driver_id: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  vehicle_id: string | null;
  plate_number: string | null;
  vehicle_type: string | null;
  offer_id: string | null;
  my_side: OrderSide;
  auto_complete_hours: number;
  dispute_window_hours: number;
}

export async function loadOrder(id: string): Promise<OrderDetail | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('order_detail', { p_order_id: id });
  if (error) {
    // A refusal is the ordinary answer for somebody else's order, so it
    // is not logged as a failure — the page renders its 404.
    return null;
  }
  const row = (Array.isArray(data) ? data[0] : null) as OrderDetail | null;
  if (!row) return null;
  return { ...row, agreed_price: Number(row.agreed_price) };
}

export interface TimelineRowSource {
  id: string;
  created_at: string;
  from_status: string | null;
  to_status: string;
  actor_side: string;
  actor_name: string | null;
  note: string | null;
}

export async function loadTimeline(id: string): Promise<TimelineRowSource[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('order_timeline', { p_order_id: id });
  if (error) {
    console.error('[comenzi] timeline failed', { message: error.message });
    return [];
  }
  return (data ?? []) as TimelineRowSource[];
}

export interface EvidenceRow {
  id: string;
  kind: EvidenceKind;
  file_path: string | null;
  note: string | null;
  payload: Record<string, string>;
  captured_at: string;
  author_name: string;
  lat: number | null;
  lng: number | null;
  is_hidden: boolean;
}

export async function loadEvidence(id: string): Promise<EvidenceRow[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('order_evidence_list', { p_order_id: id });
  if (error) {
    console.error('[comenzi] evidence failed', { message: error.message });
    return [];
  }
  return (data ?? []) as EvidenceRow[];
}

/** How many of each kind, for the "what is still missing" line. */
export function countByKind(rows: readonly EvidenceRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    if (row.is_hidden) continue;
    counts[row.kind] = (counts[row.kind] ?? 0) + 1;
  }
  return counts;
}

export interface CrewOption {
  kind: 'driver' | 'vehicle';
  id: string;
  label: string;
  detail: string;
}

export async function loadCrewOptions(orderId: string): Promise<CrewOption[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('order_crew_options', { p_order_id: orderId });
  if (error) {
    console.error('[comenzi] crew options failed', { message: error.message });
    return [];
  }
  return (data ?? []) as CrewOption[];
}

export interface DisputeReason {
  code: string;
  label: string;
}

export async function loadDisputeReasons(): Promise<DisputeReason[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('order_dispute_reasons')
    .select('code, label')
    .order('sort_order', { ascending: true });

  if (error) {
    console.error('[comenzi] dispute reasons failed', { message: error.message });
    return [];
  }
  return (data ?? []) as DisputeReason[];
}

/**
 * Signed links for the photographs, in one round trip.
 *
 * The bucket is private, so nothing renders without one of these. They
 * expire in an hour: long enough to read a page and scroll back, short
 * enough that a link pasted into a chat is dead by the time anybody
 * follows it.
 */
export const EVIDENCE_URL_TTL_SECONDS = 3600;

export async function signEvidence(paths: readonly string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  const wanted = [...new Set(paths)].filter((path) => path !== '');
  if (!isSupabaseConfigured() || wanted.length === 0) return urls;

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from('order-evidence')
    .createSignedUrls(wanted, EVIDENCE_URL_TTL_SECONDS);

  if (error) {
    console.error('[comenzi] signing failed', { message: error.message });
    return urls;
  }
  for (const row of data ?? []) {
    if (row.signedUrl && row.path) urls.set(row.path, row.signedUrl);
  }
  return urls;
}

/**
 * The client's own photographs of the vehicle, for the comparison view.
 *
 * Signed, not public. The bucket used to be public and its read policy
 * was the bucket name and nothing else, so anyone with the anon key
 * listed every photo on the platform and downloaded it — including the
 * photos on a private request. Migration `20260928100000` closed both
 * halves; this is the side of it the screens see.
 */
export async function signRequestPhotos(paths: readonly string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  const wanted = [...new Set(paths)].filter((path) => path !== '');
  if (!isSupabaseConfigured() || wanted.length === 0) return urls;

  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from('listing-photos')
    .createSignedUrls(wanted, EVIDENCE_URL_TTL_SECONDS);

  if (error) {
    console.error('[comenzi] signing request photos failed', { message: error.message });
    return urls;
  }
  for (const row of data ?? []) {
    if (row.signedUrl && row.path) urls.set(row.path, row.signedUrl);
  }
  return urls;
}

// ---------------------------------------------------------------------
// The staff screens
// ---------------------------------------------------------------------

export const ADMIN_ORDERS_PAGE_SIZE = 50;

export interface AdminOrderQuery {
  status: OrderStatus | null;
  companyId: string | null;
  disputedOnly: boolean;
  from: string | null;
  to: string | null;
  page: number;
}

export interface AdminOrderRow {
  id: string;
  created_at: string;
  status: OrderStatus;
  agreed_price: number;
  currency: string;
  from_city: string | null;
  to_city: string | null;
  carrier_company_id: string | null;
  carrier_name: string | null;
  client_name: string | null;
  disputed_at: string | null;
  dispute_category: string | null;
  evidence_count: number;
  total_count: number;
}

export async function loadAdminOrders(
  query: AdminOrderQuery,
): Promise<{ rows: AdminOrderRow[]; total: number; error: string | null }> {
  if (!isSupabaseConfigured()) return { rows: [], total: 0, error: null };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_orders', {
    p_status: query.status ?? undefined,
    p_company_id: query.companyId ?? undefined,
    p_disputed_only: query.disputedOnly,
    p_from: query.from === null ? undefined : `${query.from}T00:00:00Z`,
    p_to: query.to === null ? undefined : `${nextDay(query.to)}T00:00:00Z`,
    p_limit: ADMIN_ORDERS_PAGE_SIZE,
    p_offset: (query.page - 1) * ADMIN_ORDERS_PAGE_SIZE,
  });

  if (error) {
    console.error('[admin/transporturi] list failed', { message: error.message });
    return { rows: [], total: 0, error: error.message };
  }
  const rows = ((data ?? []) as AdminOrderRow[]).map((row) => ({
    ...row,
    agreed_price: Number(row.agreed_price),
    total_count: Number(row.total_count),
  }));
  return { rows, total: rows[0]?.total_count ?? 0, error: null };
}

export interface AdminOrderCompany {
  company_id: string;
  company_name: string;
  orders_count: number;
}

export async function loadAdminOrderCompanies(): Promise<AdminOrderCompany[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_order_companies', {});
  if (error) {
    console.error('[admin/transporturi] companies failed', { message: error.message });
    return [];
  }
  return ((data ?? []) as AdminOrderCompany[]).map((row) => ({
    ...row,
    orders_count: Number(row.orders_count),
  }));
}

/** The day after an ISO day, without a timezone anywhere near it. */
function nextDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
