'use server';

import { revalidatePath } from 'next/cache';
import { ROUTES } from '@/config/routes';
import { requireAccountContext } from '@/lib/auth/account';
import { toAppError } from '@/lib/errors';
import { validateMessage } from '@/lib/messages';
import { createClient } from '@/lib/supabase/server';
import { isDuplicateRow, isUuid } from '@/lib/uploads/paths';

export interface MessageState {
  error?: string;
  notice?: string;
  fieldErrors?: Record<string, string>;
  /** The message went out: the composer can be emptied. */
  sent?: boolean;
  /** Its id, for the images that follow it. */
  messageId?: string;
}

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? '').trim();
}

function refresh(conversationId?: string) {
  revalidatePath(ROUTES.accountMessages);
  if (conversationId) revalidatePath(`${ROUTES.accountMessages}/${conversationId}`);
}

/**
 * Trimiterea unui mesaj. Imaginile lui urcă după, una câte una.
 *
 * Mesajul întâi, atașamentele după: dacă o imagine cade, textul a ajuns
 * deja, ceea ce este ordinea bună. Invers ar însemna imagini orfane în
 * bucket după fiecare eroare de rețea. Imaginile merg prin
 * `/api/incarcare/atasament`, fiecare cu progresul ei și păstrată pe
 * dispozitiv până ajunge, legată de mesaj prin `message_id`.
 *
 * Id-ul mesajului îl alege dispozitivul, o dată. O a doua apăsare după un
 * răspuns pierdut găsește mesajul pe care l-a făcut prima și îl ia drept
 * trimis — înainte, a doua apăsare se lovea de garda de mesaj repetat, iar
 * imaginile nu mai ajungeau niciodată.
 */
export async function sendMessageAction(
  _previous: MessageState,
  formData: FormData,
): Promise<MessageState> {
  const { user } = await requireAccountContext(ROUTES.accountMessages);
  const userId = user.id;

  const conversationId = text(formData, 'conversation_id');
  const body = text(formData, 'body');
  if (conversationId === '') return { error: 'Lipsește conversația.' };

  const given = text(formData, 'message_id');
  const messageId = isUuid(given) ? given : crypto.randomUUID();
  const attachments = Math.max(0, Math.trunc(Number(text(formData, 'attachment_count')) || 0));

  const problem = validateMessage(body, attachments);
  if (problem !== null) return { fieldErrors: { body: problem } };

  const supabase = await createClient();
  const { error } = await supabase
    .from('messages')
    .insert({ id: messageId, conversation_id: conversationId, sender_user_id: userId, body });

  if (error) {
    // Already there under this id: the first press got through and only
    // its answer was lost.
    const { data: existing } = isDuplicateRow(error)
      ? await supabase.from('messages').select('id').eq('id', messageId).eq('sender_user_id', userId).maybeSingle()
      : { data: null };
    if (!existing) return { error: toAppError(error, 'mesaje.send').message };
  }

  refresh(conversationId);
  return { sent: true, messageId };
}

/** Marcarea firului ca citit. Prin RPC-ul care exista deja. */
export async function markReadAction(conversationId: string): Promise<void> {
  await requireAccountContext(ROUTES.accountMessages);
  const supabase = await createClient();
  await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId });
  refresh(conversationId);
}

export async function reportMessageAction(
  _previous: MessageState,
  formData: FormData,
): Promise<MessageState> {
  await requireAccountContext(ROUTES.accountMessages);

  const messageId = text(formData, 'message_id');
  const reason = text(formData, 'reason');
  if (messageId === '') return { error: 'Lipsește mesajul.' };
  if (reason.length < 10) {
    return { fieldErrors: { reason: 'Scrie câteva cuvinte despre ce nu este în regulă.' } };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('report_message', {
    p_message_id: messageId,
    p_reason: reason,
  });
  if (error) return { error: toAppError(error, 'mesaje.report').message };

  return { notice: 'Am primit sesizarea. Ne uităm peste ea.' };
}

export async function blockSenderAction(
  _previous: MessageState,
  formData: FormData,
): Promise<MessageState> {
  await requireAccountContext(ROUTES.accountMessages);

  const userId = text(formData, 'user_id');
  if (userId === '') return { error: 'Lipsește contul.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('block_sender', {
    p_user_id: userId,
    p_reason: text(formData, 'reason') || undefined,
  });
  if (error) return { error: toAppError(error, 'mesaje.block').message };

  refresh();
  return { notice: 'Contul a fost blocat.' };
}

export async function unblockSenderAction(
  _previous: MessageState,
  formData: FormData,
): Promise<MessageState> {
  await requireAccountContext(ROUTES.accountMessages);

  const blockId = text(formData, 'block_id');
  if (blockId === '') return { error: 'Lipsește blocarea.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('unblock_sender', { p_block_id: blockId });
  if (error) return { error: toAppError(error, 'mesaje.unblock').message };

  refresh();
  return { notice: 'Blocarea a fost ridicată.' };
}

/**
 * Deschiderea unei conversații de pe un anunț.
 *
 * Poarta de contact se consumă în `guard_conversation_insert()`, deci
 * refuzul vine de acolo cu propoziția lui — inclusiv „ai atins limita de
 * contacte pe luna aceasta", care este exact ce trebuie spus.
 */
export async function startListingConversationAction(
  _previous: MessageState,
  formData: FormData,
): Promise<MessageState> {
  const context = await requireAccountContext(ROUTES.accountMessages);

  const requestId = text(formData, 'request_id');
  const routeId = text(formData, 'route_id');
  if (requestId === '' && routeId === '') return { error: 'Lipsește anunțul.' };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('conversations')
    .insert({
      cargo_listing_id: requestId === '' ? null : requestId,
      truck_listing_id: routeId === '' ? null : routeId,
      initiator_user_id: context.user.id,
      // Rescris de gardă din anunț; coloana este NOT NULL, deci are
      // nevoie de o valoare ca să treacă de insert.
      owner_user_id: context.user.id,
    })
    .select('id')
    .single();

  if (error) return { error: toAppError(error, 'mesaje.start').message };

  refresh(data.id);
  return { notice: data.id };
}
