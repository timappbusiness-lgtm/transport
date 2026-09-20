'use server';

import { revalidatePath } from 'next/cache';
import { ROUTES } from '@/config/routes';
import { toAppError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';

export interface StaffToolState {
  error?: string;
  notice?: string;
}

/**
 * Confirming a telephone number by hand.
 *
 * The only route there is, until an SMS provider is configured: the
 * database asks for a verified number before somebody may open a
 * carrier's contact details, and nothing can set that automatically
 * today. `staff_set_phone_verified` is where the rules live — staff only,
 * a written reason required, an audit row either way — so this action
 * only carries the form across and shows the sentence it comes back with.
 */
export async function verifyPhoneAction(
  _previous: StaffToolState,
  formData: FormData,
): Promise<StaffToolState> {
  const userId = String(formData.get('user_id') ?? '').trim();
  const note = String(formData.get('note') ?? '').trim();

  if (userId === '') return { error: 'Lipsește contul.' };
  if (note === '') return { error: 'Scrie cum ai confirmat numărul.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('staff_set_phone_verified', {
    p_user: userId,
    p_verified: true,
    p_note: note,
  });

  if (error) return { error: toAppError(error, 'pilot.verifyPhone').message };

  revalidatePath(ROUTES.adminPilot);
  return { notice: 'Numărul este confirmat. Contul poate deschide date de contact.' };
}

/**
 * Marking an account as one of ours.
 *
 * Everything public — the two boards, the directory, the homepage
 * figures, the route count a client is shown, and every number on this
 * page — excludes them. A pilot measured on firms we seeded is a pilot
 * nobody has run.
 */
export async function markTestAccountAction(
  _previous: StaffToolState,
  formData: FormData,
): Promise<StaffToolState> {
  const kind = String(formData.get('kind') ?? '');
  const id = String(formData.get('id') ?? '').trim();
  const isTest = formData.get('is_test') === 'yes';

  if (id === '') return { error: 'Lipsește contul sau firma.' };
  if (kind !== 'user' && kind !== 'company') return { error: 'Alege un cont sau o firmă.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('staff_set_test_account', {
    p_user: kind === 'user' ? id : undefined,
    p_company: kind === 'company' ? id : undefined,
    p_is_test: isTest,
  });

  if (error) return { error: toAppError(error, 'pilot.markTest').message };

  revalidatePath(ROUTES.adminPilot);
  return {
    notice: isTest
      ? 'Marcat ca al nostru. Iese din toate numerele publice.'
      : 'Nu mai e marcat ca al nostru. Intră din nou în numerele publice.',
  };
}
