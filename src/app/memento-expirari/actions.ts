'use server';

import { revalidatePath } from 'next/cache';
import { ROUTES } from '@/config/routes';
import { getAccountContext } from '@/lib/auth/account';
import { deleteServerDraft } from '@/lib/continuity/server-drafts';
import { doneUrl } from '@/lib/continuity/drafts';
import { toAppError } from '@/lib/errors';
import { isIsoDay, isMementoKind, isPlate, mementoLabel } from '@/lib/memento';
import { createClient } from '@/lib/supabase/server';
import { isUuid } from '@/lib/uploads/paths';

/** What the public page's form holds: one vehicle, its dates. */
export interface StarterPayload {
  vehicleId: string;
  plate: string;
  make: string;
  model: string;
  dates: Record<string, string>;
  dueKm: string;
  customName: string;
}

export type StarterAnswer = { ok: true; redirectTo: string } | { ok: false; error: string; needsAccount?: boolean };

const NULL = null as unknown as string;

/**
 * The public page's memento, saved once there is an account.
 *
 * Idempotent on the id the browser chose when the form started: coming
 * back from sign-up and pressing „Salvează" twice is one vehicle. The
 * account's copy of the draft goes here; the browser's goes on the page
 * this redirects to (`?gata=memento`).
 */
export async function saveStarterAction(payload: StarterPayload): Promise<StarterAnswer> {
  const context = await getAccountContext();
  if (context === null) return { ok: false, needsAccount: true, error: 'Intră în cont ca să salvezi mementoul.' };
  if (!isUuid(payload.vehicleId)) return { ok: false, error: 'Formularul nu are un identificator. Reîncarcă pagina.' };
  if (!isPlate(payload.plate ?? '')) return { ok: false, error: 'Scrie numărul de înmatriculare.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('memento_save_vehicle', {
    p_id: payload.vehicleId,
    p_company_id: NULL,
    p_plate: payload.plate,
    p_make: payload.make.trim() || undefined,
    p_model: payload.model.trim() || undefined,
  });
  if (error) return { ok: false, error: toAppError(error, 'memento.starter').message };

  const km = Number((payload.dueKm ?? '').replace(/[\s.]/g, ''));
  const kinds = new Set(Object.keys(payload.dates ?? {}));
  // A service due by kilometres alone has no date to put it in `dates`.
  if (Number.isInteger(km) && km > 0) kinds.add('revizie');
  for (const kind of kinds) {
    if (!isMementoKind(kind)) continue;
    const date = payload.dates?.[kind];
    const validUntil = typeof date === 'string' && isIsoDay(date) ? date : null;
    const dueKm = kind === 'revizie' && Number.isInteger(km) && km > 0 ? km : null;
    if (validUntil === null && dueKm === null) continue;
    const customName = kind === 'altceva' ? payload.customName.trim() : null;
    if (kind === 'altceva' && (customName === null || customName.length < 2)) continue;
    const saved = await supabase.rpc('memento_save_entry', {
      p_vehicle_id: payload.vehicleId,
      p_kind: kind,
      p_valid_until: validUntil ?? NULL,
      p_custom_name: customName ?? undefined,
      p_due_km: dueKm ?? undefined,
    });
    if (saved.error) {
      return { ok: false, error: `${mementoLabel(kind, customName)}: ${toAppError(saved.error, 'memento.starter').message}` };
    }
  }

  await deleteServerDraft(context.user.id, 'memento');
  revalidatePath(ROUTES.accountMemento);
  return { ok: true, redirectTo: doneUrl(`${ROUTES.accountMemento}?vedere=personal`, 'memento') };
}
