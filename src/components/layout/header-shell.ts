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
