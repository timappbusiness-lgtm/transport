import 'server-only';
import { DEFAULT_DETOUR_SETTINGS, type DetourSettings } from './matching';
import { createClient } from './supabase/server';
import { isSupabaseConfigured } from './supabase/env';

/**
 * The two dials the detour needs, read once per page.
 *
 * `matching_settings.default_detour_km` is what a route that never named
 * a tolerance gets; `price_settings.road_distance_factor` turns
 * straight-line kilometres into the road kilometres a dispatcher was
 * thinking of when they typed one. Both tables are readable by anyone —
 * the numbers are printed on screen next to the decision they explain,
 * and a rule the interface cannot name is a rule people distrust.
 *
 * A failed read falls back to `DEFAULT_DETOUR_SETTINGS` rather than
 * throwing: the dashboard is worth more with a slightly stale default
 * than not at all, and the values it falls back to are the column
 * defaults the database ships with.
 */
export async function loadDetourSettings(): Promise<DetourSettings> {
  if (!isSupabaseConfigured()) return DEFAULT_DETOUR_SETTINGS;

  const supabase = await createClient();
  const [matching, prices] = await Promise.all([
    supabase.from('matching_settings').select('default_detour_km').maybeSingle(),
    supabase.from('price_settings').select('road_distance_factor').maybeSingle(),
  ]);

  if (matching.error || prices.error) {
    console.error('[potrivire] settings query failed', {
      matching: matching.error?.message,
      prices: prices.error?.message,
    });
  }

  return {
    defaultDetourKm:
      matching.data?.default_detour_km ?? DEFAULT_DETOUR_SETTINGS.defaultDetourKm,
    roadFactor:
      prices.data === null || prices.data === undefined
        ? DEFAULT_DETOUR_SETTINGS.roadFactor
        : Number(prices.data.road_distance_factor),
  };
}
