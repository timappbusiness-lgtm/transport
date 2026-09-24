/**
 * The order page's two columns: the order, and the action column.
 *
 * One column below lg, and it is `minmax(0, 1fr)` rather than the grid's
 * implicit `auto`: an auto column is as wide as the longest word in it,
 * and a note with a 60-letter reference number made the whole order page
 * scroll 881px sideways on a phone.
 *
 * Shared with the layout harness (`/proba/ecrane?sectiune=comanda`), so
 * the sweep measures the page's own grid and not a copy of it.
 */
export const ORDER_GRID =
  'grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]';
