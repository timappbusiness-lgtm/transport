/**
 * Items shared out into independent columns, first column first.
 *
 * A CSS grid puts neighbours in the same row, and a row is as tall as its
 * tallest cell: open one accordion and the card beside it stretched to
 * match, empty (the billing FAQ on /abonamente). Even aligned to the start,
 * everything below the open item moved down in both columns. Columns that
 * are stacks of their own do not share rows, so an item that grows moves
 * only what is under it, in its own column.
 *
 * The order reads down the first column, then down the second — the same
 * order as the single column a phone shows, so nothing is reordered when
 * the width changes.
 */
export function splitColumns<T>(items: readonly T[], columns: number): T[][] {
  const count = Number.isFinite(columns) ? Math.max(1, Math.floor(columns)) : 1;
  const size = Math.ceil(items.length / count);
  const out: T[][] = [];
  for (let index = 0; index < count; index += 1) {
    const slice = items.slice(index * size, (index + 1) * size);
    if (slice.length > 0 || index === 0) out.push(slice);
  }
  return out;
}
