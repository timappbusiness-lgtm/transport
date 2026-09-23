'use client';

import Link from 'next/link';
import { useSyncExternalStore } from 'react';
import { continuityCopy } from '@/content/continuitate';
import { SIGN_IN_AGAIN_HREF } from '@/lib/continuity/session';
import {
  dismissSessionNotice,
  getServerSessionState,
  getSessionState,
  subscribeSession,
} from '@/lib/continuity/session-store';

/**
 * The page-wide notice for a session that expired while a form was open.
 *
 * The form itself says what happened, beside its fields. This says what to
 * do about it — sign in again in a new tab, so this one, with the form in
 * it, stays exactly as it is — and, when the other tab reports that the
 * sign-in worked, that the form can be sent now.
 *
 * `role="status"`, not `alert`: the form's own error is the alert, and one
 * failure read out twice is noise.
 */
export function SessionNotice() {
  const state = useSyncExternalStore(subscribeSession, getSessionState, getServerSessionState);
  if (state === 'ok') return null;
  const c = continuityCopy.session;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-50 flex justify-center px-4">
      <div
        role="status"
        data-session-notice={state}
        className="pointer-events-auto flex w-full max-w-[34rem] flex-wrap items-center gap-x-4 gap-y-2 rounded-card border border-border-strong bg-surface px-4 py-3 text-small text-foreground shadow-float"
      >
        <p className="min-w-0 flex-1">{state === 'expired' ? c.expired : c.restored}</p>
        {state === 'expired' ? (
          <Link
            href={SIGN_IN_AGAIN_HREF}
            target="_blank"
            rel="noopener"
            className="link-accent font-medium"
          >
            {c.signInAgain}
          </Link>
        ) : null}
        <button
          type="button"
          onClick={dismissSessionNotice}
          className="text-small text-muted underline-offset-4 hover:text-foreground hover:underline"
        >
          {c.close}
        </button>
      </div>
    </div>
  );
}
