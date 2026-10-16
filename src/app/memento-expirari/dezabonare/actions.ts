'use server';

import { createPublicClient } from '@/lib/supabase/public';
import { isSupabaseConfigured } from '@/lib/supabase/env';

export interface UnsubscribeState {
  outcome?: 'done' | 'invalid';
}

/**
 * „Oprește mementourile pe e-mail", from the link in a reminder.
 *
 * Without a session, and deliberately behind a button rather than on the
 * link itself: mail scanners open every link in a message, and a GET that
 * switched something off would be pressed by them before the person ever
 * read the e-mail. The token can do this one thing and nothing else.
 */
export async function unsubscribeMementoAction(_prev: UnsubscribeState, formData: FormData): Promise<UnsubscribeState> {
  const token = String(formData.get('t') ?? '');
  if (!isSupabaseConfigured() || !/^[0-9a-f-]{36}$/i.test(token)) return { outcome: 'invalid' };
  const supabase = createPublicClient();
  const { data, error } = await supabase.rpc('memento_unsubscribe', { p_token: token });
  return { outcome: !error && data === true ? 'done' : 'invalid' };
}
