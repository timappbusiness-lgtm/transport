'use server';

import { cookies } from 'next/headers';
import { revalidatePath, updateTag } from 'next/cache';
import { redirect } from 'next/navigation';
import { ROUTES } from '@/config/routes';
import { ACTIVE_COMPANY_COOKIE, getAccountContext, isManager } from '@/lib/auth/account';
import { DIRECTORY_TAG } from '@/lib/directory-source';
import { MAX_PUBLIC_DESCRIPTION } from '@/lib/directory';
import { toAppError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import { accountCopy } from '@/content/account';
import { firmaCopy } from '@/content/firma';
import {
  MAX_RATE,
  MIN_RATE,
  normaliseContactPhone,
  normaliseWebsite,
  tidyCodes,
} from '@/lib/company-profile';
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

/**
 * "Trimite firma la verificare".
 *
 * Nothing is decided here. `submit_company_for_review()` is SECURITY
 * DEFINER: it checks that the caller manages the company, that the company
 * is in draft or rejected, that ANAF does not call it inactive, and that
 * every blocking document is at least uploaded — then writes the audit row.
 * A `42501` or `23502` comes back as the Romanian sentence the migration
 * raised, which is what the user sees.
 */
export async function submitCompanyForReviewAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await getAccountContext();
  if (!context) redirect(ROUTES.signIn);

  const companyId = String(formData.get('company_id') ?? '');
  // The form field says which company was on screen; membership is the
  // session's, and the RPC re-checks it against auth.uid().
  if (!context.memberships.some((m) => m.company.id === companyId)) {
    return { error: accountCopy.review.notManager };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc('submit_company_for_review', {
    p_company_id: companyId,
  });

  if (error) return { error: toAppError(error, 'cont.submitForReview').message };

  revalidatePath(ROUTES.accountDocuments);
  revalidatePath(ROUTES.accountCompany);
  revalidatePath(ROUTES.account);
  return { notice: accountCopy.review.sent };
}

// ---------------------------------------------------------------------
// The public profile
// ---------------------------------------------------------------------

/**
 * Opting the firm into the public directory, and what its card says.
 *
 * These three columns are the ones `guard_company_write` deliberately
 * leaves writable after verification: a firm may change its mind about
 * appearing, and may rewrite its own description, without going back
 * through review. Everything else about the row stays locked, and the
 * length limit below is the same one the check constraint enforces — this
 * copy of it only exists so the user gets a sentence rather than a 23514.
 */
export async function updatePublicProfileAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await requireContext();
  const company = context.activeCompany;
  if (!company) return { error: 'Nu ai o firmă activă.' };

  const description = text(formData, 'publicDescription').trim();
  if (description.length > MAX_PUBLIC_DESCRIPTION) {
    return {
      fieldErrors: {
        publicDescription: `Descrierea poate avea cel mult ${MAX_PUBLIC_DESCRIPTION} de caractere.`,
      },
      values: { publicDescription: description },
    };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('companies')
    .update({
      public_profile_enabled: formData.get('publicProfileEnabled') === 'on',
      public_description: description === '' ? null : description,
    })
    .eq('id', company.id);

  if (error) return { error: toAppError(error, 'cont.updatePublicProfile').message };

  revalidatePath(ROUTES.accountCompany);
  updateTag(DIRECTORY_TAG);
  return { notice: accountCopy.publicProfile.saved };
}

/**
 * The logo, after the browser has already put the file in storage.
 *
 * The upload itself goes straight from the browser into the company's own
 * folder, which is what the bucket policies allow; this only records where
 * it landed. `null` clears it, and the object is left in place — a stray
 * 200 KB file is cheaper than a delete that races a page still rendering
 * the old path.
 */
export async function setCompanyLogoAction(path: string | null): Promise<ActionState> {
  const context = await requireContext();
  const company = context.activeCompany;
  if (!company) return { error: 'Nu ai o firmă activă.' };

  // The path is built in the browser, so it is checked rather than trusted:
  // anything outside this company's folder is refused here, and would be
  // refused by the storage policy as well.
  if (path !== null && !path.startsWith(`${company.id}/`)) {
    return { error: 'Calea fișierului nu aparține firmei tale.' };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('companies')
    .update({ logo_path: path })
    .eq('id', company.id);

  if (error) return { error: toAppError(error, 'cont.setCompanyLogo').message };

  revalidatePath(ROUTES.accountCompany);
  updateTag(DIRECTORY_TAG);
  return { notice: accountCopy.publicProfile.saved };
}

// ---------------------------------------------------------------------
// The company profile: coverage, capabilities and alerts
//
// One action per tab, because saving is per tab: a manager who fixed the
// telephone number should not have their half-finished county list sent
// with it, and an error has to be attributable to the tab that can fix it.
//
// Nothing here decides anything. The values are cleaned by the same rules
// `src/lib/company-profile.ts` states, sent, and whatever the trigger in
// migration 20260918090000 refuses comes back as its own Romanian message.
// ---------------------------------------------------------------------

function checked(formData: FormData, name: string): boolean {
  return formData.get(name) === 'on';
}

/** Every value of a repeated checkbox, cleaned the way `tidy_codes` does. */
function codes(formData: FormData, name: string, upper: boolean): string[] {
  return tidyCodes(
    formData.getAll(name).filter((v): v is string => typeof v === 'string'),
    upper,
  );
}

async function saveCompany(
  companyId: string,
  patch: Record<string, unknown>,
  context: string,
): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.from('companies').update(patch).eq('id', companyId);
  if (error) return { error: toAppError(error, context).message };

  revalidatePath(ROUTES.accountCompany);
  updateTag(DIRECTORY_TAG);
  return { notice: firmaCopy.saved };
}

export async function updateCompanyIdentityAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await requireContext();
  const company = context.activeCompany;
  if (!company) return { error: 'Nu ai o firmă activă.' };

  const phone = text(formData, 'contactPhone').trim();
  const email = text(formData, 'contactEmail').trim();
  const website = text(formData, 'website').trim();

  const fieldErrors: Record<string, string> = {};
  if (phone !== '' && normaliseContactPhone(phone) === null) {
    fieldErrors.contactPhone = 'Scrie numărul în forma +40722000111.';
  }
  if (website !== '' && normaliseWebsite(website) === null) {
    fieldErrors.website = 'Scrie adresa în forma https://firma.ro.';
  }
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const patch: Record<string, unknown> = {
    contact_phone: phone === '' ? null : phone,
    contact_email: email === '' ? null : email,
    website: website === '' ? null : website,
    county: text(formData, 'county').trim() || null,
    city: text(formData, 'city').trim() || null,
    address: text(formData, 'address').trim() || null,
    base_address_hidden: checked(formData, 'baseAddressHidden'),
  };

  // Identity is editable only while the company is a draft — the same rule
  // `guard_company_write` enforces. Leaving the fields out afterwards is
  // not the protection; it is so a manager gets a form they can act on
  // rather than an error about a box that should not have been there.
  if (company.verification_status === 'draft') {
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

  return saveCompany(company.id, patch, 'firma.identity');
}

export async function updateCoverageAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await requireContext();
  const company = context.activeCompany;
  if (!company) return { error: 'Nu ai o firmă activă.' };

  const scope = text(formData, 'coverageScope');
  if (scope !== 'judetean' && scope !== 'national' && scope !== 'international') {
    return { fieldErrors: { coverageScope: 'Alege zona în care transporți.' } };
  }

  const counties = codes(formData, 'coverageCounties', true);
  const countries = codes(formData, 'coverageCountries', true);

  if (scope === 'judetean' && counties.length === 0) {
    return { fieldErrors: { coverageCounties: 'Alege cel puțin un județ în care transporți.' } };
  }
  if (scope === 'international' && countries.length === 0) {
    return { fieldErrors: { coverageCountries: 'Alege cel puțin o țară în afara României.' } };
  }

  // The scope decides which of the two lists means anything, and the
  // trigger clears the other one anyway. Sending them empty keeps the two
  // sides saying the same thing.
  return saveCompany(
    company.id,
    {
      coverage_scope: scope,
      coverage_counties: scope === 'judetean' ? counties : [],
      coverage_countries: scope === 'international' ? countries : [],
    },
    'firma.coverage',
  );
}

