'use server';

import { revalidatePath } from 'next/cache';
import { ROUTES, myRequestRoute } from '@/config/routes';
import { requireAccountContext } from '@/lib/auth/account';
import { toAppError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';

/**
 * Cine vede o cerere.
 *
 * Amândouă acțiunile de aici cheamă un RPC care verifică din nou cine
 * este apelantul și refuză altfel. Regula de vizibilitate este în RLS,
 * nu în ecran — ce se schimbă aici este doar coloana pe care o citește
 * politica.
 */
export interface VisibilityState {
  error?: string;
  notice?: string;
}

export async function setInvitesAction(
  _previous: VisibilityState,
  formData: FormData,
): Promise<VisibilityState> {
  await requireAccountContext(ROUTES.accountRequests);

  const id = String(formData.get('request_id') ?? '');
  const companies = formData.getAll('carrier').map(String).filter((v) => v !== '');
  if (id === '') return { error: 'Lipsește cererea.' };
  if (companies.length === 0) return { error: 'Alege cel puțin un transportator.' };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('set_listing_invites', {
    p_cargo_listing_id: id,
    p_company_ids: companies,
  });
  if (error) return { error: toAppError(error, 'cereri.invites').message };

  revalidatePath(myRequestRoute(id));
  const n = Number(data ?? 0);
  return {
    notice:
      n === 1 ? 'Un transportator invitat.' : `${n} transportatori invitați.`,
  };
}

/**
 * «Deschide pe bursă».
 *
 * Ireversibilă, și textul de pe buton o spune înainte. Invitațiile
 * rămân: cine a fost întrebat primul este parte din istoria cererii.
 */
export async function openToPublicAction(
  _previous: VisibilityState,
  formData: FormData,
): Promise<VisibilityState> {
  await requireAccountContext(ROUTES.accountRequests);

  const id = String(formData.get('request_id') ?? '');
  if (id === '') return { error: 'Lipsește cererea.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('open_listing_to_public', {
    p_cargo_listing_id: id,
  });
  if (error) return { error: toAppError(error, 'cereri.open').message };

  revalidatePath(myRequestRoute(id));
  revalidatePath(ROUTES.requests);
  return { notice: 'Cererea este acum pe bursă. O văd toți transportatorii.' };
}
