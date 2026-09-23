'use client';

import { useActionState, useId, useState } from 'react';
import { hideEvidenceAction, type OrderState } from '@/app/cont/transporturi/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { ordersCopy } from '@/content/comenzi';

const EMPTY: OrderState = {};
const c = ordersCopy.evidence;

/**
 * Hiding one photograph or one note, with a reason.
 *
 * The row stays and so does the file: `order_evidence` refuses an
 * update to anything but its three hidden_* columns, whoever asks, and
 * the only thing this changes is whether the two parties see it. A
 * moderation decision somebody has to answer for later is worth nothing
 * if the thing decided about is gone.
 */
export function HideEvidence({ evidenceId, orderId }: { evidenceId: string; orderId: string }) {
  const [state, action, pending] = useActionState(hideEvidenceAction, EMPTY);
  const [open, setOpen] = useState(false);
  const id = useId();

  if (state.notice !== undefined) return <FormNotice>{state.notice}</FormNotice>;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1 text-small text-muted underline underline-offset-4 hover:text-foreground"
      >
        {c.hide}
      </button>
    );
  }

  return (
    <form
      action={action}
      className="mt-2 flex flex-col gap-2 rounded-input border border-border-strong bg-ground-alt p-2"
    >
      <input type="hidden" name="evidence_id" value={evidenceId} />
      <input type="hidden" name="order_id" value={orderId} />

      <label htmlFor={`${id}-reason`} className="text-small font-medium">
        {c.hideReason}
      </label>
      <input
        id={`${id}-reason`}
        name="reason"
        required
        maxLength={500}
        className="rounded-input border border-border-strong bg-surface px-2 py-1.5 text-small"
      />
      <p className="text-small leading-tight text-muted">{c.hideReasonHint}</p>

      <div className="flex flex-wrap gap-1.5">
        <button type="submit" disabled={pending} className={buttonClasses('ink', 'sm')}>
          {c.hideSubmit}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={buttonClasses('secondary', 'sm')}
        >
          {ordersCopy.actions.cancel}
        </button>
      </div>
      <FormError>{state.error}</FormError>
    </form>
  );
}
