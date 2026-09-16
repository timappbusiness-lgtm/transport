'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { companyRoutes } from '@/config/routes';
import { type ActionState, messageFromError } from '@/lib/action-state';
import { requireMembership } from '@/lib/auth';
import type { Database } from '@/lib/supabase/database.types';
import { VEHICLE_TYPE_ORDER, normalizePlate } from '@/lib/vehicles';

type VehicleType = Database['public']['Enums']['vehicle_type'];

function text(formData: FormData, name: string): string | null {
  const v = String(formData.get(name) ?? '').trim();
  return v ? v : null;
}

/** "4,2" and "4.2" both mean 4.2 metres. */
function number(formData: FormData, name: string): number | null | 'invalid' {
  const raw = text(formData, name);
  if (raw === null) return null;
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 'invalid';
}

function specs(formData: FormData): { values: Record<string, number | string | null>; errors: Record<string, string> } {
  const errors: Record<string, string> = {};
  const values: Record<string, number | string | null> = {
    make: text(formData, 'make'),
    model: text(formData, 'model'),
  };
  const year = number(formData, 'year');
  if (year === 'invalid' || (typeof year === 'number' && (year < 1950 || year > 2100 || !Number.isInteger(year)))) {
    errors.year = 'An invalid.';
  } else values.year = year;

  for (const [field, label] of [['length_m', 'Lungime'], ['width_m', 'Lățime'], ['height_m', 'Înălțime']] as const) {
    const v = number(formData, field);
    if (v === 'invalid' || (typeof v === 'number' && v > 30)) errors[field] = `${label} invalidă (metri).`;
    else values[field] = v;
  }
  const weight = number(formData, 'max_weight_kg');
  if (weight === 'invalid' || (typeof weight === 'number' && !Number.isInteger(weight))) {
    errors.max_weight_kg = 'Greutate invalidă (kg, număr întreg).';
  } else values.max_weight_kg = weight;
  return { values, errors };
}

export async function createVehicle(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const companyId = String(formData.get('company_id') ?? '');
  const { session } = await requireMembership(companyId);

  const plate = normalizePlate(String(formData.get('plate_number') ?? ''));
  const type = String(formData.get('vehicle_type') ?? '') as VehicleType;
  const { values, errors } = specs(formData);
  if (plate.length < 4) errors.plate_number = 'Număr de înmatriculare invalid.';
  if (!VEHICLE_TYPE_ORDER.includes(type)) errors.vehicle_type = 'Alege tipul vehiculului.';
  if (Object.keys(errors).length) return { ok: false, errors };

  const { data, error } = await session.supabase
    .from('vehicles')
    .insert({
      company_id: companyId,
      plate_number: plate,
      vehicle_type: type,
      vin: text(formData, 'vin')?.toUpperCase() ?? null,
      ...values,
    })
    .select('id')
    .single();
  if (error || !data) {
    return {
      ok: false,
      message: error?.code === '23505' ? 'Firma are deja un vehicul cu acest număr.' : messageFromError(error),
    };
  }
  revalidatePath(companyRoutes(companyId).fleet);
  redirect(companyRoutes(companyId).vehicle(data.id));
}

export async function updateVehicle(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const companyId = String(formData.get('company_id') ?? '');
  const vehicleId = String(formData.get('vehicle_id') ?? '');
  const { session } = await requireMembership(companyId);

  const { values, errors } = specs(formData);
  if (Object.keys(errors).length) return { ok: false, errors };

  const { error } = await session.supabase
    .from('vehicles')
    .update({ ...values, assigned_driver_id: text(formData, 'assigned_driver_id') })
    .eq('id', vehicleId)
    .eq('company_id', companyId);
  if (error) return { ok: false, message: messageFromError(error) };
  revalidatePath(companyRoutes(companyId).vehicle(vehicleId));
  revalidatePath(companyRoutes(companyId).fleet);
  return { ok: true, message: 'Datele vehiculului au fost salvate.' };
}

export async function createDriver(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const companyId = String(formData.get('company_id') ?? '');
  const { session } = await requireMembership(companyId);
  const fullName = text(formData, 'full_name');
  if (!fullName || fullName.length < 3) return { ok: false, errors: { full_name: 'Scrie numele șoferului.' } };

  const { error } = await session.supabase
    .from('drivers')
    .insert({ company_id: companyId, full_name: fullName, phone: text(formData, 'phone') });
  if (error) return { ok: false, message: messageFromError(error) };
  revalidatePath(companyRoutes(companyId).fleet);
  return { ok: true, message: `${fullName} a fost adăugat.` };
}

export async function addRoute(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const companyId = String(formData.get('company_id') ?? '');
  const vehicleId = String(formData.get('vehicle_id') ?? '');
  const { session } = await requireMembership(companyId);

  const fromCountry = String(formData.get('from_country') ?? '');
  const toCountry = String(formData.get('to_country') ?? '');
  if (!/^[A-Z]{2}$/.test(fromCountry) || !/^[A-Z]{2}$/.test(toCountry)) {
    return { ok: false, message: 'Alege țara de plecare și de sosire.' };
  }

  const { error } = await session.supabase.from('vehicle_routes').insert({
    vehicle_id: vehicleId,
    from_country: fromCountry,
    from_city: text(formData, 'from_city'),
    to_country: toCountry,
    to_city: text(formData, 'to_city'),
  });
  if (error) {
    return { ok: false, message: error.code === '23505' ? 'Ruta este deja adăugată.' : messageFromError(error) };
  }
  revalidatePath(companyRoutes(companyId).vehicle(vehicleId));
  return { ok: true, message: 'Ruta a fost adăugată.' };
}

export async function removeRoute(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const companyId = String(formData.get('company_id') ?? '');
  const vehicleId = String(formData.get('vehicle_id') ?? '');
  const { session } = await requireMembership(companyId);

  const { error } = await session.supabase
    .from('vehicle_routes')
    .delete()
    .eq('id', String(formData.get('route_id') ?? ''))
    .eq('vehicle_id', vehicleId);
  if (error) return { ok: false, message: messageFromError(error) };
  revalidatePath(companyRoutes(companyId).vehicle(vehicleId));
  return { ok: true };
}
