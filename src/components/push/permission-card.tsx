'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { buttonClasses } from '@/components/ui/button';
import { pushCopy } from '@/content/notificari';
import { createDismissalStore } from '@/lib/dismissal-store';
import { DISMISS_KEY, shouldPrompt } from '@/lib/push';
import { usePush } from './use-push';

/**
 * The card that asks.
 *
 * It appears after the person has done something that makes notifications
 * obviously useful — never on page load. `shouldPrompt` holds that rule
 * and is tested; this component only renders what it decides.
 *
 * On iOS Safari before the site is installed the card shows instructions
 * instead of a button, because there is no button that would work: iOS
 * only offers push to an installed site, and a "activează" that silently
 * does nothing is worse than an explanation.
 */
export function PushPermissionCard({
  audience,
  /** The action that just happened, which is what makes this the moment. */
  trigger,
}: {
  audience: 'carrier' | 'client';
  trigger: boolean;
}) {
  const push = usePush();
  const [closed, setClosed] = useState(false);

  const store = useMemo(() => createDismissalStore(DISMISS_KEY), []);
  const dismissedAt = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );

  if (closed || push.support === 'unknown' || push.permission === 'unknown') return null;

  const show = shouldPrompt({
    support: push.support,
    permission: push.permission,
    subscribed: push.subscribed,
    afterMeaningfulAction: trigger,
    dismissedAt,
    now: new Date(),
  });
  if (!show) return null;

  function dismiss() {
    store.dismiss();
    setClosed(true);
  }

  const c = pushCopy.card;
  const needsInstall = push.support === 'needs-install';

  return (
    <section
      aria-labelledby="notificari-card"
      className="mt-6 rounded-card border border-border-strong bg-surface p-5"
    >
      <h2 id="notificari-card" className="text-h3">
        {needsInstall ? c.iosTitle : c.title}
      </h2>
      <p className="mt-2 max-w-[56ch] text-body text-muted">
        {needsInstall ? c.iosBody : audience === 'carrier' ? c.carrierBody : c.clientBody}
      </p>

      {push.error ? <p className="mt-3 text-body text-danger">{push.error}</p> : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {needsInstall ? (
          <button type="button" onClick={dismiss} className={buttonClasses('secondary', 'sm')}>
            {c.iosDismiss}
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={push.busy}
              onClick={() => {
                void push.subscribe().then((ok) => {
                  if (ok) setClosed(true);
                });
              }}
              className={buttonClasses('primary', 'sm')}
            >
              {c.accept}
            </button>
            <button type="button" onClick={dismiss} className={buttonClasses('secondary', 'sm')}>
              {c.later}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
