/**
 * What is new on the board since a carrier last looked, and how to say it.
 *
 * Free of Supabase and React, so the rule is readable and tested on its
 * own: `src/lib/board-match-source.ts` reads the rows, this decides which
 * of them count.
 */

import { pluralRo } from './requests';

/**
 * The rows published strictly after `since`.
 *
 * Strictly: a request published in the same instant the carrier opened
 * the board was on the board they saw. A missing or unreadable `since`
 * counts nothing — somebody who never opened the board is not told that
 * everything on it is new.
 */
export function newSince<T extends { published_at: string | null }>(
  rows: readonly T[],
  since: string | null,
): T[] {
  if (since === null) return [];
  const from = Date.parse(since);
  if (!Number.isFinite(from)) return [];
  return rows.filter((row) => {
    if (row.published_at === null) return false;
    const at = Date.parse(row.published_at);
    return Number.isFinite(at) && at > from;
  });
}

/** „O cerere nouă de la ultima vizită", „12 cereri noi …", or nothing at zero. */
export function newRequestsLine(count: number): string | null {
  if (!Number.isFinite(count) || count <= 0) return null;
  const n = Math.floor(count);
  // `pluralRo` knows the „de" from twenty on: „20 de cereri noi".
  const text = n === 1 ? 'O cerere nouă' : pluralRo(n, 'cerere nouă', 'cereri noi');
  return `${text} de la ultima vizită`;
}

/** How long a board can stay open and still count as the visit. */
const MAX_OPEN_MS = 24 * 60 * 60 * 1000;

/**
 * The moment to record as „last seen", from the time the board was drawn.
 *
 * Never later than now — a clock from the browser is not trusted to
 * decide what the server has published — and never older than a day: a
 * tab left open over the weekend and then glanced at does not mark
 * Monday's requests as read. Null when the value is not a time at all.
 */
export function seenAt(renderedAt: string, now: Date): string | null {
  const at = Date.parse(renderedAt);
  if (!Number.isFinite(at)) return null;
  const nowMs = now.getTime();
  if (at > nowMs) return now.toISOString();
  if (nowMs - at > MAX_OPEN_MS) return null;
  return new Date(at).toISOString();
}

/** Sent on `window` when the board is on the screen, so the header drops its badge. */
export const BOARD_SEEN_EVENT = 'app:cereri-vazute';
