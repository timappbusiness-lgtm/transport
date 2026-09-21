'use server';

import { revalidatePath } from 'next/cache';
import { ROUTES, companyRoute, transportRoute } from '@/config/routes';
import { requireAccountContext } from '@/lib/auth/account';
import { toAppError } from '@/lib/errors';
import { MAX_COMMENT, validateRating, type SubScore } from '@/lib/ratings';
import { createClient } from '@/lib/supabase/server';

export interface RatingState {
  error?: string;
  notice?: string;
  fieldErrors?: Record<string, string>;
}

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? '').trim();
}

/** Un sub-scor lipsă este `null`, nu zero: nimeni nu a dat zero stele. */
function score(formData: FormData, name: string): number | null {
  const raw = text(formData, name);
  if (raw === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

/** Toate locurile în care apare o evaluare, ca să nu rămână niciunul vechi. */
function refresh(orderId: string | null, slug: string | null) {
  revalidatePath(ROUTES.accountRatings);
  revalidatePath(ROUTES.account);
  if (orderId !== null) revalidatePath(transportRoute(orderId));
  if (slug !== null) revalidatePath(companyRoute(slug));
}

const SUB_KEYS: SubScore['key'][] = [
  'punctuality',
  'communication',
  'vehicle_care',
  'info_accuracy',
  'handover_availability',
];

function readDraft(formData: FormData) {
  const subScores: Partial<Record<SubScore['key'], number | null>> = {};
  for (const key of SUB_KEYS) subScores[key] = score(formData, key);
  return {
    score: score(formData, 'score'),
    subScores,
    comment: text(formData, 'comment'),
  };
}

/**
 * Trimiterea unei evaluări.
 *
 * Validarea de aici este ca omul să nu apese degeaba. Cea care decide
 * este `post_rating()`, care se uită la starea comenzii, la fereastră, la
 * dispută și la partea pe care se află cel care evaluează — și refuză cu
 * o propoziție în română, afișată exact așa cum a scris-o.
 */
export async function postRatingAction(
  _previous: RatingState,
  formData: FormData,
): Promise<RatingState> {
  await requireAccountContext(ROUTES.accountRatings);

  const orderId = text(formData, 'order_id');
  if (orderId === '') return { error: 'Lipsește comanda.' };

  const draft = readDraft(formData);
  const fieldErrors = validateRating(draft);
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.rpc('post_rating', {
    p_order_id: orderId,
    p_score: draft.score as number,
    p_punctuality: draft.subScores.punctuality ?? undefined,
    p_communication: draft.subScores.communication ?? undefined,
    p_vehicle_care: draft.subScores.vehicle_care ?? undefined,
    p_info_accuracy: draft.subScores.info_accuracy ?? undefined,
    p_handover_availability: draft.subScores.handover_availability ?? undefined,
    p_comment: draft.comment === '' ? undefined : draft.comment.slice(0, MAX_COMMENT),
  });
  if (error) return { error: toAppError(error, 'evaluari.post').message };

  refresh(orderId, text(formData, 'slug') || null);
  return { notice: 'Evaluarea a fost trimisă. Mulțumim.' };
}

/** Corectura, o singură dată, în fereastra de editare. Baza numără, nu pagina. */
export async function editRatingAction(
  _previous: RatingState,
  formData: FormData,
): Promise<RatingState> {
  await requireAccountContext(ROUTES.accountRatings);

  const ratingId = text(formData, 'rating_id');
  if (ratingId === '') return { error: 'Lipsește evaluarea.' };

  const draft = readDraft(formData);
  const fieldErrors = validateRating(draft);
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.rpc('edit_rating', {
    p_rating_id: ratingId,
    p_score: draft.score as number,
    p_punctuality: draft.subScores.punctuality ?? undefined,
    p_communication: draft.subScores.communication ?? undefined,
    p_vehicle_care: draft.subScores.vehicle_care ?? undefined,
    p_info_accuracy: draft.subScores.info_accuracy ?? undefined,
    p_handover_availability: draft.subScores.handover_availability ?? undefined,
    p_comment: draft.comment === '' ? undefined : draft.comment.slice(0, MAX_COMMENT),
  });
  if (error) return { error: toAppError(error, 'evaluari.edit').message };

  refresh(text(formData, 'order_id') || null, text(formData, 'slug') || null);
  return { notice: 'Evaluarea a fost corectată.' };
}

/** Răspunsul public al firmei evaluate. Unul singur, și definitiv. */
export async function replyToRatingAction(
  _previous: RatingState,
  formData: FormData,
): Promise<RatingState> {
  await requireAccountContext(ROUTES.accountRatings);

  const ratingId = text(formData, 'rating_id');
  const body = text(formData, 'body');
  if (ratingId === '') return { error: 'Lipsește evaluarea.' };
  if (body === '') return { fieldErrors: { body: 'Scrie un răspuns.' } };
  if (body.length > MAX_COMMENT) {
    return { fieldErrors: { body: `Răspunsul are cel mult ${MAX_COMMENT} de caractere.` } };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('reply_to_rating', {
    p_rating_id: ratingId,
    p_body: body,
  });
  if (error) return { error: toAppError(error, 'evaluari.reply').message };

  refresh(null, text(formData, 'slug') || null);
  return { notice: 'Răspunsul a fost publicat.' };
}

/** Sesizarea unei evaluări, prin fluxul de sesizări care există deja. */
export async function reportRatingAction(
  _previous: RatingState,
  formData: FormData,
): Promise<RatingState> {
  await requireAccountContext(ROUTES.accountRatings);

  const ratingId = text(formData, 'rating_id');
  const reason = text(formData, 'reason');
  if (ratingId === '') return { error: 'Lipsește evaluarea.' };
  if (reason.length < 10) {
    return { fieldErrors: { reason: 'Scrie câteva cuvinte despre ce nu este în regulă.' } };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('report_rating', {
    p_rating_id: ratingId,
    p_reason: reason,
  });
  if (error) return { error: toAppError(error, 'evaluari.report').message };

  return { notice: 'Am primit sesizarea. Ne uităm peste ea.' };
}

// ---------------------------------------------------------------------
// Echipa
// ---------------------------------------------------------------------

/** Ascunderea unei evaluări. Rândul și textul rămân; se schimbă cine le vede. */
export async function hideRatingAction(
  _previous: RatingState,
  formData: FormData,
): Promise<RatingState> {
  await requireAccountContext(ROUTES.adminRatings);

  const ratingId = text(formData, 'rating_id');
  const reason = text(formData, 'reason');
  if (ratingId === '') return { error: 'Lipsește evaluarea.' };
  if (reason === '') return { fieldErrors: { reason: 'Scrie de ce o ascunzi.' } };

  const supabase = await createClient();
  const { error } = await supabase.rpc('staff_hide_rating', {
    p_rating_id: ratingId,
    p_reason: reason,
  });
  if (error) return { error: toAppError(error, 'admin.hideRating').message };

  revalidatePath(ROUTES.adminRatings);
  return { notice: 'Evaluarea a fost ascunsă.' };
}

export async function unhideRatingAction(
  _previous: RatingState,
  formData: FormData,
): Promise<RatingState> {
  await requireAccountContext(ROUTES.adminRatings);

  const ratingId = text(formData, 'rating_id');
  const reason = text(formData, 'reason');
  if (ratingId === '') return { error: 'Lipsește evaluarea.' };
  if (reason === '') return { fieldErrors: { reason: 'Scrie de ce o repui.' } };

  const supabase = await createClient();
  const { error } = await supabase.rpc('staff_unhide_rating', {
    p_rating_id: ratingId,
    p_reason: reason,
  });
  if (error) return { error: toAppError(error, 'admin.unhideRating').message };

  revalidatePath(ROUTES.adminRatings);
  return { notice: 'Evaluarea a fost repusă.' };
}

export async function hideRatingReplyAction(
  _previous: RatingState,
  formData: FormData,
): Promise<RatingState> {
  await requireAccountContext(ROUTES.adminRatings);

  const replyId = text(formData, 'reply_id');
  const reason = text(formData, 'reason');
  if (replyId === '') return { error: 'Lipsește răspunsul.' };
  if (reason === '') return { fieldErrors: { reason: 'Scrie de ce îl ascunzi.' } };

  const supabase = await createClient();
  const { error } = await supabase.rpc('staff_hide_rating_reply', {
    p_reply_id: replyId,
    p_reason: reason,
  });
  if (error) return { error: toAppError(error, 'admin.hideReply').message };

  revalidatePath(ROUTES.adminRatings);
  return { notice: 'Răspunsul a fost ascuns.' };
}
