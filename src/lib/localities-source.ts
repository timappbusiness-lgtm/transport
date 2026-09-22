import 'server-only';
import type { Locality } from './localities';
import { SUGGESTION_LIMIT, shouldSearch } from './localities';
import { isSupabaseConfigured } from './supabase/env';
import { createClient } from './supabase/server';

/**
 * What the locality picker reads.
 *
 * All three go through functions that decide for themselves who is
 * asking. `search_localities` is open without an account — the gazetteer
 * is a public nomenclature, and the request form opens without one —
 * while `remember_locality` and `report_missing_locality` start from
 * `auth.uid()` and refuse a visitor.
 */

export async function searchLocalities(
  query: string,
  near: { lat: number; lng: number } | null = null,
  limit: number = SUGGESTION_LIMIT,
): Promise<Locality[]> {
  if (!isSupabaseConfigured() || !shouldSearch(query)) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('search_localities', {
    p_query: query.trim(),
    p_near_lat: near?.lat ?? undefined,
    p_near_lng: near?.lng ?? undefined,
    p_limit: limit,
  });

  if (error) {
    console.error('[localitati] search failed', { code: error.code, message: error.message });
    return [];
  }
  return (data ?? []) as Locality[];
}

/**
 * Remembers that this person chose this locality.
 *
 * Never awaited by a form: the ranking is a convenience and a failed
 * write must not fail a publish.
 */
export async function rememberLocality(localityId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc('remember_locality', { p_locality_id: localityId });
  if (error) console.error('[localitati] remember failed', error.message);
}

/**
 * „Nu găsim localitatea?" — stores what the person typed and raises a
 * flag for the team. Without it, somebody from a village that is not in
 * the gazetteer cannot publish at all.
 */
export async function reportMissingLocality(
  typed: string,
  country: string,
  listingId: string | null,
): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('report_missing_locality', {
    p_typed: typed,
    p_country: country,
    p_listing_id: listingId ?? undefined,
  });
  if (error) {
    console.error('[localitati] report failed', { code: error.code, message: error.message });
    return null;
  }
  return (data as string | null) ?? null;
}
