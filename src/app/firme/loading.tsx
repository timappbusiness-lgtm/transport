import { BoardSkeleton } from '@/components/ui/skeleton';
import { loadingCopy } from '@/content/loading';

export default function Loading() {
  return <BoardSkeleton label={loadingCopy.companies} cards={3} />;
}
