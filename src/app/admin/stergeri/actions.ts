'use server';

import { revalidatePath } from 'next/cache';
import { ROUTES } from '@/config/routes';
import { toAppError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';

export interface DeletionAdminState {
  error?: string;
  notice?: string;
}

/**
 * Anonymising somebody's account from the staff side.
 *
 * No grace period, because the reason for doing it from here is usually a
 * written request or an order that has already waited. Everything else is
 * identical to a person asking for themselves, deliberately: the blocking
 * rules are not a courtesy to the account holder, they are what keeps a
 * counterparty's open transport from losing one of its ends. Staff who
 * hit a block see the same sentence the person would.
 *
 * The reason is mandatory in the database, not here. This only refuses
 * early so somebody does not lose what they typed.
 */
export async function anonymiseAccountAction(
  _previous: DeletionAdminState,
  formData: FormData,
): Promise<DeletionAdminState> {
  const userId = String(formData.get('user_id') ?? '').trim();
  const reason = String(formData.get('reason') ?? '').trim();

  if (userId === '') return { error: 'Lipsește contul de anonimizat.' };
  if (reason === '') return { error: 'Motivul este obligatoriu.' };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('staff_anonymise_account', {
    p_user_id: userId,
    p_reason: reason,
  });

  if (error) return { error: toAppError(error, 'deletion.anonymise').message };

  revalidatePath(ROUTES.adminDeletions);
  return {
    notice:
      data?.status === 'blocked'
        ? 'Cererea este înregistrată, dar blocată. Vezi motivul în listă.'
        : 'Contul este programat pentru anonimizare la următoarea rulare a jobului.',
  };
}

export async function cancelDeletionRequestAction(
  _previous: DeletionAdminState,
  formData: FormData,
): Promise<DeletionAdminState> {
  const id = String(formData.get('request_id') ?? '').trim();
  if (id === '') return { error: 'Lipsește cererea de anulat.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('cancel_account_deletion', { p_id: id });
  if (error) return { error: toAppError(error, 'deletion.cancel').message };

  revalidatePath(ROUTES.adminDeletions);
  return { notice: 'Ștergerea a fost anulată și contul a fost repornit.' };
}
