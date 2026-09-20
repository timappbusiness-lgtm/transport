import { createClient } from './supabase/server';
import { isSupabaseConfigured } from './supabase/env';
import {
  bestRouteDetour,
  matchReasons,
  matchingRequests,
  type CarrierProfile,
  type CarrierRoute,
  type DetourFit,
  type DetourSettings,
  type MatchReason,
} from './matching';
import { loadDetourSettings } from './matching-settings-source';
import type { PublicRequest } from './requests';
import type { Company } from './auth/account';

/**
 * Everything the carrier dashboard needs, read once and in parallel.
 *
 * All of it is the company's own data, so it goes through the session
 * client and RLS decides what comes back — there is no filtering by
 * `company_id` that a mistake here could widen. Nothing is cached: these
 * are the numbers the person is about to act on.
 */

/** Documents inside this window are worth warning about. */
export const EXPIRY_WINDOW_DAYS = 30;

export interface PendingBooking {
  id: string;
  truckListingId: string;
  slots: number;
  /** When the reservation lapses, ISO. */
  expiresAt: string | null;
  fromCity: string;
  toCity: string;
}

export interface CarrierDashboard {
  /** Company documents expiring soon, expired, or rejected. */
  documentsExpiring: number;
  documentsRejected: number;
  /** Blocking company documents never uploaded — the onboarding gap. */
  documentsMissing: number;
  /** Active vehicles, whatever their papers say. */
  vehiclesActive: number;
  /** Active vehicles the nightly sweep has taken off the board. */
  vehiclesBlocked: number;
  pendingBookings: PendingBooking[];
  activeRoutes: number;
  seatsTaken: number;
  seatsTotal: number;
  contactsThisMonth: number;
  /** Requests this carrier's profile and routes say it can do. */
  matches: PublicRequest[];
  /** Why each match was shown, keyed by request id. */
  matchReasons: Record<string, MatchReason[]>;
  /**
   * The detour each match needs, keyed by request id.
   *
   * Absent when no published route could be measured against it, which
   * is not the same as zero — see `bestRouteDetour`.
   */
  detours: Record<string, DetourFit>;
  /**
   * When this snapshot was taken, ISO.
   *
   * Countdowns and relative times are measured against it rather than
   * against the clock at render: reading the clock during render is the
   * unstable result React's purity rule is about, and a reservation's
   * "expiră în 3 ore" should be relative to the data, not to the frame.
   */
  now: string;
}

export const NO_CARRIER_DASHBOARD: CarrierDashboard = {
  documentsExpiring: 0,
  documentsRejected: 0,
  documentsMissing: 0,
  vehiclesActive: 0,
  vehiclesBlocked: 0,
  pendingBookings: [],
  activeRoutes: 0,
  seatsTaken: 0,
  seatsTotal: 0,
  contactsThisMonth: 0,
  matches: [],
  matchReasons: {},
  detours: {},
  now: '1970-01-01T00:00:00.000Z',
};

export async function loadCarrierDashboard(company: Company): Promise<CarrierDashboard> {
  if (!isSupabaseConfigured()) return { ...NO_CARRIER_DASHBOARD, now: new Date().toISOString() };

  const now = new Date().toISOString();
  const supabase = await createClient();
  const monthStart = startOfMonthUtc();
  const horizon = new Date(Date.now() + EXPIRY_WINDOW_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);

  const [documents, vehicles, routes, bookings, contacts] = await Promise.all([
    supabase
      .from('v_company_missing_documents')
      .select('state, valid_until, is_blocking')
      .eq('company_id', company.id),
    supabase
      .from('vehicles')
      .select('id, is_compliant')
      .eq('company_id', company.id)
      .eq('is_active', true),
    supabase
      .from('truck_listings')
      .select(ROUTE_COLUMNS)
      .eq('company_id', company.id)
      .eq('status', 'active'),
    supabase
      .from('departure_bookings')
      .select('id, truck_listing_id, slots, status, expires_at')
      .eq('status', 'reserved')
      .order('expires_at', { ascending: true })
      .limit(10),
    supabase
      .from('contact_reveals')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', company.id)
      .gte('created_at', monthStart),
  ]);

  for (const [label, result] of [
    ['documents', documents],
    ['vehicles', vehicles],
    ['routes', routes],
    ['bookings', bookings],
    ['contacts', contacts],
  ] as const) {
    if (result.error) {
      console.error(`[acasă] ${label} query failed`, {
        code: result.error.code,
        message: result.error.message,
      });
    }
  }

  const documentRows = documents.data ?? [];
  const routeRows = routes.data ?? [];

  // A booking belongs to one of this carrier's routes. RLS already limits
  // the rows, and this keeps a stale one from a deleted listing out.
  const routeIds = new Set(routeRows.map((row) => row.id));
  const pendingBookings: PendingBooking[] = (bookings.data ?? [])
    .filter((row) => routeIds.has(row.truck_listing_id))
    .map((row) => {
      const route = routeRows.find((candidate) => candidate.id === row.truck_listing_id);
      return {
        id: row.id,
        truckListingId: row.truck_listing_id,
        slots: row.slots,
        expiresAt: row.expires_at,
        fromCity: route?.from_city ?? '',
        toCity: route?.to_city ?? '',
      };
    });

  return {
    documentsExpiring: documentRows.filter(
      (row) =>
        row.state === 'expired' ||
        (row.state === 'ok' && row.valid_until !== null && row.valid_until <= horizon),
    ).length,
    documentsRejected: documentRows.filter((row) => row.state === 'rejected').length,
    documentsMissing: documentRows.filter((row) => row.is_blocking && row.state === 'missing')
      .length,
    vehiclesActive: (vehicles.data ?? []).length,
    vehiclesBlocked: (vehicles.data ?? []).filter((row) => !row.is_compliant).length,
    pendingBookings,
    activeRoutes: routeRows.length,
    seatsTaken: pendingBookings.reduce((sum, booking) => sum + booking.slots, 0),
    seatsTotal: routeRows.reduce((sum, row) => sum + (row.platform_slots_total ?? 0), 0),
    contactsThisMonth: contacts.count ?? 0,
    ...(await loadMatches(routeRows, profileOf(company), await loadDetourSettings())),
    now,
  };
}

