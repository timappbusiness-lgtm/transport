import type { Metadata } from 'next';
import Link from 'next/link';
import { TopBar } from '@/components/app/top-bar';
import { MyRequestCard } from '@/components/requests/my-request-card';
import { buttonClasses } from '@/components/ui/button';
import { ROUTES } from '@/config/routes';
import { requestsCopy } from '@/content/cereri';
import { requireAccountContext } from '@/lib/auth/account';
import { FEATURES } from '@/lib/features';
import type { MyRequest } from '@/lib/my-requests';
import { loadMatchingCounts, loadMyRequests } from '@/lib/my-requests-source';
import { loadPendingOfferCounts } from '@/lib/offers-source';
import { isoToday } from '@/lib/request-form';
import { EmptyState } from '@/components/ui/empty-state';

export const metadata: Metadata = { title: requestsCopy.mine.title };

/**
 * The clock and the rows, read outside the component: a component that
 * calls `new Date()` while rendering is impure, and the date this page
 * needs is today's, taken once.
 */
async function load(): Promise<{
  requests: MyRequest[];
  today: string;
  counts: Map<string, number>;
  offers: Map<string, number> | null;
}> {
  const context = await requireAccountContext(ROUTES.accountRequests);
  const requests = await loadMyRequests(context);
  const ids = requests.map((request) => request.id);
  const [counts, offers] = await Promise.all([
    loadMatchingCounts(requests),
    FEATURES.offers ? loadPendingOfferCounts(ids) : Promise.resolve(null),
  ]);
  return { requests, today: isoToday(new Date()), counts, offers };
}

export default async function Page() {
  const { requests, today, counts, offers } = await load();
  const c = requestsCopy.mine;

  return (
    <div className="flex flex-col gap-8">
      <TopBar
        title={c.title}
        actions={[{ href: ROUTES.newRequest, label: c.publish }]}
      />

      {requests.length === 0 ? (
        // The bar above already carries „Publică" as the primary action;
        // the way out here is the same link, quieter.
        <EmptyState
          title={c.empty}
          body={c.emptyBody}
          action={
            <Link href={ROUTES.newRequest} className={buttonClasses('secondary', 'md')}>
              {c.publish}
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {requests.map((request) => (
            <MyRequestCard
              key={request.id}
              request={request}
              today={today}
              carrierCount={counts.get(request.id) ?? null}
              offerCount={offers === null ? null : (offers.get(request.id) ?? 0)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
