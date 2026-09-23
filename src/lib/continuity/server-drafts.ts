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
