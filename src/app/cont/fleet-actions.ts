'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { ROUTES, vehicleRoute } from '@/config/routes';
import { getAccountContext, redirectToSignIn } from '@/lib/auth/account';
import { deleteServerDraft } from '@/lib/continuity/server-drafts';
import {
  ACCEPTED_DOCUMENT_TYPES,
  MAX_DOCUMENT_BYTES,
  documentStoragePath,
} from '@/lib/documents';
import { toAppError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';
import { VEHICLE_TYPE_ORDER, normalizePlate } from '@/lib/vehicles';
import type { ActionState } from './actions';

/**
 * Fleet and document actions.
 *
 * Ported from pull request #6, with one change that matters: there, each
 * action read `company_id` out of the submitted form and checked membership
 * against it. Here the company comes from the session, the same way the rest
 * of the account area works — a form field is what the user was looking at,
 * never a claim about which company they may write to. The database would
 * refuse a forged id anyway; this means it never gets the chance.
 */

type VehicleType = Database['public']['Enums']['vehicle_type'];
type DocumentKind = Database['public']['Enums']['document_kind'];

/** The signed-in user's active company, or a redirect. */
async function requireCompany() {
  const context = await getAccountContext();
  if (!context) return redirectToSignIn(ROUTES.accountFleet);
  if (!context.activeCompany) redirect(ROUTES.accountCompanyCreate);
  return { context, company: context.activeCompany };
}

function text(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? '').trim();
  return value === '' ? null : value;
}

/** "4,2" and "4.2" both mean 4.2 metres. */
function number(formData: FormData, name: string): number | null | 'invalid' {
  const raw = text(formData, name);
  if (raw === null) return null;
  const parsed = Number(raw.replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 'invalid';
}

interface Specs {
  values: Record<string, number | string | null>;
  fieldErrors: Record<string, string>;
}

/** The dimensions and weight shared by the create and edit forms. */
function readSpecs(formData: FormData): Specs {
  const fieldErrors: Record<string, string> = {};
  const values: Record<string, number | string | null> = {
    make: text(formData, 'make'),
    model: text(formData, 'model'),
  };

  const year = number(formData, 'year');
  if (
    year === 'invalid' ||
    (typeof year === 'number' && (year < 1950 || year > 2100 || !Number.isInteger(year)))
  ) {
    fieldErrors.year = 'An invalid.';
  } else {
    values.year = year;
  }

  for (const [field, label] of [
    ['length_m', 'Lungimea'],
    ['width_m', 'Lățimea'],
    ['height_m', 'Înălțimea'],
  ] as const) {
    const value = number(formData, field);
    if (value === 'invalid' || (typeof value === 'number' && value > 30)) {
      fieldErrors[field] = `${label} trebuie să fie un număr de metri sub 30.`;
    } else {
      values[field] = value;
    }
  }

  const weight = number(formData, 'max_weight_kg');
  if (weight === 'invalid' || (typeof weight === 'number' && !Number.isInteger(weight))) {
    fieldErrors.max_weight_kg = 'Greutatea se scrie în kilograme, număr întreg.';
  } else {
    values.max_weight_kg = weight;
  }

  return { values, fieldErrors };
}

// ---------------------------------------------------------------------
// Vehicles
// ---------------------------------------------------------------------

export interface VehicleState extends ActionState {
  /** The vehicle just added: the form stays, empty, for the next one. */
  created?: { id: string; plate: string };
}

/**
 * „Câte mașini încap": a whole number between 1 and 15, or nothing. The
 * database refuses anything else (`vehicles_platform_slots_ck`); this is
 * the sentence before the refusal.
 */
function slots(formData: FormData): number | null | 'invalid' {
  const raw = text(formData, 'platform_slots');
  if (raw === null) return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 1 && value <= 15 ? value : 'invalid';
}

export async function createVehicleAction(
  _prev: VehicleState,
  formData: FormData,
): Promise<VehicleState> {
  const { context, company } = await requireCompany();

  const plate = normalizePlate(String(formData.get('plate_number') ?? ''));
  const type = String(formData.get('vehicle_type') ?? '') as VehicleType;
  const { values, fieldErrors } = readSpecs(formData);
  const platformSlots = slots(formData);

  if (plate.length < 4) fieldErrors.plate_number = 'Număr de înmatriculare invalid.';
  if (!VEHICLE_TYPE_ORDER.includes(type)) fieldErrors.vehicle_type = 'Alege tipul vehiculului.';
  if (platformSlots === 'invalid') fieldErrors.platform_slots = 'Scrie un număr între 1 și 15.';
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('vehicles')
    .insert({
      company_id: company.id,
      plate_number: plate,
      vehicle_type: type,
      vin: text(formData, 'vin')?.toUpperCase() ?? null,
      platform_slots: platformSlots === 'invalid' ? null : platformSlots,
      ...values,
    })
    .select('id')
    .single();

  if (error || !data) {
    // 23505 is the per-company unique index on the plate. The generic
    // message for it would send someone hunting for a typo.
    if (error?.code === '23505') {
      return { fieldErrors: { plate_number: 'Firma are deja un vehicul cu acest număr.' } };
    }
    return { error: toAppError(error, 'fleet.createVehicle').message };
  }

  revalidatePath(ROUTES.accountFleet);
  revalidatePath(ROUTES.accountDocuments);
  // The vehicle exists: the form's draft goes on the account here, and in
  // the browser when the form reads `created`. The person stays, with an
  // empty form, for „Adaugă încă un vehicul" — the documents are asked for
  // later, when they want something that needs them.
  await deleteServerDraft(context.user.id, 'vehicul');
  return { created: { id: data.id, plate }, notice: `${plate} a fost adăugat.` };
}

export async function updateVehicleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { company } = await requireCompany();
  const vehicleId = String(formData.get('vehicle_id') ?? '');
  const { values, fieldErrors } = readSpecs(formData);
  if (Object.keys(fieldErrors).length > 0) return { fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase
    .from('vehicles')
    .update({ ...values, assigned_driver_id: text(formData, 'assigned_driver_id') })
    .eq('id', vehicleId)
    .eq('company_id', company.id);

  if (error) return { error: toAppError(error, 'fleet.updateVehicle').message };

  revalidatePath(vehicleRoute(vehicleId));
  revalidatePath(ROUTES.accountFleet);
  return { notice: 'Datele vehiculului au fost salvate.' };
}

export async function createDriverAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { company } = await requireCompany();

  const fullName = text(formData, 'full_name');
  if (fullName === null || fullName.length < 3) {
    return { fieldErrors: { full_name: 'Scrie numele șoferului.' } };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('drivers')
    .insert({ company_id: company.id, full_name: fullName, phone: text(formData, 'phone') });

  if (error) return { error: toAppError(error, 'fleet.createDriver').message };

  revalidatePath(ROUTES.accountFleet);
  return { notice: `${fullName} a fost adăugat.` };
}

// ---------------------------------------------------------------------
// Routes a vehicle runs
// ---------------------------------------------------------------------

export async function addRouteAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireCompany();
  const vehicleId = String(formData.get('vehicle_id') ?? '');

  const fromCountry = String(formData.get('from_country') ?? '');
  const toCountry = String(formData.get('to_country') ?? '');
  if (!/^[A-Z]{2}$/.test(fromCountry) || !/^[A-Z]{2}$/.test(toCountry)) {
    return { error: 'Alege țara de plecare și țara de sosire.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('vehicle_routes').insert({
    vehicle_id: vehicleId,
    from_country: fromCountry,
    from_city: text(formData, 'from_city'),
    to_country: toCountry,
    to_city: text(formData, 'to_city'),
  });

  if (error) {
    if (error.code === '23505') return { error: 'Ruta este deja adăugată.' };
    return { error: toAppError(error, 'fleet.addRoute').message };
  }

  revalidatePath(vehicleRoute(vehicleId));
  return { notice: 'Ruta a fost adăugată.' };
}

