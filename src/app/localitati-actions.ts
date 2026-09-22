'use server';

import type { Locality } from '@/lib/localities';
import {
  rememberLocality,
  reportMissingLocality,
  searchLocalities,
} from '@/lib/localities-source';

/**
 * The three things the locality picker asks the server for.
 *
 * Server actions rather than a route handler: the picker is a client
 * component inside forms that are already server-rendered, and an action
 * needs no second authentication path.
 *
 * None of them trusts an argument for authorization. The search is open
 * without an account by design; the other two are refused for a visitor
 * inside Postgres, not here.
 */

export async function searchLocalitiesAction(
  query: string,
  near: { lat: number; lng: number } | null,
): Promise<Locality[]> {
  return searchLocalities(query, near);
}

export async function rememberLocalityAction(localityId: string): Promise<void> {
  await rememberLocality(localityId);
}

export async function reportMissingLocalityAction(
  typed: string,
  country: string,
): Promise<{ ok: boolean }> {
  const id = await reportMissingLocality(typed, country, null);
  return { ok: id !== null };
}
