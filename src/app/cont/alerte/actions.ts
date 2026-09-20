'use server';

import { revalidatePath } from 'next/cache';
import { ROUTES } from '@/config/routes';
import { toAppError } from '@/lib/errors';
import { requireAccountContext } from '@/lib/auth/account';
import { createClient } from '@/lib/supabase/server';
import type { AlertFrequency, SearchFilters } from '@/lib/saved-searches';

export interface AlertState {
  error?: string;
  notice?: string;
  /** Set when the plan is full, so the form can link to /abonamente. */
  quotaReached?: boolean;
}

const FREQUENCIES: readonly AlertFrequency[] = ['immediate', 'daily'];

function frequency(value: FormDataEntryValue | null): AlertFrequency {
  const text = String(value ?? '');
  return (FREQUENCIES as readonly string[]).includes(text)
    ? (text as AlertFrequency)
    : 'immediate';
}

/**
 * Saving a search.
 *
 * The filters arrive as JSON from whichever screen offered the button —
 * the board with its current filters, or an empty state — and are handed
 * to `save_search`, which applies the plan limit. The limit is not
 * checked here: a check in a server action is a convenience, the one in
 * the database is the rule, and its sentence names the plan.
 */
export async function saveSearchAction(
  _previous: AlertState,
  formData: FormData,
): Promise<AlertState> {
  await requireAccountContext(ROUTES.accountAlerts);

  const name = String(formData.get('name') ?? '').trim();
  const raw = String(formData.get('filters') ?? '{}');

  let filters: SearchFilters;
  try {
    filters = JSON.parse(raw) as SearchFilters;
  } catch {
    return { error: 'Filtrele s-au pierdut pe drum. Ia-o de la capăt de pe panou.' };
  }

  if (name === '') return { error: 'Dă-i căutării un nume, ca să o recunoști în listă.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('save_search', {
    p_name: name,
    p_target: 'cargo',
    p_filters: filters as never,
    p_frequency: frequency(formData.get('frequency')),
    p_notify_email: formData.get('notify_email') !== null,
  });

  if (error) {
    const message = toAppError(error, 'alerts.save').message;
    return { error: message, quotaReached: /limita/i.test(message) };
  }

  revalidatePath(ROUTES.accountAlerts);
  return { notice: `Am salvat „${name}”. Te anunțăm când apare ceva potrivit.` };
}

/**
 * Pausing, renaming or changing how often it writes.
 *
 * Straight through the table's own policies: a saved search is the one
 * thing here its owner may edit directly, and `guard_saved_search_write`
 * is what stops them moving it to somebody else or forging the date it
 * last fired.
 */
export async function updateSearchAction(
  _previous: AlertState,
  formData: FormData,
): Promise<AlertState> {
  await requireAccountContext(ROUTES.accountAlerts);

  const id = String(formData.get('id') ?? '').trim();
  if (id === '') return { error: 'Lipsește căutarea.' };

  const patch: Record<string, unknown> = {};
  const name = String(formData.get('name') ?? '').trim();
  if (name !== '') patch.name = name;
  if (formData.has('frequency')) patch.frequency = frequency(formData.get('frequency'));
  if (formData.has('is_active')) patch.is_active = formData.get('is_active') === 'yes';
  if (formData.has('notify_email')) {
    patch.notify_email = formData.get('notify_email') === 'yes';
  }

  if (Object.keys(patch).length === 0) return {};

  const supabase = await createClient();
  const { error } = await supabase.from('saved_searches').update(patch).eq('id', id);

  if (error) return { error: toAppError(error, 'alerts.update').message };

  revalidatePath(ROUTES.accountAlerts);
  return { notice: 'Am salvat.' };
}

export async function deleteSearchAction(
  _previous: AlertState,
  formData: FormData,
): Promise<AlertState> {
  await requireAccountContext(ROUTES.accountAlerts);

  const id = String(formData.get('id') ?? '').trim();
  if (id === '') return { error: 'Lipsește căutarea.' };

  const supabase = await createClient();
  const { error } = await supabase.from('saved_searches').delete().eq('id', id);

  if (error) return { error: toAppError(error, 'alerts.delete').message };

  revalidatePath(ROUTES.accountAlerts);
  return { notice: 'Căutarea a fost ștearsă.' };
}
