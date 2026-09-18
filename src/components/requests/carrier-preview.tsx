'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { previewCarriersAction } from '@/app/cerere/actions';
import { buttonClasses } from '@/components/ui/button';
import { ROUTES } from '@/config/routes';
import { CARRIER_COUNT_COPY, carrierCountSentence } from '@/lib/carrier-count';
import type { RequestDraft } from '@/lib/request-form';

/**
 * The preview in the last step of the form.
 *
 * Asked for, never automatic. The count costs a scan of every verified
 * carrier, and a form that runs it on every keystroke is a form that
 * spends somebody's hourly allowance before they have finished typing
 * their telephone number — so it is a button, and the button is the
 * whole rate-limiting story on this side.
 *
 * It is also only offered to somebody who is signed in. A visitor has no
 * session for the database to count against, and the honest version of
 * that is not showing the button rather than showing one that fails.
 */
export function CarrierPreview({ draft, signedIn }: { draft: RequestDraft; signedIn: boolean }) {
  const [pending, startTransition] = useTransition();
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState(false);

  if (!signedIn) return null;

  function onClick(): void {
    setError(null);
    startTransition(async () => {
      const result = await previewCarriersAction({
        fromCity: draft.fromCity,
        fromCountry: draft.fromCountry,
        toCity: draft.toCity,
        toCountry: draft.toCountry,
        loadingFrom: draft.loadingFrom,
        loadingTo: draft.loadingTo,
        category: draft.category,
        isRunning: draft.isRunning,
        wheelsTurn: draft.wheelsTurn,
        steeringWorks: draft.steeringWorks,
        serviceType: draft.serviceType,
      });
      setAsked(true);
      setCount(result.count);
      setError(result.error ?? null);
    });
  }

  const none = count !== null && count <= 0;

  return (
    <div className="rounded-input border border-border bg-ground-alt px-4 py-3">
      {!asked ? (
        <button
          type="button"
          onClick={onClick}
          disabled={pending}
          className={buttonClasses('secondary', 'sm')}
        >
          {pending ? CARRIER_COUNT_COPY.previewPending : CARRIER_COUNT_COPY.previewLabel}
        </button>
      ) : null}

      {asked && count !== null ? (
        <>
          <p className="text-sm">{carrierCountSentence(count)}</p>
          {none ? (
            <Link
              href={ROUTES.routes}
              className="mt-1 inline-block text-sm underline underline-offset-2"
            >
              {CARRIER_COUNT_COPY.zeroLinkLabel}
            </Link>
          ) : (
            <p className="mt-1 text-xs text-muted">{CARRIER_COUNT_COPY.how}</p>
          )}
        </>
      ) : null}

      {error !== null ? (
        <p role="alert" className="mt-1 text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
