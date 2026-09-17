import { unstable_cache } from 'next/cache';
import type { PublicRequirement } from './trust';
import { createPublicClient } from './supabase/public';
import { isSupabaseConfigured } from './supabase/env';

/**
 * What /verificare reads.
 *
 * The document rules change a few times a year, so they are cached for
 * longer than the homepage's activity — but they are still read rather than
 * written into the page, because a page that describes rules from memory
 * drifts away from the rules.
 */

export const VERIFICATION_TAG = 'verification-rules';
const REVALIDATE_SECONDS = 300;

export interface VerificationData {
  requirements: PublicRequirement[];
  /** What we say about how long review takes. null hides the question. */
  reviewTimeLabel: string | null;
}

export const NO_VERIFICATION: VerificationData = {
  requirements: [],
  reviewTimeLabel: null,
};

async function fetchVerification(): Promise<VerificationData> {
  if (!isSupabaseConfigured()) return NO_VERIFICATION;

  const supabase = createPublicClient();
  const [requirements, settings] = await Promise.all([
    supabase.from('v_document_requirements_public').select('*'),
    supabase.from('homepage_settings').select('review_time_label').maybeSingle(),
  ]);

  for (const [label, result] of [
    ['requirements', requirements],
    ['settings', settings],
  ] as const) {
    if (result.error) {
      console.error(`[verificare] ${label} query failed`, {
        code: result.error.code,
        message: result.error.message,
      });
    }
  }

  return {
    requirements: (requirements.data ?? []) as PublicRequirement[],
    reviewTimeLabel: settings.data?.review_time_label ?? null,
  };
}

export const loadVerification = unstable_cache(fetchVerification, [VERIFICATION_TAG], {
  revalidate: REVALIDATE_SECONDS,
  tags: [VERIFICATION_TAG],
});
