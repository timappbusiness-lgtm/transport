import 'server-only';
import { cache } from 'react';
import { getAccountContext } from './auth/account';
import { pendingDocumentCount } from './badges';
import { loadNewRequestCount } from './board-match-source';
import { NO_NAV_COUNTS, type NavCounts } from './navigation';
import { isSupabaseConfigured } from './supabase/env';
import { createClient } from './supabase/server';

/**
 * The numbers on the menu badges.
 *
 * Read once per request — `cache()` — and handed to the header and the
 * sidebar from the same call, because two counts of the same thing is how
 * a badge stops being believed. The header streams in behind a Suspense
 * boundary and the sidebar renders in the account layout; without the
 * cache that is two round trips for one number.
 *
 * Both counts come from a function that decides for itself whose rows
 * these are: `unread_message_count()` and `unanswered_offer_count()` start
 * from `auth.uid()`. Nothing here is passed a user id, and nothing here
 * adds a rule about who may see what.
 *
 * A failure is zero, never a thrown error. A badge is decoration on top of
 * a menu that works; taking the header down because a count did not answer
 * would be the wrong trade.
 */
export const loadNavCounts = cache(async (): Promise<NavCounts> => {
  if (!isSupabaseConfigured()) return NO_NAV_COUNTS;

  const supabase = await createClient();
  // The active firm, from the same cached context the page already read.
  // No firm, no documents count — and no extra round trip for it.
  const context = await getAccountContext();
  const companyId = context?.activeCompany?.id ?? null;

  const [messages, offers, documents, newRequests] = await Promise.all([
    supabase.rpc('unread_message_count'),
    supabase.rpc('unanswered_offer_count'),
    companyId === null
      ? Promise.resolve({ data: [], error: null })
      : // The rows the documents page reads, under the same RLS: a member
        // sees their own firm's requirements and nobody else's.
        supabase
          .from('v_company_missing_documents')
          .select('is_blocking, state')
          .eq('company_id', companyId),
    // A carrier's only: zero for everybody else without a query.
    loadNewRequestCount(context),
  ]);

  if (messages.error) console.error('[meniu] unread_message_count', messages.error.message);
  if (offers.error) console.error('[meniu] unanswered_offer_count', offers.error.message);
  if (documents.error) console.error('[meniu] documents', documents.error.message);

  return {
    messages: toCount(messages.data),
    offers: toCount(offers.data),
    documents: pendingDocumentCount(
      (documents.data ?? []) as { is_blocking: boolean | null; state: string | null }[],
    ),
    newRequests,
  };
});

/** A count is a non-negative integer or it is nothing. */
function toCount(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}
