'use client';

import { useActionState } from 'react';
import { withdrawOfferAction, type OfferState } from '@/app/cont/oferte/actions';
import { buttonClasses } from '@/components/ui/button';
import { offersCopy } from '@/content/oferte';

const EMPTY: OfferState = {};

/** Taking an offer back, with the consequence said before the click. */
export function WithdrawOffer({ offerId }: { offerId: string }) {
  const [state, action, pending] = useActionState(withdrawOfferAction, EMPTY);

  return (
    <form
      action={action}
      onSubmit={(event) => {
        if (!window.confirm(offersCopy.sent.withdrawConfirm)) event.preventDefault();
      }}
    >
      <input type="hidden" name="offer_id" value={offerId} />
      <button type="submit" disabled={pending} className={buttonClasses('secondary', 'sm')}>
        {pending ? offersCopy.sent.withdrawing : offersCopy.sent.withdraw}
      </button>
      {state.error !== undefined ? (
        <p role="alert" className="mt-2 text-sm text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
