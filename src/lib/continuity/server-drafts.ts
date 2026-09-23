import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { isDraftForm, isDraftPayload, isDraftScope, type DraftEnvelope } from './drafts';

/**
 * The account's copy of a draft, read on the server — by a page, so the
 * first render is already the draft from the other device, and by the
 * draft actions. Owner-only by RLS; `userId` narrows the query, it does
 * not authorise it.
 */
export async function readServerDraft(
  userId: string,
  form: string,
  scope: string,
): Promise<DraftEnvelope<Record<string, unknown>> | null> {
  if (!isDraftForm(form) || !isDraftScope(scope)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from('form_drafts')
    .select('payload, step, updated_at')
    .eq('user_id', userId)
    .eq('form_key', form)
    .eq('scope', scope)
    .maybeSingle();
  if (!data || !isDraftPayload(data.payload)) return null;
  return { payload: data.payload, step: data.step, savedAt: Date.parse(data.updated_at) };
}

/**
 * The account's copy of a draft, removed once the form it belonged to has
 * done its job. Called by the action, before it redirects; never throws,
 * because a draft left behind is a nuisance and a failed publish is not.
 */
export async function deleteServerDraft(userId: string, form: string, scope = ''): Promise<void> {
  if (!isDraftForm(form) || !isDraftScope(scope)) return;
  try {
    const supabase = await createClient();
    await supabase
      .from('form_drafts')
      .delete()
      .eq('user_id', userId)
      .eq('form_key', form)
      .eq('scope', scope);
  } catch {
    /* see above */
  }
}
