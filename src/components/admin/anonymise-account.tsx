'use client';

import { useActionState } from 'react';
import {
  anonymiseAccountAction,
  cancelDeletionRequestAction,
  type DeletionAdminState,
} from '@/app/admin/stergeri/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { personalDataCopy } from '@/content/date-personale';

const c = personalDataCopy.admin;
const EMPTY: DeletionAdminState = {};
const CONTROL =
  'w-full rounded-input border border-border-strong bg-surface px-3.5 py-2.5 text-body';

export function AnonymiseAccount() {
  const [state, action, pending] = useActionState(anonymiseAccountAction, EMPTY);

  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {c.userId}
          <input name="user_id" required autoComplete="off" className={CONTROL} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          {c.reason}
          <input name="reason" required autoComplete="off" className={CONTROL} />
          <span className="text-xs font-normal text-muted">{c.reasonHint}</span>
        </label>
      </div>
      <div>
        <button type="submit" disabled={pending} className={buttonClasses('ink', 'sm')}>
          {c.anonymise}
        </button>
      </div>
      <FormError>{state.error}</FormError>
      <FormNotice>{state.notice}</FormNotice>
    </form>
  );
}

export function CancelDeletion({ requestId }: { requestId: string }) {
  const [state, action, pending] = useActionState(cancelDeletionRequestAction, EMPTY);

  return (
    <form action={action}>
      <input type="hidden" name="request_id" value={requestId} />
      <button type="submit" disabled={pending} className={buttonClasses('secondary', 'sm')}>
        {c.cancel}
      </button>
      <FormError>{state.error}</FormError>
    </form>
  );
}
