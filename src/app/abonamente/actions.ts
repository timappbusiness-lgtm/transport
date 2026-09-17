'use server';

import { revalidatePath } from 'next/cache';
import { ROUTES } from '@/config/routes';
import { plansCopy } from '@/content/plans';
import { getAccountContext } from '@/lib/auth/account';
import { toAppError } from '@/lib/errors';
import { BILLING_MONTHS } from '@/lib/plans';
import { createClient } from '@/lib/supabase/server';

/**
 * Asking for a plan.
 *
 * This charges nothing. `request_subscription` checks that the caller
 * manages the company, that the plan and the period are on sale, and that
 * there is no request already open — then writes the row and queues two
 * e-mails. A `42501` or `23505` comes back as the Romanian sentence the
 * migration raised, which is what the user sees.
 */

export interface RequestState {
  error?: string;
  notice?: string;
}

export async function requestSubscriptionAction(
  _previous: RequestState,
  formData: FormData,
): Promise<RequestState> {
  const context = await getAccountContext();
  if (!context) return { error: 'Intră în cont ca să alegi un plan.' };

  const companyId = String(formData.get('companyId') ?? '');
  const planCode = String(formData.get('planCode') ?? '');
  const months = Number(formData.get('months') ?? '');
  const notes = String(formData.get('notes') ?? '').trim();

  // The form says which company was on screen; membership is the session's,
  // and the RPC re-checks it against auth.uid().
  if (!context.memberships.some((m) => m.company.id === companyId)) {
    return { error: 'Nu ai dreptul să alegi un plan pentru această firmă.' };
  }
  if (planCode === '' || !(BILLING_MONTHS as readonly number[]).includes(months)) {
    return { error: 'Alege un plan și o perioadă.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('request_subscription', {
    p_company_id: companyId,
    p_plan_code: planCode,
    p_months: months,
    p_notes: notes === '' ? null : notes,
  });

  if (error) return { error: toAppError(error, 'abonamente.request').message };

  revalidatePath(ROUTES.plans);
  revalidatePath(ROUTES.accountSubscription);
  return { notice: plansCopy.dialog.sent };
}
