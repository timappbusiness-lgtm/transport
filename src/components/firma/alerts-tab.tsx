'use client';

import { useActionState } from 'react';
import { updateAlertsAction, type ActionState } from '@/app/cont/actions';
import { Field, FormError, FormNotice } from '@/components/auth/form';
import { SaveBar } from '@/components/firma/save-bar';
import { firmaCopy } from '@/content/firma';
import type { Company } from '@/lib/auth/account';

const EMPTY: ActionState = {};

/**
 * The e-mail a matching request causes.
 *
 * Only e-mail is offered. `saved_searches` has had `notify_whatsapp` and
 * `notify_push` columns since phase 0 and nothing sends either, so a
 * switch for them here would be a promise the platform does not keep. The
 * e-mail is real: publishing a request writes a row into
 * `notification_outbox` for every matching carrier, and the
 * `outbox-dispatcher` edge function delivers it. (It used to say n8n;
 * the four n8n workflows were never built and the drain moved into an
 * edge function in 20260918160000. `n8n/` holds only a README now.)
 *
 * The rules are listed rather than described, because "cererile potrivite"
 * means nothing until somebody says what potrivite is — and the four lines
 * below are exactly what `company_matches_request` does.
 */
export function AlertsTab({ company }: { company: Company }) {
  const [state, action] = useActionState(updateAlertsAction, EMPTY);
  const c = firmaCopy.alerts;
  const verified = company.verification_status === 'verified';

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      <div>
        <h2 className="text-[1.0625rem]">{c.title}</h2>
        <p className="mt-1.5 max-w-[62ch] text-sm text-muted">{c.lede}</p>
      </div>

      <FormError>{state.error}</FormError>
      <FormNotice>{state.notice}</FormNotice>

      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          name="alertsEnabled"
          defaultChecked={company.alerts_enabled}
          className="mt-0.5 size-4 accent-[#1C262B]"
        />
        <span>
          {c.enable}
          <span className="mt-1 block text-xs text-muted">{c.enableHint}</span>
        </span>
      </label>

      {!verified ? <p className="text-sm text-muted">{c.unverified}</p> : null}

      <Field
        label={c.email}
        name="alertsEmail"
        type="email"
        inputMode="email"
        required={false}
        hint={c.emailHint}
        placeholder={company.contact_email ?? ''}
        defaultValue={company.alerts_email ?? ''}
        error={state.fieldErrors?.alertsEmail}
      />

      <div className="border-t border-border pt-5">
        <p className="text-sm font-medium">{c.whatMatches}</p>
        <ul className="mt-2 flex flex-col gap-1.5">
          {c.rules.map((rule) => (
            <li key={rule} className="text-[0.8125rem] text-muted">
              {rule}
            </li>
          ))}
        </ul>
      </div>

      <SaveBar />
    </form>
  );
}
