'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { updateCapabilitiesAction, type ActionState } from '@/app/cont/actions';
import { Field, FormError, FormNotice } from '@/components/auth/form';
import { CheckboxGrid } from '@/components/firma/checkbox-grid';
import { SaveBar } from '@/components/firma/save-bar';
import { ROUTES } from '@/config/routes';
import { firmaCopy } from '@/content/firma';
import type { Company } from '@/lib/auth/account';
import { CARGO_CATEGORY_LABELS } from '@/lib/departures';

const EMPTY: ActionState = {};

export interface Option {
  code: string;
  label: string;
  hint: string | null;
}

/**
 * What the firm takes on, and what it has to take it on with.
 *
 * The two lists come from `equipment_options` and `service_options` rather
 * than from a constant here, because an admin grows them from
 * `/admin/optiuni`. A code a firm already has that has since been retired
 * keeps its tick: the loader adds it back to the list, since hiding it
 * would show a firm a profile it did not save.
 *
 * The vehicle count is not a field. It is counted from the fleet, because
 * a number a firm types is a number that is wrong within a month and
 * nobody notices.
 */
export function CapabilitiesTab({
  company,
  equipmentOptions,
  serviceOptions,
  vehiclesTotal,
}: {
  company: Company;
  equipmentOptions: readonly Option[];
  serviceOptions: readonly Option[];
  vehiclesTotal: number;
}) {
  const [state, action] = useActionState(updateCapabilitiesAction, EMPTY);
  const c = firmaCopy.capabilities;

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <div>
        <h2 className="text-[1.0625rem]">{c.title}</h2>
        <p className="mt-1.5 max-w-[62ch] text-sm text-muted">{c.lede}</p>
      </div>

      <FormError>{state.error}</FormError>
      <FormNotice>{state.notice}</FormNotice>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-1 text-sm font-medium">{c.vehicleTypes}</legend>
        <p className="text-xs text-muted">{c.vehicleTypesHint}</p>
        <CheckboxGrid
          name="vehicleTypesAccepted"
          columns={3}
          selected={company.vehicle_types_accepted}
          options={Object.entries(CARGO_CATEGORY_LABELS).map(([code, label]) => ({
            code,
            label,
          }))}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-2.5 border-t border-border pt-5">
        <legend className="mb-1 text-sm font-medium">{c.services}</legend>
        <p className="text-xs text-muted">{c.servicesHint}</p>
        <CheckboxGrid name="services" selected={company.services} options={serviceOptions} />
      </fieldset>

      <fieldset className="flex flex-col gap-2.5 border-t border-border pt-5">
        <legend className="mb-1 text-sm font-medium">{c.equipment}</legend>
        <p className="text-xs text-muted">{c.equipmentHint}</p>
        <CheckboxGrid name="equipment" selected={company.equipment} options={equipmentOptions} />
      </fieldset>

      <div className="border-t border-border pt-5">
        <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <Field
            label={`${c.rate} (${c.rateUnit})`}
            name="indicativeRate"
            inputMode="numeric"
            required={false}
            defaultValue={
              company.indicative_rate_ron_per_km === null
                ? ''
                : String(company.indicative_rate_ron_per_km)
            }
            error={state.fieldErrors?.indicativeRate}
          />
          <Field
            label={c.rateNote}
            name="indicativeRateNote"
            required={false}
            defaultValue={company.indicative_rate_note ?? ''}
            error={state.fieldErrors?.indicativeRateNote}
          />
        </div>
        <p className="mt-1.5 text-xs text-muted">{c.rateHint}</p>
      </div>

      <div className="border-t border-border pt-5">
        <p className="text-sm font-medium">{c.fleet}</p>
        <p className="mt-1 text-sm text-muted">
          {vehiclesTotal === 0 ? (
            c.fleetEmpty
          ) : (
            <span className="text-foreground">{vehiclesTotal}</span>
          )}
        </p>
        <p className="mt-1.5 text-xs text-muted">
          {c.fleetHint}{' '}
          <Link
            href={ROUTES.accountFleet}
            className="underline underline-offset-4 decoration-border-strong hover:decoration-foreground"
          >
            Flotă
          </Link>
        </p>
      </div>

      <SaveBar />
    </form>
  );
}
