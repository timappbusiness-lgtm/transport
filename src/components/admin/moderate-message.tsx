'use client';

import { useActionState, useId, useState } from 'react';
import { hideMessageAction, type ModerationState } from '@/app/admin/anunturi/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { messagesCopy } from '@/content/mesaje';

const EMPTY: ModerationState = {};
const c = messagesCopy.admin.conversations;

/** Ascunde un mesaj, cu motiv. Părțile văd că a fost ascuns, nu de ce. */
export function ModerateMessage({ messageId }: { messageId: string }) {
  const [state, action, pending] = useActionState(hideMessageAction, EMPTY);
  const [open, setOpen] = useState(false);
  const id = useId();

  if (state.notice !== undefined) return <FormNotice>{state.notice}</FormNotice>;

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
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="message_id" value={messageId} />
      <label htmlFor={`${id}-reason`} className="text-[0.8125rem] font-medium">
        {c.hideReason}
      </label>
      <input
        id={`${id}-reason`}
        name="reason"
        required
        maxLength={500}
        className="rounded-input border border-border-strong bg-surface px-2.5 py-1.5 text-sm"
      />
      <FormError>{state.fieldErrors?.reason}</FormError>
      <div className="flex flex-wrap gap-1.5">
        <button type="submit" disabled={pending} className={buttonClasses('primary', 'sm')}>
          {c.hide}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={buttonClasses('secondary', 'sm')}
        >
          Renunță
        </button>
      </div>
      <FormError>{state.error}</FormError>
    </form>
  );
}
