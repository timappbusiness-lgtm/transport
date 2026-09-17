/**
 * The brand name is not trademark-checked yet, so it lives in exactly one
 * place. Never hardcode it in a component.
 */
export const BRAND_NAME = 'Coridor' as const;

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
