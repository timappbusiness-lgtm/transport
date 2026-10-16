'use client';

import { useId } from 'react';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { KeepingForm } from '@/components/ui/keeping-form';
import { saveMementoScheduleAction, type MementoState } from '@/app/cont/memento/actions';
import { mementoCopy } from '@/content/memento';
import { useKeptActionState } from '@/lib/continuity/use-kept-action-state';
import { cn } from '@/lib/utils';

const EMPTY: MementoState = {};
const c = mementoCopy.schedule;

/**
 * The reminder days for one kind of document, or for all of them. A row
 * without its own setting shows the days it inherits, marked „implicit";
 * „Înapoi la implicit" takes its own setting away.
 */
export function MementoScheduleRow({
  scope,
  kind,
  label,
  days,
  inherited,
}: {
  scope: 'personal' | 'firma';
  kind: string;
  label: string;
  /** This row's own days, or null when it inherits. */
  days: readonly number[] | null;
  /** What it inherits: the account's default, or the platform's. */
  inherited: readonly number[];
}) {
  const [state, dispatch, pending] = useKeptActionState(saveMementoScheduleAction, EMPTY);
  const id = useId();
  return (
    <KeepingForm action={dispatch} className="grid gap-2 px-4 py-3 sm:grid-cols-[10rem_minmax(0,1fr)_auto] sm:items-start sm:px-5" data-memento-schedule={kind}>
      <input type="hidden" name="scope" value={scope} />
      <input type="hidden" name="kind" value={kind} />
      <label htmlFor={`${id}-days`} className="pt-2 text-body font-medium">
        {label}
      </label>
      <div className="flex min-w-0 flex-col gap-1">
        <input
          id={`${id}-days`}
          name="days"
          defaultValue={(days ?? inherited).join(', ')}
          inputMode="numeric"
          aria-invalid={state.fieldErrors?.days ? true : undefined}
          className={cn(
            'w-full rounded-input border bg-surface px-3 py-2 font-mono text-body',
            state.fieldErrors?.days ? 'border-danger' : 'border-border-strong',
          )}
        />
        {days === null ? <span className="text-small text-muted">{c.defaultLabel}</span> : null}
        {state.fieldErrors?.days ? <span className="text-small text-danger">{state.fieldErrors.days}</span> : null}
        <FormError>{state.error}</FormError>
        <FormNotice>{state.notice}</FormNotice>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={buttonClasses('ink', 'sm')}>
          {c.save}
        </button>
        {days !== null ? (
          <button type="submit" name="reset" value="1" disabled={pending} className={buttonClasses('secondary', 'sm')}>
            {c.reset}
          </button>
        ) : null}
      </div>
    </KeepingForm>
  );
}
