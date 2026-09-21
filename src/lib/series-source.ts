import 'server-only';
import type { RecurrenceKind } from './recurrence';
import { createClient } from './supabase/server';
import { isSupabaseConfigured } from './supabase/env';

/**
 * Seriile firmei, și ce urmează din ele.
 *
 * `route_series` se citește prin politica proprie — numai firma ei o
 * vede — deci aici nu se adaugă niciun filtru. Datele următoare vin din
 * `route_series_upcoming()`, adică din aceeași funcție pe care o
 * folosește jobul, nu dintr-o a doua socoteală.
 */

export interface SeriesRow {
  id: string;
  created_at: string;
  vehicle_id: string;
  direction: 'tur' | 'retur';
  from_city: string;
  to_city: string;
  kind: RecurrenceKind;
  weekdays: number[];
  every_n_days: number | null;
  starts_on: string;
  ends_on: string;
  is_paused: boolean;
  paused_reason: string | null;
  generated_through: string | null;
  ended_at: string | null;
  plate_number: string | null;
  /** Câte plecări a scris deja. */
  published: number;
}

export async function loadSeries(companyId: string): Promise<SeriesRow[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();

  const [series, counts, vehicles] = await Promise.all([
    supabase
      .from('route_series')
      .select(
        'id, created_at, vehicle_id, direction, from_city, to_city, kind, weekdays, every_n_days, starts_on, ends_on, is_paused, paused_reason, generated_through, ended_at',
      )
      .eq('company_id', companyId)
      .order('created_at', { ascending: false }),
    supabase
      .from('truck_listings')
      .select('series_id')
      .eq('company_id', companyId)
      .not('series_id', 'is', null),
    supabase.from('vehicles').select('id, plate_number').eq('company_id', companyId),
  ]);

  if (series.error) {
    console.error('[trasee:serii]', series.error.message);
    return [];
  }

  const plates = new Map(
    ((vehicles.data ?? []) as { id: string; plate_number: string }[]).map((v) => [
      v.id,
      v.plate_number,
    ]),
  );

  const published = new Map<string, number>();
  for (const row of (counts.data ?? []) as { series_id: string }[]) {
    published.set(row.series_id, (published.get(row.series_id) ?? 0) + 1);
  }

  return ((series.data ?? []) as Omit<SeriesRow, 'plate_number' | 'published'>[]).map(
    (row) => ({
      ...row,
      plate_number: plates.get(row.vehicle_id) ?? null,
      published: published.get(row.id) ?? 0,
    }),
  );
}

/** Următoarele date ale unei serii, din aceeași funcție pe care o cheamă jobul. */
export async function loadUpcoming(seriesId: string, limit = 5): Promise<string[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('route_series_upcoming', {
    p_series_id: seriesId,
    p_limit: limit,
  });
  if (error) return [];
  return (data ?? []) as string[];
}
