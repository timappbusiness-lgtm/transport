'use server';

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ROUTES } from '@/config/routes';
import { ACTIVE_COMPANY_COOKIE, getAccountContext, isManager } from '@/lib/auth/account';
import { toAppError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import {
  isCompanyType,
  normaliseCui,
  normalisePhone,
  validateCompanyDetails,
  validateEmail,
  validateFullName,
  validateOtp,
  validatePassword,
  validatePhone,
} from '@/lib/validation/auth';

/**
 * Server actions for the account area.
 *
 * Two rules hold everywhere in this file:
 *
 * 1. The session is read on the server, never taken from the request body.
 *    A company id or a role arriving in a form is a hint about what the user
 *    was looking at, never a claim about what they may do.
 * 2. Authorization is the database's job. These actions call RPCs and let
 *    RLS refuse; a `42501` carries a Romanian message written in the
 *    migration and is shown to the user as it is.
 */

export interface ActionState {
  error?: string;
  notice?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

async function requireContext() {
  const context = await getAccountContext();
  if (!context) redirect(ROUTES.signIn);
  return context;
}

// ---------------------------------------------------------------------
// Active company
// ---------------------------------------------------------------------

export async function setActiveCompanyAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  const companyId = text(formData, 'companyId');

  // The cookie is only ever written for a company the database says this
  // user belongs to. Anything else is dropped silently.
  const membership = context.memberships.find((m) => m.company.id === companyId);
  if (!membership) redirect(ROUTES.account);

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_COMPANY_COOKIE, companyId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });

  revalidatePath('/cont', 'layout');
  redirect(ROUTES.account);
}

// ---------------------------------------------------------------------
// Company creation (sign-up step 2)
// ---------------------------------------------------------------------

export interface CuiLookupState extends ActionState {
  company?: {
    cui: string;
    legalName: string;
    address: string | null;
    county: string | null;
    isInactive: boolean;
  };
}

export async function lookupCuiAction(
  _previous: CuiLookupState,
  formData: FormData,
): Promise<CuiLookupState> {
  await requireContext();
  const raw = text(formData, 'cui');
  const cui = normaliseCui(raw);

  if (cui.length < 2 || cui.length > 10) {
    return { fieldErrors: { cui: 'CUI-ul are între 2 și 10 cifre.' }, values: { cui: raw } };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.functions.invoke('verify-cui-anaf', {
    body: { cui },
  });

  if (error) {
    return {
      error: 'Nu am putut verifica CUI-ul la ANAF. Poți completa datele manual.',
      values: { cui: raw },
    };
  }

  const payload = data as {
    found?: boolean;
    legal_name?: string | null;
    address?: string | null;
    is_inactive?: boolean;
    is_struck_off?: boolean;
  } | null;

  if (!payload?.found) {
    return {
      fieldErrors: { cui: 'CUI-ul nu a fost găsit la ANAF. Verifică cifrele.' },
      values: { cui: raw },
    };
  }

  if (payload.is_inactive || payload.is_struck_off) {
    return {
      error:
        'Firma apare ca inactivă sau radiată la ANAF. Nu putem continua înregistrarea. Scrie-ne dacă este o eroare.',
      values: { cui: raw },
    };
  }

  return {
    company: {
      cui,
      legalName: payload.legal_name ?? '',
      address: payload.address ?? null,
      county: null,
      isInactive: false,
    },
    values: { cui: raw },
  };
}

export async function createCompanyAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireContext();

  const cui = text(formData, 'cui');
  const legalName = text(formData, 'legalName').trim();
  const companyType = text(formData, 'companyType');
  const county = text(formData, 'county').trim();
  const city = text(formData, 'city').trim();
  const contactEmail = text(formData, 'contactEmail').trim();
  const contactPhone = text(formData, 'contactPhone').trim();

  const validation = validateCompanyDetails({ cui, legalName, companyType });
  if (!validation.ok) {
    return {
      fieldErrors: validation.errors,
      values: { cui, legalName, companyType, county, city, contactEmail, contactPhone },
    };
  }
  if (!isCompanyType(companyType)) {
    return { fieldErrors: { companyType: 'Alege tipul de activitate.' } };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('create_company', {
    p_cui: normaliseCui(cui),
    p_legal_name: legalName,
    p_company_type: companyType,
    p_county: county === '' ? null : county,
    p_city: city === '' ? null : city,
    p_contact_email: contactEmail === '' ? null : contactEmail,
    p_contact_phone: contactPhone === '' ? null : contactPhone,
  });

  if (error) {
    return {
      error: toAppError(error, 'createCompany').message,
      values: { cui, legalName, companyType, county, city, contactEmail, contactPhone },
    };
  }

  revalidatePath('/cont', 'layout');
  redirect(ROUTES.accountCompany);
}

export async function updateCompanyAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await requireContext();
  if (!context.activeCompany) return { error: 'Nu ai o firmă activă.' };

  const isDraft = context.activeCompany.verification_status === 'draft';

  // Identity fields are only sent while the company is still a draft. The
  // database refuses them afterwards either way (`guard_company_write`);
  // omitting them here just means the user gets the form they can act on
  // rather than an error they cannot.
  const patch: Record<string, string | null> = {
    county: text(formData, 'county').trim() || null,
    city: text(formData, 'city').trim() || null,
    contact_email: text(formData, 'contactEmail').trim() || null,
    contact_phone: text(formData, 'contactPhone').trim() || null,
  };

  if (isDraft) {
    const legalName = text(formData, 'legalName').trim();
    const companyType = text(formData, 'companyType');
    if (legalName === '') {
      return { fieldErrors: { legalName: 'Introdu denumirea firmei.' } };
    }
    if (!isCompanyType(companyType)) {
      return { fieldErrors: { companyType: 'Alege tipul de activitate.' } };
    }
    patch.legal_name = legalName;
    patch.company_type = companyType;
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('companies')
    .update(patch)
    .eq('id', context.activeCompany.id);

  if (error) return { error: toAppError(error, 'updateCompany').message };

  revalidatePath('/cont', 'layout');
  return { notice: 'Datele firmei au fost salvate.' };
}

// ---------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------

export async function updateProfileAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await requireContext();
  const fullName = text(formData, 'fullName').trim();

  const nameError = validateFullName(fullName);
  if (nameError) return { fieldErrors: { fullName: nameError }, values: { fullName } };

  const supabase = await createClient();
  const { error } = await supabase
    .from('profiles')
    .update({ full_name: fullName })
    .eq('id', context.user.id);

  if (error) {
    return { error: toAppError(error, 'updateProfile').message, values: { fullName } };
  }

  revalidatePath(ROUTES.accountProfile);
  return { notice: 'Modificările au fost salvate.' };
}

