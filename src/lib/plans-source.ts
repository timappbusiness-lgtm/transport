import { unstable_cache } from 'next/cache';
import { toPlan, type Plan, type PricingSettings } from './plans';
import { createPublicClient } from './supabase/public';
import { isSupabaseConfigured } from './supabase/env';

/**
 * What /abonamente reads, and what the homepage and the FAQ read from the
 * same place.
 *
 * There is one loader for prices rather than one per page: the homepage
 * states the recommended plan's price, the FAQ answers "cât costă
 * abonamentul", and the pricing page lists all of it. Three queries would
 * be three chances for them to disagree.
 */

export const PRICING_TAG = 'pricing';
const REVALIDATE_SECONDS = 300;

export interface Pricing {
  /** Public plans with their public periods, cheapest period first. */
  plans: Plan[];
  settings: PricingSettings;
}

/**
 * The defaults the migration seeds, used only when there is no database to
 * ask. No plans means the pricing page says so and states no price — which
 * is the honest answer when we cannot read one.
 */
export const DEFAULT_PRICING_SETTINGS: PricingSettings = {
  trialDays: 30,
  vatLabel: null,
  manualBilling: true,
  billingContactEmail: null,
};

export const NO_PRICING: Pricing = { plans: [], settings: DEFAULT_PRICING_SETTINGS };

async function fetchPricing(): Promise<Pricing> {
  if (!isSupabaseConfigured()) return NO_PRICING;

  const supabase = createPublicClient();
  const [plans, periods, settings] = await Promise.all([
    supabase
      .from('plans')
      .select('*')
      .eq('is_public', true)
      .not('audience', 'is', null)
      .order('sort_order', { ascending: true }),
    // RLS already hides a period whose plan is not public, so this needs no
    // join: what comes back is what a visitor may be shown.
    supabase.from('plan_billing_periods').select('*').eq('is_public', true),
    supabase.from('pricing_settings').select('*').maybeSingle(),
  ]);

  for (const [label, result] of [
    ['plans', plans],
    ['periods', periods],
    ['settings', settings],
  ] as const) {
    if (result.error) {
      console.error(`[abonamente] ${label} query failed`, {
        code: result.error.code,
        message: result.error.message,
      });
    }
  }

  return {
    plans: (plans.data ?? []).map((plan) => toPlan(plan, periods.data ?? [])),
    settings: settings.data
      ? {
          trialDays: settings.data.trial_days,
          vatLabel: settings.data.vat_label,
          manualBilling: settings.data.manual_billing,
          billingContactEmail: settings.data.billing_contact_email,
        }
      : DEFAULT_PRICING_SETTINGS,
  };
}

export const loadPricing = unstable_cache(fetchPricing, [PRICING_TAG], {
  revalidate: REVALIDATE_SECONDS,
  tags: [PRICING_TAG],
});
