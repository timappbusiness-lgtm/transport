'use client';

import { useActionState, useId } from 'react';
import { setPlanAction, type PlanActionState } from '@/app/admin/planuri/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { adminDirectoryCopy } from '@/content/admin-directory';
import { cn } from '@/lib/utils';

const EMPTY: PlanActionState = {};
const c = adminDirectoryCopy.plans;

export interface EditablePlan {
  code: string;
  name: string;
  priceMonth: number;
  isPublic: boolean;
  features: string[];
}

export function PlanForm({ plan }: { plan: EditablePlan }) {
  const [state, action] = useActionState(setPlanAction, EMPTY);
  const id = useId();

  return (
    <form action={action} className="rounded-card border border-border bg-surface p-4 sm:p-5">
      <input type="hidden" name="code" value={plan.code} />
      <h3 className="text-[1rem]">{plan.name}</h3>
      <p className="mt-1 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-muted">
        {plan.code}
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${id}-price`} className="text-sm font-medium">
            {c.columns.price}
          </label>
          <input
            id={`${id}-price`}
            name="price_ron_month"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            defaultValue={String(plan.priceMonth)}
            aria-invalid={state.fieldErrors?.price_ron_month ? true : undefined}
            className={cn(
              'w-full rounded-input border bg-surface px-3 py-2 text-[0.875rem]',
              state.fieldErrors?.price_ron_month ? 'border-danger' : 'border-border-strong',
            )}
          />
          {state.fieldErrors?.price_ron_month ? (
            <p className="text-xs text-danger">{state.fieldErrors.price_ron_month}</p>
          ) : null}

          <label className="mt-3 flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              name="is_public"
              defaultChecked={plan.isPublic}
              className="size-4 accent-[#1C262B]"
            />
            {c.columns.visible}
          </label>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${id}-features`} className="text-sm font-medium">
            {c.columns.features}
          </label>
          <textarea
            id={`${id}-features`}
            name="display_features"
            rows={5}
            defaultValue={plan.features.join('\n')}
            className="w-full rounded-input border border-border-strong bg-surface px-3 py-2 text-[0.875rem]"
          />
          <p className="text-xs text-muted">{c.featuresHint}</p>
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
    </form>
  );
}
