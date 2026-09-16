'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ROUTES, companyRoutes } from '@/config/routes';
import { type ActionState, messageFromError } from '@/lib/action-state';
import { requireSession } from '@/lib/auth';
import { INVITABLE_ROLES, normalizeCui } from '@/lib/companies';
import type { Database } from '@/lib/supabase/database.types';

type Enums = Database['public']['Enums'];

export interface AnafResult {
  ok: boolean;
  message?: string;
  company?: {
    legalName: string | null;
    address: string | null;
    regCom: string | null;
    vatPayer: boolean;
    inactive: boolean;
    struckOff: boolean;
  };
}

/** Autofill from the ANAF register through the verify-cui-anaf function. */
export async function lookupAnaf(rawCui: string): Promise<AnafResult> {
  const cui = normalizeCui(rawCui);
  if (!cui) return { ok: false, message: 'CUI invalid.' };

  const { supabase } = await requireSession();
  const { data, error } = await supabase.functions.invoke('verify-cui-anaf', { body: { cui } });
  if (error || !data?.found) {
    return {
      ok: false,
      message: data?.found === false ? 'CUI-ul nu a fost găsit la ANAF.' : 'ANAF nu răspunde acum. Completează datele manual.',
    };
  }
  return {
    ok: true,
    company: {
      legalName: data.legal_name ?? null,
      address: data.address ?? null,
      regCom: data.reg_com ?? null,
      vatPayer: Boolean(data.vat_payer),
      inactive: Boolean(data.is_inactive),
      struckOff: Boolean(data.is_struck_off),
    },
  };
}

export async function createCompany(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSession();
  const cui = normalizeCui(String(formData.get('cui') ?? ''));
  const legalName = String(formData.get('legal_name') ?? '').trim();
  const type = String(formData.get('company_type') ?? '') as Enums['company_type'];

  const errors: Record<string, string> = {};
  if (!cui) errors.cui = 'CUI invalid.';
  if (legalName.length < 3) errors.legal_name = 'Scrie denumirea firmei, ca în registru.';
  if (!['transport', 'expeditie', 'both'].includes(type)) errors.company_type = 'Alege tipul firmei.';
  if (Object.keys(errors).length || !cui) return { ok: false, errors };

  const optional = <K extends string>(key: K, name: string): Partial<Record<K, string>> => {
    const v = String(formData.get(name) ?? '').trim();
    return v ? ({ [key]: v } as Record<K, string>) : {};
  };

  const { data, error } = await session.supabase.rpc('create_company', {
    p_cui: cui,
    p_legal_name: legalName,
    p_company_type: type,
    ...optional('p_county', 'county'),
    ...optional('p_city', 'city'),
    ...optional('p_contact_email', 'contact_email'),
    ...optional('p_contact_phone', 'contact_phone'),
  });
  if (error || !data) return { ok: false, message: messageFromError(error) };

  // Store the ANAF snapshot on the new company. Not blocking: ANAF is slow
  // and rate-limited, and the reviewer sees whether the check ran.
  await session.supabase.functions
    .invoke('verify-cui-anaf', { body: { cui, company_id: data.id } })
    .catch(() => undefined);

  revalidatePath(ROUTES.account, 'layout');
  redirect(companyRoutes(data.id).overview);
}

export async function inviteMember(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireSession();
  const companyId = String(formData.get('company_id') ?? '');
  const email = String(formData.get('email') ?? '').trim();
  const role = String(formData.get('role') ?? '') as Exclude<Enums['company_member_role'], 'owner'>;
  if (!INVITABLE_ROLES.includes(role)) return { ok: false, errors: { role: 'Alege rolul.' } };

  const { error } = await supabase.rpc('invite_company_member', { p_company_id: companyId, p_email: email, p_role: role });
  if (error) return { ok: false, message: messageFromError(error) };
  revalidatePath(companyRoutes(companyId).overview);
  return { ok: true, message: `Invitație trimisă la ${email.toLowerCase()}. Expiră în 7 zile.` };
}

export async function revokeInvitation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireSession();
  const { error } = await supabase.rpc('revoke_company_invitation', {
    p_invitation_id: String(formData.get('invitation_id') ?? ''),
  });
  if (error) return { ok: false, message: messageFromError(error) };
  revalidatePath(companyRoutes(String(formData.get('company_id') ?? '')).overview);
  return { ok: true, message: 'Invitația a fost retrasă.' };
}

export async function respondToInvitation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireSession();
  const invitationId = String(formData.get('invitation_id') ?? '');
  const accept = formData.get('decision') === 'accept';

  const { error } = accept
    ? await supabase.rpc('accept_company_invitation', { p_invitation_id: invitationId })
    : await supabase.rpc('decline_company_invitation', { p_invitation_id: invitationId });
  if (error) return { ok: false, message: messageFromError(error) };

  revalidatePath(ROUTES.account, 'layout');
  return { ok: true, message: accept ? 'Ai intrat în firmă.' : 'Invitația a fost refuzată.' };
}

export async function transferOwnership(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase } = await requireSession();
  const companyId = String(formData.get('company_id') ?? '');
  const newOwner = String(formData.get('new_owner') ?? '');
  if (!newOwner) return { ok: false, errors: { new_owner: 'Alege noul proprietar.' } };
  if (formData.get('confirm') !== 'on') {
    return { ok: false, errors: { confirm: 'Confirmă că predai proprietatea firmei.' } };
  }

  const reason = String(formData.get('reason') ?? '').trim();
  const { error } = await supabase.rpc('transfer_company_ownership', {
    p_company_id: companyId,
    p_new_owner_user_id: newOwner,
    ...(reason ? { p_reason: reason } : {}),
  });
  if (error) return { ok: false, message: messageFromError(error) };
  revalidatePath(companyRoutes(companyId).overview);
  revalidatePath(ROUTES.account, 'layout');
  return { ok: true, message: 'Proprietatea a fost transferată. Ai rămas administrator.' };
}
