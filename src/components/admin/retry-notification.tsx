'use client';

import { retryNotificationAction, type RetryState } from '@/app/admin/notificari/actions';
import { buttonClasses } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { KeepingForm } from '@/components/ui/keeping-form';
import { useKeptActionState } from '@/lib/continuity/use-kept-action-state';

const EMPTY: RetryState = {};

/** One button per failed row. The rule it calls is in the database. */
export function RetryNotification({ id }: { id: string }) {
  const [state, action, pending] = useKeptActionState(retryNotificationAction, EMPTY);

  if (state.notice !== undefined) {
    return <span className="text-small text-muted">{state.notice}</span>;
  }

  return (
    <KeepingForm action={action} className="flex flex-col items-end gap-1">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        className={cn(buttonClasses('secondary', 'sm'), 'whitespace-nowrap')}
      >
        {pending ? 'Se reîncearcă…' : 'Reîncearcă'}
      </button>
      {state.error !== undefined ? (
        <span role="alert" className="text-small text-danger">
          {state.error}
        </span>
      ) : null}
    </KeepingForm>
  );
}