/** The company row, as matching reads it. */
function profileOf(company: Company): CarrierProfile {
  return {
    companyType: company.company_type,
    coverageScope: company.coverage_scope,
    coverageCounties: company.coverage_counties,
    coverageCountries: company.coverage_countries,
    vehicleTypesAccepted: company.vehicle_types_accepted,
    equipment: company.equipment,
    services: company.services,
  };
}

/**
 * Requests on the corridors this carrier runs.
 *
 * Read through the same public view a visitor reads, because that is all a
 * carrier is entitled to see of somebody else's request until they reveal
 * the contact. The matching itself is in `src/lib/matching.ts`, where it
 * can be argued about in a test.
 */
interface RouteRow {
  from_country: string;
  to_country: string;
  from_city: string;
  to_city: string;
  from_lat: number | null;
  from_lng: number | null;
  to_lat: number | null;
  to_lng: number | null;
  max_detour_km: number | null;
  available_from: string;
  available_to: string | null;
}

async function loadMatches(
  routes: readonly RouteRow[],
  profile: CarrierProfile,
  settings: DetourSettings,
): Promise<{
  matches: PublicRequest[];
  matchReasons: Record<string, MatchReason[]>;
  detours: Record<string, DetourFit>;
}> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('v_requests_public')
    .select('*')
    .order('published_at', { ascending: false })
    .limit(60);

  if (error) {
    console.error('[acasă] matches query failed', { code: error.code, message: error.message });
    return { matches: [], matchReasons: {}, detours: {} };
  }

  const carrierRoutes = toCarrierRoutes(routes);

  const matches = matchingRequests(
    (data ?? []) as PublicRequest[],
    carrierRoutes,
    undefined,
    profile,
    settings,
  );

  const reasons: Record<string, MatchReason[]> = {};
  const detours: Record<string, DetourFit> = {};
  for (const request of matches) {
    reasons[request.id] = matchReasons(request, profile, carrierRoutes);
    const fit = bestRouteDetour(request, carrierRoutes, settings);
    if (fit !== null) detours[request.id] = fit;
  }

  return { matches, matchReasons: reasons, detours };
}

/**
 * `truck_listings` rows as matching reads them.
 *
 * Exported because the board's „potrivite cu firma mea" filter reads the
 * same rows and must reach the same answer: two mappings of the same
 * table are two chances to disagree about what a route is.
 */
export function toCarrierRoutes(routes: readonly RouteRow[]): CarrierRoute[] {
  return routes.map((row) => ({
    fromCountry: row.from_country,
    toCountry: row.to_country,
    availableFrom: row.available_from,
    availableTo: row.available_to,
    from:
      row.from_lat === null || row.from_lng === null
        ? null
        : { lat: row.from_lat, lng: row.from_lng },
    to: row.to_lat === null || row.to_lng === null ? null : { lat: row.to_lat, lng: row.to_lng },
    fromCity: row.from_city,
    toCity: row.to_city,
    maxDetourKm: row.max_detour_km,
  }));
}

export const ROUTE_COLUMNS =
  'id, from_country, to_country, from_city, to_city, from_lat, from_lng, to_lat, to_lng, max_detour_km, available_from, available_to, platform_slots_total';

function startOfMonthUtc(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}
