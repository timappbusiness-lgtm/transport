import { DetailSkeleton } from '@/components/ui/skeleton';
import { loadingCopy } from '@/content/loading';

export default function Loading() {
  return <DetailSkeleton label={loadingCopy.request} />;
}
