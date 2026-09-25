/**
 * The platform's name, decided on 25 September 2026. It lives in exactly
 * one place: every page, e-mail, icon and document reads it from here, and
 * `tests/unit/brand.test.ts` fails when it is written anywhere else. After
 * changing it, run `pnpm brand`. Not yet checked against registered
 * trademarks (OSIM, EUIPO).
 */
export const BRAND_NAME = 'Transauto Bursa' as const;

/**
 * The name in lowercase ASCII letters and digits, for the places a name
 * has to be a token: a file name, a crawler's name in a robots.txt group.
 * „Rută Nouă" would be „rutanoua"; this one is „transautobursa".
 */
export const BRAND_SLUG = BRAND_NAME.normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]/g, '');

export const BRAND_TAGLINE_RO = 'Transport auto cu firme verificate' as const;

/**
 * Canonical origin. NEXT_PUBLIC_SITE_URL is set for Production on Vercel;
 * preview builds fall back to their own deployment URL, so they never
 * advertise the production domain.
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

/**
 * Where a person writes when something is wrong and they have no account.
 *
 * Null when unset, and the page then points at the contact form instead of
 * building a mailto for an address that may not exist — a dead link in the
 * one place somebody is trying to report fraud is worse than no link.
 */
export const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL ?? null;
