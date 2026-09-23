'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { ROUTES } from '@/config/routes';
import { adminDirectoryCopy } from '@/content/admin-directory';
import { getAccountContext, redirectToSignIn } from '@/lib/auth/account';
import { toAppError } from '@/lib/errors';
import { featuresFromText, type PlanAudience } from '@/lib/plans';
import { PRICING_TAG } from '@/lib/plans-source';
import { createClient } from '@/lib/supabase/server';

/**
 * The prices a carrier reads on the homepage and on /abonamente.
 *
 * `plans` lost its update policy in migration 20260917150000 and
 * `plan_billing_periods` never had one, so the audited RPCs are the only
 * way in and every change leaves a row in `audit_log`. The features here
 * are display text: the limits the platform actually enforces are separate
 * columns, and editing this list does not change them.
 */
const c = adminDirectoryCopy.plans;
const s = adminDirectoryCopy.pricing;

export interface PlanActionState {
  error?: string;
  notice?: string;
  fieldErrors?: Record<string, string>;
}

function refresh(): void {
  updateTag(PRICING_TAG);
  revalidatePath(ROUTES.home);
  revalidatePath(ROUTES.plans);
  revalidatePath(ROUTES.faq);
  revalidatePath(ROUTES.adminPlans);
}

function audienceOf(value: FormDataEntryValue | null): PlanAudience | null {
  return value === 'carrier' || value === 'forwarder' ? value : null;
}

export async function setPlanAction(
  _previous: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const context = await getAccountContext();
  if (!context) return redirectToSignIn(ROUTES.admin);
  if (!context.isStaff) return { error: c.noAccess };

  const code = String(formData.get('code') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  const price = Number(String(formData.get('price_ron_month') ?? '').trim());
  if (code === '') return { error: c.noAccess };
  if (!Number.isFinite(price) || price < 0) {
    return { fieldErrors: { price_ron_month: c.invalidPrice } };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('set_plan', {
    p_code: code,
    p_name: name,
    p_short_description: String(formData.get('short_description') ?? '').trim(),
    p_audience: audienceOf(formData.get('audience')),
    p_price_ron_month: price,
    p_is_public: formData.get('is_public') === 'on',
    p_highlight: formData.get('highlight') === 'on',
    p_features: featuresFromText(String(formData.get('features') ?? '')),
  });

  if (error) return { error: toAppError(error, 'admin.setPlan').message };

  refresh();
  return { notice: c.saved };
}

export async function setPlanPeriodAction(
  _previous: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const context = await getAccountContext();
  if (!context) return redirectToSignIn(ROUTES.admin);
  if (!context.isStaff) return { error: c.noAccess };

  const code = String(formData.get('code') ?? '').trim();
  const months = Number(String(formData.get('months') ?? '').trim());
  const total = Number(String(formData.get('total_price_ron') ?? '').trim());
  if (code === '') return { error: c.noAccess };
  if (!Number.isFinite(total) || total < 0) {
    return { fieldErrors: { total_price_ron: c.invalidPeriod } };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('set_plan_period', {
    p_code: code,
    p_months: months,
    p_total_price_ron: total,
    p_is_public: formData.get('is_public') === 'on',
  });

  if (error) return { error: toAppError(error, 'admin.setPlanPeriod').message };

  refresh();
  return { notice: c.periodSaved };
}

export async function setPricingSettingsAction(
  _previous: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const context = await getAccountContext();
  if (!context) return redirectToSignIn(ROUTES.admin);
  if (!context.isStaff) return { error: s.noAccess };

  const trialDays = Number(String(formData.get('trial_days') ?? '').trim());
  if (!Number.isInteger(trialDays) || trialDays < 0 || trialDays > 365) {
    return { fieldErrors: { trial_days: s.invalidTrial } };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('set_pricing_settings', {
    p_trial_days: trialDays,
    p_vat_label: String(formData.get('vat_label') ?? '').trim(),
    p_manual_billing: formData.get('manual_billing') === 'on',
    p_billing_contact_email: String(formData.get('billing_contact_email') ?? '').trim(),
  });

  if (error) return { error: toAppError(error, 'admin.setPricingSettings').message };

  refresh();
  revalidatePath(ROUTES.adminSettings);
  return { notice: s.saved };
}
