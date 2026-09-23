'use server';

import type { Json } from '@/lib/supabase/database.types';
import { getAccountContext } from '@/lib/auth/account';
import {
  isDraftForm,
  isDraftPayload,
  isDraftScope,
  isDraftStep,
  type DraftEnvelope,
} from '@/lib/continuity/drafts';
import { readServerDraft } from '@/lib/continuity/server-drafts';
import { createClient } from '@/lib/supabase/server';

/**
 * The server half of a form's draft: the copy that follows the account
 * from the phone to the desktop.
 *
 * Nothing here decides who may read or write what — `form_drafts` is
 * owner-only under RLS, and the session is the caller's own. The checks
 * below only stop a malformed call from costing a round trip to Postgres,
 * which refuses the same shapes with its own constraints.
 *
 * None of these throws and none of them asks anybody to sign in: a draft
 * is a convenience, and a save that fails is a save the browser copy
 * already made. Signed out, loading finds nothing and saving does nothing.
 */

export async function loadDraftAction(
  form: string,
  scope: string,
): Promise<DraftEnvelope<Record<string, unknown>> | null> {
  const context = await getAccountContext();
  if (!context) return null;
  return readServerDraft(context.user.id, form, scope);
}

export async function saveDraftAction(
  form: string,
  scope: string,
  step: string | null,
  payload: unknown,
): Promise<boolean> {
  if (!isDraftForm(form) || !isDraftScope(scope) || !isDraftStep(step)) return false;
  if (!isDraftPayload(payload)) return false;
  const context = await getAccountContext();
  if (!context) return false;

  const supabase = await createClient();
  const { error } = await supabase.from('form_drafts').upsert(
    {
      user_id: context.user.id,
      form_key: form,
      scope,
      step,
      payload: payload as Json,
    },
    { onConflict: 'user_id,form_key,scope' },
  );
  return !error;
}

export async function clearDraftAction(form: string, scope: string): Promise<void> {
  if (!isDraftForm(form) || !isDraftScope(scope)) return;
  const context = await getAccountContext();
  if (!context) return;

  const supabase = await createClient();
  await supabase
    .from('form_drafts')
    .delete()
    .eq('user_id', context.user.id)
    .eq('form_key', form)
    .eq('scope', scope);
}
