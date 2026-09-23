'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { orderContactsAction, type ContactsState } from '@/app/cont/oferte/actions';
import { FormError } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { transportRoute } from '@/config/routes';
import { offersCopy } from '@/content/oferte';

const EMPTY: ContactsState = {};
const c = offersCopy.contact;

/**
 * The other party's telephone number, once there is an order.
 *
 * A button rather than a panel that is simply there, for the same
 * reason the board has one: opening a contact is an event somebody may
 * later ask about, and `order_contacts()` records it. That it costs
 * nothing is said beside the button, because a carrier who has learnt
 * that contacts come out of an allowance will otherwise not press it.
 *
 * Which side comes back is the database's answer, not this component's:
 * the client gets the carrier, the carrier gets the client.
 */
export function OrderContacts({ offerId, label }: { offerId: string; label?: string }) {
  const [state, action] = useActionState(orderContactsAction, EMPTY);

  if (state.contacts) {
    const { displayName, name, phone, email, transportId } = state.contacts;
    return (
      <div className="rounded-input border border-success/40 bg-success/8 px-4 py-3">
        <p className="text-xs text-muted">{c.title}</p>
        {displayName ? <p className="mt-1 text-sm font-medium">{displayName}</p> : null}
        {name !== null && name !== displayName ? (
          <p className="text-sm">
            <span className="text-muted">{c.name}: </span>
            {name}
          </p>
        ) : null}
        {phone ? (
          <p className="font-mono text-sm tabular-nums">
            <a href={`tel:${phone}`} className="link-accent">
              {phone}
            </a>
          </p>
        ) : null}
        {email ? (
          <p className="text-sm">
            <a href={`mailto:${email}`} className="link-accent">
              {email}
            </a>
          </p>
        ) : null}
        <p className="mt-2 text-xs text-muted">{c.free}</p>
        {transportId !== null ? (
          <p className="mt-2 text-sm">
            <Link href={transportRoute(transportId)} className="link-accent">
              {offersCopy.sent.seeOrder}
            </Link>
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="offer_id" value={offerId} />
      <button type="submit" className={buttonClasses('primary', 'sm')}>
        {label ?? c.open}
      </button>
      <p className="text-xs text-muted">{c.free}</p>
      <FormError>{state.error}</FormError>
    </form>
  );
}
