import { buildFaq } from './faq';
import { highlightedPlan } from './plans';
import { loadPricing } from './plans-source';
import { loadVerification } from './trust-source';
import type { FaqGroup } from '@/content/faq';

/**
 * The FAQ's data, from the loaders that already cache it.
 *
 * There is no third query here on purpose: the document rules are the ones
 * /verificare reads, and the price and the trial are the ones /abonamente
 * reads. One definition each, cached once, used by every page that states
 * them — and the plan is whichever one is recommended, not a code written
 * into this file.
 */
export async function loadFaq(): Promise<FaqGroup[]> {
  const [verification, pricing] = await Promise.all([loadVerification(), loadPricing()]);

  return buildFaq({
    requirements: verification.requirements,
    plan: highlightedPlan(pricing.plans, 'carrier'),
    trialDays: pricing.settings.trialDays,
    vatLabel: pricing.settings.vatLabel,
    reviewTimeLabel: verification.reviewTimeLabel,
  });
}
