'use server';

import { getAccountContext } from '@/lib/auth/account';
import { boardIsTheirs } from '@/lib/board-match-source';
import { seenAt } from '@/lib/board-news';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';

/**
 * A carrier has looked at the board: what was new is no longer new.
 *
 * Called by the board once it is on the screen — not while it renders, so
 * a prefetch or a refresh behind somebody's back never clears a count
 * nobody read. `renderedAt` is when the server drew the board they are
 * looking at: a request published in the seconds between that and this
 * call was not on it, and stays new.
 *
 * Writes `profiles.last_seen_at` on the carrier's own row, under the
 * policy that already lets a person update their profile; the guard on
 * that table does not cover this column, and nothing else writes it. It
 * is also what the pilot dashboard reads as „active this week", which a
 * carrier opening the board is.
 */
export async function markBoardSeenAction(renderedAt: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const context = await getAccountContext();
  if (context === null || context.activeRole === 'driver') return;
  if (!boardIsTheirs(context.activeCompany)) return;

  const at = seenAt(renderedAt, new Date());
  if (at === null) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from('profiles')
    .update({ last_seen_at: at })
    .eq('id', context.user.id);
  if (error) console.error('[cereri] last visit not saved', { message: error.message });
}
