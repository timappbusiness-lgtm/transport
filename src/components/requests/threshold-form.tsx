'use client';

import { useActionState, useId } from 'react';
import { setThresholdsAction, type ThresholdActionState } from '@/app/admin/activitate/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { activityAdminCopy } from '@/content/activitate';
import type { ActivityThresholds } from '@/lib/requests';
import { cn } from '@/lib/utils';

const EMPTY: ThresholdActionState = {};
const c = activityAdminCopy;

export function ThresholdForm({ thresholds }: { thresholds: ActivityThresholds }) {
  const [state, action] = useActionState(setThresholdsAction, EMPTY);
  const id = useId();

  return (
    <form action={action} className="rounded-card border border-border bg-surface p-4 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id={`${id}-stats`}
          name="stats_min_requests"
          label={c.statsMin}
          hint={c.statsMinHint}
          defaultValue={String(thresholds.statsMinRequests)}
          error={state.fieldErrors?.stats_min_requests}
        />
        <Field
          id={`${id}-feed`}
          name="feed_min_requests"
          label={c.feedMin}
          hint={c.feedMinHint}
          defaultValue={String(thresholds.feedMinRequests)}
          error={state.fieldErrors?.feed_min_requests}
        />
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

function Field({
  id,
  name,
  label,
  hint,
  defaultValue,
  error,
}: {
  id: string;
  name: string;
  label: string;
  hint: string;
  defaultValue: string;
  error?: string | undefined;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="number"
        min={0}
        step={1}
        inputMode="numeric"
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        className={cn(
          'w-full rounded-input border bg-surface px-3 py-2 text-[0.875rem]',
          error ? 'border-danger' : 'border-border-strong',
        )}
      />
      <p className="text-xs text-muted">{hint}</p>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
