'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { ROUTES } from '@/config/routes';
import { adminDirectoryCopy } from '@/content/admin-directory';
import { getAccountContext } from '@/lib/auth/account';
import { toAppError } from '@/lib/errors';
import { DIRECTORY_TAG } from '@/lib/directory-source';
import { createClient } from '@/lib/supabase/server';

/**
 * The price a carrier reads on the homepage.
 *
 * `plans` lost its update policy in migration 20260917150000, so `set_plan`
 * is the only way in and every change leaves a row in `audit_log`. The
 * features here are display text: the limits the platform actually enforces
 * are separate columns, and changing this list does not change them.
 */
const c = adminDirectoryCopy.plans;

export interface PlanActionState {
  error?: string;
  notice?: string;
  fieldErrors?: Record<string, string>;
}

export async function setPlanAction(
  _previous: PlanActionState,
  formData: FormData,
): Promise<PlanActionState> {
  const context = await getAccountContext();
  if (!context?.isStaff) return { error: c.noAccess };

  const code = String(formData.get('code') ?? '').trim();
  const price = Number(String(formData.get('price_ron_month') ?? '').trim());
  if (code === '') return { error: c.noAccess };
  if (!Number.isFinite(price) || price < 0) {
    return { fieldErrors: { price_ron_month: c.invalidPrice } };
  }

  // One feature per line, blanks dropped: an empty line in a textarea is a
  // stray keystroke, not a bullet point.
  const features = String(formData.get('display_features') ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

  const supabase = await createClient();
  const { error } = await supabase.rpc('set_plan', {
    p_code: code,
    p_price_ron_month: price,
    p_is_public: formData.get('is_public') === 'on',
    p_display_features: features,
  });

  if (error) return { error: toAppError(error, 'admin.setPlan').message };

  updateTag(DIRECTORY_TAG);
  revalidatePath(ROUTES.home);
  revalidatePath(ROUTES.faq);
  revalidatePath(ROUTES.adminPlans);

  return { notice: c.saved };
}
