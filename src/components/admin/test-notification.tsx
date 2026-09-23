'use client';

import { useId } from 'react';
import { sendTestNotificationAction, type RetryState } from '@/app/admin/notificari/actions';
import { buttonClasses } from '@/components/ui/button';
import { MAIL_TEMPLATES } from '@/content/mail-samples';
import { KeepingForm } from '@/components/ui/keeping-form';
import { useKeptActionState } from '@/lib/continuity/use-kept-action-state';

const EMPTY: RetryState = {};
const CONTROL =
  'rounded-input border border-border-strong bg-surface px-3 py-2 text-body';

/**
 * „Trimite un e-mail de test".
 *
 * It queues a real row, so it goes out through the real dispatcher with
 * the real templates. A button that sent mail some other way would prove
 * the button works and nothing about the path a notification takes.
 */
export function TestNotification() {
  const [state, action, pending] = useKeptActionState(sendTestNotificationAction, EMPTY);
  const id = useId();

  return (
    <KeepingForm action={action} className="flex flex-col gap-3 rounded-card border border-border bg-ground-alt p-4">
      <div>
        <h3 className="text-body">Trimite un e-mail de test</h3>
        <p className="mt-1 max-w-[62ch] text-body text-muted">
          Pune la coadă un șablon cu date de exemplu. Pleacă pe același drum ca o notificare
          adevărată, deci dacă ajunge, ajung și celelalte.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label htmlFor={`${id}-template`} className="flex flex-col gap-1 text-body">
          Șablon
          <select id={`${id}-template`} name="template" defaultValue="company_verified" className={CONTROL}>
            {MAIL_TEMPLATES.map((template) => (
              <option key={template.id} value={template.id}>
                {template.label}
              </option>
            ))}
          </select>
        </label>

        <label htmlFor={`${id}-email`} className="flex flex-col gap-1 text-body">
          Adresa
          <input
            id={`${id}-email`}
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="tu@firma.ro"
            className={CONTROL}
          />
        </label>

        <button type="submit" disabled={pending} className={buttonClasses('secondary', 'md')}>
          {pending ? 'Se pune la coadă…' : 'Trimite'}
        </button>
      </div>

      {state.error !== undefined ? (
        <p role="alert" className="text-body text-danger">
          {state.error}
        </p>
      ) : null}
      {state.notice !== undefined ? (
        <p role="status" className="text-body text-muted">
          {state.notice}
        </p>
      ) : null}
    </KeepingForm>
  );
}
