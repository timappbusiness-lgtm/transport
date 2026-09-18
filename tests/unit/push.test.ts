import { describe, expect, it } from 'vitest';
import { createDismissalStore } from '@/lib/dismissal-store';
import {
  DISMISS_DAYS,
  describeSubscription,
  isDismissed,
  isIosSafari,
  platformOf,
  shortUserAgent,
  shouldPrompt,
  supportFor,
  urlBase64ToUint8Array,
  type BrowserFacts,
  type PromptInput,
} from '@/lib/push';

/**
 * When to ask, and — the half that actually matters — when not to.
 *
 * A permission prompt shown at the wrong moment is refused, and a refusal
 * is permanent until somebody digs into browser settings. One badly-timed
 * prompt costs the channel forever, which is why there is no branch below
 * that asks on page load.
 */

const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36';
const SAFARI_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const CHROME_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120 Mobile/15E148 Safari/604.1';

function facts(over: Partial<BrowserFacts> = {}): BrowserFacts {
  return {
    hasServiceWorker: true,
    hasPushManager: true,
    hasNotification: true,
    userAgent: CHROME_ANDROID,
    isStandalone: false,
    vapidKey: 'BExampleKey',
    ...over,
  };
}

describe('what this browser can do', () => {
  it('is ready on Android Chrome', () => {
    expect(supportFor(facts())).toBe('ready');
  });

  it('tells iOS Safari to install first, rather than "unsupported"', () => {
    // iOS reports no PushManager until the site is on the home screen, so
    // the capability test alone would say "unsupported" to somebody one
    // gesture away from it working.
    expect(
      supportFor(facts({ userAgent: SAFARI_IOS, hasPushManager: false })),
    ).toBe('needs-install');
  });

  it('is ready on iOS once it is installed', () => {
    expect(supportFor(facts({ userAgent: SAFARI_IOS, isStandalone: true }))).toBe('ready');
  });

  it('does not tell Chrome on iOS to install, because that would not help', () => {
    // It is WebKit underneath and reports iOS, but it cannot register a
    // service worker for push at all.
    expect(
      supportFor(facts({ userAgent: CHROME_IOS, hasPushManager: false })),
    ).toBe('unsupported');
  });

  it('says so when the site has no VAPID key', () => {
    expect(supportFor(facts({ vapidKey: null }))).toBe('not-configured');
    expect(supportFor(facts({ vapidKey: '  ' }))).toBe('not-configured');
  });

  it('says unsupported when a piece is genuinely missing', () => {
    expect(supportFor(facts({ hasServiceWorker: false }))).toBe('unsupported');
    expect(supportFor(facts({ hasNotification: false }))).toBe('unsupported');
  });
});

describe('telling iOS Safari apart', () => {
  it('recognises it', () => {
    expect(isIosSafari(SAFARI_IOS)).toBe(true);
  });

  it('does not mistake the WebKit skins for it', () => {
    expect(isIosSafari(CHROME_IOS)).toBe(false);
  });

  it('leaves Android alone', () => {
    expect(isIosSafari(CHROME_ANDROID)).toBe(false);
  });
});

describe('when the card appears', () => {
  function input(over: Partial<PromptInput> = {}): PromptInput {
    return {
      support: 'ready',
      permission: 'default',
      subscribed: false,
      afterMeaningfulAction: true,
      dismissedAt: null,
      now: new Date('2026-09-18T10:00:00Z'),
      ...over,
    };
  }

  it('never on first load, whatever else is true', () => {
    // The single most important line in this file.
    expect(shouldPrompt(input({ afterMeaningfulAction: false }))).toBe(false);
  });

  it('after something that makes notifications obviously useful', () => {
    expect(shouldPrompt(input())).toBe(true);
  });

  it('not to somebody already subscribed', () => {
    expect(shouldPrompt(input({ subscribed: true }))).toBe(false);
  });

  it('never again once the browser itself refused', () => {
    // Asking again does nothing at all: the prompt never appears twice.
    expect(shouldPrompt(input({ permission: 'denied' }))).toBe(false);
  });

  it('not when permission is already granted and everything works', () => {
    expect(shouldPrompt(input({ permission: 'granted' }))).toBe(false);
  });

  it('still on iOS, because there the card is the install instructions', () => {
    expect(shouldPrompt(input({ support: 'needs-install', permission: 'default' }))).toBe(true);
  });

  it('not on a browser that cannot do it', () => {
    expect(shouldPrompt(input({ support: 'unsupported' }))).toBe(false);
    expect(shouldPrompt(input({ support: 'not-configured' }))).toBe(false);
  });

  it('respects a dismissal for thirty days, then asks once more', () => {
    const now = new Date('2026-09-18T10:00:00Z');
    const recent = new Date(now.getTime() - 10 * 86_400_000).toISOString();
    const old = new Date(now.getTime() - (DISMISS_DAYS + 1) * 86_400_000).toISOString();

    expect(shouldPrompt(input({ dismissedAt: recent, now }))).toBe(false);
    expect(shouldPrompt(input({ dismissedAt: old, now }))).toBe(true);
  });

  it('treats a corrupt dismissal timestamp as no dismissal', () => {
    // It comes from localStorage, which is to say from anything at all.
    expect(isDismissed('not a date', new Date())).toBe(false);
    expect(isDismissed(null, new Date())).toBe(false);
  });
});

