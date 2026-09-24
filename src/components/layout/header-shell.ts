/**
 * The floating bar's two wrappers, as class strings.
 *
 * In their own file, free of the session and the router, so the header's
 * layout test can wrap the real header view in exactly the bar the site
 * draws and measure it at every width with the real stylesheet.
 */

/** Sticky, inset from the edges, and transparent to the pointer. */
export const HEADER_OUTER = 'pointer-events-none sticky top-0 z-40 px-3 pt-3 sm:px-5 sm:pt-4';

/**
 * The pill itself: the dark petrol ground at 88%, blurred. Over a white
 * page — the worst case — white on it is 11.23:1, the pale accent 7.44:1
 * and the bright accent 6.12:1. `tests/unit/accent-dark.test.ts` reads
 * this class and measures it.
 */
export const HEADER_BAR =
  'pointer-events-auto relative mx-auto flex h-14 w-full max-w-[72rem] items-center gap-2 rounded-pill border border-white/15 bg-dark-from/88 px-2.5 text-white shadow-float backdrop-blur-xl sm:gap-3 sm:px-4';

/**
 * The bar's one filled pill — „Publică o cerere", „Publică un traseu" — in
 * the bright accent, because it is the primary action on a dark surface.
 * Dark ink on it is 8.80:1, and the pill against the bar 6.12:1 and ΔE00 55.
 *
 * `whitespace-nowrap` is load-bearing: without it a label wraps to two or
 * three lines on a phone and the pill grows taller than the bar it sits in.
 */
export const PILL_SOLID =
  'inline-flex items-center justify-center whitespace-nowrap rounded-pill bg-accent-bright px-3 py-1.5 text-small font-semibold text-on-accent-bright transition-[background-color,transform] duration-(--duration-quick) hover:bg-accent-bright-hover motion-safe:active:scale-[0.98] sm:px-4';

/** A quiet link or button in the bar: white text, a hover ground. */
export const PILL_QUIET =
  'inline-flex items-center justify-center whitespace-nowrap rounded-pill px-2 py-1.5 text-small text-white/85 transition-[color,background-color] duration-150 hover:bg-white/12 hover:text-white sm:px-3';
