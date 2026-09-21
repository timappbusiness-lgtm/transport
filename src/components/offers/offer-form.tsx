'use client';

import { useActionState, useId, useState } from 'react';
import Link from 'next/link';
import { sendOfferAction, type OfferState } from '@/app/cont/oferte/actions';
import { buttonClasses } from '@/components/ui/button';
import { ROUTES } from '@/config/routes';
import { offersCopy } from '@/content/oferte';
import { CURRENCIES, formatMoney, priceCeiling, type Currency, type OfferSettings } from '@/lib/offers';
import type { EligibleVehicle } from '@/lib/offers-source';
import { cn } from '@/lib/utils';

const EMPTY: OfferState = {};
const c = offersCopy.form;
const CONTROL = 'w-full rounded-input border border-border-strong bg-surface px-3 py-2 text-sm';

/**
 * „Trimite ofertă".
 *
 * A sheet on a phone and a panel on a desktop, because a carrier reads
 * the board on a phone in a lorry park and the form has nine fields.
 * Closed until asked for: a request page that opens with a form is a
 * request page nobody reads.
 *
 * Every rule here is applied again by `guard_offer_terms()`. What this
 * buys is finding out about a problem while the field is still on
 * screen.
 */
export function OfferForm({
  listingId,
  loadingFrom,
  vehicles,
  needsVehicle,
  settings,
  priceRange,
  label,
}: {
  listingId: string;
  loadingFrom: string;
  vehicles: readonly EligibleVehicle[];
  needsVehicle: boolean;
  settings: OfferSettings;
  /** The indicative range, when prices are published. */
  priceRange?: { low: string; high: string } | undefined;
  label?: string | undefined;
}) {
  const [state, action, pending] = useActionState(sendOfferAction, EMPTY);
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState<Currency>('RON');
  const id = useId();

  if (state.notice !== undefined) {
    return (
      <p role="status" className="rounded-card border border-success/45 bg-success/8 p-4 text-sm">
        {state.notice}{' '}
        <Link href={ROUTES.accountOffers} className="underline underline-offset-4">
          Vezi ofertele trimise
        </Link>
      </p>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonClasses('primary', 'md')}>
        {label ?? c.title}
      </button>
    );
  }

  const noVehicle = needsVehicle && vehicles.length === 0;

  return (
    <form
      action={action}
      className="flex w-full flex-col gap-4 rounded-card border border-border bg-surface p-4 sm:p-5"
    >
      <input type="hidden" name="listing_id" value={listingId} />
      <input type="hidden" name="loading_from" value={loadingFrom} />

      <div>
        <h3 className="text-[1.0625rem]">{c.title}</h3>
        <p className="mt-1.5 max-w-[58ch] text-sm text-muted">{c.lede}</p>
        {priceRange !== undefined ? (
          <p className="mt-2 text-sm text-muted">{c.priceRange(priceRange.low, priceRange.high)}</p>
        ) : null}
      </div>

      {noVehicle ? (
        <p className="rounded-card border border-warning/45 bg-warning/8 p-3 text-sm">
          {c.vehicleNone}{' '}
          <Link href={ROUTES.accountFleet} className="underline underline-offset-4">
            Deschide Flota
          </Link>
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
        <Field
          id={`${id}-price`}
          name="price"
          label={c.price}
          hint={c.priceHint(formatMoney(priceCeiling(currency, settings), currency))}
          error={state.fieldErrors?.price}
          inputMode="decimal"
          required
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-currency`} className="text-sm font-medium">
            {c.currency}
          </label>
          <select
            id={`${id}-currency`}
            name="currency"
            value={currency}
            onChange={(event) => setCurrency(event.target.value as Currency)}
            className={CONTROL}
          >
            {CURRENCIES.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          id={`${id}-pickup`}
          name="pickup_date"
          type="date"
          label={c.pickup}
          error={state.fieldErrors?.pickupDate}
          min={loadingFrom}
        />
        <Field
          id={`${id}-delivery`}
          name="delivery_date"
          type="date"
          label={c.delivery}
          error={state.fieldErrors?.deliveryDate}
          min={loadingFrom}
        />
      </div>
      <p className="-mt-2 text-xs text-muted">{c.datesHint}</p>

      {needsVehicle ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-vehicle`} className="text-sm font-medium">
            {c.vehicle}
          </label>
          <select
            id={`${id}-vehicle`}
            name="vehicle_id"
            defaultValue=""
            className={CONTROL}
            aria-invalid={state.fieldErrors?.vehicleId ? true : undefined}
          >
            <option value="">Alege…</option>
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {[vehicle.plate_number, vehicle.make, vehicle.model].filter(Boolean).join(' · ')}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted">{c.vehicleHint}</p>
          {state.fieldErrors?.vehicleId ? (
            <p className="text-xs text-danger">{state.fieldErrors.vehicleId}</p>
          ) : null}
        </div>
      ) : null}

      <label htmlFor={`${id}-conditions`} className="flex flex-col gap-1.5 text-sm font-medium">
        {c.conditions}
        <textarea
          id={`${id}-conditions`}
          name="conditions"
          rows={3}
          maxLength={1000}
          className={cn(CONTROL, 'resize-y font-normal')}
        />
        <span className="text-xs font-normal text-muted">{c.conditionsHint}</span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          id={`${id}-term`}
          name="payment_term_days"
          label={c.paymentTerm}
          inputMode="numeric"
          error={state.fieldErrors?.paymentTermDays}
        />
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-validity`} className="text-sm font-medium">
            {c.validity}
          </label>
          <select
            id={`${id}-validity`}
            name="validity_hours"
            defaultValue={String(settings.defaultValidityHours)}
            className={CONTROL}
          >
            {[12, 24, 48, 72].map((hours) => (
              <option key={hours} value={hours}>
                {c.validityHours(hours)}
              </option>
            ))}
            {[7, 14]
              .filter((days) => days <= settings.maxValidityDays)
              .map((days) => (
                <option key={days} value={days * 24}>
                  {c.validityDays(days)}
                </option>
              ))}
          </select>
          {state.fieldErrors?.validityHours ? (
            <p className="text-xs text-danger">{state.fieldErrors.validityHours}</p>
          ) : null}
        </div>
      </div>

      <label htmlFor={`${id}-message`} className="flex flex-col gap-1.5 text-sm font-medium">
        {c.message}
        <textarea
          id={`${id}-message`}
          name="message"
          rows={2}
          maxLength={1000}
          className={cn(CONTROL, 'resize-y font-normal')}
        />
        <span className="text-xs font-normal text-muted">{c.messageHint}</span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending || noVehicle}
          className={buttonClasses('primary', 'md')}
        >
          {pending ? c.submitting : c.submit}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-muted underline underline-offset-4"
        >
          {c.cancel}
        </button>
      </div>

      {state.error !== undefined ? (
        <div role="alert" className="text-sm text-danger">
          <p>{state.error}</p>
          {state.quotaReached === true ? (
            <p className="mt-1 text-foreground">
              <Link href={ROUTES.plans} className="underline underline-offset-4">
                {offersCopy.quota.action}
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}

function Field({
  id,
  name,
  label,
  hint,
  error,
  type = 'text',
  inputMode,
  min,
  required,
}: {
  id: string;
  name: string;
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  type?: 'text' | 'date' | undefined;
  inputMode?: 'decimal' | 'numeric' | undefined;
  min?: string | undefined;
  required?: boolean | undefined;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        inputMode={inputMode}
        min={min}
        required={required}
        aria-invalid={error ? true : undefined}
        className={cn(CONTROL, error && 'border-danger')}
      />
      {hint !== undefined ? <p className="text-xs text-muted">{hint}</p> : null}
      {error !== undefined ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
