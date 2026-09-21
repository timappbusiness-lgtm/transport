'use server';

import { revalidatePath } from 'next/cache';
import { ROUTES } from '@/config/routes';
import { requireAccountContext } from '@/lib/auth/account';
import { toAppError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';

export interface FavouriteState {
  error?: string;
  notice?: string;
}

/**
 * Adăugarea și scoaterea din listă.
 *
 * Firma se ia din contextul contului și se **trimite** funcției, care o
 * verifică din nou. Nu se ghicește în bază: cineva poate fi în două
 * firme, iar o ghicitoare ar pune favoritul pe cea greșită o dată la
 * zece.
 */
export async function addFavouriteAction(
  _previous: FavouriteState,
  formData: FormData,
): Promise<FavouriteState> {
  const context = await requireAccountContext(ROUTES.accountFavourites);
  const company = context.activeCompany;
  if (!company) return { error: 'Alege o firmă înainte.' };

  const carrier = String(formData.get('carrier_company_id') ?? '');
  if (carrier === '') return { error: 'Lipsește transportatorul.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('add_favourite_carrier', {
    p_company_id: company.id,
    p_carrier_company_id: carrier,
    p_note: String(formData.get('note') ?? '') || undefined,
  });
  if (error) return { error: toAppError(error, 'favoriti.add').message };

  revalidatePath(ROUTES.accountFavourites);
  return { notice: 'Adăugat la favoriți.' };
}

export async function removeFavouriteAction(
  _previous: FavouriteState,
  formData: FormData,
): Promise<FavouriteState> {
  const context = await requireAccountContext(ROUTES.accountFavourites);
  const company = context.activeCompany;
  if (!company) return { error: 'Alege o firmă înainte.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('remove_favourite_carrier', {
    p_company_id: company.id,
    p_carrier_company_id: String(formData.get('carrier_company_id') ?? ''),
  });
  if (error) return { error: toAppError(error, 'favoriti.remove').message };

  revalidatePath(ROUTES.accountFavourites);
  return { notice: 'Scos din favoriți.' };
}
