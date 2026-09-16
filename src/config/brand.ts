/**
 * The brand name is not trademark-checked yet, so it lives in exactly one
 * place. Never hardcode it in a component.
 */
export const BRAND_NAME = 'Coridor' as const;

export const BRAND_TAGLINE_RO = 'Transport auto cu firme verificate' as const;

/** Canonical origin. Vercel sets this per environment. */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
