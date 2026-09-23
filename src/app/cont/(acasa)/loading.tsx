import { DashboardSkeleton } from '@/components/ui/skeleton';
import { loadingCopy } from '@/content/loading';

/**
 * Inside the account layout: the menu stays, the page fills in.
 *
 * In its route group so it covers this page and nothing under it: the
 * pages below call `notFound()`, and under a loading boundary a 404
 * would answer 200. See `src/components/ui/skeleton.tsx`.
 */
export default function Loading() {
  return <DashboardSkeleton label={loadingCopy.account} />;
}
