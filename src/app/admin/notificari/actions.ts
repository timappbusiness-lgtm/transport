'use server';

import { revalidatePath } from 'next/cache';
import { ROUTES } from '@/config/routes';
import { toAppError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';

export interface RetryState {
  error?: string;
  notice?: string;
}

/**
 * Put one failed row back in the queue.
 *
 * The rule is in `retry_outbox_row`: staff only, only a failed or skipped
 * row, the attempt counter back to zero, and an audit entry. A person
 * looked at this and decided it deserves another five tries, which is the
 * whole point of a manual retry.
 */
export async function retryNotificationAction(
  _previous: RetryState,
  formData: FormData,
): Promise<RetryState> {
  const id = String(formData.get('id') ?? '').trim();
  if (id === '') return { error: 'Lipsește notificarea de reîncercat.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('retry_outbox_row', { p_id: id });

  if (error) return { error: toAppError(error, 'notifications.retry').message };

  revalidatePath(ROUTES.adminNotifications);
  return { notice: 'Notificarea a fost pusă din nou la coadă.' };
}
