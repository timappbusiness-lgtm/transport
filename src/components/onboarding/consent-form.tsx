'use client';

import { useRef } from 'react';

import { startOnboardingAction, type OnboardingState } from '@/app/admin/inscrieri/actions';
import { FormError } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { onboardingCopy } from '@/content/inscrieri';
import { CONSENT_CHANNELS, CONSENT_LABELS, MAX_CONSENT_NOTE } from '@/lib/onboarding';
import { KeepingForm } from '@/components/ui/keeping-form';
import { useKeptActionState } from '@/lib/continuity/use-kept-action-state';
import { DraftRestored } from '@/components/continuity/draft-status';
import { useFormDraft } from '@/lib/continuity/use-form-draft';

const EMPTY: OnboardingState = {};
const c = onboardingCopy.wizard.consent;
const FIELD =
  'rounded-input border border-border-strong bg-surface px-3 py-2 text-body font-normal';

/** Today, as the date input wants it. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function ConsentForm() {
  const [state, action, pending] = useKeptActionState(startOnboardingAction, EMPTY);
  // Kept on every change, on the account too: the contact and the consent, typed while on the phone with the carrier
  // survive a refresh or a dropped connection. Cleared once the step is saved.
  const draftRef = useRef<HTMLFormElement>(null);
  const draft = useFormDraft(draftRef, { form: 'inscriere-asistata', signedIn: true });

  return (
    <KeepingForm ref={draftRef} action={action} className="flex flex-col gap-4">
      {draft.restored !== null ? (
        <DraftRestored savedAt={draft.restored.savedAt} onStartOver={draft.startOver} />
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-body font-medium">
          {c.name}
          <input name="contact_name" required className={FIELD} />
          <span className="text-small font-normal text-muted">{c.nameHint}</span>
          <FormError>{state.fieldErrors?.name}</FormError>
        </label>

        <label className="flex flex-col gap-1.5 text-body font-medium">
          {c.email}
          <input type="email" name="contact_email" required className={FIELD} />
          <span className="text-small font-normal text-muted">{c.emailHint}</span>
          <FormError>{state.fieldErrors?.email}</FormError>
        </label>

        <label className="flex flex-col gap-1.5 text-body font-medium">
          {c.phone}
          <input name="contact_phone" required className={FIELD} />
          <FormError>{state.fieldErrors?.phone}</FormError>
        </label>

        <label className="flex flex-col gap-1.5 text-body font-medium">
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

        <label className="flex flex-col gap-1.5 text-body font-medium">
          {c.date}
          <input type="date" name="consent_date" required defaultValue={today()} className={FIELD} />
          <FormError>{state.fieldErrors?.consentDate}</FormError>
        </label>
      </div>

      <label className="flex flex-col gap-1.5 text-body font-medium">
        {c.note}
        <textarea name="consent_note" rows={2} maxLength={MAX_CONSENT_NOTE} className={FIELD} />
        <span className="text-small font-normal text-muted">{c.noteHint}</span>
      </label>

      <label className="flex items-start gap-2.5 rounded-input border border-border-strong bg-ground-alt p-3 text-small">
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
    </KeepingForm>
  );
}
