'use server';

import { ROUTES } from '@/config/routes';
import { getAccountContext } from '@/lib/auth/account';
import { signInUrlFor } from '@/lib/auth/next-path';
import { toAppError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { departuresCopy } from '@/content/departures';
import { redirect } from 'next/navigation';

export interface SavedSearchState {
  error?: string;
  notice?: string;
}

/** A readable name for the alert e-mail, built from what was searched. */
function describe(filters: Record<string, string>): string {
  const parts: string[] = [];
  if (filters['tara-plecare']) parts.push(`din ${filters['tara-plecare']}`);
  if (filters['tara-sosire']) parts.push(`spre ${filters['tara-sosire']}`);
  if (filters['directie']) parts.push(filters['directie'] === 'tur' ? 'pe tur' : 'pe retur');
  if (filters['vehicul']) parts.push(filters['vehicul']);
  return parts.length > 0 ? `Trasee ${parts.join(' ')}` : 'Toate traseele';
}

/**
 * "Tell me when a route appears."
 *
 * Signed out, this sends the visitor to sign-in with the search in `next`,
 * so the filters survive the round trip and the alert is saved the moment
 * they come back — rather than losing what they typed, which is the usual
 * way this interaction fails.
 */
export async function saveSearchAction(
  _prev: SavedSearchState,
  formData: FormData,
): Promise<SavedSearchState> {
  const query = String(formData.get('query') ?? '');
  const target = `${ROUTES.routes}${query}`;

  const context = await getAccountContext();
  if (!context) redirect(signInUrlFor(target));

  const filters = Object.fromEntries(new URLSearchParams(query.replace(/^\?/, '')).entries());
  const supabase = await createClient();

  // One alert per identical search: asking twice is a person checking, not
  // a request for two e-mails.
  const { data: existing } = await supabase
    .from('saved_searches')
    .select('id')
    .eq('user_id', context.user.id)
    .eq('target', 'truck')
    .eq('filters', JSON.stringify(filters))
    .maybeSingle();

  if (existing) return { notice: departuresCopy.empty.alertExists };

  const { error } = await supabase.from('saved_searches').insert({
    user_id: context.user.id,
    name: describe(filters),
    target: 'truck',
    filters,
    notify_email: true,
  });

  if (error) return { error: toAppError(error, 'trasee.saveSearch').message };
  return { notice: departuresCopy.empty.alertSaved };
}
