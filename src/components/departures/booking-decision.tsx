'use client';

import { answerBookingAction, type DepartureActionState } from '@/app/cont/trasee/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { departuresCopy } from '@/content/departures';
import { KeepingForm } from '@/components/ui/keeping-form';
import { useKeptActionState } from '@/lib/continuity/use-kept-action-state';

const EMPTY: DepartureActionState = {};

/**
 * Confirm or refuse one reservation.
 *
 * Both buttons submit the same form with a different `decision`, so there is
 * one action and one place where the result is reported. Confirming calls
 * `confirm_departure_booking`, which creates the order through the shared
 * function — the same path an accepted offer takes.
 */
export function BookingDecision({ bookingId }: { bookingId: string }) {
  const [state, action] = useKeptActionState(answerBookingAction, EMPTY);
  const c = departuresCopy.mine;

  if (state.notice) {
    return <FormNotice>{state.notice}</FormNotice>;
  }

  return (
    <KeepingForm action={action} className="flex flex-col items-end gap-2">
      <input type="hidden" name="booking_id" value={bookingId} />
      <div className="flex gap-2">
        <button
          type="submit"
          name="decision"
          value="confirm"
          className={buttonClasses('primary', 'sm')}
        >
          {c.confirm}
        </button>
        <button
          type="submit"
          name="decision"
          value="reject"
          className={buttonClasses('secondary', 'sm')}
        >
          {c.reject}
        </button>
      </div>
      <FormError>{state.error}</FormError>
    </KeepingForm>
  );
}
