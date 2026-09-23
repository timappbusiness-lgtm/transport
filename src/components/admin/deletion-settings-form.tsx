'use client';

import { useActionState, useId } from 'react';
import {
  setDeletionSettingsAction,
  type SettingsActionState,
} from '@/app/admin/setari/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { personalDataCopy } from '@/content/date-personale';
import type { DeletionSettings } from '@/lib/account-deletion-source';

const EMPTY: SettingsActionState = {};
const c = personalDataCopy.admin.settings;
const CONTROL =
  'w-full rounded-input border border-border-strong bg-surface px-3.5 py-2.5 text-body';

/**
 * The three numbers behind erasure and retention.
 *
 * They were reachable only through an RPC until now, which meant changing
 * the grace period was a thing one person knew how to do. A number that
 * governs everybody's account and lives in somebody's head is a number
 * nobody can check.
 */
export function DeletionSettingsForm({ settings }: { settings: DeletionSettings }) {
  const [state, action] = useActionState(setDeletionSettingsAction, EMPTY);
  const id = useId();

  return (
    <section aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`} className="text-h3">
        {c.title}
      </h2>
      <p className="mt-2 max-w-[62ch] text-sm text-muted">{c.lede}</p>

      <form action={action} className="mt-4 rounded-card border border-border bg-surface p-4 sm:p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id={`${id}-grace`}
            name="grace_days"
            label={c.graceDays}
            hint={c.graceDaysHint}
            defaultValue={String(settings.graceDays)}
            error={state.fieldErrors?.grace_days}
            inputMode="numeric"
          />
          <Field
            id={`${id}-months`}
            name="contact_reveal_months"
            label={c.contactRevealMonths}
            hint={c.contactRevealMonthsHint}
            defaultValue={String(settings.contactRevealMonths)}
            error={state.fieldErrors?.contact_reveal_months}
            inputMode="numeric"
          />
          <div className="sm:col-span-2">
            <Field
              id={`${id}-email`}
              name="support_email"
              label={c.supportEmail}
              hint={c.supportEmailHint}
              defaultValue={settings.supportEmail ?? ''}
              error={state.fieldErrors?.support_email}
              type="email"
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="submit" className={buttonClasses('primary', 'sm')}>
            {c.save}
          </button>
        </div>

        <div className="mt-3 flex flex-col gap-2">
          <FormError>{state.error}</FormError>
          <FormNotice>{state.notice}</FormNotice>
        </div>
      </form>
    </section>
  );
}

function Field({
  id,
  name,
  label,
  hint,
  defaultValue,
  error,
  type = 'text',
  inputMode,
}: {
  id: string;
  name: string;
  label: string;
  hint: string;
  defaultValue: string;
  error?: string | undefined;
  type?: string;
  inputMode?: 'numeric';
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        defaultValue={defaultValue}
        autoComplete="off"
        {...(inputMode ? { inputMode } : {})}
        className={CONTROL}
      />
      <p className="text-xs text-muted">{hint}</p>
      {error ? (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
