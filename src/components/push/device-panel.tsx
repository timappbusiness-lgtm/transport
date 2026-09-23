'use client';

import { useState, useTransition } from 'react';
import {
  removeSubscriptionAction,
  sendTestPushAction,
} from '@/app/cont/setari/notificari/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { pushCopy } from '@/content/notificari';
import { formatDateRo } from '@/lib/format';
import type { DeviceRow } from '@/lib/notifications-source';
import { usePush } from './use-push';

const c = pushCopy.settings.devices;

/**
 * This browser, and the others.
 *
 * "This browser" is decided by the browser rather than by the row list:
 * two devices can have the same label, and a list that guesses which line
 * is yours will eventually let somebody switch off the wrong one.
 */
export function DevicePanel({ devices }: { devices: DeviceRow[] }) {
  const push = usePush();
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const others = devices.filter((device) => device.disabledAt === null);

  return (
    <section aria-labelledby="dispozitive" className="rounded-card border border-border bg-surface p-5">
      <h2 id="dispozitive" className="text-h3">
        {c.title}
      </h2>

      {push.support === 'not-configured' ? (
        <p className="mt-2 text-sm text-muted">{c.notConfigured}</p>
      ) : push.support === 'unsupported' ? (
        <p className="mt-2 text-sm text-muted">{c.unsupported}</p>
      ) : push.support === 'needs-install' ? (
        <p className="mt-2 max-w-[56ch] text-sm text-muted">{pushCopy.card.iosBody}</p>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted">{push.subscribed ? c.on : c.off}</p>

          <FormError>{push.error ?? error ?? undefined}</FormError>
          {notice ? <FormNotice>{notice}</FormNotice> : null}

          <div className="mt-4 flex flex-wrap gap-2">
            {push.subscribed ? (
              <>
                <button
                  type="button"
                  disabled={push.busy}
                  onClick={() => void push.unsubscribe()}
                  className={buttonClasses('secondary', 'sm')}
                >
                  {c.disable}
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      setNotice(null);
                      setError(null);
                      const result = await sendTestPushAction();
                      setNotice(result.notice ?? null);
                      setError(result.error ?? null);
                    })
                  }
                  className={buttonClasses('secondary', 'sm')}
                >
                  {c.test}
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={push.busy}
                onClick={() => void push.subscribe()}
                className={buttonClasses('primary', 'sm')}
              >
                {c.enable}
              </button>
            )}
          </div>

          {push.subscribed ? <p className="mt-2 text-xs text-muted">{c.testHint}</p> : null}
        </>
      )}

      <div className="mt-6 border-t border-border pt-5">
        <p className="text-sm font-medium">{c.others}</p>
        {others.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{c.none}</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {others.map((device) => (
              <li key={device.id} className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm">{device.userAgent ?? 'Dispozitiv'}</p>
                  <p className="text-xs text-muted">
                    {c.lastSeen(formatDateRo(device.lastSeenAt))}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const result = await removeSubscriptionAction(device.endpoint);
                      setError(result.error ?? null);
                    })
                  }
                  className="text-small text-muted underline underline-offset-4 hover:text-foreground"
                >
                  {c.remove}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
