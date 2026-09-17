'use server';

import type { PublicRequest } from '@/lib/requests';
import { loadHomepageActivity } from '@/lib/requests-source';

/**
 * The newest requests, for the homepage feed's minute poll.
 *
 * It reads the same cached loader the page rendered from, so a hundred
 * visitors polling once a minute still cost one query a minute. There is
 * nothing to authorize: every row it returns is already public, and it
 * returns exactly what `v_requests_public` allows anon to read.
 */
export async function latestRequestsAction(): Promise<PublicRequest[]> {
  const { requests } = await loadHomepageActivity();
  return requests;
}
