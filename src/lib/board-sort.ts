import type { BoardSort } from './board-simplicity';
import type { PublicRequest } from './requests';

/**
 * The three orders a board offers.
 *
 * Applied in the application rather than in the query, for the same
 * reason „potrivite cu firma mea" is: the board view returns one page of
 * rows and both boards already re-rank what they were given. Sorting
 * here keeps the two boards agreeing about what „cele mai noi" means.
 *
 * Every comparison falls back to the publication date, so a list never
 * reorders itself between two renders because two rows tied.
 */

function byNewest(a: { published_at: string }, b: { published_at: string }): number {
  return b.published_at.localeCompare(a.published_at);
}

export function sortRequests(rows: readonly PublicRequest[], sort: BoardSort): PublicRequest[] {
  const out = [...rows];
  if (sort === 'incarcare') {
    // Soonest loading first. `loading_from` is `date not null` on
    // `listings`, so there is no missing-date case to defend against —
    // a fallback here would be a branch nothing can reach.
    out.sort((a, b) =>
      a.loading_from === b.loading_from
        ? byNewest(a, b)
        : a.loading_from.localeCompare(b.loading_from),
    );
    return out;
  }
  if (sort === 'distanta') {
    out.sort((a, b) => {
      const av = a.estimated_km ?? -1;
      const bv = b.estimated_km ?? -1;
      return av === bv ? byNewest(a, b) : bv - av;
    });
    return out;
  }
  out.sort(byNewest);
  return out;
}

/**
 * The routes board's three.
 *
 * „Încărcare apropiată" reads `available_from`, the day the platform
 * leaves. The third is free seats rather than distance, because a
 * departure has no estimated distance to sort by — see the note on
 * `DEPARTURE_SORTS`.
 *
 * `published_at` is nullable on this view, so the tiebreak treats a
 * missing date as the oldest rather than throwing the row to the top.
 */
export interface SortableDeparture {
  published_at: string | null;
  available_from: string;
  slots_free: number;
}

function byNewestDeparture(a: SortableDeparture, b: SortableDeparture): number {
  return (b.published_at ?? '').localeCompare(a.published_at ?? '');
}

export function sortDepartures<T extends SortableDeparture>(
  rows: readonly T[],
  sort: BoardSort,
): T[] {
  const out = [...rows];
  if (sort === 'incarcare') {
    out.sort((a, b) =>
      a.available_from === b.available_from
        ? byNewestDeparture(a, b)
        : a.available_from.localeCompare(b.available_from),
    );
    return out;
  }
  if (sort === 'locuri') {
    out.sort((a, b) =>
      a.slots_free === b.slots_free ? byNewestDeparture(a, b) : b.slots_free - a.slots_free,
    );
    return out;
  }
  out.sort(byNewestDeparture);
  return out;
}
