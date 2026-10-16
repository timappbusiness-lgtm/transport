'use client';

import { useId, useRef } from 'react';
import { setMementoSettingsAction, type SettingsActionState } from '@/app/admin/setari/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { KeepingForm } from '@/components/ui/keeping-form';
import { mementoCopy } from '@/content/memento';
import { useKeptActionState } from '@/lib/continuity/use-kept-action-state';
import { useUnsavedGuard } from '@/lib/continuity/use-unsaved-guard';
import type { MementoSettings } from '@/lib/memento-source';

const EMPTY: SettingsActionState = {};
const c = mementoCopy.admin;
const CONTROL = 'w-full rounded-input border border-border-strong bg-surface px-3.5 py-2.5 text-body';

/**
 * The memento's numbers: how many vehicles an account may keep, how fast
 * they may be added, how long an expired date stays, and the days the
 * reminders go by default. Every limit says so in Romanian when reached.
 */
export function MementoSettingsForm({ settings }: { settings: MementoSettings }) {
  const [state, action] = useKeptActionState(setMementoSettingsAction, EMPTY);
  const guardRef = useRef<HTMLFormElement>(null);
  useUnsavedGuard(guardRef, state);
  const id = useId();
  const fields: { name: string; label: string; value: number }[] = [
    { name: 'max_vehicles_individual', label: c.maxIndividual, value: settings.maxVehiclesIndividual },
    { name: 'max_vehicles_company', label: c.maxCompany, value: settings.maxVehiclesCompany },
    { name: 'vehicles_per_hour', label: c.vehiclesPerHour, value: settings.vehiclesPerHour },
    { name: 'imports_per_hour', label: c.importsPerHour, value: settings.importsPerHour },
    { name: 'import_max_rows', label: c.importMaxRows, value: settings.importMaxRows },
    { name: 'ai_reads_per_day', label: c.aiReadsPerDay, value: settings.aiReadsPerDay },
    { name: 'history_days', label: c.historyDays, value: settings.historyDays },
  ];

  return (
    <section aria-labelledby={`${id}-title`} data-memento-admin-settings>
      <h2 id={`${id}-title`} className="text-h3">
        {c.title}
      </h2>
      <p className="mt-2 max-w-[62ch] text-body text-muted">{c.lede}</p>
      <KeepingForm ref={guardRef} action={action} className="mt-4 rounded-card border border-border bg-surface p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((field) => (
            <div key={field.name} className="flex flex-col gap-1.5">
              <label htmlFor={`${id}-${field.name}`} className="text-body font-medium">
                {field.label}
              </label>
              <input
                id={`${id}-${field.name}`}
                name={field.name}
                inputMode="numeric"
                defaultValue={String(field.value)}
                className={CONTROL}
              />
              {state.fieldErrors?.[field.name] ? (
                <p className="text-small text-danger">{state.fieldErrors[field.name]}</p>
              ) : null}
            </div>
          ))}
          <div className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-days`} className="text-body font-medium">
              {c.defaultDays}
            </label>
            <input id={`${id}-days`} name="default_days" defaultValue={settings.defaultDays.join(', ')} className={CONTROL} />
            {state.fieldErrors?.default_days ? <p className="text-small text-danger">{state.fieldErrors.default_days}</p> : null}
          </div>
        </div>
        <div className="mt-4">
          <button type="submit" className={buttonClasses('ink', 'sm')}>
            {c.save}
          </button>
        </div>
        <div className="mt-3 flex flex-col gap-2">
          <FormError>{state.error}</FormError>
          <FormNotice>{state.notice}</FormNotice>
        </div>
      </KeepingForm>
    </section>
  );
}
