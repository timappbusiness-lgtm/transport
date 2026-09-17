import { unstable_cache } from 'next/cache';
import {
  FEED_LIMIT,
  type ActivityStats,
  type ActivityThresholds,
  type PublicRequest,
} from './requests';
import { createPublicClient } from './supabase/public';
import { isSupabaseConfigured } from './supabase/env';

/**
 * What the homepage asks the database, and how often.
 *
 * Everything here is the same for every visitor, so it is read with the
 * sessionless client and cached for a minute. Without that, a homepage
 * under load would run the aggregate scan once per visitor; with it, once
 * per minute, and the section stays cheap enough not to cost the page its
 * Lighthouse score.
 */

export const ACTIVITY_REVALIDATE_SECONDS = 60;

export interface HomepageActivity {
  /** null when there is no database configured, or the query failed. */
  stats: ActivityStats | null;
  thresholds: ActivityThresholds;
  requests: PublicRequest[];
}

/**
 * The defaults the migration seeds. Used only when there is no database to
 * ask — a checkout with no Supabase renders the empty state, which is the
 * honest answer to "how busy is it" when we cannot tell.
 */
export const DEFAULT_THRESHOLDS: ActivityThresholds = {
  statsMinRequests: 50,
  feedMinRequests: 6,
};

export const NO_ACTIVITY: HomepageActivity = {
  stats: null,
  thresholds: DEFAULT_THRESHOLDS,
  requests: [],
};

async function fetchActivity(): Promise<HomepageActivity> {
  if (!isSupabaseConfigured()) return NO_ACTIVITY;

  const supabase = createPublicClient();
  const [activity, settings, requests] = await Promise.all([
    supabase.rpc('homepage_activity'),
    supabase.from('homepage_settings').select('*').maybeSingle(),
    supabase
      .from('v_requests_public')
      .select('*')
      .order('published_at', { ascending: false })
      .limit(FEED_LIMIT),
  ]);

  for (const [label, result] of [
    ['activity', activity],
    ['settings', settings],
    ['requests', requests],
  ] as const) {
    if (result.error) {
      console.error(`[acasă] ${label} query failed`, {
        code: result.error.code,
        message: result.error.message,
      });
    }
  }

  const row = Array.isArray(activity.data) ? activity.data[0] : activity.data;

  return {
    stats: row ? toStats(row) : null,
    thresholds: settings.data
      ? {
          statsMinRequests: settings.data.stats_min_requests,
          feedMinRequests: settings.data.feed_min_requests,
        }
      : DEFAULT_THRESHOLDS,
    requests: (requests.data ?? []) as PublicRequest[],
  };
}

/**
 * Cached across requests, not merely deduplicated within one. The tag lets
 * the staff screen drop it the moment a threshold moves, so a change is
 * visible immediately rather than up to a minute later.
 */
export const ACTIVITY_TAG = 'homepage-activity';

export const loadHomepageActivity = unstable_cache(fetchActivity, [ACTIVITY_TAG], {
  revalidate: ACTIVITY_REVALIDATE_SECONDS,
  tags: [ACTIVITY_TAG],
});

interface ActivityRow {
  published_total: number | null;
  published_last_7d: number | null;
  total_km: number | null;
  active_total: number | null;
  daily_counts: number[] | null;
  daily_from: string | null;
}

/**
 * `bigint` comes back from PostgREST as a number when it fits and as a
 * string when it does not, so the total is coerced once here rather than
 * trusted in a component.
 */
function toStats(row: ActivityRow): ActivityStats {
  return {
    publishedTotal: Number(row.published_total ?? 0),
    publishedLast7d: Number(row.published_last_7d ?? 0),
    totalKm: Number(row.total_km ?? 0),
    activeTotal: Number(row.active_total ?? 0),
    daily: (row.daily_counts ?? []).map((n) => Number(n) || 0),
    dailyFrom: row.daily_from ?? '',
  };
}