/**
 * Plain void action, the shape the account area uses for a one-button
 * destructive form. RLS decides whether the row goes; a refusal leaves the
 * list unchanged and the page simply re-renders with the route still there.
 */
export async function removeRouteAction(formData: FormData): Promise<void> {
  await requireCompany();
  const vehicleId = String(formData.get('vehicle_id') ?? '');

  const supabase = await createClient();
  const { error } = await supabase
    .from('vehicle_routes')
    .delete()
    .eq('id', String(formData.get('route_id') ?? ''))
    .eq('vehicle_id', vehicleId);

  if (error) console.error('[fleet.removeRoute]', toAppError(error, 'fleet.removeRoute').message);

  revalidatePath(vehicleRoute(vehicleId));
}

// ---------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------

export interface RegisterDocumentInput {
  documentId: string;
  vehicleId: string | null;
  kind: DocumentKind;
  fileName: string;
  mime: string;
  size: number;
}

/**
 * Registers a document whose file is already in the bucket.
 *
 * Idempotent on the document id, which the device chose once and sends on
 * every attempt: a retry after a lost answer finds the row the first
 * attempt made (`documents_pkey`) and reports success instead of a
 * duplicate. The bucket's and the table's own policies enforce the real
 * limits; this is the readable sentence before them.
 *
 * Reading the document with AI is a separate call (`readDocumentAction`),
 * made by the screen once this answers: the file is safe and counted the
 * moment it is registered, whatever the model then does.
 */
export async function registerDocumentAction(
  input: RegisterDocumentInput,
): Promise<ActionState> {
  const { context, company } = await requireCompany();

  if (
    !(ACCEPTED_DOCUMENT_TYPES as readonly string[]).includes(input.mime) ||
    input.size > MAX_DOCUMENT_BYTES
  ) {
    return { error: 'Încarcă un PDF sau o fotografie de cel mult 10 MB.' };
  }

  const supabase = await createClient();
  const { error } = await supabase.from('documents').insert({
    id: input.documentId,
    company_id: company.id,
    vehicle_id: input.vehicleId,
    scope: input.vehicleId ? 'vehicle' : 'company',
    kind: input.kind,
    file_path: documentStoragePath(company.id, input.documentId, input.fileName),
    file_mime: input.mime,
    file_size_bytes: input.size,
    uploaded_by: context.user.id,
  });

  // The same id twice is the same document: the first attempt got through
  // and only its answer was lost — when the row is this firm's own. An id
  // that collides with anything else is refused, not reported as saved.
  if (error) {
    const again =
      error.code === '23505' && /documents_pkey/.test(error.message)
        ? await supabase.from('documents').select('id').eq('id', input.documentId).eq('company_id', company.id).maybeSingle()
        : { data: null };
    if (!again.data) return { error: toAppError(error, 'documents.register').message };
  }

  revalidatePath(ROUTES.accountDocuments);
  revalidatePath(ROUTES.account);
  if (input.vehicleId) revalidatePath(vehicleRoute(input.vehicleId));

  return { notice: 'Document încărcat. Urmează verificarea de către echipa platformei.' };
}
