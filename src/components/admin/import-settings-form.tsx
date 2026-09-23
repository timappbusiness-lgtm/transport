'use client';

import { useActionState, useId } from 'react';
import {
  saveImportSettingsAction,
  type ImportSettingsState,
} from '@/app/admin/import/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { Button } from '@/components/ui/button';
import type { ImportSettings } from '@/lib/import-settings-source';

const EMPTY: ImportSettingsState = {};
const CONTROL =
  'w-full rounded-input border border-border-strong bg-surface px-3.5 py-2.5 text-body';

function Field({
  label,
  hint,
  name,
  value,
  step,
  min,
  max,
}: {
  label: string;
  hint: string;
  name: string;
  value: number;
  step?: string;
  min: string;
  max: string;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="number"
        defaultValue={value}
        min={min}
        max={max}
        {...(step === undefined ? {} : { step })}
        className={CONTROL}
      />
      <p className="text-xs text-muted">{hint}</p>
    </div>
  );
}

export function ImportSettingsForm({ settings }: { settings: ImportSettings }) {
  const [state, action, pending] = useActionState(saveImportSettingsAction, EMPTY);
  const enabledId = useId();

  return (
    <form action={action} className="flex flex-col gap-5">
      <FormError>{state.error}</FormError>
      <FormNotice>{state.notice}</FormNotice>

      <div className="flex items-start gap-3 rounded-card border border-border bg-surface p-4">
        <input
          id={enabledId}
          name="is_enabled"
          type="checkbox"
          defaultChecked={settings.is_enabled}
          className="mt-0.5 size-4"
        />
        <label htmlFor={enabledId} className="text-sm">
          <span className="font-medium">Completarea automată este pornită</span>
          <span className="mt-1 block text-xs text-muted">
            Oprită, cele două file dispar din formular. Restul formularului rămâne neatins.
          </span>
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Completări pe zi, pentru un cont"
          hint="Se numără pe zile de București, nu UTC."
          name="daily_limit_per_user"
          value={settings.daily_limit_per_user}
          min="0"
          max="500"
        />
        <Field
          label="Completări pe zi, fără cont"
          hint="Pe adresă, păstrată doar ca hash. Mai mic, pentru că nu există cont de suspendat."
          name="daily_limit_per_ip"
          value={settings.daily_limit_per_ip}
          min="0"
          max="100"
        />
        <Field
          label="Buget lunar, USD"
          hint="Luna se închide la miezul nopții la București. Peste el, completarea automată se oprește singură."
          name="monthly_budget_usd"
          value={settings.monthly_budget_usd}
          step="0.01"
          min="0"
          max="100000"
        />
        <Field
          label="Avertisment la, % din buget"
          hint="Primim un mesaj o singură dată pe lună, la pragul ăsta, și încă unul când bugetul e consumat."
          name="alert_at_pct"
          value={settings.alert_at_pct}
          min="1"
          max="100"
        />
        <Field
          label="Încredere minimă pe câmp"
          hint="Sub pragul ăsta, câmpul rămâne gol. O casetă goală costă zece secunde; un an greșit pe care nimeni nu l-a citit costă un transport."
          name="min_field_confidence"
          value={settings.min_field_confidence}
          step="0.05"
          min="0"
          max="1"
        />
      </div>

      <div>
        <Button type="submit" disabled={pending}>
          {pending ? 'Se salvează...' : 'Salvează'}
        </Button>
      </div>
    </form>
  );
}
