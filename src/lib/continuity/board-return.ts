/**
 * The way back to a board, filters and page included.
 *
 * A board's filters are in its address, so the browser's own back button
 * already returns to them. The „← Înapoi la cereri" link on a detail page
 * did not: it pointed at the bare board, and every carrier who opened a
 * request from a filtered list and pressed it was back at the unfiltered
 * one, choosing the same five filters again. The board now remembers its
 * last query for this tab, and the link goes there.
 *
 * `sessionStorage`: one tab's browsing, gone with the tab. Only a query
 * string of the board itself is ever kept or followed.
 */

import type { DraftStorage } from './drafts';

const PREFIX = 'app.panou.';

/** The query as the board wrote it, or '' — never anything that is not a query. */
export function cleanBoardQuery(raw: string | null | undefined): string {
  if (typeof raw !== 'string' || raw === '' || raw === '?') return '';
  const query = raw.startsWith('?') ? raw : `?${raw}`;
  if (query.length > 1500 || /[\s#]/.test(query)) return '';
  // Parsed and written back, so what is followed is only ever key=value pairs.
  const params = new URLSearchParams(query.slice(1));
  const clean = params.toString();
  return clean === '' ? '' : `?${clean}`;
}

export function rememberBoard(storage: DraftStorage | null, board: string, search: string): void {
  try {
    const query = cleanBoardQuery(search);
    if (query === '') storage?.removeItem(PREFIX + board);
    else storage?.setItem(PREFIX + board, query);
  } catch {
    /* no storage: the link goes to the plain board, as it used to */
  }
}

export function boardHref(storage: DraftStorage | null, board: string): string {
  try {
    return `${board}${cleanBoardQuery(storage?.getItem(PREFIX + board))}`;
  } catch {
    return board;
  }
}
