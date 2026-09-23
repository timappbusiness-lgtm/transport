/**
 * Validation for the `next` parameter used after sign-in.
 *
 * An unvalidated `next` is an open redirect: an attacker sends
 * `/autentificare?next=https://evil.example`, the victim signs in for real,
 * and lands on a page that looks like a continuation of the flow. Only
 * same-origin paths are ever followed.
 *
 * The checks run against the value a browser would actually navigate to,
 * which is why tabs, newlines and carriage returns are stripped first:
 * browsers remove them from URLs, so a tab-separated path would otherwise
 * slip through as a protocol-relative URL.
 */

export const DEFAULT_NEXT = '/cont';

/** Characters a browser silently drops from a URL before navigating. */
const STRIPPED = /[\t\n\r]/g;

/**
 * True when the value carries a C0 control character or DEL.
 *
 * Written as a code-point check rather than a character class on purpose: a
 * class containing literal control bytes is unreadable in a diff, and one of
 * them is NUL, which some tooling truncates on.
 */
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function decodeOnce(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // Malformed percent-encoding: judge the raw value instead.
    return value;
  }
}

function looksExternal(value: string): boolean {
  return (
    value.startsWith('//') ||
    value.startsWith('/\\') ||
    value.startsWith('\\') ||
    // any scheme: http:, https:, javascript:, data:, mailto: and the rest
    /^[a-z][a-z0-9+.-]*:/i.test(value)
  );
}

/**
 * Returns a safe internal path, or `fallback` when the input cannot be
 * trusted. Never throws.
 */
export function safeNextPath(
  raw: string | null | undefined,
  fallback: string = DEFAULT_NEXT,
): string {
  if (typeof raw !== 'string') return fallback;

  const stripped = raw.replace(STRIPPED, '');
  if (stripped === '') return fallback;

  // Reject rather than sanitise: a path carrying control characters is not
  // something a legitimate link produced.
  if (hasControlCharacter(stripped)) return fallback;

  if (!stripped.startsWith('/')) return fallback;
  if (looksExternal(stripped)) return fallback;

  // Judge the decoded form too. An encoded protocol-relative URL is
  // same-origin as written, but any layer that decodes before redirecting
  // turns it external, so it never gets through here.
  const decoded = decodeOnce(stripped).replace(STRIPPED, '');
  if (!decoded.startsWith('/') || looksExternal(decoded)) return fallback;

  return stripped;
}

/**
 * Builds the sign-in URL for a protected page, carrying the path the user
 * was trying to reach. `next` is only added when it is worth returning to.
 */
export function signInUrlFor(pathname: string, search?: string): string {
  const target = `${pathname}${search ?? ''}`;
  const safe = safeNextPath(target, '');
  if (safe === '' || safe === DEFAULT_NEXT) return '/autentificare';
  return `/autentificare?next=${encodeURIComponent(safe)}`;
}

/**
 * A link to an authentication page that carries the place to come back to.
 *
 * Every page on the way — sign-in, the switch to sign-up, the confirmation
 * screen, the password reset and the page that sets the new password —
 * passes `next` along, so a person who started signing in from step four
 * of a form lands on step four, whichever way they went. A `next` that is
 * not a safe internal path, or is the default anyway, is left off.
 */
export function withNext(path: string, next: string | null | undefined): string {
  const safe = safeNextPath(next, '');
  if (safe === '' || safe === DEFAULT_NEXT) return path;
  const separator = path.includes('?') ? '&' : '?';
  return `${path}${separator}next=${encodeURIComponent(safe)}`;
}
