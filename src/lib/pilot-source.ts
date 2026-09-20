import 'server-only';
import { createClient } from './supabase/server';
import { isSupabaseConfigured } from './supabase/env';
import type { PilotOverview, PilotWeek } from './pilot';

/**
 * What `/admin/pilot` reads.
 *
 * Both functions refuse a non-staff caller in the database rather than
 * trusting this file to have checked, and both exclude accounts marked
 * `is_test`. A pilot measured on our own seeded firms is a pilot nobody
 * has run.
 */
export interface PilotData {
  overview: PilotOverview | null;
  weeks: PilotWeek[];
  error: string | null;
}

export const NO_PILOT: PilotData = { overview: null, weeks: [], error: null };

export async function loadPilot(from: string, to: string): Promise<PilotData> {
  if (!isSupabaseConfigured()) return NO_PILOT;

  const supabase = await createClient();
  const [overview, weeks] = await Promise.all([
    supabase.rpc('pilot_overview', { p_from: from, p_to: to }),
    supabase.rpc('pilot_weekly_activity', { p_from: from, p_to: to }),
  ]);

  if (overview.error) {
    console.error('[pilot] overview failed', {
      code: overview.error.code,
      message: overview.error.message,
    });
  }

  const row = Array.isArray(overview.data) ? (overview.data[0] as PilotOverview) : null;

  return {
    overview: row ?? null,
    weeks: (weeks.data as PilotWeek[] | null) ?? [],
    error: overview.error?.message ?? weeks.error?.message ?? null,
  };
}
