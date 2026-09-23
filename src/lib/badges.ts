/**
 * When a badge appears, and what it says. Free of React.
 *
 * Every rule here answers the same question — is there something real to
 * show — and the answer „no" means the badge is not rendered at all. A
 * „0" beside „Mesaje" is furniture; a „Nou" on a request from last week
 * is a lie; an „acum 2 zile" on a route nobody dated is invented. The
 * component draws; this decides.
 */

/** A day. „Nou" means published inside the last one of these. */
export const NEW_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * How far in the future a publication date may be and still count.
 *
 * The server and a phone disagree about the time by a few seconds, and
 * sometimes by a few minutes. A row published „in two minutes" is a row
 * published now by a clock that runs fast; a row published tomorrow is a
 * bad row, and it gets no badge.
 */
const CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * „Nou": published within the last 24 hours.
 *
 * Nothing for a missing date, an unparseable one, or one further in the
 * future than clock skew explains. `published_at` is nullable on the
 * routes view, and a route with no date is not new — it is undated.
 */
export function isNew(publishedAt: string | null | undefined, now: Date): boolean {
  if (publishedAt === null || publishedAt === undefined || publishedAt === '') return false;
  const then = new Date(publishedAt).getTime();
  if (Number.isNaN(then)) return false;
  const age = now.getTime() - then;
  return age >= -CLOCK_SKEW_MS && age < NEW_WINDOW_MS;
}

/**
 * The text of a count, or null when there is nothing to count.
 *
 * Null for zero, a negative, a fraction's floor of zero, NaN and
 * Infinity: a count that is not a positive whole number is not shown.
 * Past nine it is „9+" — a three-digit badge pushes the label out of a
 * 240px menu, and „27 mesaje necitite" and „9+" ask the same thing of
 * the person reading it.
 */
export function countLabel(count: number | null | undefined): string | null {
  if (count === null || count === undefined || !Number.isFinite(count)) return null;
  const whole = Math.floor(count);
  if (whole <= 0) return null;
  return whole > 9 ? '9+' : String(whole);
}

/**
 * The documents still waiting on the firm: blocking, and missing,
 * rejected or expired.
 *
 * `in_review` is not one of them — it waits on us, not on them — and an
 * optional document is never a to-do. The rows are the ones the
 * documents page reads, from `v_company_missing_documents`.
 */
export function pendingDocumentCount(
  rows: readonly { is_blocking: boolean | null; state: string | null }[],
): number {
  return rows.filter(
    (row) =>
      row.is_blocking === true &&
      (row.state === 'missing' || row.state === 'rejected' || row.state === 'expired'),
  ).length;
}
