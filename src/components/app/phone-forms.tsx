'use client';

import { useActionState, useState } from 'react';
import { confirmPhoneCode, sendPhoneCode } from '@/app/actions/phone';
import { initialActionState } from '@/lib/action-state';
import { Field, FormMessage, SubmitButton, inputClasses } from './forms';

export function PhoneVerification({ currentPhone }: { currentPhone: string | null }) {
  const [phone, setPhone] = useState(currentPhone ?? '');
  const [sent, sendAction] = useActionState(sendPhoneCode, initialActionState);
  const [confirmed, confirmAction] = useActionState(confirmPhoneCode, initialActionState);

  return (
    <div className="grid gap-6">
      <form action={sendAction} className="grid gap-3">
        <Field label="Număr de telefon" htmlFor="phone" error={sent?.errors?.phone}>
          <input
            id="phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            placeholder="07xx xxx xxx"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
            className={inputClasses}
          />
        </Field>
        <FormMessage state={sent} />
        <div>
          <SubmitButton size="sm" pendingLabel="Se trimite…">
            Trimite codul
          </SubmitButton>
        </div>
      </form>

      {sent?.ok ? (
        <form action={confirmAction} className="grid gap-3 border-t border-border pt-5">
          <input type="hidden" name="phone" value={phone} />
          <Field label="Codul primit" htmlFor="code" error={confirmed?.errors?.code}>
            <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required className={`${inputClasses} font-mono tracking-[0.3em]`} />
          </Field>
          <FormMessage state={confirmed} />
          <div>
            <SubmitButton size="sm" pendingLabel="Se verifică…">
              Confirmă
            </SubmitButton>
          </div>
        </form>
      ) : null}
    </div>
  );
}
