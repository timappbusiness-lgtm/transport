import { BoardSkeleton } from '@/components/ui/skeleton';
import { departuresCopy } from '@/content/departures';
import { loadingCopy } from '@/content/loading';

/**
 * While the board's routes are on the way: the board's own heading and
 * shape, the rows empty.
 *
 * In its route group so it covers this page and nothing under it: the
 * route page below calls `notFound()`, and under a loading boundary a
 * 404 would answer 200. See `src/components/ui/skeleton.tsx`.
 */
export default function Loading() {
  return (
    <BoardSkeleton
      label={loadingCopy.routes}
      title={departuresCopy.board.title}
      lede={departuresCopy.board.lede}
    />
  );
}
