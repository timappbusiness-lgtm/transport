'use server';

import { revalidatePath } from 'next/cache';
import { ROUTES } from '@/config/routes';
import { getAccountContext } from '@/lib/auth/account';
import { toAppError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';

/**
 * Notification settings.
 *
 * Every write here is the caller's own row, which is what the policies
 * allow and nothing more — there is no admin path through this file. The
 * two rules that are not the caller's to relax (a mandatory type stays on
 * for in-app and e-mail) are enforced by a trigger, so an error coming
 * back from one of these actions carries the Romanian message written in
 * the migration.
 */

export interface NotificationActionState {
  error?: string;
  notice?: string;
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

async function requireUser() {
  const context = await getAccountContext();
  if (!context) return null;
  return context.user;
}

/**
 * Store the subscription this browser just created.
 *
 * `upsert` on the endpoint, because the same browser re-subscribing
 * returns the same endpoint and a second row would mean two notifications
 * for one device. A row that was disabled by the sender comes back to
 * life here, which is exactly what re-subscribing means.
 */
export async function saveSubscriptionAction(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string;
  platform: string;
}): Promise<NotificationActionState> {
  const user = await requireUser();
  if (!user) return { error: 'Autentificare necesară.' };

  const supabase = await createClient();
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: user.id,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      user_agent: input.userAgent,
      platform: input.platform,
      last_seen_at: new Date().toISOString(),
      last_error: null,
      disabled_at: null,
    },
    { onConflict: 'endpoint' },
  );

  if (error) return { error: toAppError(error, 'push.save').message };

  revalidatePath(`${ROUTES.accountSettings}/notificari`);
  return { notice: 'Notificările sunt pornite pe acest dispozitiv.' };
}

export async function removeSubscriptionAction(endpoint: string): Promise<NotificationActionState> {
  const user = await requireUser();
  if (!user) return { error: 'Autentificare necesară.' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', endpoint)
    .eq('user_id', user.id);

  if (error) return { error: toAppError(error, 'push.remove').message };

  revalidatePath(`${ROUTES.accountSettings}/notificari`);
  return { notice: 'Notificările sunt oprite pe acest dispozitiv.' };
}

export async function setPreferenceAction(
  _previous: NotificationActionState,
  formData: FormData,
): Promise<NotificationActionState> {
  const user = await requireUser();
  if (!user) return { error: 'Autentificare necesară.' };

  const type = text(formData, 'type');
  const channel = text(formData, 'channel');
  const enabled = text(formData, 'enabled') === 'true';

  if (channel !== 'inapp' && channel !== 'email' && channel !== 'push') {
    return { error: 'Canal necunoscut.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('notification_preferences').upsert(
    { user_id: user.id, type, [channel]: enabled },
    { onConflict: 'user_id,type' },
  );

  if (error) return { error: toAppError(error, 'push.preference').message };

  revalidatePath(`${ROUTES.accountSettings}/notificari`);
  return { notice: 'Salvat.' };
}

export async function setQuietHoursAction(
  _previous: NotificationActionState,
  formData: FormData,
): Promise<NotificationActionState> {
  const user = await requireUser();
  if (!user) return { error: 'Autentificare necesară.' };

  const enabled = formData.get('quietHoursEnabled') === 'on';
  const from = text(formData, 'quietFrom');
  const to = text(formData, 'quietTo');
  const cap = Number(text(formData, 'maxPerHour') || '10');

  if (!/^\d{2}:\d{2}$/.test(from) || !/^\d{2}:\d{2}$/.test(to)) {
    return { error: 'Orele se scriu în forma 22:00.' };
  }
  if (!Number.isInteger(cap) || cap < 1 || cap > 100) {
    return { error: 'Numărul de notificări pe oră este între 1 și 100.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('notification_settings').upsert(
    {
      user_id: user.id,
      quiet_hours_enabled: enabled,
      quiet_from: from,
      quiet_to: to,
      max_push_per_hour: cap,
    },
    { onConflict: 'user_id' },
  );

  if (error) return { error: toAppError(error, 'push.quietHours').message };

  revalidatePath(`${ROUTES.accountSettings}/notificari`);
  return { notice: 'Setările au fost salvate.' };
}

export async function sendTestPushAction(): Promise<NotificationActionState> {
  const user = await requireUser();
  if (!user) return { error: 'Autentificare necesară.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('send_test_push');
  if (error) return { error: toAppError(error, 'push.test').message };

  return {
    notice:
      'Notificarea de test a fost pusă la coadă. Ar trebui să ajungă în câteva momente.',
  };
}
