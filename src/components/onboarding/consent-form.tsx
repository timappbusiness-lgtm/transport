'use client';

import { useActionState } from 'react';
import { startOnboardingAction, type OnboardingState } from '@/app/admin/inscrieri/actions';
import { FormError } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { onboardingCopy } from '@/content/inscrieri';
import { CONSENT_CHANNELS, CONSENT_LABELS, MAX_CONSENT_NOTE } from '@/lib/onboarding';

const EMPTY: OnboardingState = {};
const c = onboardingCopy.wizard.consent;
const FIELD =
  'rounded-input border border-border-strong bg-surface px-3 py-2 text-sm font-normal';

/** Today, as the date input wants it. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ConsentForm() {
  const [state, action, pending] = useActionState(startOnboardingAction, EMPTY);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {c.name}
          <input name="contact_name" required className={FIELD} />
          <span className="text-xs font-normal text-muted">{c.nameHint}</span>
          <FormError>{state.fieldErrors?.name}</FormError>
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {c.email}
          <input type="email" name="contact_email" required className={FIELD} />
          <span className="text-xs font-normal text-muted">{c.emailHint}</span>
          <FormError>{state.fieldErrors?.email}</FormError>
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {c.phone}
          <input name="contact_phone" required className={FIELD} />
          <FormError>{state.fieldErrors?.phone}</FormError>
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {c.channel}
          <select name="consent_channel" required defaultValue="" className={FIELD}>
            <option value="" disabled>
              Alege
            </option>
            {CONSENT_CHANNELS.map((channel) => (
              <option key={channel} value={channel}>
                {CONSENT_LABELS[channel]}
              </option>
            ))}
          </select>
          <FormError>{state.fieldErrors?.channel}</FormError>
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {c.date}
          <input type="date" name="consent_date" required defaultValue={today()} className={FIELD} />
          <FormError>{state.fieldErrors?.consentDate}</FormError>
        </label>
      </div>

      <label className="flex flex-col gap-1.5 text-sm font-medium">
        {c.note}
        <textarea name="consent_note" rows={2} maxLength={MAX_CONSENT_NOTE} className={FIELD} />
        <span className="text-xs font-normal text-muted">{c.noteHint}</span>
      </label>

      <label className="flex items-start gap-2.5 rounded-input border border-border-strong bg-ground-alt p-3 text-[0.8125rem]">
        <input type="checkbox" name="consent_confirmed" className="mt-0.5" />
        <span>{c.confirm}</span>
      </label>
      <FormError>{state.fieldErrors?.consentConfirmed}</FormError>

      <div>
        <button type="submit" disabled={pending} className={buttonClasses('primary', 'md')}>
          {c.submit}
        </button>
      </div>
      <FormError>{state.error}</FormError>
    </form>
  );
}