export async function changeEmailAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireContext();
  const email = text(formData, 'email').trim();

  const emailError = validateEmail(email);
  if (emailError) return { fieldErrors: { email: emailError }, values: { email } };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ email });

  if (error) {
    return { error: toAppError(error, 'changeEmail').message, values: { email } };
  }

  return {
    notice:
      'Ți-am trimis un link de confirmare pe adresa nouă. Până confirmi, rămâne adresa veche.',
  };
}

export async function changePasswordAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await requireContext();
  const currentPassword = text(formData, 'currentPassword');
  const newPassword = text(formData, 'newPassword');

  const passwordError = validatePassword(newPassword);
  if (passwordError) return { fieldErrors: { newPassword: passwordError } };

  const supabase = await createClient();
  const email = context.user.email;
  if (!email) return { error: 'Contul nu are o adresă de e-mail.' };

  // Re-authenticate before changing the password: a live session found on an
  // unlocked laptop should not be enough to lock the owner out.
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword,
  });
  if (reauthError) {
    return { fieldErrors: { currentPassword: 'Parola actuală nu este corectă.' } };
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { error: toAppError(error, 'changePassword').message };

  return { notice: 'Parola a fost schimbată.' };
}

// ---------------------------------------------------------------------
// Phone verification
// ---------------------------------------------------------------------

export async function sendPhoneOtpAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireContext();
  const raw = text(formData, 'phone');

  const phoneError = validatePhone(raw);
  if (phoneError) return { fieldErrors: { phone: phoneError }, values: { phone: raw } };

  const phone = normalisePhone(raw);
  if (!phone) return { fieldErrors: { phone: 'Numărul nu pare valid.' }, values: { phone: raw } };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ phone });

  if (error) {
    return { error: toAppError(error, 'sendPhoneOtp').message, values: { phone: raw } };
  }

  return { notice: 'Ți-am trimis un cod prin SMS.', values: { phone } };
}

