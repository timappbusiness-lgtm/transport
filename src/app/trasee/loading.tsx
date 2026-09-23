import { BoardSkeleton } from '@/components/ui/skeleton';
import { loadingCopy } from '@/content/loading';

/** While the board's rows are on the way: the board's own shape, empty. */
export default function Loading() {
  return <BoardSkeleton label={loadingCopy.routes} />;
}
