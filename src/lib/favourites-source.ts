import 'server-only';
import { createClient } from './supabase/server';
import { isSupabaseConfigured } from './supabase/env';

export interface FavouriteCarrier {
  carrier_company_id: string;
  name: string;
  slug: string | null;
  city: string | null;
  county: string | null;
  rating_avg: number | null;
  rating_count: number;
  note: string | null;
  created_at: string;
}

/**
 * Favoriții firmei.
 *
 * `my_favourite_carriers()` verifică singură apartenența, deci nu se
 * adaugă niciun filtru aici.
 */
export async function loadFavourites(companyId: string): Promise<FavouriteCarrier[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('my_favourite_carriers', {
    p_company_id: companyId,
  });
  if (error) {
    console.error('[favoriti]', error.message);
    return [];
  }
  return (data ?? []) as FavouriteCarrier[];
}

/** Doar id-urile, pentru filtrul de pe oferte. */
export async function loadFavouriteIds(companyId: string): Promise<Set<string>> {
  const rows = await loadFavourites(companyId);
  return new Set(rows.map((row) => row.carrier_company_id));
}
