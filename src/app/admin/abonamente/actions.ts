'use server';

import { revalidatePath, updateTag } from 'next/cache';
import { ROUTES } from '@/config/routes';
import { adminDirectoryCopy } from '@/content/admin-directory';
import { getAccountContext } from '@/lib/auth/account';
import { toAppError } from '@/lib/errors';
import { PRICING_TAG } from '@/lib/plans-source';
import { createClient } from '@/lib/supabase/server';

/**
 * Working the request queue.
 *
 * Each transition is an audited RPC that checks staff membership itself;
 * there is no table grant that would let these actions write the row
 * directly. Activation is the one that touches `subscriptions`, and it
 * refuses a company that is not verified — a plan is not a shortcut past
 * the paperwork.
 */
const c = adminDirectoryCopy.requests;

export interface RequestActionState {
  error?: string;
  notice?: string;
}

/** The session client, or null when the caller is not staff. */
async function staffClient() {
  const context = await getAccountContext();
  if (!context?.isStaff) return null;
  return await createClient();
}

function refresh(): void {
  updateTag(PRICING_TAG);
  revalidatePath(ROUTES.adminSubscriptions);
  revalidatePath(ROUTES.accountSubscription);
}

export async function markContactedAction(
  _previous: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const supabase = await staffClient();
  if (!supabase) return { error: c.noAccess };

  const { error } = await supabase.rpc('mark_subscription_request_contacted', {
    p_id: String(formData.get('id') ?? ''),
  });
  if (error) return { error: toAppError(error, 'admin.markContacted').message };

  refresh();
  return { notice: c.contacted };
}

export async function activateRequestAction(
  _previous: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const supabase = await staffClient();
  if (!supabase) return { error: c.noAccess };

  const { error } = await supabase.rpc('activate_subscription_request', {
    p_id: String(formData.get('id') ?? ''),
  });
  if (error) return { error: toAppError(error, 'admin.activateRequest').message };

  refresh();
  return { notice: c.activated };
}

export async function rejectRequestAction(
  _previous: RequestActionState,
  formData: FormData,
): Promise<RequestActionState> {
  const supabase = await staffClient();
  if (!supabase) return { error: c.noAccess };

  const reason = String(formData.get('reason') ?? '').trim();
  if (reason === '') return { error: c.reasonRequired };

  const { error } = await supabase.rpc('reject_subscription_request', {
    p_id: String(formData.get('id') ?? ''),
    p_reason: reason,
  });
  if (error) return { error: toAppError(error, 'admin.rejectRequest').message };

  refresh();
  return { notice: c.rejected };
}
