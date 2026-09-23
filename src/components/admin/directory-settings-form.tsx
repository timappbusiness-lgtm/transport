'use client';

import { useId } from 'react';
import {
  setDirectorySettingsAction,
  type SettingsActionState,
} from '@/app/admin/setari/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { adminDirectoryCopy } from '@/content/admin-directory';
import type { DirectoryThresholds } from '@/lib/directory';
import { cn } from '@/lib/utils';
import { KeepingForm } from '@/components/ui/keeping-form';
import { useKeptActionState } from '@/lib/continuity/use-kept-action-state';

const EMPTY: SettingsActionState = {};
const c = adminDirectoryCopy.settings;

export function DirectorySettingsForm({ thresholds }: { thresholds: DirectoryThresholds }) {
  const [state, action] = useKeptActionState(setDirectorySettingsAction, EMPTY);
  const id = useId();

  return (
    <KeepingForm action={action} className="rounded-card border border-border bg-surface p-4 sm:p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id={`${id}-stats`}
          name="stats_min_companies"
          label={c.statsMin}
          hint={c.statsMinHint}
          defaultValue={String(thresholds.statsMinCompanies)}
          error={state.fieldErrors?.stats_min_companies}
        />
        <Field
          id={`${id}-directory`}
          name="directory_min_companies"
          label={c.directoryMin}
          hint={c.directoryMinHint}
          defaultValue={String(thresholds.directoryMinCompanies)}
          error={state.fieldErrors?.directory_min_companies}
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
    </KeepingForm>
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
      <label htmlFor={id} className="text-body font-medium">
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
          'w-full rounded-input border bg-surface px-3 py-2 text-body',
          error ? 'border-danger' : 'border-border-strong',
        )}
      />
      <p className="text-small text-muted">{hint}</p>
      {error ? <p className="text-small text-danger">{error}</p> : null}
    </div>
  );
}
