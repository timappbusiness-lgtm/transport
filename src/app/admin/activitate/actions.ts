'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { ROUTES } from '@/config/routes';
import { activityAdminCopy } from '@/content/activitate';
import { getAccountContext } from '@/lib/auth/account';
import { toAppError } from '@/lib/errors';
import { ACTIVITY_TAG } from '@/lib/requests-source';
import { createClient } from '@/lib/supabase/server';

/**
 * Moving the two thresholds.
 *
 * `set_homepage_settings` is SECURITY DEFINER, checks staff membership
 * itself and writes the before/after pair to `audit_log`. There is no table
 * grant that would let this action write the row directly, so the check
 * below is a courtesy that produces a better message — not the rule.
 */
const c = activityAdminCopy;

export interface ThresholdActionState {
  error?: string;
  notice?: string;
  fieldErrors?: Record<string, string>;
}

function whole(formData: FormData, name: string): number | null {
  const raw = String(formData.get(name) ?? '').trim();
  if (raw === '') return null;
  const value = Number(raw);
  return Number.isInteger(value) ? value : null;
}

export async function setThresholdsAction(
  _prev: ThresholdActionState,
  formData: FormData,
): Promise<ThresholdActionState> {
  const context = await getAccountContext();
  if (!context?.isStaff) return { error: c.noAccess };

  const statsMin = whole(formData, 'stats_min_requests');
  const feedMin = whole(formData, 'feed_min_requests');

  const fieldErrors: Record<string, string> = {};
  if (statsMin === null || statsMin < 0 || statsMin > 100_000) {
    fieldErrors.stats_min_requests = c.invalidStats;
  }
  if (feedMin === null || feedMin < 1 || feedMin > 1000) {
    fieldErrors.feed_min_requests = c.invalidFeed;
  }
  if (statsMin === null || feedMin === null || Object.keys(fieldErrors).length > 0) {
    return { fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('set_homepage_settings', {
    p_stats_min_requests: statsMin,
    p_feed_min_requests: feedMin,
  });

  if (error) return { error: toAppError(error, 'admin.setHomepageSettings').message };

  // The homepage reads through a one-minute cache. `updateTag` rather than
  // `revalidateTag`: from a server action it expires the entry immediately,
  // so the person who just pressed Save sees the change on the next page
  // view instead of up to a minute later.
  updateTag(ACTIVITY_TAG);
  revalidatePath(ROUTES.home);
  revalidatePath(ROUTES.adminActivity);

  return { notice: c.saved };
}
