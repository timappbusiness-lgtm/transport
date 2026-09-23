'use client';

import { useId } from 'react';
import type { ActionState } from '@/app/cont/actions';
import {
  addRouteAction,
  createDriverAction,
  createVehicleAction,
  updateVehicleAction,
} from '@/app/cont/fleet-actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { COUNTRY_OPTIONS, VEHICLE_TYPE_LABELS, VEHICLE_TYPE_ORDER } from '@/lib/vehicles';
import { cn } from '@/lib/utils';
import { KeepingForm } from '@/components/ui/keeping-form';
import { useKeptActionState } from '@/lib/continuity/use-kept-action-state';

const EMPTY: ActionState = {};

const CONTROL =
  'w-full rounded-input border bg-surface px-3.5 py-2.5 text-body border-border-strong';

/**
 * The shared `Field` renders its own input, which these forms cannot use:
 * most of their controls are selects. This is the same label, hint and
 * error wiring around arbitrary children.
 */
function Labelled({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string | undefined;
  error?: string | undefined;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-body font-medium">
        {label}
      </label>
      {children}
      {hint ? <p className="text-small text-muted">{hint}</p> : null}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-small text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function Submit({
  children,
  pendingLabel,
  variant = 'primary',
}: {
  children: React.ReactNode;
  pendingLabel: string;
  variant?: 'primary' | 'secondary';
}) {
  return (
    <button type="submit" className={buttonClasses(variant, 'sm')} data-pending-label={pendingLabel}>
      {children}
    </button>
  );
}

export interface VehicleSpecs {
  make: string | null;
  model: string | null;
  year: number | null;
  length_m: number | null;
  width_m: number | null;
  height_m: number | null;
  max_weight_kg: number | null;
}

function numberValue(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

function SpecFields({
  fieldErrors,
  defaults,
  prefix,
}: {
  fieldErrors?: Record<string, string> | undefined;
  defaults?: VehicleSpecs | undefined;
  prefix: string;
}) {
  const field = (name: string) => `${prefix}-${name}`;
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Labelled label="Marcă" htmlFor={field('make')}>
          <input
            id={field('make')}
            name="make"
            defaultValue={defaults?.make ?? ''}
            className={CONTROL}
          />
        </Labelled>
        <Labelled label="Model" htmlFor={field('model')}>
          <input
            id={field('model')}
            name="model"
            defaultValue={defaults?.model ?? ''}
            className={CONTROL}
          />
        </Labelled>
        <Labelled label="An" htmlFor={field('year')} error={fieldErrors?.year}>
          <input
            id={field('year')}
            name="year"
            inputMode="numeric"
            defaultValue={numberValue(defaults?.year)}
            className={cn(CONTROL, fieldErrors?.year && 'border-danger')}
          />
        </Labelled>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-body font-medium">Dimensiuni și greutate</legend>
        <div className="grid gap-3 sm:grid-cols-4">
          {(
            [
              ['length_m', 'Lungime (m)', 'decimal'],
              ['width_m', 'Lățime (m)', 'decimal'],
              ['height_m', 'Înălțime (m)', 'decimal'],
              ['max_weight_kg', 'Masă maximă (kg)', 'numeric'],
            ] as const
          ).map(([name, label, mode]) => (
            <Labelled
              key={name}
              label={label}
              htmlFor={field(name)}
              error={fieldErrors?.[name]}
            >
              <input
                id={field(name)}
                name={name}
                inputMode={mode}
                defaultValue={numberValue(defaults?.[name])}
                className={cn(CONTROL, fieldErrors?.[name] && 'border-danger')}
              />
            </Labelled>
          ))}
        </div>
      </fieldset>
    </>
  );
}

export function NewVehicleForm() {
  const [state, action] = useKeptActionState(createVehicleAction, EMPTY);
  const id = useId();

  return (
    <KeepingForm action={action} className="flex flex-col gap-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-3">
        <Labelled
          label="Număr de înmatriculare"
          htmlFor={`${id}-plate`}
          error={state.fieldErrors?.plate_number}
        >
          <input
            id={`${id}-plate`}
            name="plate_number"
            required
            placeholder="TM 01 CRD"
            className={cn(
              CONTROL,
              'font-mono uppercase',
              state.fieldErrors?.plate_number && 'border-danger',
            )}
          />
        </Labelled>
        <Labelled
          label="Tip"
          htmlFor={`${id}-type`}
          error={state.fieldErrors?.vehicle_type}
        >
          <select
            id={`${id}-type`}
            name="vehicle_type"
            defaultValue="platforma_auto"
            className={CONTROL}
          >
            {VEHICLE_TYPE_ORDER.map((type) => (
              <option key={type} value={type}>
                {VEHICLE_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </Labelled>
        <Labelled label="Serie de șasiu (VIN)" htmlFor={`${id}-vin`}>
          <input id={`${id}-vin`} name="vin" className={cn(CONTROL, 'font-mono uppercase')} />
        </Labelled>
      </div>

      <SpecFields fieldErrors={state.fieldErrors} prefix={`${id}-new`} />

      <FormError>{state.error}</FormError>
      <FormNotice>{state.notice}</FormNotice>

      <div>
        <Submit pendingLabel="Se adaugă…">Adaugă vehiculul</Submit>
      </div>
    </KeepingForm>
  );
}

export function EditVehicleForm({
  vehicleId,
  specs,
  assignedDriverId,
  drivers,
}: {
  vehicleId: string;
  specs: VehicleSpecs;
  assignedDriverId: string | null;
  drivers: { id: string; full_name: string }[];
}) {
  const [state, action] = useKeptActionState(updateVehicleAction, EMPTY);
  const id = useId();

  return (
    <KeepingForm action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="vehicle_id" value={vehicleId} />
      <SpecFields fieldErrors={state.fieldErrors} defaults={specs} prefix={`${id}-edit`} />

      <Labelled
        label="Șofer desemnat"
        htmlFor={`${id}-driver`}
        hint={drivers.length === 0 ? 'Adaugă șoferi din pagina flotei.' : undefined}
      >
        <select
          id={`${id}-driver`}
          name="assigned_driver_id"
          defaultValue={assignedDriverId ?? ''}
          className={CONTROL}
        >
          <option value="">—</option>
          {drivers.map((driver) => (
            <option key={driver.id} value={driver.id}>
              {driver.full_name}
            </option>
          ))}
        </select>
      </Labelled>

      <FormError>{state.error}</FormError>
      <FormNotice>{state.notice}</FormNotice>

      <div>
        <Submit pendingLabel="Se salvează…">Salvează</Submit>
      </div>
    </KeepingForm>
  );
}

export function NewDriverForm() {
  const [state, action] = useKeptActionState(createDriverAction, EMPTY);
  const id = useId();

  return (
    <KeepingForm action={action} className="flex flex-col gap-3" noValidate>
      <div className="grid gap-3 sm:grid-cols-2">
        <Labelled label="Nume" htmlFor={`${id}-name`} error={state.fieldErrors?.full_name}>
          <input
            id={`${id}-name`}
            name="full_name"
            required
            className={cn(CONTROL, state.fieldErrors?.full_name && 'border-danger')}
          />
        </Labelled>
        <Labelled label="Telefon" htmlFor={`${id}-phone`}>
          <input id={`${id}-phone`} name="phone" type="tel" className={CONTROL} />
        </Labelled>
      </div>

      <FormError>{state.error}</FormError>
      <FormNotice>{state.notice}</FormNotice>

      <div>
        <Submit variant="secondary" pendingLabel="Se adaugă…">
          Adaugă șoferul
        </Submit>
      </div>
    </KeepingForm>
  );
}

export function AddRouteForm({ vehicleId }: { vehicleId: string }) {
  const [state, action] = useKeptActionState(addRouteAction, EMPTY);
  const id = useId();

  const countries = (name: string, defaultValue: string) => (
    <select id={`${id}-${name}`} name={name} defaultValue={defaultValue} className={CONTROL}>
      {COUNTRY_OPTIONS.map((country) => (
        <option key={country.code} value={country.code}>
          {country.name}
        </option>
      ))}
    </select>
  );

  return (
    <KeepingForm action={action} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="vehicle_id" value={vehicleId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Labelled label="Din țara" htmlFor={`${id}-from_country`}>
          {countries('from_country', 'DE')}
        </Labelled>
        <Labelled label="Oraș (opțional)" htmlFor={`${id}-from_city`}>
          <input id={`${id}-from_city`} name="from_city" className={CONTROL} />
        </Labelled>
        <Labelled label="Spre țara" htmlFor={`${id}-to_country`}>
          {countries('to_country', 'RO')}
        </Labelled>
        <Labelled label="Oraș (opțional)" htmlFor={`${id}-to_city`}>
          <input id={`${id}-to_city`} name="to_city" className={CONTROL} />
        </Labelled>
      </div>

      <FormError>{state.error}</FormError>
      <FormNotice>{state.notice}</FormNotice>

      <div>
        <Submit variant="secondary" pendingLabel="Se adaugă…">
          Adaugă ruta
        </Submit>
      </div>
    </KeepingForm>
  );
}
