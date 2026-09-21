'use server';

import { revalidatePath } from 'next/cache';
import { ROUTES } from '@/config/routes';
import { offersCopy } from '@/content/oferte';
import { requireAccountContext } from '@/lib/auth/account';
import { toAppError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';

export interface HideState {
  error?: string;
  notice?: string;
}

/**
 * Hiding one message from a clarification thread.
 *
 * The only thing staff may write anywhere near an offer, and the only
 * thing this screen does at all. `staff_hide_message()` refuses anybody
 * who is not `is_platform_admin()`, refuses an empty reason, and writes
 * `message.hidden` to `audit_log` with the reason and the actor — so
 * the audit entry, not this action, is the record.
 *
 * The body is left where it is rather than blanked: a moderation
 * decision somebody has to answer for later is worth nothing if the
 * thing decided about is gone. `offer_thread()` returns the placeholder
 * to the two parties, and the row keeps the text.
 */
export async function hideMessageAction(
  _previous: HideState,
  formData: FormData,
): Promise<HideState> {
  await requireAccountContext(ROUTES.adminOffers);

  const messageId = String(formData.get('message_id') ?? '').trim();
  const offerId = String(formData.get('offer_id') ?? '').trim();
  const reason = String(formData.get('reason') ?? '').trim();
  if (messageId === '') return { error: 'Lipsește mesajul.' };
  if (reason === '') {
    return { error: 'Scrie de ce ascunzi mesajul. Motivul rămâne în jurnal.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('staff_hide_message', {
    p_message_id: messageId,
    p_reason: reason,
  });
  if (error) return { error: toAppError(error, 'admin.offers.hide').message };

  if (offerId !== '') revalidatePath(`${ROUTES.adminOffers}/${offerId}`);
  return { notice: offersCopy.admin.detail.hidden };
}
