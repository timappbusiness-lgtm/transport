import 'server-only';
import type { AssistedStatus, ConsentChannel, StepState } from './onboarding';
import { createClient } from './supabase/server';
import { isSupabaseConfigured } from './supabase/env';

/**
 * Ce citesc ecranele de înscriere asistată.
 *
 * `admin_assisted_onboardings()` refuză singură pe cine nu este din
 * echipă, iar `assisted_onboarding_preview()` este singura funcție de
 * aici pe care o poate chema cineva fără cont — pentru că exact asta
 * este starea în care se află cineva care deschide linkul. Fișierul
 * acesta nu adaugă nicio regulă de acces.
 */

function report(where: string, error: { message: string } | null) {
  if (error) console.error(`[inscrieri:${where}]`, error.message);
}

export interface OnboardingRow {
  id: string;
  created_at: string;
  status: AssistedStatus;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  company_id: string | null;
  company_name: string | null;
  company_type: string | null;
  verification_status: string | null;
  staff_user_id: string;
  staff_name: string;
  consent_channel: ConsentChannel;
  consent_at: string;
  claim_sent_at: string | null;
  claim_expires_at: string | null;
  claimed_at: string | null;
  step_company: boolean;
  step_documents: boolean;
  step_vehicles: boolean;
  step_profile: boolean;
  documents_pending: number;
  solo_reviews: number;
  days_open: number;
}

export function stepsOf(row: OnboardingRow): StepState {
  return {
    firma: row.step_company,
    documente: row.step_documents,
    vehicule: row.step_vehicles,
    profil: row.step_profile,
  };
}

export async function loadOnboardings(
  status: AssistedStatus | null = null,
): Promise<OnboardingRow[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('admin_assisted_onboardings', {
    ...(status === null ? {} : { p_status: status }),
  });
  report('list', error);
  return (data ?? []) as OnboardingRow[];
}

export async function loadOnboarding(id: string): Promise<OnboardingRow | null> {
  const rows = await loadOnboardings();
  return rows.find((row) => row.id === id) ?? null;
}

export interface ClaimPreview {
  company_name: string;
  contact_name: string;
  email_hint: string;
  documents_count: number;
  vehicles_count: number;
  expires_at: string;
}

/**
 * Ce se vede înainte de a se înregistra cineva.
 *
 * Un token greșit, unul folosit și unul expirat întorc toate trei
 * `null`, pentru că baza le răspunde la fel dinadins: un mesaj diferit
 * pentru fiecare i-ar spune cuiva care încearcă token-uri care dintre
 * încercări au nimerit ceva real.
 */
export async function loadClaimPreview(token: string): Promise<ClaimPreview | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('assisted_onboarding_preview', {
    p_token: token,
  });
  if (error) return null;
  const rows = (data ?? []) as ClaimPreview[];
  return rows[0] ?? null;
}

export interface HandoverSummary {
  claimed_at: string;
  staff_name: string;
  documents_count: number;
  vehicles_count: number;
  has_coverage: boolean;
}

/** Bannerul de pe tabloul de bord. Fără rând, fără banner. */
export async function loadHandover(companyId: string): Promise<HandoverSummary | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('assisted_handover_summary', {
    p_company_id: companyId,
  });
  if (error) return null;
  const rows = (data ?? []) as HandoverSummary[];
  return rows[0] ?? null;
}

export interface AssistedPilot {
  started: number;
  sent: number;
  claimed: number;
  expired: number;
  verified: number;
  median_hours_to_verified: number | null;
  solo_reviews: number;
}

export async function loadAssistedPilot(
  from: string,
  to: string,
): Promise<AssistedPilot | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('pilot_assisted', { p_from: from, p_to: to });
  report('pilot', error);
  const rows = (data ?? []) as AssistedPilot[];
  return rows[0] ?? null;
}

export interface OnboardingDocument {
  id: string;
  kind: string;
  /** The Romanian name from `document_requirements`, not a second copy of it. */
  label: string;
  status: string;
  created_at: string;
  uploaded_on_behalf: boolean;
}

/** Documentele și vehiculele unei firme în curs de înscriere. */
export async function loadOnboardingContents(companyId: string): Promise<{
  documents: OnboardingDocument[];
  vehicles: { id: string; plate_number: string; vehicle_type: string }[];
}> {
  if (!isSupabaseConfigured()) return { documents: [], vehicles: [] };
  const supabase = await createClient();
  const [docs, vehicles, requirements] = await Promise.all([
    supabase
      .from('documents')
      .select('id, kind, status, created_at, uploaded_on_behalf')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false }),
    supabase
      .from('vehicles')
      .select('id, plate_number, vehicle_type')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false }),
    // The names live in the table the admin screen already reads them
    // from; a second map in TypeScript would be a second thing to keep
    // in step with a list an admin can grow.
    supabase.from('document_requirements').select('kind, label_ro'),
  ]);
  report('contents', docs.error ?? vehicles.error);

  const labels = new Map(
    ((requirements.data ?? []) as { kind: string; label_ro: string }[]).map((r) => [
      r.kind,
      r.label_ro,
    ]),
  );

  const rows = (docs.data ?? []) as {
    id: string;
    kind: string;
    status: string;
    created_at: string;
    uploaded_on_behalf: boolean;
  }[];

  return {
    documents: rows.map((row) => ({ ...row, label: labels.get(row.kind) ?? row.kind })),
    vehicles: (vehicles.data ?? []) as { id: string; plate_number: string; vehicle_type: string }[],
  };
}
