import 'server-only';
import { createClient } from './supabase/server';
import { isSupabaseConfigured } from './supabase/env';
import type { QuotaState, SavedSearch, SearchActivity } from './saved-searches';

/**
 * What `/cont/alerte` reads.
 *
 * The quota comes from the database rather than being worked out here:
 * `plans.max_saved_searches` is what `save_search` enforces, and a second
 * copy of the arithmetic in the browser is a second answer to the same
 * question.
 */
export interface AlertsData {
  searches: SavedSearch[];
  activity: Map<string, SearchActivity>;
  quota: QuotaState;
  error: string | null;
}

export const NO_ALERTS: AlertsData = {
  searches: [],
  activity: new Map(),
  quota: { used: 0, allowed: null, planName: '' },
  error: null,
};

export async function loadAlerts(userId: string): Promise<AlertsData> {
  if (!isSupabaseConfigured()) return NO_ALERTS;

  const supabase = await createClient();
  const [searches, activity, quota] = await Promise.all([
    supabase
      .from('saved_searches')
      .select(
        'id, name, target, filters, frequency, notify_email, is_active, created_at, last_digest_at, last_notified_at',
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase.rpc('saved_search_activity', { p_days: 7 }),
    supabase.rpc('saved_search_quota', { p_user: userId }),
  ]);

  if (searches.error) {
    console.error('[alerte] query failed', {
      code: searches.error.code,
      message: searches.error.message,
    });
  }

  const quotaRow = Array.isArray(quota.data) ? quota.data[0] : null;

  return {
    searches: (searches.data as SavedSearch[] | null) ?? [],
    activity: new Map(
      ((activity.data as SearchActivity[] | null) ?? []).map((row) => [
        row.saved_search_id,
        row,
      ]),
    ),
    quota: {
      used: quotaRow?.used ?? 0,
      allowed: quotaRow?.allowed ?? null,
      planName: quotaRow?.plan_name ?? '',
    },
    error: searches.error?.message ?? null,
  };
}

export interface SearchMatch {
  id: string;
  created_at: string;
  cargo_listing_id: string;
  reasons: string[];
  detour_km: number | null;
  title: string | null;
}

/** The recent matches of one search, for the detail panel. */
export async function loadMatches(searchId: string, limit = 20): Promise<SearchMatch[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('saved_search_matches')
    .select('id, created_at, cargo_listing_id, reasons, detour_km, cargo_listings(title)')
    .eq('saved_search_id', searchId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[alerte] matches query failed', { message: error.message });
    return [];
  }

  return (data ?? []).map((row) => {
    // PostgREST types an embedded one-to-many as an array even where the
    // foreign key makes it one row. Taking the first is the honest read.
    const embedded = row.cargo_listings as unknown;
    const listing = (Array.isArray(embedded) ? embedded[0] : embedded) as
      | { title: string | null }
      | null
      | undefined;
    return {
      id: row.id,
      created_at: row.created_at,
      cargo_listing_id: row.cargo_listing_id,
      reasons: row.reasons ?? [],
      detour_km: row.detour_km,
      title: listing?.title ?? null,
    };
  });
}
