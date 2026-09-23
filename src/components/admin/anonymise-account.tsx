'use client';

import {
  anonymiseAccountAction,
  cancelDeletionRequestAction,
  type DeletionAdminState,
} from '@/app/admin/stergeri/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { personalDataCopy } from '@/content/date-personale';
import { KeepingForm } from '@/components/ui/keeping-form';
import { useKeptActionState } from '@/lib/continuity/use-kept-action-state';

const c = personalDataCopy.admin;
const EMPTY: DeletionAdminState = {};
const CONTROL =
  'w-full rounded-input border border-border-strong bg-surface px-3.5 py-2.5 text-body';

export function AnonymiseAccount() {
  const [state, action, pending] = useKeptActionState(anonymiseAccountAction, EMPTY);

  return (
    <KeepingForm action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <label className="flex flex-col gap-1.5 text-body font-medium">
          {c.userId}
          <input name="user_id" required autoComplete="off" className={CONTROL} />
        </label>
        <label className="flex flex-col gap-1.5 text-body font-medium">
          {c.reason}
          <input name="reason" required autoComplete="off" className={CONTROL} />
          <span className="text-small font-normal text-muted">{c.reasonHint}</span>
        </label>
      </div>
      <div>
        <button type="submit" disabled={pending} className={buttonClasses('ink', 'sm')}>
          {c.anonymise}
        </button>
      </div>
      <FormError>{state.error}</FormError>
      <FormNotice>{state.notice}</FormNotice>
    </KeepingForm>
  );
}

export function CancelDeletion({ requestId }: { requestId: string }) {
  const [state, action, pending] = useKeptActionState(cancelDeletionRequestAction, EMPTY);

  return (
    <KeepingForm action={action}>
      <input type="hidden" name="request_id" value={requestId} />
      <button type="submit" disabled={pending} className={buttonClasses('secondary', 'sm')}>
        {c.cancel}
      </button>
      <FormError>{state.error}</FormError>
    </KeepingForm>
  );
}
