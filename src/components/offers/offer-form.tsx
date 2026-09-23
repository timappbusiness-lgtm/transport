'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { clearDraftAction } from '@/app/draft-actions';
import { DraftRestored, DraftStatus } from '@/components/continuity/draft-status';
import { browserStorage, clearDraft, draftKey } from '@/lib/continuity/drafts';
import { useFormDraft } from '@/lib/continuity/use-form-draft';
import Link from 'next/link';
import { sendOfferAction, type OfferState } from '@/app/cont/oferte/actions';
import { buttonClasses } from '@/components/ui/button';
import { ROUTES } from '@/config/routes';
import { offersCopy } from '@/content/oferte';
import { CURRENCIES, formatMoney, priceCeiling, type Currency, type OfferSettings } from '@/lib/offers';
import type { EligibleVehicle } from '@/lib/offers-source';
import { cn } from '@/lib/utils';
import { KeepingForm } from '@/components/ui/keeping-form';
import { useKeptActionState } from '@/lib/continuity/use-kept-action-state';

const EMPTY: OfferState = {};
const c = offersCopy.form;
const CONTROL = 'w-full rounded-input border border-border-strong bg-surface px-3 py-2 text-body';

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
  const [state, action, pending] = useKeptActionState(sendOfferAction, EMPTY);
  const key = draftKey('oferta', listingId);
  // A draft of this offer in the browser opens the form by itself: the
  // price typed before a refresh is waiting in it.
  const hasDraft = useSyncExternalStore(
    subscribeNothing,
    () => browserStorage()?.getItem(key) != null,
    () => false,
  );
  const [chosen, setOpen] = useState<boolean | null>(null);
  const open = chosen ?? hasDraft;

  // Sent: the draft has done its job, here and on the account.
  const sent = state.notice !== undefined;
  useEffect(() => {
    if (!sent) return;
    clearDraft(browserStorage(), key);
    clearDraftAction('oferta', listingId).catch(() => {});
  }, [sent, key, listingId]);

  if (state.notice !== undefined) {
    return (
      <p role="status" className="rounded-card border border-success/45 bg-success/8 p-4 text-body">
        {state.notice}{' '}
        <Link href={ROUTES.accountOffers} className="link-accent">
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

  return (
    <OfferFields
      state={state}
      action={action}
      pending={pending}
      onClose={() => setOpen(false)}
      listingId={listingId}
      loadingFrom={loadingFrom}
      vehicles={vehicles}
      needsVehicle={needsVehicle}
      settings={settings}
      priceRange={priceRange}
    />
  );
}

function subscribeNothing() {
  return () => {};
}

/**
 * The form itself, mounted while it is open. Its draft is kept on every
 * change — in the browser and on the account — so closing it, a refresh,
 * or a request that fails loses nothing; „Închide" hides the form and
 * keeps the draft, „Începe din nou" throws it away.
 */
function OfferFields({
  state,
  action,
  pending,
  onClose,
  listingId,
  loadingFrom,
  vehicles,
  needsVehicle,
  settings,
  priceRange,
}: {
  state: OfferState;
  action: (formData: FormData) => void;
  pending: boolean;
  onClose: () => void;
  listingId: string;
  loadingFrom: string;
  vehicles: readonly EligibleVehicle[];
  needsVehicle: boolean;
  settings: OfferSettings;
  priceRange?: { low: string; high: string } | undefined;
}) {
  const [currency, setCurrency] = useState<Currency>('RON');
  const formRef = useRef<HTMLFormElement>(null);
  const id = useId();
  const draft = useFormDraft(formRef, {
    form: 'oferta',
    scope: listingId,
    signedIn: true,
    onRestore: (values) => {
      const restored = values.currency;
      if (typeof restored === 'string' && (CURRENCIES as readonly string[]).includes(restored)) {
        setCurrency(restored as Currency);
      }
    },
  });

  const noVehicle = needsVehicle && vehicles.length === 0;

  return (
    <KeepingForm
      ref={formRef}
      action={action}
      className="flex w-full flex-col gap-4 rounded-card border border-border bg-surface p-4 sm:p-5"
    >
      <input type="hidden" name="listing_id" value={listingId} />
      {draft.restored !== null ? (
        <DraftRestored savedAt={draft.restored.savedAt} onStartOver={draft.startOver} />
      ) : null}
      <input type="hidden" name="loading_from" value={loadingFrom} />

      <div>
        <h3 className="text-h3">{c.title}</h3>
        <p className="mt-1.5 max-w-[58ch] text-body text-muted">{c.lede}</p>
        {priceRange !== undefined ? (
          <p className="mt-2 text-body text-muted">{c.priceRange(priceRange.low, priceRange.high)}</p>
        ) : null}
      </div>

      {noVehicle ? (
        <p className="rounded-card border border-warning/45 bg-warning/8 p-3 text-body">
          {c.vehicleNone}{' '}
          <Link href={ROUTES.accountFleet} className="link-accent">
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
          <label htmlFor={`${id}-currency`} className="text-body font-medium">
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
      <p className="-mt-2 text-small text-muted">{c.datesHint}</p>

      {needsVehicle ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-vehicle`} className="text-body font-medium">
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
          <p className="text-small text-muted">{c.vehicleHint}</p>
          {state.fieldErrors?.vehicleId ? (
            <p className="text-small text-danger">{state.fieldErrors.vehicleId}</p>
          ) : null}
        </div>
      ) : null}

      <label htmlFor={`${id}-conditions`} className="flex flex-col gap-1.5 text-body font-medium">
        {c.conditions}
        <textarea
          id={`${id}-conditions`}
          name="conditions"
          rows={3}
          maxLength={1000}
          className={cn(CONTROL, 'resize-y font-normal')}
        />
        <span className="text-small font-normal text-muted">{c.conditionsHint}</span>
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
          <label htmlFor={`${id}-validity`} className="text-body font-medium">
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
            <p className="text-small text-danger">{state.fieldErrors.validityHours}</p>
          ) : null}
        </div>
      </div>

      <label htmlFor={`${id}-message`} className="flex flex-col gap-1.5 text-body font-medium">
        {c.message}
        <textarea
          id={`${id}-message`}
          name="message"
          rows={2}
          maxLength={1000}
          className={cn(CONTROL, 'resize-y font-normal')}
        />
        <span className="text-small font-normal text-muted">{c.messageHint}</span>
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
          onClick={onClose}
          className="text-body text-muted underline underline-offset-4"
        >
          {c.cancel}
        </button>
        <DraftStatus status={draft.status} />
      </div>

      {state.error !== undefined ? (
        <div role="alert" className="text-body text-danger">
          <p>{state.error}</p>
          {state.quotaReached === true ? (
            <p className="mt-1 text-foreground">
              <Link href={ROUTES.plans} className="link-ink">
                {offersCopy.quota.action}
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}
    </KeepingForm>
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
      <label htmlFor={id} className="text-body font-medium">
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
      {hint !== undefined ? <p className="text-small text-muted">{hint}</p> : null}
      {error !== undefined ? <p className="text-small text-danger">{error}</p> : null}
    </div>
  );
}
