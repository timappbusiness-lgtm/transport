import { BRAND_NAME, BRAND_TAGLINE_RO } from './brand';

/**
 * Where the files `pnpm brand` writes are served from.
 *
 * The files themselves are generated from the name and the mark; these are
 * only their addresses and sizes, kept next to each other so a page that
 * sets its own Open Graph values can hand back the same picture instead of
 * losing it (Next replaces `openGraph` as a whole, it does not merge it).
 */
export const OG_IMAGE = {
  url: '/brand/og.png',
  width: 1200,
  height: 630,
  alt: `${BRAND_NAME} — ${BRAND_TAGLINE_RO}`,
} as const;

/** The mark for the e-mail header, 96px drawn at 32. */
export const EMAIL_MARK_PATH = '/brand/mark-email.png';
