'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ROUTES, onboardingRoute } from '@/config/routes';
import { requireAccountContext } from '@/lib/auth/account';
import { doneUrl } from '@/lib/continuity/drafts';
import { deleteServerDraft } from '@/lib/continuity/server-drafts';
import { toAppError } from '@/lib/errors';
import {
  normaliseOnboardingPhone,
  validateContact,
  hasErrors,
  type ConsentChannel,
} from '@/lib/onboarding';
import { createClient } from '@/lib/supabase/server';

/**
 * Ce face echipa, în numele firmei.
 *
 * Fiecare acțiune de aici cheamă un RPC care verifică din nou cine este
 * apelantul. Validarea din fișierul acesta este pentru mesaje citibile,
 * nu pentru siguranță: dacă ar dispărea toată, nimeni nu ar căpăta
 * niciun drept în plus.
 */

export interface OnboardingState {
  error?: string;
  notice?: string;
  /** Tokenul, arătat o singură dată după ce a fost generat. */
  token?: string;
  fieldErrors?: Record<string, string>;
}

function text(formData: FormData, name: string): string {
  return String(formData.get(name) ?? '').trim();
}

export async function startOnboardingAction(
  _previous: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const context = await requireAccountContext(ROUTES.adminOnboardings);

  const input = {
    name: text(formData, 'contact_name'),
    email: text(formData, 'contact_email'),
    phone: text(formData, 'contact_phone'),
    channel: text(formData, 'consent_channel'),
    consentDate: text(formData, 'consent_date'),
    consentConfirmed: formData.get('consent_confirmed') !== null,
  };

  const errors = validateContact(input);
  if (hasErrors(errors)) return { fieldErrors: errors as Record<string, string> };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('start_assisted_onboarding', {
    p_contact_name: input.name,
    p_contact_email: input.email,
    p_contact_phone: normaliseOnboardingPhone(input.phone),
    p_consent_channel: input.channel as ConsentChannel,
    // Midday, so a date typed in Bucharest does not become the previous
    // day once it is stored as UTC.
    p_consent_at: new Date(`${input.consentDate}T12:00:00`).toISOString(),
    p_consent_note: text(formData, 'consent_note') || undefined,
  });

  if (error) return { error: toAppError(error, 'inscrieri.start').message };

  revalidatePath(ROUTES.adminOnboardings);
  // Started: the consent form's draft goes, here and in the browser.
  await deleteServerDraft(context.user.id, 'inscriere-asistata');
  redirect(doneUrl(onboardingRoute((data as { id: string }).id, 'firma'), 'inscriere-asistata'));
}

export async function createOnboardingCompanyAction(
  _previous: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  await requireAccountContext(ROUTES.adminOnboardings);

  const id = text(formData, 'onboarding_id');
  const cui = text(formData, 'cui');
  const legalName = text(formData, 'legal_name');
  const companyType = text(formData, 'company_type');

  if (id === '') return { error: 'Lipsește înscrierea.' };
  if (cui === '') return { fieldErrors: { cui: 'Scrie CUI-ul firmei.' } };
  if (legalName === '') return { fieldErrors: { legal_name: 'Scrie denumirea firmei.' } };
  if (companyType === '') return { fieldErrors: { company_type: 'Alege ce face firma.' } };

  const supabase = await createClient();
  const { error } = await supabase.rpc('assisted_create_company', {
    p_onboarding_id: id,
    p_cui: cui,
    p_legal_name: legalName,
    p_company_type: companyType as 'transport' | 'expeditie' | 'both',
    p_county: text(formData, 'county') || undefined,
    p_city: text(formData, 'city') || undefined,
    p_contact_email: text(formData, 'contact_email') || undefined,
    p_contact_phone: text(formData, 'contact_phone') || undefined,
  });

  if (error) return { error: toAppError(error, 'inscrieri.company').message };

  revalidatePath(onboardingRoute(id));
  redirect(onboardingRoute(id, 'documente'));
}

export async function addOnboardingVehicleAction(
  _previous: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  await requireAccountContext(ROUTES.adminOnboardings);

  const id = text(formData, 'onboarding_id');
  const companyId = text(formData, 'company_id');
  const plate = text(formData, 'plate_number').toUpperCase().replace(/\s+/g, '');
  const vehicleType = text(formData, 'vehicle_type');
  const weight = Number(text(formData, 'max_weight_kg'));

  if (companyId === '') return { error: 'Firma nu a fost creată încă.' };
  if (plate.length < 5) return { fieldErrors: { plate_number: 'Scrie numărul de înmatriculare.' } };
  if (vehicleType === '') return { fieldErrors: { vehicle_type: 'Alege tipul vehiculului.' } };

  const supabase = await createClient();
  const { error } = await supabase.from('vehicles').insert({
    company_id: companyId,
    plate_number: plate,
    vehicle_type: vehicleType as 'platforma_auto',
    ...(Number.isFinite(weight) && weight > 0 ? { max_weight_kg: weight } : {}),
  });

  if (error) return { error: toAppError(error, 'inscrieri.vehicle').message };

  revalidatePath(onboardingRoute(id));
  return { notice: `Vehiculul ${plate} a fost adăugat.` };
}

/**
 * Profilul și acoperirea.
 *
 * Scrise direct pe `companies`, prin politica obișnuită — echipa o avea
 * deja. `guard_company_write` refuză oricum câmpurile pe care nimeni nu
 * are voie să le schimbe din afară.
 */
export async function saveOnboardingProfileAction(
  _previous: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const context = await requireAccountContext(ROUTES.adminOnboardings);

  const id = text(formData, 'onboarding_id');
  const companyId = text(formData, 'company_id');
  if (companyId === '') return { error: 'Firma nu a fost creată încă.' };

  const counties = formData.getAll('counties').map(String).filter((v) => v !== '');
  const services = formData.getAll('services').map(String).filter((v) => v !== '');
  const equipment = formData.getAll('equipment').map(String).filter((v) => v !== '');
  const scope = text(formData, 'coverage_scope');

  const supabase = await createClient();
  const { error } = await supabase
    .from('companies')
    .update({
      coverage_scope: (scope === '' ? 'national' : scope) as 'national',
      coverage_counties: counties,
      services,
      equipment,
      profile_updated_at: new Date().toISOString(),
    })
    .eq('id', companyId);

  if (error) return { error: toAppError(error, 'inscrieri.profile').message };

  revalidatePath(onboardingRoute(id));
  await deleteServerDraft(context.user.id, 'inscriere-asistata', `${id}-profil`);
  redirect(doneUrl(onboardingRoute(id, 'link'), 'inscriere-asistata', `${id}-profil`));
}

/**
 * Linkul de preluare.
 *
 * `token` se întoarce în stare și se arată o singură dată. Baza ține
 * doar amprenta lui, deci o a doua vizită pe ecran nu îl mai poate
 * recupera — iar asta este intenționat, nu o limitare.
 */
export async function issueClaimAction(
  _previous: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  await requireAccountContext(ROUTES.adminOnboardings);

  const id = text(formData, 'onboarding_id');
  if (id === '') return { error: 'Lipsește înscrierea.' };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('issue_assisted_claim', { p_onboarding_id: id });
  if (error) return { error: toAppError(error, 'inscrieri.claim').message };

  revalidatePath(ROUTES.adminOnboardings);
  revalidatePath(onboardingRoute(id));
  return { notice: 'Linkul a fost generat și e-mailul este în coadă.', token: String(data) };
}
