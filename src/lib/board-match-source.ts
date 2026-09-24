import 'server-only';
import { cache } from 'react';
import type { AccountContext, Company } from './auth/account';
import { ROUTE_COLUMNS, toCarrierRoutes } from './dashboard-source';
import {
  bestRouteDetour,
  carries,
  detourOk,
  type CarrierProfile,
  type CarrierRoute,
  type DetourFit,
} from './matching';
import { loadDetourSettings } from './matching-settings-source';
import { newSince } from './board-news';
import type { PublicRequest } from './requests';
import { isSupabaseConfigured } from './supabase/env';
import { createClient } from './supabase/server';

/**
 * The board narrowed to what one firm can actually do, and what is new
 * on it since the carrier last looked.
 *
 * One place for both, because the board's „Potrivite cu firma mea", the
 * badge in the header and the line „12 cereri noi de la ultima vizită"
 * are three readings of one rule. Written three times, they would
 * disagree the first time one of them changed.
 */

/** A firm that carries, and so has a board of work it can take. */
export function boardIsTheirs(company: Company | null): company is Company {
  return company !== null && company.company_type !== 'expeditie';
}

/**
 * Two rules, both from `src/lib/matching.ts`: `carries()` for coverage,
 * categories and equipment, and the detour for how far off the firm's
 * own published routes each request sits. A firm with no measurable
 * route keeps every request `carries()` allowed — unmeasured is not the
 * same as unsuitable.
 */
export async function onlyForCompany(
  requests: readonly PublicRequest[],
  company: Company,
): Promise<{ requests: PublicRequest[]; detours: Record<string, DetourFit> }> {
  const [routes, settings] = await Promise.all([loadCompanyRoutes(company.id), loadDetourSettings()]);
  const profile = profileOf(company);

  const kept = requests.filter(
    (request) => carries(request, profile) && detourOk(request, routes, settings),
  );

  const detours: Record<string, DetourFit> = {};
  for (const request of kept) {
    const fit = bestRouteDetour(request, routes, settings);
    if (fit !== null) detours[request.id] = fit;
  }

  return { requests: kept, detours };
}

export function profileOf(company: Company): CarrierProfile {
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

const loadCompanyRoutes = cache(async (companyId: string): Promise<CarrierRoute[]> => {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('truck_listings')
    .select(ROUTE_COLUMNS)
    .eq('company_id', companyId)
    .eq('status', 'active');

  if (error) {
    console.error('[cereri] routes query failed', { message: error.message });
    return [];
  }
  return toCarrierRoutes(data ?? []);
});

/**
 * How many rows the count looks at. The same window the board scans when
 * it narrows to a firm: a count bigger than this would be a number the
 * board itself could not show.
 */
export const NEW_SCAN_LIMIT = 200;

/**
 * Requests this carrier can take, published since they last opened the
 * board.
 *
 * „Last opened" is `profiles.last_seen_at`, which the board writes when a
 * carrier opens it (`markBoardSeenAction`). Somebody who has never
 * opened it has no „since" and gets no number: a count of every request
 * ever published is not news.
 *
 * Real rows only, read under the same RLS as the board: `v_requests_public`
 * is what a visitor sees, and nothing here adds a rule about who sees
 * what. A failure is zero, never a thrown error — the badge decorates a
 * menu that works without it.
 *
 * Read once per request, so the header and the board say the same number.
 */
export const loadNewRequestCount = cache(async (context: AccountContext | null): Promise<number> => {
  if (!isSupabaseConfigured() || context === null) return 0;
  if (context.activeRole === 'driver') return 0;
  const company = context.activeCompany;
  if (!boardIsTheirs(company)) return 0;
  const since = context.profile?.last_seen_at ?? null;
  if (since === null) return 0;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('v_requests_public')
    .select('*')
    .gt('published_at', since)
    .order('published_at', { ascending: false })
    .limit(NEW_SCAN_LIMIT);

  if (error) {
    console.error('[cereri] new since last visit failed', { message: error.message });
    return 0;
  }

  const rows = newSince((data ?? []) as PublicRequest[], since);
  if (rows.length === 0) return 0;
  const mine = await onlyForCompany(rows, company);
  return mine.requests.length;
});
