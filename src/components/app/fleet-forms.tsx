'use client';

import { useActionState } from 'react';
import { addRoute, createDriver, createVehicle, updateVehicle } from '@/app/actions/fleet';
import { initialActionState } from '@/lib/action-state';
import { COUNTRY_OPTIONS, VEHICLE_TYPE_LABELS, VEHICLE_TYPE_ORDER } from '@/lib/vehicles';
import { Field, FormMessage, SubmitButton, inputClasses } from './forms';

interface Specs {
  make: string | null;
  model: string | null;
  year: number | null;
  length_m: number | null;
  width_m: number | null;
  height_m: number | null;
  max_weight_kg: number | null;
}

function SpecFields({ errors, defaults }: { errors?: Record<string, string> | undefined; defaults?: Specs }) {
  const num = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Marcă" htmlFor="make">
          <input id="make" name="make" defaultValue={defaults?.make ?? ''} className={inputClasses} />
        </Field>
        <Field label="Model" htmlFor="model">
          <input id="model" name="model" defaultValue={defaults?.model ?? ''} className={inputClasses} />
        </Field>
        <Field label="An" htmlFor="year" error={errors?.year}>
          <input id="year" name="year" inputMode="numeric" defaultValue={num(defaults?.year)} className={inputClasses} />
        </Field>
      </div>
      <fieldset className="grid gap-3">
        <legend className="mb-1 text-sm font-medium">Dimensiuni și greutate</legend>
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Lungime (m)" htmlFor="length_m" error={errors?.length_m}>
            <input id="length_m" name="length_m" inputMode="decimal" defaultValue={num(defaults?.length_m)} className={inputClasses} />
          </Field>
          <Field label="Lățime (m)" htmlFor="width_m" error={errors?.width_m}>
            <input id="width_m" name="width_m" inputMode="decimal" defaultValue={num(defaults?.width_m)} className={inputClasses} />
          </Field>
          <Field label="Înălțime (m)" htmlFor="height_m" error={errors?.height_m}>
            <input id="height_m" name="height_m" inputMode="decimal" defaultValue={num(defaults?.height_m)} className={inputClasses} />
          </Field>
          <Field label="Masă maximă (kg)" htmlFor="max_weight_kg" error={errors?.max_weight_kg}>
            <input id="max_weight_kg" name="max_weight_kg" inputMode="numeric" defaultValue={num(defaults?.max_weight_kg)} className={inputClasses} />
          </Field>
        </div>
      </fieldset>
    </>
  );
}

export function NewVehicleForm({ companyId }: { companyId: string }) {
  const [state, action] = useActionState(createVehicle, initialActionState);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="company_id" value={companyId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Număr de înmatriculare" htmlFor="plate_number" error={state?.errors?.plate_number}>
          <input id="plate_number" name="plate_number" required placeholder="TM 01 CRD" className={`${inputClasses} font-mono uppercase`} />
        </Field>
        <Field label="Tip" htmlFor="vehicle_type" error={state?.errors?.vehicle_type}>
          <select id="vehicle_type" name="vehicle_type" defaultValue="platforma_auto" className={inputClasses}>
            {VEHICLE_TYPE_ORDER.map((t) => (
              <option key={t} value={t}>
                {VEHICLE_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Serie de șasiu (VIN)" htmlFor="vin">
          <input id="vin" name="vin" className={`${inputClasses} font-mono uppercase`} />
        </Field>
      </div>
      <SpecFields errors={state?.errors} />
      <FormMessage state={state} />
      <div>
        <SubmitButton size="sm" pendingLabel="Se adaugă…">
          Adaugă vehiculul
        </SubmitButton>
      </div>
    </form>
  );
}

export function EditVehicleForm({
  companyId,
  vehicleId,
  specs,
  assignedDriverId,
  drivers,
}: {
  companyId: string;
  vehicleId: string;
  specs: Specs;
  assignedDriverId: string | null;
  drivers: { id: string; full_name: string }[];
}) {
  const [state, action] = useActionState(updateVehicle, initialActionState);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="company_id" value={companyId} />
      <input type="hidden" name="vehicle_id" value={vehicleId} />
      <SpecFields errors={state?.errors} defaults={specs} />
      <Field label="Șofer desemnat" htmlFor="assigned_driver_id" hint={drivers.length === 0 ? 'Adaugă șoferi din pagina flotei.' : undefined}>
        <select id="assigned_driver_id" name="assigned_driver_id" defaultValue={assignedDriverId ?? ''} className={inputClasses}>
          <option value="">—</option>
          {drivers.map((d) => (
            <option key={d.id} value={d.id}>
              {d.full_name}
            </option>
          ))}
        </select>
      </Field>
      <FormMessage state={state} />
      <div>
        <SubmitButton size="sm" pendingLabel="Se salvează…">
          Salvează
        </SubmitButton>
      </div>
    </form>
  );
}

export function NewDriverForm({ companyId }: { companyId: string }) {
  const [state, action] = useActionState(createDriver, initialActionState);
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="company_id" value={companyId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nume" htmlFor="driver_name" error={state?.errors?.full_name}>
          <input id="driver_name" name="full_name" required className={inputClasses} />
        </Field>
        <Field label="Telefon" htmlFor="driver_phone">
          <input id="driver_phone" name="phone" type="tel" className={inputClasses} />
        </Field>
      </div>
      <FormMessage state={state} />
      <div>
        <SubmitButton size="sm" variant="secondary" pendingLabel="Se adaugă…">
          Adaugă șoferul
        </SubmitButton>
      </div>
    </form>
  );
}

export function AddRouteForm({ companyId, vehicleId }: { companyId: string; vehicleId: string }) {
  const [state, action] = useActionState(addRoute, initialActionState);
  const countrySelect = (id: string, name: string, defaultValue: string) => (
    <select id={id} name={name} defaultValue={defaultValue} className={inputClasses}>
      {COUNTRY_OPTIONS.map((c) => (
        <option key={c.code} value={c.code}>
          {c.name}
        </option>
      ))}
    </select>
  );
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="company_id" value={companyId} />
      <input type="hidden" name="vehicle_id" value={vehicleId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Din țara" htmlFor="from_country">
          {countrySelect('from_country', 'from_country', 'DE')}
        </Field>
        <Field label="Oraș (opțional)" htmlFor="from_city">
          <input id="from_city" name="from_city" className={inputClasses} />
        </Field>
        <Field label="Spre țara" htmlFor="to_country">
          {countrySelect('to_country', 'to_country', 'RO')}
        </Field>
        <Field label="Oraș (opțional)" htmlFor="to_city">
          <input id="to_city" name="to_city" className={inputClasses} />
        </Field>
      </div>
      <FormMessage state={state} />
      <div>
        <SubmitButton size="sm" variant="secondary" pendingLabel="Se adaugă…">
          Adaugă ruta
        </SubmitButton>
      </div>
    </form>
  );
}