export async function verifyPhoneOtpAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireContext();
  const phone = text(formData, 'phone');
  const token = text(formData, 'token').replace(/\s/g, '');

  const otpError = validateOtp(token);
  if (otpError) return { fieldErrors: { token: otpError }, values: { phone } };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ phone, token, type: 'phone_change' });

  if (error) {
    return { error: toAppError(error, 'verifyPhoneOtp').message, values: { phone } };
  }

  // profiles.phone_verified is synced from auth.users by a trigger; the app
  // never writes it.
  revalidatePath('/cont', 'layout');
  return { notice: 'Numărul de telefon a fost confirmat.' };
}

// ---------------------------------------------------------------------
// Members and invitations
// ---------------------------------------------------------------------

export async function inviteMemberAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await requireContext();
  const email = text(formData, 'email').trim().toLowerCase();
  const role = text(formData, 'role');

  const emailError = validateEmail(email);
  if (emailError) return { fieldErrors: { email: emailError }, values: { email, role } };
  if (!context.activeCompany) return { error: 'Nu ai o firmă activă.' };

  // The UI hides the form from non-managers; the RPC is what enforces it.
  const supabase = await createClient();
  const { error } = await supabase.rpc('invite_company_member', {
    p_company_id: context.activeCompany.id,
    p_email: email,
    p_role: role,
  });

  if (error) {
    return { error: toAppError(error, 'inviteMember').message, values: { email, role } };
  }

  revalidatePath(ROUTES.accountMembers);
  return { notice: `Am trimis invitația către ${email}.` };
}

async function invitationAction(
  rpc: 'accept_company_invitation' | 'decline_company_invitation' | 'revoke_company_invitation',
  invitationId: string,
  context: string,
  path: string,
): Promise<ActionState> {
  await requireContext();
  const supabase = await createClient();
  const { error } = await supabase.rpc(rpc, { p_invitation_id: invitationId });

  if (error) return { error: toAppError(error, context).message };

  revalidatePath(path);
  revalidatePath('/cont', 'layout');
  return {};
}

export async function acceptInvitationAction(formData: FormData): Promise<void> {
  await invitationAction(
    'accept_company_invitation',
    text(formData, 'invitationId'),
    'acceptInvitation',
    ROUTES.accountInvitations,
  );
  redirect(ROUTES.account);
}

export async function declineInvitationAction(formData: FormData): Promise<void> {
  await invitationAction(
    'decline_company_invitation',
    text(formData, 'invitationId'),
    'declineInvitation',
    ROUTES.accountInvitations,
  );
  redirect(ROUTES.accountInvitations);
}

export async function revokeInvitationAction(formData: FormData): Promise<void> {
  await invitationAction(
    'revoke_company_invitation',
    text(formData, 'invitationId'),
    'revokeInvitation',
    ROUTES.accountMembers,
  );
  redirect(ROUTES.accountMembers);
}

export async function changeMemberRoleAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  const userId = text(formData, 'userId');
  const role = text(formData, 'role');

  if (context.activeCompany && isManager(context.activeRole)) {
    // A direct update, guarded in Postgres: `guard_member_write` refuses to
    // move a member between companies or to grant ownership this way, and
    // `audit_member_changes` records who did it.
    const supabase = await createClient();
    await supabase
      .from('company_members')
      .update({ role })
      .eq('company_id', context.activeCompany.id)
      .eq('user_id', userId);
  }

  revalidatePath(ROUTES.accountMembers);
  redirect(ROUTES.accountMembers);
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const context = await requireContext();
  const userId = text(formData, 'userId');

  if (context.activeCompany && isManager(context.activeRole)) {
    const supabase = await createClient();
    await supabase
      .from('company_members')
      .delete()
      .eq('company_id', context.activeCompany.id)
      .eq('user_id', userId);
  }

  revalidatePath(ROUTES.accountMembers);
  redirect(ROUTES.accountMembers);
}

export async function transferOwnershipAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await requireContext();
  const newOwnerId = text(formData, 'userId');
  const reason = text(formData, 'reason').trim();

  if (!context.activeCompany) return { error: 'Nu ai o firmă activă.' };

  const supabase = await createClient();
  const { error } = await supabase.rpc('transfer_company_ownership', {
    p_company_id: context.activeCompany.id,
    p_new_owner_user_id: newOwnerId,
    p_reason: reason === '' ? null : reason,
  });

  if (error) return { error: toAppError(error, 'transferOwnership').message };

  revalidatePath(ROUTES.accountMembers);
  revalidatePath('/cont', 'layout');
  return { notice: 'Proprietatea a fost transferată.' };
}
