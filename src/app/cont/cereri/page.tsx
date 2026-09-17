import type { Metadata } from 'next';
import Link from 'next/link';
import { TopBar } from '@/components/app/top-bar';
import { MyRequestCard } from '@/components/requests/my-request-card';
import { buttonClasses } from '@/components/ui/button';
import { Card } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { requestsCopy } from '@/content/cereri';
import { requireAccountContext } from '@/lib/auth/account';
import type { MyRequest } from '@/lib/my-requests';
import { loadMyRequests } from '@/lib/my-requests-source';
import { isoToday } from '@/lib/request-form';

export const metadata: Metadata = { title: requestsCopy.mine.title };

/**
 * The clock and the rows, read outside the component: a component that
 * calls `new Date()` while rendering is impure, and the date this page
 * needs is today's, taken once.
 */
async function load(): Promise<{ requests: MyRequest[]; today: string }> {
  const context = await requireAccountContext(ROUTES.accountRequests);
  return { requests: await loadMyRequests(context), today: isoToday(new Date()) };
}

export default async function Page() {
  const { requests, today } = await load();
  const c = requestsCopy.mine;

  return (
    <div className="flex flex-col gap-8">
      <TopBar
        title={c.title}
        actions={[{ href: ROUTES.newRequest, label: c.publish }]}
      />

      {requests.length === 0 ? (
        <Card className="p-6">
          <h2 className="text-[1.125rem]">{c.empty}</h2>
          <p className="mt-2 max-w-[54ch] text-sm text-muted">{c.emptyBody}</p>
          <Link href={ROUTES.newRequest} className={`${buttonClasses('primary', 'md')} mt-5`}>
            {c.publish}
          </Link>
        </Card>
      ) : (
        <ul className="flex flex-col gap-4">
          {requests.map((request) => (
            <MyRequestCard key={request.id} request={request} today={today} />
          ))}
        </ul>
      )}
    </div>
  );
}
