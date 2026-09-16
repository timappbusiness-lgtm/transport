'use server';

import { revalidatePath } from 'next/cache';
import { ROUTES } from '@/config/routes';
import { type ActionState, messageFromError } from '@/lib/action-state';
import { requireStaff } from '@/lib/auth';

export async function reviewDocument(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireStaff();
  const documentId = String(formData.get('document_id') ?? '');
  const approve = formData.get('decision') === 'approve';
  const validUntil = String(formData.get('valid_until') ?? '').trim();
  const reason = String(formData.get('rejection_reason') ?? '').trim();

  if (approve && validUntil && !/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) {
    return { ok: false, errors: { valid_until: 'Dată invalidă.' } };
  }
  if (!approve && reason.length < 5) {
    return { ok: false, errors: { rejection_reason: 'Scrie motivul, îl vede firma.' } };
  }

  const { error } = await supabase.rpc('review_document', {
    p_document_id: documentId,
    p_approve: approve,
    ...(approve && validUntil ? { p_valid_until: validUntil } : {}),
    ...(!approve ? { p_rejection_reason: reason } : {}),
  });
  if (error) return { ok: false, message: messageFromError(error) };
  revalidatePath(ROUTES.adminDocuments);
  return { ok: true, message: approve ? 'Document aprobat.' : 'Document respins.' };
}

export async function grantStaff(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireStaff();
  const email = String(formData.get('email') ?? '').trim().toLowerCase();
  const reason = String(formData.get('reason') ?? '').trim();
  if (reason.length < 5) return { ok: false, errors: { reason: 'Scrie motivul.' } };

  const { data: profile } = await supabase.from('profiles').select('id').ilike('email', email).maybeSingle();
  if (!profile) return { ok: false, errors: { email: 'Nu există un cont cu acest e-mail.' } };

  const { error } = await supabase.rpc('set_platform_staff', { p_user_id: profile.id, p_role: 'admin', p_reason: reason });
  if (error) return { ok: false, message: messageFromError(error) };
  revalidatePath(ROUTES.adminStaff);
  return { ok: true, message: `${email} are acum acces de administrare.` };
}

export async function revokeStaff(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireStaff();
  const userId = String(formData.get('user_id') ?? '');
  const reason = String(formData.get('reason') ?? '').trim();
  if (reason.length < 5) return { ok: false, errors: { reason: 'Scrie motivul.' } };

  // set_platform_staff(user, null, reason) revokes; the generated type does
  // not model the null.
  const { error } = await supabase.rpc('set_platform_staff', {
    p_user_id: userId,
    p_role: null as unknown as 'admin',
    p_reason: reason,
  });
  if (error) return { ok: false, message: messageFromError(error) };
  revalidatePath(ROUTES.adminStaff);
  return { ok: true, message: 'Accesul a fost retras.' };
}
