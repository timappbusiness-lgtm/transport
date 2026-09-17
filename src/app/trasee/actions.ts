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

export interface RevealState {
  error?: string;
  contact?: { name: string | null; phone: string | null; email: string | null };
}

/**
 * Reveal a carrier's contact details.
 *
 * Nothing is decided here. `reveal_contact` is SECURITY DEFINER and applies
 * the whole rule — a company account or a verified phone, an active listing,
 * a contact allowance left on the plan — raising a written Romanian message
 * when it refuses. Those messages tell the person what to do next, so they
 * are shown exactly as the database wrote them.
 */
export async function revealContactAction(
  _prev: RevealState,
  formData: FormData,
): Promise<RevealState> {
  const truckListingId = String(formData.get('truckListingId') ?? '');

  const context = await getAccountContext();
  if (!context) redirect(signInUrlFor(`${ROUTES.routes}/${truckListingId}`));

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('reveal_contact', {
    p_cargo_listing_id: undefined,
    p_truck_listing_id: truckListingId,
  });

  if (error) return { error: toAppError(error, 'trasee.revealContact').message };

  const row = Array.isArray(data) ? data[0] : null;
  if (!row) return { error: 'Transportatorul nu a lăsat date de contact pentru acest traseu.' };

  return {
    contact: {
      name: row.contact_name ?? null,
      phone: row.contact_phone ?? null,
      email: row.contact_email ?? null,
    },
  };
}
