import { buildFaq } from './faq';
import { loadHomepageDirectory } from './directory-source';
import { loadVerification } from './trust-source';
import type { FaqGroup } from '@/content/faq';

/**
 * The FAQ's data, from the loaders that already cache it.
 *
 * There is no third query here on purpose: the document rules are the ones
 * /verificare reads, and the price and the trial are the ones the homepage
 * reads. One definition each, cached once, used by every page that states
 * them.
 */
export async function loadFaq(): Promise<FaqGroup[]> {
  const [verification, directory] = await Promise.all([loadVerification(), loadHomepageDirectory()]);

  return buildFaq({
    requirements: verification.requirements,
    plan: directory.plan,
    trialDays: directory.thresholds.trialDays,
    reviewTimeLabel: verification.reviewTimeLabel,
  });
}
