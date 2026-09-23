'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { acceptTermsAction } from '@/app/cont/terms-actions';
import { FormError } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { ROUTES } from '@/config/routes';
import { legalCopy } from '@/content/legal-copy';

/**
 * „Termenii s-au schimbat" — the one screen in the account area that has
 * to be answered before anything else happens.
 *
 * Not a dismissible modal. The terms are the contract, and an account
 * carrying on under a version nobody accepted is an account we cannot
 * point at anything for. But it is also not a trap: the links out — read
 * the document, sign out — are on the same screen, because a person who
 * does not agree must be able to leave without agreeing.
 *
 * Rendered by the layout in place of the shell rather than over it, so
 * there is no z-index, no scroll lock and nothing behind it to reach with
 * a keyboard.
 */
export function TermsGate({ version }: { version: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | undefined>(undefined);
  const c = legalCopy.gate;

  function onAccept(): void {
    setError(undefined);
    startTransition(async () => {
      const state = await acceptTermsAction();
      if (state.error !== undefined) setError(state.error);
    });
  }

  return (
    <main className="mx-auto flex w-full max-w-[42rem] flex-col gap-4 px-4 py-16">
      <h1 className="text-h2">{c.title}</h1>
      <p className="text-body">{c.body(version)}</p>
      <p className="text-body text-muted">{c.why}</p>

      <div className="mt-2 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onAccept}
          disabled={pending}
          className={buttonClasses('primary', 'md')}
        >
          {pending ? c.accepting : c.accept}
        </button>
        <Link href={ROUTES.terms} className={buttonClasses('secondary', 'md')}>
          {c.read}
        </Link>
      </div>

      {error !== undefined ? <FormError>{error}</FormError> : null}

      <p className="mt-4 text-body text-muted">
        {c.leave}{' '}
        <Link href={ROUTES.accountPersonalData} className="underline underline-offset-2">
          {c.leaveLink}
        </Link>
        .
      </p>
    </main>
  );
}