export async function updateCapabilitiesAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await requireContext();
  const company = context.activeCompany;
  if (!company) return { error: 'Nu ai o firmă activă.' };

  const rawRate = text(formData, 'indicativeRate').trim().replace(',', '.');
  const note = text(formData, 'indicativeRateNote').trim();

  let rate: number | null = null;
  if (rawRate !== '') {
    const value = Number(rawRate);
    if (!Number.isFinite(value) || value < MIN_RATE || value > MAX_RATE) {
      return {
        fieldErrors: {
          indicativeRate: `Tariful orientativ este între ${MIN_RATE} și ${MAX_RATE} lei pe kilometru.`,
        },
      };
    }
    rate = value;
  } else if (note !== '') {
    return { fieldErrors: { indicativeRate: 'Scrie tariful înainte de observația despre el.' } };
  }

  return saveCompany(
    company.id,
    {
      vehicle_types_accepted: formData
        .getAll('vehicleTypesAccepted')
        .filter((v): v is string => typeof v === 'string'),
      equipment: codes(formData, 'equipment', false),
      services: codes(formData, 'services', false),
      indicative_rate_ron_per_km: rate,
      indicative_rate_note: note === '' ? null : note,
    },
    'firma.capabilities',
  );
}

export async function updateAlertsAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await requireContext();
  const company = context.activeCompany;
  if (!company) return { error: 'Nu ai o firmă activă.' };

  const enabled = checked(formData, 'alertsEnabled');
  const email = text(formData, 'alertsEmail').trim();

  // A switch with nowhere to send is a switch that does nothing, and the
  // account screen is the only place that can say so before it is on.
  if (enabled && email === '' && (company.contact_email ?? '') === '') {
    return {
      fieldErrors: { alertsEmail: 'Lasă o adresă de e-mail la care să primești alertele.' },
    };
  }

  return saveCompany(
    company.id,
    { alerts_enabled: enabled, alerts_email: email === '' ? null : email },
    'firma.alerts',
  );
}
