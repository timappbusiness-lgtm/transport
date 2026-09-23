'use client';

import { useId, useRef } from 'react';
import {
  setPlanAction,
  setPlanPeriodAction,
  type PlanActionState,
} from '@/app/admin/planuri/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { adminDirectoryCopy } from '@/content/admin-directory';
import {
  BILLING_MONTHS,
  featuresToText,
  formatLei,
  freeMonths,
  freeMonthsLabel,
  type BillingMonths,
  type Plan,
} from '@/lib/plans';
import { cn } from '@/lib/utils';
import { KeepingForm } from '@/components/ui/keeping-form';
import { useKeptActionState } from '@/lib/continuity/use-kept-action-state';
import { useUnsavedGuard } from '@/lib/continuity/use-unsaved-guard';

const EMPTY: PlanActionState = {};
const c = adminDirectoryCopy.plans;

const CONTROL = 'w-full rounded-input border border-border-strong bg-surface px-3 py-2 text-body';

export interface EditablePlan extends Plan {
  isPublic: boolean;
  /** Totals for every period, including the ones taken off sale. */
  allPeriods: { months: BillingMonths; total: number; isPublic: boolean }[];
}

export function PlanForm({ plan }: { plan: EditablePlan }) {
  const [state, action] = useKeptActionState(setPlanAction, EMPTY);
  const guardRef = useRef<HTMLFormElement>(null);
  // Leaving with changes nobody saved asks once; a save takes it away.
  useUnsavedGuard(guardRef, state);
  const id = useId();

  return (
    <div className="rounded-card border border-border bg-surface p-4 sm:p-5">
      <KeepingForm ref={guardRef} action={action}>
        <input type="hidden" name="code" value={plan.code} />

        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-h3">{plan.name}</h3>
          <p className="font-mono text-label uppercase tracking-[0.12em] text-muted">
            {plan.code}
          </p>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field id={`${id}-name`} name="name" label={c.name} defaultValue={plan.name} />
          <Field
            id={`${id}-price`}
            name="price_ron_month"
            label={c.columns.price}
            type="number"
            defaultValue={String(plan.monthlyPrice)}
            error={state.fieldErrors?.price_ron_month}
          />
          <Field
            id={`${id}-desc`}
            name="short_description"
            label={c.shortDescription}
            defaultValue={plan.description ?? ''}
            className="sm:col-span-2"
          />

          <div className="flex min-w-0 flex-col gap-1.5">
            <label htmlFor={`${id}-audience`} className="text-body font-medium">
              {c.audience}
            </label>
            <select
              id={`${id}-audience`}
              name="audience"
              defaultValue={plan.audience ?? ''}
              className={CONTROL}
            >
              <option value="">{c.audienceNone}</option>
              <option value="carrier">{c.audienceCarrier}</option>
              <option value="forwarder">{c.audienceForwarder}</option>
            </select>
          </div>

          <div className="flex flex-col justify-end gap-2">
            <label className="flex items-center gap-2.5 text-body">
              <input
                type="checkbox"
                name="is_public"
                defaultChecked={plan.isPublic}
                className="size-4 accent-foreground"
              />
              {c.columns.visible}
            </label>
            <label className="flex items-center gap-2.5 text-body">
              <input
                type="checkbox"
                name="highlight"
                defaultChecked={plan.highlight}
                className="size-4 accent-foreground"
              />
              {c.highlight}
            </label>
            <p className="text-small text-muted">{c.highlightHint}</p>
          </div>

          <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2">
            <label htmlFor={`${id}-features`} className="text-body font-medium">
              {c.columns.features}
            </label>
            <textarea
              id={`${id}-features`}
              name="features"
              rows={7}
              defaultValue={featuresToText(plan.features)}
              className={cn(CONTROL, 'font-mono text-small')}
            />
            <p className="text-small text-muted">{c.featuresHelp}</p>
            <p className="text-small text-muted">{c.featuresHint}</p>
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

      <Periods plan={plan} />
    </div>
  );
}

/**
 * The totals, one small form each.
 *
 * Beside every one, the saving it produces — computed here from the same
 * two figures the public page computes it from, so a total typed in this
 * box shows its effect before it is on the page. There is nowhere to type
 * a percentage, because a percentage is never stored.
 */
function Periods({ plan }: { plan: EditablePlan }) {
  return (
    <section className="mt-6 border-t border-border pt-5">
      <h4 className="text-body font-medium">{c.periods}</h4>
      <p className="mt-1 max-w-[60ch] text-small text-muted">{c.periodsHint}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {BILLING_MONTHS.map((months) => (
          <PeriodForm key={months} plan={plan} months={months} />
        ))}
      </div>
    </section>
  );
}

function PeriodForm({ plan, months }: { plan: EditablePlan; months: BillingMonths }) {
  const [state, action] = useKeptActionState(setPlanPeriodAction, EMPTY);
  const guardRef = useRef<HTMLFormElement>(null);
  // Leaving with changes nobody saved asks once; a save takes it away.
  useUnsavedGuard(guardRef, state);
  const id = useId();
  const current = plan.allPeriods.find((p) => p.months === months);

  const total = current?.total ?? plan.monthlyPrice * months;
  const saving = Math.round(plan.monthlyPrice * months - total);
  const free = freeMonths(plan.monthlyPrice, total, months);

  return (
    <KeepingForm ref={guardRef} action={action} className="rounded-input border border-border p-3">
      <input type="hidden" name="code" value={plan.code} />
      <input type="hidden" name="months" value={months} />

      <label htmlFor={`${id}-total`} className="text-small font-medium">
        {c.periodMonths(months)}
      </label>
      <input
        id={`${id}-total`}
        name="total_price_ron"
        type="number"
        min={0}
        step="0.01"
        inputMode="decimal"
        defaultValue={current ? String(current.total) : ''}
        aria-invalid={state.fieldErrors?.total_price_ron ? true : undefined}
        className={cn(CONTROL, 'mt-1.5')}
      />

      <label className="mt-2 flex items-center gap-2 text-small">
        <input
          type="checkbox"
          name="is_public"
          defaultChecked={current?.isPublic ?? true}
          className="size-3.5 accent-foreground"
        />
        {c.periodPublic}
      </label>

      {months > 1 && saving > 0 ? (
        <p className="mt-2 text-small text-muted">
          {free !== null ? freeMonthsLabel(free) : `−${formatLei(saving)}`}
        </p>
      ) : null}

      <button type="submit" className={cn(buttonClasses('secondary', 'sm'), 'mt-2 w-full')}>
        {c.savePeriod}
      </button>
      {state.notice ? (
        <p className="mt-2 text-small text-muted">{state.notice}</p>
      ) : null}
      {state.error ? <p className="mt-2 text-small text-danger">{state.error}</p> : null}
      {state.fieldErrors?.total_price_ron ? (
        <p className="mt-2 text-small text-danger">{state.fieldErrors.total_price_ron}</p>
      ) : null}
    </KeepingForm>
  );
}

function Field({
  id,
  name,
  label,
  defaultValue,
  type = 'text',
  error,
  className,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
  type?: 'text' | 'number' | undefined;
  error?: string | undefined;
  className?: string | undefined;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-body font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        min={type === 'number' ? 0 : undefined}
        step={type === 'number' ? '0.01' : undefined}
        inputMode={type === 'number' ? 'decimal' : undefined}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        className={cn(CONTROL, error && 'border-danger')}
      />
      {error ? <p className="text-small text-danger">{error}</p> : null}
    </div>
  );
}
