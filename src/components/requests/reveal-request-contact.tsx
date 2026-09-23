'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { revealRequestContactAction, type RevealRequestState } from '@/app/cerere/actions';
import { FormError } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { ROUTES } from '@/config/routes';
import { requestsCopy } from '@/content/cereri';
import { isQuotaError } from '@/lib/errors';

const EMPTY: RevealRequestState = {};

/**
 * "Deschide datele de contact."
 *
 * The decision belongs entirely to `reveal_contact`: it spends one of the
 * plan's contacts, logs the opening, and refuses with a written Romanian
 * message when the caller has no firm, a firm that cannot act, or nothing
 * left this month. Those messages say what to do next, so they are shown as
 * the database wrote them.
 */
export function RevealRequestContact({
  requestId,
  signedIn,
}: {
  requestId: string;
  signedIn: boolean;
}) {
  const [state, action] = useActionState(revealRequestContactAction, EMPTY);
  const c = requestsCopy.detail;

  if (state.contact) {
    return (
      <div className="rounded-input border border-success/40 bg-success/8 px-4 py-3">
        {state.contact.name ? (
          <p className="text-sm font-medium">{state.contact.name}</p>
        ) : null}
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
      <input type="hidden" name="request_id" value={requestId} />
      <button type="submit" className={buttonClasses('primary', 'md')}>
        {signedIn ? c.contact : c.contactHidden}
      </button>
      <FormError>{state.error}</FormError>
      {state.error && isQuotaError(state.error) ? (
        <p className="text-sm">
          <Link
            href={ROUTES.plans}
            className="link-accent"
          >
            {c.seePlans}
          </Link>
        </p>
      ) : null}
    </form>
  );
}
