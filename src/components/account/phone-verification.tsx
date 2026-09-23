'use client';

import { useActionState, useState } from 'react';
import { Icon } from '@/components/ui/icon';
import { uiIcon } from '@/lib/icons';
import { sendPhoneOtpAction, verifyPhoneOtpAction, type ActionState } from '@/app/cont/actions';
import { Field, FormError, FormNotice, SubmitButton } from '@/components/auth/form';
import { accountCopy } from '@/content/account';

const EMPTY: ActionState = {};

/**
 * Phone confirmation, shown as a step rather than a wall.
 *
 * The database only requires a confirmed number at the point where it
 * matters — publishing as an individual, or asking for someone's contact
 * details — so this never blocks sign-up.
 */
export function PhoneVerification({
  phone,
  verified,
}: {
  phone: string;
  verified: boolean;
}) {
  const c = accountCopy.individual.phoneStep;
  const [sendState, sendAction] = useActionState(sendPhoneOtpAction, EMPTY);
  const [verifyState, verifyAction] = useActionState(verifyPhoneOtpAction, EMPTY);
  const [open, setOpen] = useState(false);

  const pendingPhone = sendState.values?.phone ?? phone;
  const codeSent = Boolean(sendState.notice);

  if (verified || verifyState.notice) {
    return (
      <section className="flex items-start gap-3 rounded-card border border-success/40 bg-success/8 p-4">
        <span aria-hidden="true" className="mt-0.5 text-success">
          <Icon as={uiIcon('check')} size="md" />
        </span>
        <div>
          <p className="font-display text-body font-medium">{c.title}</p>
          <p className="mt-1 text-body text-muted">{c.bodyDone}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-card border border-border bg-surface p-5">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="mt-0.5 text-muted">
          <Icon as={uiIcon('phone')} size="md" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-body font-medium">{c.title}</p>
          <p className="mt-1 text-body text-muted">{c.body}</p>
          <p className="mt-1 font-mono text-label text-muted">{c.why}</p>
        </div>
      </div>

      {open ? (
        <div className="mt-5 flex flex-col gap-4 border-t border-border pt-5">
          <form action={sendAction} className="flex flex-col gap-3" noValidate>
            <FormError>{sendState.error}</FormError>
            <FormNotice>{sendState.notice}</FormNotice>
            <Field
              label="Număr de telefon"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="0722 123 456"
              defaultValue={pendingPhone}
              error={sendState.fieldErrors?.phone}
            />
            <SubmitButton>{codeSent ? 'Trimite alt cod' : 'Trimite codul'}</SubmitButton>
          </form>

          {codeSent ? (
            <form action={verifyAction} className="flex flex-col gap-3 border-t border-border pt-4" noValidate>
              <input type="hidden" name="phone" value={pendingPhone} />
              <FormError>{verifyState.error}</FormError>
              <Field
                label="Codul din SMS"
                name="token"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                error={verifyState.fieldErrors?.token}
              />
              <SubmitButton>Confirmă numărul</SubmitButton>
            </form>
          ) : null}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 text-body link-accent"
        >
          {c.action}
        </button>
      )}
    </section>
  );
}
