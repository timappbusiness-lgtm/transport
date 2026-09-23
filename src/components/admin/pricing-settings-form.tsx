'use client';

import { useId } from 'react';
import { setPricingSettingsAction, type PlanActionState } from '@/app/admin/planuri/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { adminDirectoryCopy } from '@/content/admin-directory';
import type { PricingSettings } from '@/lib/plans';
import { cn } from '@/lib/utils';
import { KeepingForm } from '@/components/ui/keeping-form';
import { useKeptActionState } from '@/lib/continuity/use-kept-action-state';

const EMPTY: PlanActionState = {};
const c = adminDirectoryCopy.pricing;
const CONTROL = 'w-full rounded-input border border-border-strong bg-surface px-3 py-2 text-body';

/**
 * The trial length, the VAT line and how billing works.
 *
 * The trial here is the one that actually starts when a company is
 * approved, not a sentence about one: `review_company` reads this number.
 * Setting it to zero stops the promise and the trial together.
 */
export function PricingSettingsForm({ settings }: { settings: PricingSettings }) {
  const [state, action] = useKeptActionState(setPricingSettingsAction, EMPTY);
  const id = useId();

  return (
    <KeepingForm action={action} className="rounded-card border border-border bg-surface p-4 sm:p-5">
      <h2 className="text-h3">{c.title}</h2>
      <p className="mt-1 max-w-[62ch] text-body text-muted">{c.lede}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${id}-trial`} className="text-body font-medium">
            {c.trialDays}
          </label>
          <input
            id={`${id}-trial`}
            name="trial_days"
            type="number"
            min={0}
            max={365}
            step={1}
            inputMode="numeric"
            defaultValue={String(settings.trialDays)}
            aria-invalid={state.fieldErrors?.trial_days ? true : undefined}
            className={cn(CONTROL, state.fieldErrors?.trial_days && 'border-danger')}
          />
          <p className="text-small text-muted">{c.trialDaysHint}</p>
          {state.fieldErrors?.trial_days ? (
            <p className="text-small text-danger">{state.fieldErrors.trial_days}</p>
          ) : null}
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${id}-vat`} className="text-body font-medium">
            {c.vatLabel}
          </label>
          <input
            id={`${id}-vat`}
            name="vat_label"
            type="text"
            maxLength={120}
            defaultValue={settings.vatLabel ?? ''}
            className={CONTROL}
          />
          <p className="text-small text-muted">{c.vatLabelHint}</p>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${id}-email`} className="text-body font-medium">
            {c.billingEmail}
          </label>
          <input
            id={`${id}-email`}
            name="billing_contact_email"
            type="email"
            defaultValue={settings.billingContactEmail ?? ''}
            className={CONTROL}
          />
          <p className="text-small text-muted">{c.billingEmailHint}</p>
        </div>

        <div className="flex flex-col justify-center gap-2">
          <label className="flex items-center gap-2.5 text-body">
            <input
              type="checkbox"
              name="manual_billing"
              defaultChecked={settings.manualBilling}
              className="size-4 accent-foreground"
            />
            {c.manualBilling}
          </label>
          <p className="text-small text-muted">{c.manualBillingHint}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="submit" className={buttonClasses('secondary', 'sm')}>
          {c.save}
        </button>
        {state.notice ? <FormNotice>{state.notice}</FormNotice> : null}
      </div>
      {state.error ? (
        <div className="mt-3">
          <FormError>{state.error}</FormError>
        </div>
      ) : null}
    </KeepingForm>
  );
}
