'use client';

import { useActionState, useId } from 'react';
import {
  setMatchingSettingsAction,
  type ThresholdActionState,
} from '@/app/admin/activitate/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { activityAdminCopy } from '@/content/activitate';
import { cn } from '@/lib/utils';

const EMPTY: ThresholdActionState = {};
const c = activityAdminCopy.matching;

/**
 * The detour tolerance and the category window.
 *
 * Both are read straight out of `matching_settings` and written through
 * `set_matching_settings`, which is staff-only and audited. Neither is a
 * layout preference: the first decides which requests a carrier is shown
 * at all, and the second is the sentence printed under the counters.
 */
export function MatchingForm({
  defaultDetourKm,
  categoryWindowDays,
}: {
  defaultDetourKm: number;
  categoryWindowDays: number;
}) {
  const [state, action] = useActionState(setMatchingSettingsAction, EMPTY);
  const id = useId();

  return (
    <form action={action} className="rounded-card border border-border bg-surface p-4 sm:p-5">
      <h2 className="text-h3">{c.title}</h2>
      <p className="mt-2 max-w-[62ch] text-sm text-muted">{c.lede}</p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field
          id={`${id}-detour`}
          name="default_detour_km"
          label={c.detour}
          hint={c.detourHint}
          defaultValue={String(defaultDetourKm)}
          error={state.fieldErrors?.default_detour_km}
        />
        <Field
          id={`${id}-window`}
          name="category_window_days"
          label={c.window}
          hint={c.windowHint}
          defaultValue={String(categoryWindowDays)}
          error={state.fieldErrors?.category_window_days}
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
          'w-full rounded-input border bg-surface px-3 py-2 text-sm',
          error ? 'border-danger' : 'border-border-strong',
        )}
      />
      <p className="text-xs text-muted">{hint}</p>
      {error ? <p className="text-xs text-danger">{error}</p> : null}
    </div>
  );
}
