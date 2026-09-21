'use server';

import { revalidatePath } from 'next/cache';
import { ROUTES } from '@/config/routes';
import { requireAccountContext } from '@/lib/auth/account';
import { toAppError } from '@/lib/errors';
import { normaliseImage } from '@/lib/listing-image';
import { MAX_ATTACHMENTS, validateAttachment, validateMessage } from '@/lib/messages';
import { createClient } from '@/lib/supabase/server';

export interface MessageState {
  error?: string;
  notice?: string;
  fieldErrors?: Record<string, string>;
}

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? '').trim();
}

function refresh(conversationId?: string) {
  revalidatePath(ROUTES.accountMessages);
  if (conversationId) revalidatePath(`${ROUTES.accountMessages}/${conversationId}`);
}

/**
 * Trimiterea unui mesaj, cu imaginile lui.
 *
 * Mesajul întâi, atașamentele după: dacă o imagine cade, textul a ajuns
 * deja, ceea ce este ordinea bună. Invers ar însemna imagini orfane în
 * bucket după fiecare eroare de rețea.
 *
 * Imaginile se re-codează pe server, ca peste tot: EXIF-ul dispare, nu
 * pentru că formularul a cerut-o, ci pentru că funcția asta o face
 * întotdeauna.
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

  const files = formData
    .getAll('attachments')
    .filter((f): f is File => f instanceof File && f.size > 0)
    .slice(0, MAX_ATTACHMENTS);

  const problem = validateMessage(body, files.length);
  if (problem !== null) return { fieldErrors: { body: problem } };

  for (const file of files) {
    const bad = validateAttachment(file);
    if (bad !== null) return { fieldErrors: { attachments: bad } };
  }

  const supabase = await createClient();
  // Mesajul întâi, imaginile după. Dacă o imagine cade, textul a ajuns
  // deja — ordinea inversă ar lăsa fișiere orfane în bucket după fiecare
  // eroare de rețea.
  const { data: inserted, error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, sender_user_id: userId, body })
    .select('id')
    .single();

  if (error) return { error: toAppError(error, 'mesaje.send').message };

  for (const [index, file] of files.entries()) {
    const buffer = await normaliseImage(Buffer.from(await file.arrayBuffer()));
    const path = `${conversationId}/${inserted.id}-${index}.jpg`;
    const upload = await supabase.storage
      .from('message-attachments')
      .upload(path, buffer, { contentType: 'image/jpeg', upsert: false });
    if (upload.error) {
      return { error: toAppError(upload.error, 'mesaje.upload').message };
    }
    const { error: rowError } = await supabase.from('message_attachments').insert({
      message_id: inserted.id,
      conversation_id: conversationId,
      file_path: path,
      uploaded_by: userId,
    });
    if (rowError) return { error: toAppError(rowError, 'mesaje.attach').message };
  }

  refresh(conversationId);
  return {};
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
