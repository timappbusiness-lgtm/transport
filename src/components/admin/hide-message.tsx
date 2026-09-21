'use client';

import { useActionState, useId, useState } from 'react';
import { hideMessageAction, type HideState } from '@/app/admin/oferte/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { offersCopy } from '@/content/oferte';

const EMPTY: HideState = {};
const c = offersCopy.admin.detail;

/**
 * „Ascunde mesajul", with the reason it asks for.
 *
 * Closed until wanted, because a thread of twelve messages with twelve
 * open forms under it is unreadable. The reason is required by
 * `staff_hide_message()` and lands in `audit_log` beside the name of
 * whoever pressed the button — this form only collects it.
 */
export function HideMessage({ messageId, offerId }: { messageId: string; offerId: string }) {
  const [state, action, pending] = useActionState(hideMessageAction, EMPTY);
  const [open, setOpen] = useState(false);
  const id = useId();

  if (state.notice !== undefined) {
    return <FormNotice>{state.notice}</FormNotice>;
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[0.75rem] text-muted underline underline-offset-4 hover:text-foreground"
      >
        {c.hide}
      </button>
    );
  }

  return (
    <form action={action} className="mt-2 flex flex-col gap-2 rounded-input border border-border-strong bg-ground-alt p-3">
      <input type="hidden" name="message_id" value={messageId} />
      <input type="hidden" name="offer_id" value={offerId} />

      <label htmlFor={`${id}-reason`} className="text-xs font-medium">
        {c.hideReason}
      </label>
      <input
        id={`${id}-reason`}
        name="reason"
        required
        maxLength={500}
        className="rounded-input border border-border-strong bg-surface px-3 py-2 text-sm"
      />
      <p className="text-xs text-muted">{c.hideReasonHint}</p>

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={buttonClasses('primary', 'sm')}>
          {c.hideSubmit}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={buttonClasses('secondary', 'sm')}
        >
          {c.hideCancel}
        </button>
      </div>

      <FormError>{state.error}</FormError>
    </form>
  );
}
