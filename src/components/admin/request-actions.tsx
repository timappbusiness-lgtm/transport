'use client';

import { useActionState, useId } from 'react';
import {
  activateRequestAction,
  markContactedAction,
  rejectRequestAction,
  type RequestActionState,
} from '@/app/admin/abonamente/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { adminDirectoryCopy } from '@/content/admin-directory';

const EMPTY: RequestActionState = {};
const c = adminDirectoryCopy.requests;

/**
 * The three things staff can do with a request.
 *
 * Rejection asks for a reason, which the database requires as well — the
 * company is told why, and the reason stays in `audit_log`.
 */
export function RequestActions({ id, status }: { id: string; status: 'new' | 'contacted' }) {
  const [contactState, contact] = useActionState(markContactedAction, EMPTY);
  const [activateState, activate] = useActionState(activateRequestAction, EMPTY);
  const [rejectState, reject] = useActionState(rejectRequestAction, EMPTY);
  const reasonId = useId();

  return (
    <div className="flex flex-col gap-2">
      {status === 'new' ? (
        <form action={contact}>
          <input type="hidden" name="id" value={id} />
          <button type="submit" className={buttonClasses('secondary', 'sm')}>
            {c.contact}
          </button>
        </form>
      ) : null}

      <form action={activate}>
        <input type="hidden" name="id" value={id} />
        <button type="submit" className={buttonClasses('primary', 'sm')}>
          {c.activate}
        </button>
      </form>

      <form action={reject} className="flex flex-col gap-2">
        <input type="hidden" name="id" value={id} />
        <label htmlFor={reasonId} className="sr-only">
          {c.reason}
        </label>
        <input
          id={reasonId}
          name="reason"
          type="text"
          maxLength={200}
          placeholder={c.reasonPlaceholder}
          className="w-full rounded-input border border-border-strong bg-surface px-3 py-2 text-small"
        />
        <button type="submit" className={buttonClasses('secondary', 'sm')}>
          {c.reject}
        </button>
      </form>

      {[contactState, activateState, rejectState].map((state, index) => (
        <div key={index}>
          <FormError>{state.error}</FormError>
          {state.notice ? <FormNotice>{state.notice}</FormNotice> : null}
        </div>
      ))}
    </div>
  );
}
