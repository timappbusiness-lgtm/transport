'use server';

import { revalidatePath } from 'next/cache';
import { ROUTES } from '@/config/routes';
import { requireAccountContext } from '@/lib/auth/account';
import { toAppError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';

export interface ModerationState {
  error?: string;
  notice?: string;
  fieldErrors?: Record<string, string>;
}

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? '').trim();
}

/**
 * Ascunderea unui anunț de pe panou.
 *
 * Motivul îl vede și proprietarul, în contul lui — deci este scris
 * pentru el, nu pentru noi. Regula stă în `staff_hide_listing()`, care
 * refuză un motiv gol înainte ca formularul să apuce.
 */
export async function hideListingAction(
  _previous: ModerationState,
  formData: FormData,
): Promise<ModerationState> {
  await requireAccountContext(ROUTES.adminListings);

  const requestId = text(formData, 'request_id');
  const routeId = text(formData, 'route_id');
  const reason = text(formData, 'reason');
  if (requestId === '' && routeId === '') return { error: 'Lipsește anunțul.' };
  if (reason === '') return { fieldErrors: { reason: 'Scrie de ce îl ascunzi.' } };

  const supabase = await createClient();
  const { error } = await supabase.rpc('staff_hide_listing', {
    p_cargo_listing_id: requestId === '' ? undefined : requestId,
    p_truck_listing_id: routeId === '' ? undefined : routeId,
    p_reason: reason,
  });
  if (error) return { error: toAppError(error, 'admin.hideListing').message };

  revalidatePath(ROUTES.adminListings);
  return { notice: 'Anunțul a fost ascuns.' };
}

export async function restoreListingAction(
  _previous: ModerationState,
  formData: FormData,
): Promise<ModerationState> {
  await requireAccountContext(ROUTES.adminListings);

  const requestId = text(formData, 'request_id');
  const routeId = text(formData, 'route_id');
  const reason = text(formData, 'reason');
  if (requestId === '' && routeId === '') return { error: 'Lipsește anunțul.' };
  if (reason === '') return { fieldErrors: { reason: 'Scrie de ce îl repui.' } };

  const supabase = await createClient();
  const { error } = await supabase.rpc('staff_restore_listing', {
    p_cargo_listing_id: requestId === '' ? undefined : requestId,
    p_truck_listing_id: routeId === '' ? undefined : routeId,
    p_reason: reason,
  });
  if (error) return { error: toAppError(error, 'admin.restoreListing').message };

  revalidatePath(ROUTES.adminListings);
  return { notice: 'Anunțul a fost repus.' };
}

/** Ascunderea unui mesaj dintr-o conversație sesizată. */
export async function hideMessageAction(
  _previous: ModerationState,
  formData: FormData,
): Promise<ModerationState> {
  await requireAccountContext(ROUTES.adminConversations);

  const messageId = text(formData, 'message_id');
  const reason = text(formData, 'reason');
  if (messageId === '') return { error: 'Lipsește mesajul.' };
  if (reason === '') return { fieldErrors: { reason: 'Scrie de ce îl ascunzi.' } };

  const supabase = await createClient();
  const { error } = await supabase.rpc('staff_hide_message', {
    p_message_id: messageId,
    p_reason: reason,
  });
  if (error) return { error: toAppError(error, 'admin.hideMessage').message };

  revalidatePath(ROUTES.adminConversations);
  return { notice: 'Mesajul a fost ascuns.' };
}

/**
 * Exportul sesizărilor și al deciziilor de moderare.
 *
 * CSV-ul se compune în bază, unde este jurnalul. O a doua definiție a
 * lui „decizie de moderare" scrisă aici s-ar depărta de prima.
 */
export async function exportModerationAction(
  _previous: ModerationState,
  formData: FormData,
): Promise<ModerationState> {
  await requireAccountContext(ROUTES.adminListings);

  const from = text(formData, 'from');
  const to = text(formData, 'to');
  if (from === '' || to === '') return { error: 'Alege un interval.' };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('export_moderation_csv', {
    p_from: from,
    p_to: to,
  });
  if (error) return { error: toAppError(error, 'admin.export').message };

  return { notice: String(data ?? '') };
}
