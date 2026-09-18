'use server';

import { revalidatePath } from 'next/cache';
import { ROUTES } from '@/config/routes';
import { CURRENT_TERMS_VERSION } from '@/content/legal';
import { toAppError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';

export interface AcceptTermsState {
  error?: string;
}

/**
 * Accepting the current version of the terms.
 *
 * The version is not a parameter. It is whatever this deployment is
 * showing, read from the same constant the gate compared against and the
 * page rendered — so there is no call shape that records agreement to a
 * version the person was not shown.
 */
export async function acceptTermsAction(): Promise<AcceptTermsState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('accept_terms', {
    p_version: CURRENT_TERMS_VERSION,
    p_document: 'termeni',
  });

  if (error) return { error: toAppError(error, 'terms.accept').message };

  revalidatePath(ROUTES.account);
  return {};
}
