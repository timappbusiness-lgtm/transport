'use client';

import { useActionState, useId, useState } from 'react';
import Link from 'next/link';
import { reportAction, type ReportState } from '@/app/verificare/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { ROUTES } from '@/config/routes';
import { verificationCopy } from '@/content/siguranta';
import { cn } from '@/lib/utils';

const EMPTY: ReportState = {};
const c = verificationCopy.report;
const CONTROL =
  'w-full rounded-input border border-border-strong bg-surface px-3.5 py-2.5 text-[0.9375rem]';

/**
 * Reporting a company.
 *
 * Signed in, this writes to `reports`, which is where the team already
 * looks. Signed out, it opens an e-mail — because somebody who has just
 * been asked to pay outside the platform should not have to make an account
 * first to tell us about it.
 */
export function ReportButton({
  signedIn,
  supportEmail,
}: {
  signedIn: boolean;
  supportEmail: string | null;
}) {
  const [state, action] = useActionState(reportAction, EMPTY);
  const [open, setOpen] = useState(false);
  const id = useId();

  if (!signedIn) {
    return (
      <div className="mt-5">
        {supportEmail ? (
          <a
            href={`mailto:${supportEmail}?subject=${encodeURIComponent('Sesizare — verificare firmă')}`}
            className={buttonClasses('secondary', 'md')}
          >
            {c.button}
          </a>
        ) : (
          <Link href={ROUTES.contact} className={buttonClasses('secondary', 'md')}>
            {c.button}
          </Link>
        )}
        <p className="mt-3 text-[0.8125rem] text-muted">{c.signedOutNote}</p>
      </div>
    );
  }

  if (state.notice) {
    return (
      <div className="mt-5">
        <FormNotice>{state.notice}</FormNotice>
      </div>
    );
  }

  if (!open) {
    return (
      <div className="mt-5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={buttonClasses('secondary', 'md')}
        >
          {c.button}
        </button>
      </div>
    );
  }

  return (
    <form action={action} className="mt-5 flex max-w-[34rem] flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-reason`} className="text-sm font-medium">
          {c.form.reason}
        </label>
        <select id={`${id}-reason`} name="reason" className={CONTROL} defaultValue="">
          <option value="">{c.form.reasonPlaceholder}</option>
          {c.form.reasons.map((reason) => (
            <option key={reason} value={reason}>
              {reason}
            </option>
          ))}
        </select>
        {state.fieldErrors?.reason ? (
          <p className="text-xs text-danger">{state.fieldErrors.reason}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-company`} className="text-sm font-medium">
          {c.form.company}
        </label>
        <input id={`${id}-company`} name="company" type="text" className={CONTROL} />
        <p className="text-xs text-muted">{c.form.companyHint}</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-details`} className="text-sm font-medium">
          {c.form.details}
        </label>
        <textarea id={`${id}-details`} name="details" rows={4} className={cn(CONTROL, 'resize-y')} />
        <p className="text-xs text-muted">{c.form.detailsHint}</p>
        {state.fieldErrors?.details ? (
          <p className="text-xs text-danger">{state.fieldErrors.details}</p>
        ) : null}
      </div>

      {state.error ? <FormError>{state.error}</FormError> : null}

      <div className="flex flex-wrap gap-3">
        <button type="submit" className={buttonClasses('primary', 'md')}>
          {c.form.submit}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={buttonClasses('secondary', 'md')}
        >
          {c.form.cancel}
        </button>
      </div>
    </form>
  );
}
