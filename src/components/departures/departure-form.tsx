'use client';

import { useActionState, useId } from 'react';
import { createDepartureAction, type DepartureActionState } from '@/app/cont/trasee/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { departuresCopy } from '@/content/departures';
import {
  CARGO_CATEGORY_LABELS,
  FILTERABLE_CATEGORIES,
  SERVICE_TYPE_LABELS,
  SERVICE_TYPE_NOTES,
} from '@/lib/departures';
import { COUNTRY_OPTIONS, formatPlate } from '@/lib/vehicles';
import { cn } from '@/lib/utils';

const EMPTY: DepartureActionState = {};
const CONTROL = 'w-full rounded-input border border-border-strong bg-surface px-3.5 py-2.5 text-[0.9375rem]';

export interface EligibleVehicle {
  id: string;
  plate_number: string;
  make: string | null;
  model: string | null;
}

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
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}

/**
 * Publishing a departure.
 *
 * The form collects; the database decides. `guard_truck_listing_publish`
 * refuses a suspended company or a vehicle whose ITP, RCA or copie conformă
 * has lapsed, and the plan quota refuses a fourth active listing on the free
 * plan. Both raise written Romanian messages, which appear above the button.
 */
export function DepartureForm({ vehicles }: { vehicles: EligibleVehicle[] }) {
  const [state, action] = useActionState(createDepartureAction, EMPTY);
  const id = useId();
  const c = departuresCopy.form;

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">{c.direction}</legend>
        {(
          [
            ['retur', c.directionRetur],
            ['tur', c.directionTur],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2.5 text-sm">
            <input
              type="radio"
              name="direction"
              value={value}
              defaultChecked={value === 'retur'}
              className="size-4 accent-[#1C262B]"
            />
            {label}
          </label>
        ))}
        {state.fieldErrors?.direction ? (
          <p className="text-xs text-danger">{state.fieldErrors.direction}</p>
        ) : null}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Labelled label={c.from} htmlFor={`${id}-from`} error={state.fieldErrors?.from_city}>
          <div className="flex gap-2">
            <select name="from_country" defaultValue="DE" className={cn(CONTROL, 'w-28')} aria-label="Țara de plecare">
              {COUNTRY_OPTIONS.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.code}
                </option>
              ))}
            </select>
            <input id={`${id}-from`} name="from_city" required placeholder="München" className={CONTROL} />
          </div>
        </Labelled>

        <Labelled label={c.to} htmlFor={`${id}-to`} error={state.fieldErrors?.to_city}>
          <div className="flex gap-2">
            <select name="to_country" defaultValue="RO" className={cn(CONTROL, 'w-28')} aria-label="Țara de sosire">
              {COUNTRY_OPTIONS.map((country) => (
                <option key={country.code} value={country.code}>
                  {country.code}
                </option>
              ))}
            </select>
            <input id={`${id}-to`} name="to_city" required placeholder="Cluj-Napoca" className={CONTROL} />
          </div>
        </Labelled>
      </div>

      <Labelled label={c.waypoints} htmlFor={`${id}-waypoints`} hint={c.waypointsHint}>
        <input id={`${id}-waypoints`} name="waypoints" placeholder="Viena, Budapesta" className={CONTROL} />
      </Labelled>

      <div className="grid gap-4 sm:grid-cols-2">
        <Labelled
          label={c.availableFrom}
          htmlFor={`${id}-from-date`}
          error={state.fieldErrors?.available_from}
        >
          <input id={`${id}-from-date`} type="date" name="available_from" required className={CONTROL} />
        </Labelled>
        <Labelled
          label={c.availableTo}
          htmlFor={`${id}-to-date`}
          error={state.fieldErrors?.available_to}
        >
          <input id={`${id}-to-date`} type="date" name="available_to" className={CONTROL} />
        </Labelled>
      </div>

      <Labelled label={c.vehicle} htmlFor={`${id}-vehicle`} error={state.fieldErrors?.vehicle_id}>
        <select id={`${id}-vehicle`} name="vehicle_id" defaultValue="" className={CONTROL}>
          <option value="" disabled>
            Alege…
          </option>
          {vehicles.map((vehicle) => (
            <option key={vehicle.id} value={vehicle.id}>
              {formatPlate(vehicle.plate_number)}
              {vehicle.make ? ` · ${vehicle.make}${vehicle.model ? ` ${vehicle.model}` : ''}` : ''}
            </option>
          ))}
        </select>
      </Labelled>

      <div className="grid gap-4 sm:grid-cols-2">
        <Labelled
          label={c.slots}
          htmlFor={`${id}-slots`}
          hint={c.slotsHint}
          error={state.fieldErrors?.platform_slots_total}
        >
          <input id={`${id}-slots`} name="platform_slots_total" inputMode="numeric" placeholder="8" className={CONTROL} />
        </Labelled>
        <Labelled
          label={c.maxDetour}
          htmlFor={`${id}-detour`}
          error={state.fieldErrors?.max_detour_km}
        >
          <input id={`${id}-detour`} name="max_detour_km" inputMode="numeric" defaultValue="50" className={CONTROL} />
        </Labelled>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{c.accepted}</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {FILTERABLE_CATEGORIES.map((category) => (
            <label key={category} className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                name="accepted_vehicle_types"
                value={category}
                defaultChecked={category === 'autoturism'}
                className="size-4 accent-[#1C262B]"
              />
              {CARGO_CATEGORY_LABELS[category]}
            </label>
          ))}
        </div>
        {state.fieldErrors?.accepted_vehicle_types ? (
          <p className="text-xs text-danger">{state.fieldErrors.accepted_vehicle_types}</p>
        ) : null}
      </fieldset>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-1 text-sm font-medium">{c.services}</legend>
        {(['pe_sens', 'expres', 'tractare'] as const).map((service) => (
          <label key={service} className="flex items-start gap-2.5 text-sm">
            <input
              type="checkbox"
              name="service_types"
              value={service}
              defaultChecked={service === 'pe_sens'}
              className="mt-0.5 size-4 accent-[#1C262B]"
            />
            <span>
              <span className="font-medium">{SERVICE_TYPE_LABELS[service]}</span>
              <span className="block text-xs text-muted">{SERVICE_TYPE_NOTES[service]}</span>
            </span>
          </label>
        ))}
        {state.fieldErrors?.service_types ? (
          <p className="text-xs text-danger">{state.fieldErrors.service_types}</p>
        ) : null}
      </fieldset>

      <Labelled
        label={c.price}
        htmlFor={`${id}-price`}
        hint={c.priceHint}
        error={state.fieldErrors?.price_indicative}
      >
        <input id={`${id}-price`} name="price_indicative" inputMode="decimal" placeholder="650" className={CONTROL} />
      </Labelled>

      <FormError>{state.error}</FormError>
      <FormNotice>{state.notice}</FormNotice>

      <div className="flex flex-wrap gap-3">
        <button type="submit" name="intent" value="publish" className={buttonClasses('primary', 'md')}>
          {c.submit}
        </button>
        <button type="submit" name="intent" value="draft" className={buttonClasses('secondary', 'md')}>
          {c.saveDraft}
        </button>
      </div>
    </form>
  );
}
