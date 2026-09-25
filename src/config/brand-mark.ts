/**
 * The mark: the two decks of a car carrier and the ramp between them.
 *
 * Two strokes on a 24-unit grid. The first climbs from the ground, up the
 * ramp, and runs along the upper deck; the second is the lower deck, under
 * it. Read quickly it is also a step up, and two lanes of one corridor.
 * It carries no letter, so it survives a change of name untouched.
 *
 * Pure data with no imports, because four places draw it and not all of
 * them can import a component: `<LogoMark>` in the browser, the icon
 * generator (`pnpm brand`) for the favicon, the app icons and the social
 * image, the e-mail header (as the generated PNG) and the contract PDF
 * (as vector paths, from the copy `pnpm brand` writes into
 * `supabase/functions/_shared/brand.ts`). A test fails when that copy
 * and this file disagree.
 */
export const MARK = {
  /** The side of the square grid the paths are drawn on. */
  grid: 24,
  /** The ramp and the upper deck: the stroke that carries the accent. */
  ramp: 'M3 18 H6.5 L13 6 H21',
  /** The lower deck, in ink. */
  deck: 'M11 18 H21',
} as const;

/** The sizes the mark is drawn at in the interface, in CSS pixels. */
export const MARK_SIZES = [16, 24, 32, 48] as const;
export type MarkSize = (typeof MARK_SIZES)[number];

/**
 * Stroke width in grid units, per rendered size.
 *
 * Heavier when small: at 16px a 2.25-unit stroke is 1.5px and the two
 * lines smear into one; at 3 units they are 2px each with a pixel of
 * ground between them. At 48px the same 3 units would look swollen.
 */
export function markStroke(px: number): number {
  if (px <= 16) return 3;
  if (px <= 24) return 2.75;
  if (px <= 32) return 2.5;
  return 2.25;
}

/**
 * How the mark sits on a tile — the app icons and the favicon.
 *
 * `scale` is the share of the tile the 24-unit grid takes. A maskable icon
 * keeps everything inside the central circle of 80% of its width, which a
 * 60% square fits; the home-screen icon on iOS is cropped to a rounded
 * square by the system, so it is drawn full-bleed at 70%.
 */
export const TILE = {
  radius: 6,
  scale: { favicon: 0.8, icon: 0.75, apple: 0.7, maskable: 0.6 },
} as const;
