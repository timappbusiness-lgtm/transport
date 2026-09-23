'use server';

import { revalidatePath } from 'next/cache';
import { ROUTES } from '@/config/routes';
import { getAccountContext, redirectToSignIn } from '@/lib/auth/account';
import { buildExportArchive, exportStoragePath } from '@/lib/data-export';
import { toAppError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';

/**
 * Taking your data back, and asking us to stop holding it.
 *
 * Nothing here decides anything. Every rule — who may ask, what blocks
 * it, how long the grace period is, whether a link has been used — lives
 * in the database, and these actions carry its sentence back to the
 * screen as it is. That matters more here than anywhere else in the app:
 * a deletion that a component allowed and the database refused, or the
 * other way round, is somebody's account.
 *
 * There is no service-role key in this application by design, so the
 * archive is built by the person's own session: `my_data_export()` reads
 * by `auth.uid()`, the upload goes into their own folder, and the storage
 * policy refuses anything else.
 */

export interface PersonalDataState {
  error?: string;
  notice?: string;
  /** The archive that is ready, so the screen can offer the one link. */
  download?: { id: string; token: string };
}

export async function requestExportAction(): Promise<PersonalDataState> {
  const context = await getAccountContext();
  if (context === null) return redirectToSignIn(ROUTES.accountPersonalData);

  const supabase = await createClient();

  // A function returning a composite comes back as the row itself, not as
  // an array of one, so there is nothing for `.single()` to unwrap.
  const { data: request, error: requestError } = await supabase.rpc('request_data_export');
  if (requestError || !request) {
    return { error: toAppError(requestError, 'export.request').message };
  }

  const { data: payload, error: payloadError } = await supabase.rpc('my_data_export');
  if (payloadError || payload === null) {
    await supabase.rpc('finish_data_export', {
      p_id: request.id,
      p_file_path: '',
      p_error: payloadError?.message ?? 'nu am putut citi datele',
    });
    return { error: toAppError(payloadError, 'export.read').message };
  }

  const archive = buildExportArchive(payload as Record<string, unknown>);
  const path = exportStoragePath(context.user.id, request.id, new Date());

  const { error: uploadError } = await supabase.storage
    .from('exports')
    .upload(path, archive, { contentType: 'application/zip', upsert: true });
  if (uploadError) {
    await supabase.rpc('finish_data_export', {
      p_id: request.id,
      p_file_path: '',
      p_error: uploadError.message,
    });
    return { error: 'Nu am putut salva arhiva. Încearcă din nou peste câteva minute.' };
  }

  const { data: ready, error: finishError } = await supabase.rpc('finish_data_export', {
    p_id: request.id,
    p_file_path: path,
    p_size_bytes: archive.byteLength,
  });
  if (finishError || !ready) {
    return { error: toAppError(finishError, 'export.finish').message };
  }

  revalidatePath(ROUTES.accountPersonalData);
  return {
    notice: 'Arhiva este gata.',
    download: { id: ready.id, token: ready.download_token },
  };
}

export async function requestDeletionAction(
  _previous: PersonalDataState,
  formData: FormData,
): Promise<PersonalDataState> {
  const context = await getAccountContext();
  if (context === null) return redirectToSignIn(ROUTES.accountPersonalData);

  const kind = String(formData.get('kind') ?? 'user');
  const companyId = String(formData.get('company_id') ?? '').trim();
  const confirmation = String(formData.get('confirmation') ?? '').trim();

  // The typed confirmation is a brake, not a check: its whole job is to
  // make the second step deliberate. The database does not know about it
  // and must not, because a rule only the browser enforces is not a rule.
  const expected =
    kind === 'company'
      ? (context.memberships.find((m) => m.company.id === companyId)?.company.legal_name ?? '')
      : (context.profile?.email ?? context.user.email ?? '');

  if (expected === '' || confirmation.toLocaleLowerCase('ro-RO') !== expected.toLocaleLowerCase('ro-RO')) {
    return { error: 'Textul nu se potrivește. Ștergerea nu a pornit.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('request_account_deletion', {
    p_kind: kind,
    p_company_id: kind === 'company' ? companyId : null,
  });

  if (error) return { error: toAppError(error, 'deletion.request').message };

  revalidatePath(ROUTES.accountPersonalData);
  revalidatePath(ROUTES.account);
  return { notice: 'Am înregistrat cererea.' };
}

export async function cancelDeletionAction(
  _previous: PersonalDataState,
  formData: FormData,
): Promise<PersonalDataState> {
  const id = String(formData.get('request_id') ?? '').trim();
  if (id === '') return { error: 'Lipsește cererea de anulat.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('cancel_account_deletion', { p_id: id });
  if (error) return { error: toAppError(error, 'deletion.cancel').message };

  revalidatePath(ROUTES.accountPersonalData);
  revalidatePath(ROUTES.account);
  return { notice: 'Ștergerea a fost anulată. Contul funcționează ca înainte.' };
}
