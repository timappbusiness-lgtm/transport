/**
 * The mark: a car standing on the deck of a car carrier, whose rear end
 * drops into the loading ramp.
 *
 * Two shapes on a 24-unit grid: the car, filled — a body and a cabin, no
 * wheels, because it is standing on something — and the deck, a stroke
 * that runs under it and bends down at the back. It carries no letter, so
 * it survives a change of name untouched.
 *
 * Chosen over the earlier two-stroke „ramp and decks" mark because it
 * stays legible at 16px: a filled silhouette survives the pixel grid,
 * a thin diagonal turns into a staircase of half-tones. Both are drawn
 * side by side in `docs/21-sigla.md`.
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
  /** The car, a filled shape: the part that carries the accent. */
  car: 'M3.5 13.5 V10 Q3.5 8 5.5 8 H7.5 L10.5 4 H16 L19 8 H19.5 Q21.5 8 21.5 10 V13.5 Z',
  /** The deck and its ramp, a stroke, in ink. */
  deck: 'M2 20 L5 17 H22',
} as const;

/** The sizes the mark is drawn at in the interface, in CSS pixels. */
export const MARK_SIZES = [16, 24, 32, 48] as const;
export type MarkSize = (typeof MARK_SIZES)[number];

/**
 * Stroke width of the deck in grid units, per rendered size.
 *
 * Heavier when small: at 16px a 2.25-unit stroke is 1.5px and fades into
 * the car above it; at 3 units it is 2px with ground between the two.
 * At 48px the same 3 units would look swollen.
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
