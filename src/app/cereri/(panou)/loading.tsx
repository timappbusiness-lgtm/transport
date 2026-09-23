import { BoardSkeleton } from '@/components/ui/skeleton';
import { requestsCopy } from '@/content/cereri';
import { loadingCopy } from '@/content/loading';

/**
 * While the board's rows are on the way: the board's own heading and
 * shape, the rows empty.
 *
 * In its route group so it covers this page and nothing under it: the
 * request page below calls `notFound()`, and under a loading boundary a
 * 404 would answer 200. See `src/components/ui/skeleton.tsx`.
 */
export default function Loading() {
  return (
    <BoardSkeleton
      label={loadingCopy.requests}
      title={requestsCopy.board.title}
      lede={requestsCopy.board.lede}
    />
  );
}
