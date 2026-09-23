'use client';

import { useActionToast } from '@/components/ui/toast';
import Link from 'next/link';
import { updateCapabilitiesAction, type ActionState } from '@/app/cont/actions';
import { Field, FormError } from '@/components/auth/form';
import { CheckboxGrid } from '@/components/firma/checkbox-grid';
import { SaveBar } from '@/components/firma/save-bar';
import { ROUTES } from '@/config/routes';
import { firmaCopy } from '@/content/firma';
import type { Company } from '@/lib/auth/account';
import { CARGO_CATEGORY_LABELS } from '@/lib/departures';
import { KeepingForm } from '@/components/ui/keeping-form';
import { useKeptActionState } from '@/lib/continuity/use-kept-action-state';

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
  const [state, action] = useKeptActionState(updateCapabilitiesAction, EMPTY);
  // The result where the person is looking: the save button sticks to
  // the bottom of a phone, and the top of this form may be off screen.
  useActionToast(state);
  const c = firmaCopy.capabilities;

  return (
    <KeepingForm action={action} className="flex flex-col gap-5" noValidate>
      <div>
        <h2 className="text-h3">{c.title}</h2>
        <p className="mt-1.5 max-w-[62ch] text-body text-muted">{c.lede}</p>
      </div>

      <FormError>{state.error}</FormError>

      <fieldset className="flex flex-col gap-2.5">
        <legend className="mb-1 text-body font-medium">{c.vehicleTypes}</legend>
        <p className="text-small text-muted">{c.vehicleTypesHint}</p>
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
        <legend className="mb-1 text-body font-medium">{c.services}</legend>
        <p className="text-small text-muted">{c.servicesHint}</p>
        <CheckboxGrid name="services" selected={company.services} options={serviceOptions} />
      </fieldset>

      <fieldset className="flex flex-col gap-2.5 border-t border-border pt-5">
        <legend className="mb-1 text-body font-medium">{c.equipment}</legend>
        <p className="text-small text-muted">{c.equipmentHint}</p>
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
        <p className="mt-1.5 text-small text-muted">{c.rateHint}</p>
      </div>

      <div className="border-t border-border pt-5">
        <p className="text-body font-medium">{c.fleet}</p>
        <p className="mt-1 text-body text-muted">
          {vehiclesTotal === 0 ? (
            c.fleetEmpty
          ) : (
            <span className="text-foreground">{vehiclesTotal}</span>
          )}
        </p>
        <p className="mt-1.5 text-small text-muted">
          {c.fleetHint}{' '}
          <Link
            href={ROUTES.accountFleet}
            className="link-accent"
          >
            Flotă
          </Link>
        </p>
      </div>

      <SaveBar />
    </KeepingForm>
  );
}
