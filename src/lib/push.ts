/**
 * Web push, on the browser's side of the fence.
 *
 * Everything here is pure or a thin wrapper over a browser API, so the
 * decisions — when to ask, when not to ask again, whether this device can
 * do it at all — can be argued about in a test rather than discovered on
 * somebody's telephone.
 *
 * The decision that matters most: **we never ask on first load.** A
 * permission prompt before anybody knows what the site is gets refused,
 * and a refusal is permanent until somebody digs into browser settings.
 * One badly-timed prompt costs the channel forever.
 */

export type PushSupport =
  | 'ready'
  /** iOS Safari can do this, but only once installed to the home screen. */
  | 'needs-install'
  /** No service worker, no PushManager, or no Notification API. */
  | 'unsupported'
  /** The site has no VAPID key configured, so nothing can subscribe. */
  | 'not-configured';

export interface BrowserFacts {
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  userAgent: string;
  /** `display-mode: standalone`, or Safari's own flag. */
  isStandalone: boolean;
  vapidKey: string | null;
}

/**
 * iOS Safari, excluding the Chrome and Firefox skins.
 *
 * Both of those are WebKit underneath and report iOS in the user agent,
 * but neither can register a service worker for push, so telling their
 * users to add the site to the home screen would be advice that does not
 * work.
 */
export function isIosSafari(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  const isIos = /iphone|ipad|ipod/.test(ua) || (/macintosh/.test(ua) && /mobile/.test(ua));
  if (!isIos) return false;
  return !/crios|fxios|edgios|opios/.test(ua);
}

export function supportFor(facts: BrowserFacts): PushSupport {
  if (facts.vapidKey === null || facts.vapidKey.trim() === '') return 'not-configured';

  // Checked before the capability test, because iOS Safari reports no
  // PushManager until the site is installed — and "unsupported" would be
  // the wrong thing to tell somebody one gesture away from it working.
  if (isIosSafari(facts.userAgent) && !facts.isStandalone) return 'needs-install';

  if (!facts.hasServiceWorker || !facts.hasPushManager || !facts.hasNotification) {
    return 'unsupported';
  }
  return 'ready';
}

// ---------------------------------------------------------------------
// When to show the card
// ---------------------------------------------------------------------

export const DISMISS_KEY = 'coridor.push.dismissed';
/** A refusal is respected for this long before the card comes back. */
export const DISMISS_DAYS = 30;

export interface PromptInput {
  support: PushSupport;
  permission: NotificationPermission;
  /** Already subscribed on this browser. */
  subscribed: boolean;
  /** The person has just done something that makes notifications useful. */
  afterMeaningfulAction: boolean;
  /** When the card was last dismissed, ISO, or null. */
  dismissedAt: string | null;
  now: Date;
}

/**
 * Whether to show the explanation card.
 *
 * Note what is missing: there is no branch that shows it on page load.
 * The card appears after the person has done something that makes
 * notifications obviously useful — published a route, opened a matching
 * request, published a request — and never before.
 */
export function shouldPrompt(input: PromptInput): boolean {
  if (input.support === 'not-configured' || input.support === 'unsupported') return false;
  if (input.subscribed) return false;

  // `denied` is the browser's own refusal, and asking again does nothing
  // at all — the prompt never appears a second time.
  if (input.permission === 'denied') return false;
  if (input.permission === 'granted' && input.support === 'ready') return false;

  if (!input.afterMeaningfulAction) return false;

  return !isDismissed(input.dismissedAt, input.now);
}

export function isDismissed(dismissedAt: string | null, now: Date): boolean {
  if (dismissedAt === null) return false;
  const at = new Date(dismissedAt);
  if (Number.isNaN(at.getTime())) return false;
  const days = (now.getTime() - at.getTime()) / 86_400_000;
  return days < DISMISS_DAYS;
}

// ---------------------------------------------------------------------
// Talking to the browser
// ---------------------------------------------------------------------

/** VAPID keys travel as base64url and `applicationServerKey` wants bytes. */
export function urlBase64ToUint8Array(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

export interface SubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string;
  platform: string;
}

/**
 * The parts of a `PushSubscription` the server stores.
 *
 * The user agent is trimmed to something a person recognises on the
 * settings screen rather than the full string, which is a fingerprint.
 */
export function describeSubscription(
  subscription: PushSubscriptionJSON,
  userAgent: string,
): SubscriptionKeys | null {
  const endpoint = subscription.endpoint;
  const p256dh = subscription.keys?.p256dh;
  const auth = subscription.keys?.auth;
  if (!endpoint || !p256dh || !auth) return null;

  return {
    endpoint,
    p256dh,
    auth,
    userAgent: shortUserAgent(userAgent),
    platform: platformOf(userAgent),
  };
}

export function shortUserAgent(userAgent: string): string {
  const browser =
    /edg/i.test(userAgent) ? 'Edge'
    : /opr|opera/i.test(userAgent) ? 'Opera'
    : /chrome|crios/i.test(userAgent) ? 'Chrome'
    : /firefox|fxios/i.test(userAgent) ? 'Firefox'
    : /safari/i.test(userAgent) ? 'Safari'
    : 'Browser';
  return `${browser} pe ${platformOf(userAgent)}`.slice(0, 200);
}

export function platformOf(userAgent: string): string {
  const ua = userAgent.toLowerCase();
  if (/iphone|ipod/.test(ua)) return 'iPhone';
  if (/ipad/.test(ua)) return 'iPad';
  if (/android/.test(ua)) return 'Android';
  if (/windows/.test(ua)) return 'Windows';
  if (/mac os|macintosh/.test(ua)) return 'Mac';
  if (/linux/.test(ua)) return 'Linux';
  return 'necunoscut';
}
