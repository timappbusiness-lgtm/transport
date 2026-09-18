'use client';

import { useActionState } from 'react';
import { retryNotificationAction, type RetryState } from '@/app/admin/notificari/actions';
import { buttonClasses } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const EMPTY: RetryState = {};

/** One button per failed row. The rule it calls is in the database. */
export function RetryNotification({ id }: { id: string }) {
  const [state, action, pending] = useActionState(retryNotificationAction, EMPTY);

  if (state.notice !== undefined) {
    return <span className="text-xs text-muted">{state.notice}</span>;
  }

  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className={cn(buttonClasses('secondary', 'sm'), 'whitespace-nowrap')}
      >
        {pending ? 'Se reîncearcă…' : 'Reîncearcă'}
      </button>
      {state.error !== undefined ? (
        <span role="alert" className="text-xs text-danger">
          {state.error}
        </span>
      ) : null}
    </form>
  );
}
