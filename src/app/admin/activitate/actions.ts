'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { ROUTES } from '@/config/routes';
import { activityAdminCopy } from '@/content/activitate';
import { getAccountContext, redirectToSignIn } from '@/lib/auth/account';
import { toAppError } from '@/lib/errors';
import { ACTIVITY_TAG } from '@/lib/requests-source';
import { VERIFICATION_TAG } from '@/lib/trust-source';
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
  if (!context) return redirectToSignIn(ROUTES.admin);
  if (!context.isStaff) return { error: c.noAccess };

  const statsMin = whole(formData, 'stats_min_requests');
  const feedMin = whole(formData, 'feed_min_requests');
  const companiesMin = whole(formData, 'verified_companies_min');
  const reviewTime = String(formData.get('review_time_label') ?? '').trim();

  const fieldErrors: Record<string, string> = {};
  if (statsMin === null || statsMin < 0 || statsMin > 100_000) {
    fieldErrors.stats_min_requests = c.invalidStats;
  }
  if (feedMin === null || feedMin < 1 || feedMin > 1000) {
    fieldErrors.feed_min_requests = c.invalidFeed;
  }
  if (companiesMin === null || companiesMin < 1 || companiesMin > 100_000) {
    fieldErrors.verified_companies_min = c.invalidCompanies;
  }
  if (
    statsMin === null ||
    feedMin === null ||
    companiesMin === null ||
    Object.keys(fieldErrors).length > 0
  ) {
    return { fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('set_homepage_settings', {
    p_stats_min_requests: statsMin,
    p_feed_min_requests: feedMin,
    p_verified_companies_min: companiesMin,
    // The database trims it and turns an empty string into null, which is
    // what hides the question on /verificare.
    p_review_time_label: reviewTime,
  });

  if (error) return { error: toAppError(error, 'admin.setHomepageSettings').message };

  // The homepage reads through a one-minute cache. `updateTag` rather than
  // `revalidateTag`: from a server action it expires the entry immediately,
  // so the person who just pressed Save sees the change on the next page
  // view instead of up to a minute later.
  updateTag(ACTIVITY_TAG);
  updateTag(VERIFICATION_TAG);
  revalidatePath(ROUTES.home);
  revalidatePath(ROUTES.adminActivity);
  revalidatePath(ROUTES.verification);

  return { notice: c.saved };
}

/**
 * The two matching dials.
 *
 * `default_detour_km` is the tolerance a published route gets when it
 * never named one — `truck_listings.max_detour_km` carries a default of
 * 50, but a column default applies at insert and says nothing about the
 * rows written before it. `category_window_days` is the window the
 * homepage counters cover, and the number printed under them.
 *
 * `set_matching_settings` is SECURITY DEFINER, checks staff itself and
 * writes the before/after pair to `audit_log`. The checks below only
 * produce a better message than a constraint violation would.
 */
export async function setMatchingSettingsAction(
  _prev: ThresholdActionState,
  formData: FormData,
): Promise<ThresholdActionState> {
  const context = await getAccountContext();
  if (!context) return redirectToSignIn(ROUTES.admin);
  if (!context.isStaff) return { error: c.noAccess };

  const detour = whole(formData, 'default_detour_km');
  const window = whole(formData, 'category_window_days');

  const fieldErrors: Record<string, string> = {};
  if (detour === null || detour < 0 || detour > 500) {
    fieldErrors.default_detour_km = c.matching.invalidDetour;
  }
  if (window === null || window < 7 || window > 365) {
    fieldErrors.category_window_days = c.matching.invalidWindow;
  }
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.rpc('set_matching_settings', {
    p_default_detour_km: detour,
    p_category_window_days: window,
  });

  if (error) return { error: toAppError(error, 'matching.settings').message };

  // The category counters ride on the cached homepage payload, so the
  // tag has to drop or a new window is invisible for up to a minute.
  updateTag(ACTIVITY_TAG);
  revalidatePath(ROUTES.adminActivity);
  revalidatePath(ROUTES.home);
  return { notice: c.matching.saved };
}
