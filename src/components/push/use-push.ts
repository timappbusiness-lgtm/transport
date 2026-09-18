'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  describeSubscription,
  supportFor,
  urlBase64ToUint8Array,
  type PushSupport,
} from '@/lib/push';
import {
  removeSubscriptionAction,
  saveSubscriptionAction,
} from '@/app/cont/setari/notificari/actions';

/**
 * Talking to the browser's push machinery.
 *
 * Everything that can be decided without a browser lives in
 * `src/lib/push.ts` and is tested there; this is the part that has to
 * touch `navigator`, and it is deliberately thin.
 *
 * The state starts as `unknown` rather than as a guess. A component that
 * assumes "not subscribed" until it knows renders an "activează" button to
 * somebody who already did, which is the kind of flicker that makes
 * people press things twice.
 */

export interface PushState {
  support: PushSupport | 'unknown';
  permission: NotificationPermission | 'unknown';
  subscribed: boolean;
  busy: boolean;
  error: string | null;
}

const VAPID_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null;

export function usePush(): PushState & {
  subscribe: () => Promise<boolean>;
  unsubscribe: () => Promise<void>;
} {
  const [state, setState] = useState<PushState>({
    support: 'unknown',
    permission: 'unknown',
    subscribed: false,
    busy: false,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;

    async function read() {
      const support = supportFor({
        hasServiceWorker: 'serviceWorker' in navigator,
        hasPushManager: 'PushManager' in window,
        hasNotification: 'Notification' in window,
        userAgent: navigator.userAgent,
        isStandalone:
          window.matchMedia('(display-mode: standalone)').matches ||
          // Safari's own flag, which predates the media query and is the
          // only signal on older iOS.
          (window.navigator as { standalone?: boolean }).standalone === true,
        vapidKey: VAPID_KEY,
      });

      let subscribed = false;
      if (support === 'ready' && 'serviceWorker' in navigator) {
        try {
          const registration = await navigator.serviceWorker.ready;
          subscribed = (await registration.pushManager.getSubscription()) !== null;
        } catch {
          subscribed = false;
        }
      }

      if (cancelled) return;
      setState((current) => ({
        ...current,
        support,
        permission: 'Notification' in window ? Notification.permission : 'unknown',
        subscribed,
      }));
    }

    void read();
    return () => {
      cancelled = true;
    };
  }, []);

  const subscribe = useCallback(async (): Promise<boolean> => {
    if (VAPID_KEY === null) return false;
    setState((current) => ({ ...current, busy: true, error: null }));

    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState((current) => ({ ...current, busy: false, permission }));
        return false;
      }

      const registration = await navigator.serviceWorker.register('/sw.js');
      await navigator.serviceWorker.ready;

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_KEY) as BufferSource,
      });

      const described = describeSubscription(subscription.toJSON(), navigator.userAgent);
      if (!described) {
        setState((current) => ({
          ...current,
          busy: false,
          error: 'Browserul nu a dat cheile necesare.',
        }));
        return false;
      }

      const result = await saveSubscriptionAction(described);
      setState((current) => ({
        ...current,
        busy: false,
        permission,
        subscribed: result.error === undefined,
        error: result.error ?? null,
      }));
      return result.error === undefined;
    } catch (error) {
      setState((current) => ({
        ...current,
        busy: false,
        error: error instanceof Error ? error.message : 'Nu s-a putut activa.',
      }));
      return false;
    }
  }, []);

  const unsubscribe = useCallback(async () => {
    setState((current) => ({ ...current, busy: true, error: null }));
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        // The row goes first: a browser unsubscribed with a row left
        // behind is a row the sender keeps trying, and the settings screen
        // would still say this device is on.
        await removeSubscriptionAction(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setState((current) => ({ ...current, busy: false, subscribed: false }));
    } catch {
      setState((current) => ({ ...current, busy: false, subscribed: false }));
    }
  }, []);

  return { ...state, subscribe, unsubscribe };
}
