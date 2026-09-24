'use server';

import { revalidatePath } from 'next/cache';
import { ROUTES } from '@/config/routes';
import { requireAccountContext } from '@/lib/auth/account';
import { toAppError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';

/**
 * Pauză, reluare și oprire pentru o serie.
 *
 * Trei apăsări, o singură funcție în bază: `set_route_series_state()`
 * face aceeași scriere pe același rând, cu aceeași verificare, iar trei
 * acțiuni aproape identice ar fi ajuns să se deosebească într-un an.
 */
export interface SeriesState {
  error?: string;
  notice?: string;
}

export async function seriesStateAction(
  _previous: SeriesState,
  formData: FormData,
): Promise<SeriesState> {
  await requireAccountContext(ROUTES.accountDepartures);

  const id = String(formData.get('series_id') ?? '');
  const action = String(formData.get('action') ?? '');
  if (id === '') return { error: 'Lipsește seria.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('set_route_series_state', {
    p_series_id: id,
    p_action: action,
    p_reason: String(formData.get('reason') ?? '') || undefined,
  });
  if (error) return { error: toAppError(error, 'serii.state').message };

  revalidatePath(ROUTES.accountDepartures);
  return {
    notice:
      action === 'pauza'
        ? 'Seria este pe pauză. Traseele deja publicate rămân.'
        : action === 'reluare'
          ? 'Seria a fost repornită.'
          : 'Seria a fost oprită. Traseele deja publicate rămân.',
  };
}
