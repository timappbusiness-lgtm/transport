'use server';

import { revalidatePath } from 'next/cache';
import { ROUTES } from '@/config/routes';
import { toAppError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import {
  MAIL_SAMPLE_PAYLOAD,
  MAIL_TEMPLATES,
  mailTemplateLabel,
} from '@/content/mail-samples';

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

/**
 * Sending one e-mail of a chosen template to a chosen address.
 *
 * The point is to answer a question nobody can answer today: does mail
 * actually leave the building. It queues a row like any other, so it goes
 * through the same dispatcher, the same renderer and the same provider —
 * a test that took a shortcut past any of those would prove nothing about
 * the path a real notification takes.
 *
 * Staff-only and audited in `enqueue_test_notification`; the payload is
 * the sample set, which covers every variable any template uses.
 */
export async function sendTestNotificationAction(
  _previous: RetryState,
  formData: FormData,
): Promise<RetryState> {
  const template = String(formData.get('template') ?? '').trim();
  const email = String(formData.get('email') ?? '').trim();

  if (template === '') return { error: 'Alege un șablon.' };
  if (email === '') return { error: 'Scrie adresa la care îl trimitem.' };
  if (!MAIL_TEMPLATES.some((t) => t.id === template)) {
    return { error: 'Șablonul ăsta nu există.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('enqueue_test_notification', {
    p_template: template,
    p_to_email: email,
    p_payload: MAIL_SAMPLE_PAYLOAD,
  });

  if (error) return { error: toAppError(error, 'notifications.testSend').message };

  revalidatePath(ROUTES.adminNotifications);
  return {
    notice:
      `Am pus la coadă „${mailTemplateLabel(template)}” către ${email}. ` +
      'Pleacă la următoarea rulare a dispecerului — în cel mult cinci minute, ' +
      'dacă furnizorul este configurat.',
  };
}
