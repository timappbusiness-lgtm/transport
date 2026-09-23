import { DashboardSkeleton } from '@/components/ui/skeleton';
import { loadingCopy } from '@/content/loading';

/** Inside the account layout: the menu stays, the page fills in. */
export default function Loading() {
  return <DashboardSkeleton label={loadingCopy.account} />;
}
