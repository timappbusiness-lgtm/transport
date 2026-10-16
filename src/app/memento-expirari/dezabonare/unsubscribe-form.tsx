'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { buttonClasses } from '@/components/ui/button';
import { ROUTES } from '@/config/routes';
import { mementoCopy } from '@/content/memento';
import { unsubscribeMementoAction, type UnsubscribeState } from './actions';

const c = mementoCopy.unsubscribe;
const EMPTY: UnsubscribeState = {};

export function UnsubscribeForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(unsubscribeMementoAction, EMPTY);

  if (state.outcome !== undefined) {
    return (
      <p role="status" className="text-body" data-memento-unsubscribe={state.outcome}>
        {state.outcome === 'done' ? c.done : c.invalid}{' '}
        <Link href={ROUTES.accountNotificationSettings} className="underline underline-offset-4">
          {c.settings}
        </Link>
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="t" value={token} />
      <p className="text-body">{c.body}</p>
      <div>
        <button type="submit" disabled={pending} className={buttonClasses('ink', 'md')} data-memento-unsubscribe-button>
          {c.button}
        </button>
      </div>
    </form>
  );
}