describe('what the server is told about a device', () => {
  it('keeps the endpoint and both keys', () => {
    const described = describeSubscription(
      {
        endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
        keys: { p256dh: 'pk', auth: 'au' },
      },
      CHROME_ANDROID,
    );
    expect(described?.endpoint).toBe('https://fcm.googleapis.com/fcm/send/abc');
    expect(described?.p256dh).toBe('pk');
    expect(described?.auth).toBe('au');
  });

  it('refuses a subscription missing a key rather than storing half of one', () => {
    expect(
      describeSubscription({ endpoint: 'https://x/y', keys: { p256dh: 'pk' } }, CHROME_ANDROID),
    ).toBeNull();
    expect(describeSubscription({ keys: { p256dh: 'p', auth: 'a' } }, CHROME_ANDROID)).toBeNull();
  });

  it('stores something a person recognises, not a fingerprint', () => {
    expect(shortUserAgent(CHROME_ANDROID)).toBe('Chrome pe Android');
    expect(shortUserAgent(SAFARI_IOS)).toBe('Safari pe iPhone');
    // The full string is a fingerprint; the label is for the settings list.
    expect(shortUserAgent(CHROME_ANDROID).length).toBeLessThan(40);
  });

  it('names the platforms this market uses', () => {
    expect(platformOf(SAFARI_IOS)).toBe('iPhone');
    expect(platformOf(CHROME_ANDROID)).toBe('Android');
    expect(platformOf('Mozilla/5.0 (Windows NT 10.0)')).toBe('Windows');
    expect(platformOf('something else entirely')).toBe('necunoscut');
  });
});

describe('the VAPID key the browser is given', () => {
  it('decodes base64url without padding', () => {
    const bytes = urlBase64ToUint8Array('AQAB');
    expect([...bytes]).toEqual([1, 0, 1]);
  });

  it('decodes the - and _ substitutions', () => {
    expect([...urlBase64ToUint8Array('-_8')]).toEqual([251, 255]);
  });
});

describe('remembering a refusal', () => {
  function fakeStorage(initial: Record<string, string> = {}) {
    const data = { ...initial };
    return {
      getItem: (key: string) => data[key] ?? null,
      setItem: (key: string, value: string) => {
        data[key] = value;
      },
      read: () => data,
    };
  }

  it('reads what is there', () => {
    const store = createDismissalStore('k', fakeStorage({ k: '2026-09-01T00:00:00.000Z' }));
    expect(store.getSnapshot()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('returns the same reference until something changes', () => {
    // `getSnapshot` runs on every render; a new value each time is an
    // infinite re-render, which is the whole reason this is a store.
    const store = createDismissalStore('k', fakeStorage());
    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });

  it('says "never dismissed" on the server', () => {
    // The safe direction: the first client render may hide a card the
    // server showed, where the reverse flashes one at somebody who
    // dismissed it a week ago.
    const store = createDismissalStore('k', fakeStorage({ k: '2026-09-01T00:00:00.000Z' }));
    expect(store.getServerSnapshot()).toBeNull();
  });

  it('writes the dismissal and tells its listeners', () => {
    const storage = fakeStorage();
    const store = createDismissalStore('k', storage);
    let calls = 0;
    store.subscribe(() => {
      calls += 1;
    });

    store.dismiss(new Date('2026-09-18T10:00:00Z'));
    expect(storage.read().k).toBe('2026-09-18T10:00:00.000Z');
    expect(store.getSnapshot()).toBe('2026-09-18T10:00:00.000Z');
    expect(calls).toBe(1);
  });

  it('survives storage that throws, which is a private window', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const store = createDismissalStore('k', throwing);
    expect(store.getSnapshot()).toBeNull();
    // A dismissal that cannot be stored costs one extra card, which beats
    // a component that will not render.
    expect(() => store.dismiss()).not.toThrow();
  });

  it('survives having no storage at all', () => {
    const store = createDismissalStore('k', null);
    expect(store.getSnapshot()).toBeNull();
    expect(() => store.dismiss()).not.toThrow();
  });
});
