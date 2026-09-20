import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertRow } from '@/components/account/alert-row';
import { buttonClasses } from '@/components/ui/button';
import { EyebrowPill, StatusBadge } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { alertsCopy } from '@/content/alerte';
import { requireAccountContext } from '@/lib/auth/account';
import { quotaMessage, quotaReached } from '@/lib/saved-searches';
import { loadAlerts, loadMatches } from '@/lib/saved-searches-source';

export const metadata: Metadata = { title: alertsCopy.meta.title };

/** The list is the session's, so it is never prerendered. */
export const dynamic = 'force-dynamic';

const c = alertsCopy;

/**
 * „Alertele mele".
 *
 * `saved_searches` has held rows since phase 0 with no screen at all, so
 * a carrier could save nothing and see nothing. What makes this worth
 * opening rather than a list of names is the reasons: each match says
 * why it was chosen, which is the thing that makes the next e-mail
 * trustworthy.
 */
export default async function Page() {
  const context = await requireAccountContext(ROUTES.accountAlerts);
  const { searches, activity, quota, error } = await loadAlerts(context.user.id);

  // The matches of every search, fetched together: a list of five
  // searches would otherwise be five round trips opened one at a time.
  const matches = new Map(
    await Promise.all(
      searches.map(async (search) => [search.id, await loadMatches(search.id)] as const),
    ),
  );

  const full = quotaReached(quota);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <EyebrowPill>{c.hero.eyebrow}</EyebrowPill>
        <h1 className="mt-2 text-[clamp(1.5rem,4vw,2rem)]">{c.hero.title}</h1>
        <p className="mt-2 max-w-[62ch] text-sm text-muted">{c.hero.lede}</p>
      </div>

      {error !== null ? (
        <p role="alert" className="rounded-card border border-danger/45 bg-danger/8 p-4 text-sm">
          Nu se pot citi alertele acum.
        </p>
      ) : null}

      {full ? (
        <div className="rounded-card border border-warning/45 bg-warning/8 p-4">
          <p>
            <StatusBadge tone="warning">{c.quota.title}</StatusBadge>
          </p>
          <p className="mt-2 text-sm">{quotaMessage(quota)}</p>
          <p className="mt-2 text-sm">
            <Link href={ROUTES.plans} className="underline underline-offset-4">
              {c.quota.action}
            </Link>{' '}
            <span className="text-muted">{c.quota.hint}</span>
          </p>
        </div>
      ) : null}

      {searches.length === 0 ? (
        <div className="rounded-card border border-dashed border-border-strong bg-surface p-6 sm:p-8">
          <h2 className="text-[1.0625rem]">{c.empty.title}</h2>
          <p className="mt-2 max-w-[54ch] text-sm text-muted">{c.empty.body}</p>
          <p className="mt-5">
            <Link href={ROUTES.requests} className={buttonClasses('primary', 'md')}>
              {c.empty.action}
            </Link>
          </p>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-4">
            {searches.map((search) => (
              <AlertRow
                key={search.id}
                search={search}
                activity={activity.get(search.id)}
                matches={matches.get(search.id) ?? []}
              />
            ))}
          </ul>

          <p className="text-sm text-muted">
            Vrei încă una?{' '}
            <Link href={ROUTES.requests} className="underline underline-offset-4">
              Filtrează pe panou
            </Link>{' '}
            și apasă „Salvează căutarea”.
          </p>
        </>
      )}
    </div>
  );
}
