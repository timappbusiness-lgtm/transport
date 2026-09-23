'use client';

import { useActionState, useState } from 'react';
import { issueClaimAction, type OnboardingState } from '@/app/admin/inscrieri/actions';
import { FormError } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { onboardingCopy } from '@/content/inscrieri';
import { claimPath } from '@/lib/onboarding';

const EMPTY: OnboardingState = {};
const c = onboardingCopy.wizard.finish;

/**
 * Generarea linkului, și singura dată când se vede.
 *
 * Baza ține doar amprenta lui, deci o a doua vizită pe ecran nu îl mai
 * poate recupera. Textul o spune înainte de apăsare, nu după: cine
 * închide fila crezând că se mai întoarce la el pierde linkul și
 * trebuie să genereze altul, iar asta trimite un al doilea e-mail unei
 * firme care nu înțelege de ce.
 */
export function ClaimLink({
  onboardingId,
  hasCompany,
  mailConfigured = true,
}: {
  onboardingId: string;
  hasCompany: boolean;
  /** False when the dispatcher last complained about a missing secret. */
  mailConfigured?: boolean;
}) {
  const [state, action, pending] = useActionState(issueClaimAction, EMPTY);
  const [copied, setCopied] = useState(false);

  const url =
    state.token === undefined
      ? null
      : `${typeof window === 'undefined' ? '' : window.location.origin}${claimPath(state.token)}`;

  if (url !== null) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm">{c.sent}</p>

        {!mailConfigured ? (
          <p className="max-w-[66ch] rounded-input border border-warning/45 bg-warning/8 p-3 text-small">
            {c.noMail}
          </p>
        ) : null}

        <p className="max-w-[66ch] rounded-input border border-danger/45 bg-danger/8 p-3 text-small">
          {c.onceOnly}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 flex-1 break-all rounded-input border border-border bg-ground-alt px-3 py-2 font-mono text-xs">
            {url}
          </code>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(url);
              setCopied(true);
            }}
            className={buttonClasses('secondary', 'sm')}
          >
            {copied ? c.copied : c.copy}
          </button>
        </div>

        <p className="max-w-[66ch] text-small text-muted">{c.whatNext}</p>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="onboarding_id" value={onboardingId} />

      {!mailConfigured ? (
        <p className="max-w-[66ch] rounded-input border border-warning/45 bg-warning/8 p-3 text-small">
          {c.noMail}
        </p>
      ) : null}

      <p className="max-w-[66ch] text-small text-muted">{c.onceOnly}</p>

      <div>
        <button
          type="submit"
          disabled={pending || !hasCompany}
          className={buttonClasses('primary', 'md')}
        >
          {c.send}
        </button>
      </div>
      <FormError>{state.error}</FormError>
    </form>
  );
}
