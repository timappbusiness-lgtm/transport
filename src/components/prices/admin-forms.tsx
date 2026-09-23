'use client';

import { useActionState, useId, useState } from 'react';
import {
  setPriceRateAction,
  setPriceSettingsAction,
  setPricesPublishedAction,
  type PriceActionState,
} from '@/app/admin/preturi/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { VehicleIcon } from '@/components/prices/vehicle-icon';
import { buttonClasses } from '@/components/ui/button';
import { pricesCopy } from '@/content/preturi';
import { VEHICLE_CLASS_LABELS, type PriceRate, type PriceSettings } from '@/lib/pricing';
import { cn } from '@/lib/utils';

const EMPTY: PriceActionState = {};
const c = pricesCopy.admin;

/**
 * Staff forms for the rates.
 *
 * Plain forms with server actions, not a spreadsheet: every save is one
 * class, one RPC and one audit row, which is what makes "who changed the
 * SUV rate and when" answerable afterwards.
 *
 * The number fields are text, not `type="number"`, because a Romanian
 * keyboard produces "5,40" and a number input silently refuses it.
 */
export function RateForm({ rate }: { rate: PriceRate }) {
  const [state, action] = useActionState(setPriceRateAction, EMPTY);

  return (
    <form action={action} className="rounded-card border border-border bg-surface p-4 sm:p-5">
      <input type="hidden" name="vehicle_class" value={rate.vehicle_class} />

      <p className="flex items-center gap-3">
        <VehicleIcon vehicleClass={rate.vehicle_class} />
        <span className="font-medium">{VEHICLE_CLASS_LABELS[rate.vehicle_class]}</span>
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <SmallField
          label={c.rates.weight}
          name="weight_label"
          numeric={false}
          defaultValue={rate.weight_label}
          error={state.fieldErrors?.weight_label}
        />
        <SmallField
          label={c.rates.local}
          name="local_ron_per_km"
          defaultValue={decimalText(rate.local_ron_per_km)}
          error={state.fieldErrors?.local_ron_per_km}
        />
        <SmallField
          label={c.rates.national}
          name="national_ron_per_km"
          defaultValue={decimalText(rate.national_ron_per_km)}
          error={state.fieldErrors?.national_ron_per_km}
        />
        <SmallField
          label={c.rates.international}
          name="international_eur_per_km"
          defaultValue={decimalText(rate.international_eur_per_km)}
          error={state.fieldErrors?.international_eur_per_km}
        />
        <SmallField
          label={c.rates.minimumRon}
          name="minimum_ron"
          defaultValue={decimalText(rate.minimum_ron)}
          error={state.fieldErrors?.minimum_ron}
        />
        <SmallField
          label={c.rates.minimumEur}
          name="minimum_eur"
          defaultValue={decimalText(rate.minimum_eur)}
          error={state.fieldErrors?.minimum_eur}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" className={buttonClasses('secondary', 'sm')}>
          {c.rates.save}
        </button>
        {state.notice ? <FormNotice>{state.notice}</FormNotice> : null}
      </div>
      {state.error ? (
        <div className="mt-3">
          <FormError>{state.error}</FormError>
        </div>
      ) : null}
    </form>
  );
}

export function SettingsForm({ settings }: { settings: PriceSettings }) {
  const [state, action] = useActionState(setPriceSettingsAction, EMPTY);

  return (
    <form action={action} className="rounded-card border border-border bg-surface p-4 sm:p-5">
      <h2 className="text-h3">{c.settings.title}</h2>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <SmallField
          label={c.settings.notRunning}
          name="not_running_surcharge_pct"
          defaultValue={String(settings.not_running_surcharge_pct)}
          error={state.fieldErrors?.not_running_surcharge_pct}
        />
        <SmallField
          label={c.settings.express}
          name="express_surcharge_pct"
          defaultValue={String(settings.express_surcharge_pct)}
          error={state.fieldErrors?.express_surcharge_pct}
        />
        <SmallField
          label={c.settings.roadFactor}
          name="road_distance_factor"
          defaultValue={decimalText(settings.road_distance_factor)}
          hint={c.settings.roadFactorHint}
          error={state.fieldErrors?.road_distance_factor}
        />
        <SmallField
          label={c.settings.spread}
          name="range_spread_pct"
          defaultValue={String(settings.range_spread_pct)}
          error={state.fieldErrors?.range_spread_pct}
        />
        <SmallField
          label={c.settings.month}
          name="valid_month"
          type="month"
          defaultValue={(settings.valid_month ?? '').slice(0, 7)}
          error={state.fieldErrors?.valid_month}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" className={buttonClasses('secondary', 'sm')}>
          {c.settings.save}
        </button>
        {state.notice ? <FormNotice>{state.notice}</FormNotice> : null}
      </div>
      {state.error ? (
        <div className="mt-3">
          <FormError>{state.error}</FormError>
        </div>
      ) : null}
    </form>
  );
}

/**
 * Publish and withdraw.
 *
 * The confirmation is a second click in the page rather than a browser
 * dialog: it can say what will happen in a full Romanian sentence, and it
 * is the same interaction on a phone as on a desktop.
 */
export function PublishForm({ published }: { published: boolean }) {
  const [state, action] = useActionState(setPricesPublishedAction, EMPTY);
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="rounded-card border border-border bg-surface p-4 sm:p-5">
      <p className="text-sm text-muted">{published ? c.afterPublishWarning : c.draftNote}</p>

      {confirming ? (
        <form action={action} className="mt-4">
          <input type="hidden" name="published" value={published ? 'nu' : 'da'} />
          <p className="text-sm">{published ? c.confirmUnpublish : c.confirmPublish}</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <button type="submit" className={buttonClasses('primary', 'sm')}>
              {c.confirmYes}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className={buttonClasses('secondary', 'sm')}
            >
              {c.cancel}
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className={buttonClasses(published ? 'secondary' : 'primary', 'sm')}
          >
            {published ? c.unpublish : c.publish}
          </button>
        </div>
      )}

      {state.error ? (
        <div className="mt-3">
          <FormError>{state.error}</FormError>
        </div>
      ) : null}
    </div>
  );
}

/** 5.4 reads as 5,4 on a Romanian screen, and both come back as 5.4. */
function decimalText(value: number): string {
  return String(value).replace('.', ',');
}

function SmallField({
  label,
  name,
  defaultValue,
  error,
  hint,
  type = 'text',
  numeric = true,
}: {
  label: string;
  name: string;
  defaultValue: string;
  error?: string | undefined;
  hint?: string | undefined;
  type?: string | undefined;
  /** A decimal keypad on a phone. Off for the one field that is prose. */
  numeric?: boolean | undefined;
}) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-small font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        defaultValue={defaultValue}
        inputMode={numeric && type === 'text' ? 'decimal' : undefined}
        aria-invalid={error ? true : undefined}
        className={cn(
          'w-full rounded-input border bg-surface px-3 py-2 text-sm',
          error ? 'border-danger' : 'border-border-strong',
        )}
      />
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
