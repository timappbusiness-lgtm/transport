'use client';

import { useActionState } from 'react';
import { revealContactAction, type RevealState } from '@/app/trasee/actions';
import Link from 'next/link';
import { FormError } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { ROUTES } from '@/config/routes';
import { departuresCopy } from '@/content/departures';
import { isQuotaError } from '@/lib/errors';

const EMPTY: RevealState = {};

/**
 * "Contactează transportatorul."
 *
 * The decision is entirely the database's: `reveal_contact` consumes a
 * contact allowance and refuses with a written Romanian message when the
 * caller has no company, an unverified phone, or a spent quota. Those
 * messages are shown as they are — they say what to do next, which a
 * generic error would not.
 */
export function RevealContactButton({
  truckListingId,
  signedIn,
}: {
  truckListingId: string;
  signedIn: boolean;
}) {
  const [state, action] = useActionState(revealContactAction, EMPTY);
  const c = departuresCopy.detail;

  if (state.contact) {
    return (
      <div className="rounded-input border border-success/40 bg-success/8 px-4 py-3">
        <p className="text-sm font-medium">{state.contact.name}</p>
        {state.contact.phone ? (
          <p className="font-mono text-sm tabular-nums">
            <a href={`tel:${state.contact.phone}`} className="link-accent">
              {state.contact.phone}
            </a>
          </p>
        ) : null}
        {state.contact.email ? (
          <p className="text-sm">
            <a href={`mailto:${state.contact.email}`} className="link-accent">
              {state.contact.email}
            </a>
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="truckListingId" value={truckListingId} />
      <button type="submit" className={buttonClasses('secondary', 'md')}>
        {signedIn ? c.contact : 'Intră în cont ca să contactezi'}
      </button>
      <FormError>{state.error}</FormError>
      {state.error && isQuotaError(state.error) ? (
        <p className="text-sm">
          <Link
            href={ROUTES.plans}
            className="link-accent"
          >
            {departuresCopy.detail.seePlans}
          </Link>
        </p>
      ) : null}
    </form>
  );
}
