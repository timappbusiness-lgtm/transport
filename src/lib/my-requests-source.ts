import type { AccountContext } from './auth/account';
import type { CargoCategory, ServiceType } from './departures';
import { byBoardThenAge, type MyRequest } from './my-requests';
import type { ListingStatus } from './requests';
import { createClient } from './supabase/server';
import { isSupabaseConfigured } from './supabase/env';

/**
 * Reading the client's own requests.
 *
 * `cargo_listings`'s select policy lets any signed-in person read an active
 * listing — that is what the board is built on — so "mine" has to be said
 * explicitly here rather than left to RLS. Which "mine" depends on the
 * context the person is in: a firm's requests when a firm is selected, and
 * their own when none is, the same rule the fleet and the documents follow.
 */

interface Row {
  id: string;
  status: ListingStatus;
  loading_city: string;
  loading_country: string;
  unloading_city: string;
  unloading_country: string;
  loading_from: string;
  loading_to: string | null;
  service_type: ServiceType;
  published_at: string | null;
  created_at: string;
  cargo_vehicle_details:
    | {
        category: CargoCategory;
        make: string | null;
        model: string | null;
        year: number | null;
        is_running: boolean;
        needs_winch: boolean;
      }
    | {
        category: CargoCategory;
        make: string | null;
        model: string | null;
        year: number | null;
        is_running: boolean;
        needs_winch: boolean;
      }[]
    | null;
}

const COLUMNS =
  'id, status, loading_city, loading_country, unloading_city, unloading_country, loading_from, loading_to, service_type, published_at, created_at, cargo_vehicle_details(category, make, model, year, is_running, needs_winch)' as const;

export async function loadMyRequests(context: AccountContext): Promise<MyRequest[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  let query = supabase
    .from('cargo_listings')
    .select(COLUMNS)
    .eq('listing_kind', 'vehicul')
    .order('created_at', { ascending: false })
    .limit(100);

  const company = context.activeCompany;
  query = company ? query.eq('company_id', company.id) : query.eq('posted_by', context.user.id);

  const { data, error } = await query;
  if (error) {
    console.error('[cont/cereri] query failed', { code: error.code, message: error.message });
    return [];
  }

  const rows = (data ?? []) as unknown as Row[];
  return rows
    .map(toRequest)
    .filter((request): request is MyRequest => request !== null)
    .sort(byBoardThenAge);
}

function toRequest(row: Row): MyRequest | null {
  const vehicle = Array.isArray(row.cargo_vehicle_details)
    ? row.cargo_vehicle_details[0]
    : row.cargo_vehicle_details;
  // A vehicle request with no vehicle details cannot exist:
  // `guard_cargo_details_present` refuses to publish one and
  // `create_cargo_request` writes both in the same transaction.
  if (!vehicle) return null;

  return {
    id: row.id,
    status: row.status,
    fromCity: row.loading_city,
    fromCountry: row.loading_country,
    toCity: row.unloading_city,
    toCountry: row.unloading_country,
    loadingFrom: row.loading_from,
    loadingTo: row.loading_to,
    category: vehicle.category,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    isRunning: vehicle.is_running,
    needsWinch: vehicle.needs_winch,
    serviceType: row.service_type,
    publishedAt: row.published_at,
    createdAt: row.created_at,
  };
}
