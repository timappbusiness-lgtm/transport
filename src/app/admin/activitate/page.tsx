import { ThresholdForm } from '@/components/requests/threshold-form';
import { DataRow, EyebrowPill, StatusBadge } from '@/components/ui/primitives';
import { activityAdminCopy } from '@/content/activitate';
import { formatNumber, showFeed, showStats } from '@/lib/requests';
import { loadHomepageActivity } from '@/lib/requests-source';

const c = activityAdminCopy;

/** Staff membership is the session, so nothing here is ever prerendered. */
export const dynamic = 'force-dynamic';

/**
 * Where the homepage's two thresholds are set.
 *
 * Access is the layout's job — `src/app/admin/layout.tsx` gives a non-staff
 * visitor a 404 — and the RPC behind the form refuses them a second time.
 * What this screen adds is the part that is hard to hold in your head: what
 * the numbers are right now, and therefore what a visitor is seeing.
 */
export default async function Page() {
  const { stats, thresholds, requests } = await loadHomepageActivity();
  const statsVisible = showStats(stats, thresholds);
  const feedVisible = showFeed(stats, requests, thresholds);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <EyebrowPill>Staff</EyebrowPill>
        <h1 className="mt-2 text-[clamp(1.5rem,4vw,2rem)]">{c.title}</h1>
        <p className="mt-2 max-w-[62ch] text-sm text-muted">{c.lede}</p>
      </div>

      <section>
        <h2 className="text-[1.0625rem]">{c.state.title}</h2>
        {stats ? (
          <>
            <div className="mt-4 rounded-card border border-border bg-surface px-5 py-2">
              <DataRow label={c.state.publishedTotal} value={formatNumber(stats.publishedTotal)} />
              <DataRow label={c.state.activeTotal} value={formatNumber(stats.activeTotal)} />
              <DataRow label={c.state.week} value={formatNumber(stats.publishedLast7d)} />
              <DataRow label={c.state.km} value={`${formatNumber(stats.totalKm)} km`} />
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <StatusBadge tone={statsVisible ? 'success' : 'neutral'}>
                {statsVisible ? c.state.statsShown : c.state.statsHidden}
              </StatusBadge>
              <StatusBadge tone={feedVisible ? 'success' : 'neutral'}>
                {feedVisible ? c.state.feedShown : c.state.feedHidden}
              </StatusBadge>
            </div>
            <p className="mt-3 max-w-[62ch] text-[0.8125rem] text-muted">{c.state.cached}</p>
          </>
        ) : (
          <p className="mt-3 text-sm text-muted">{c.state.unavailable}</p>
        )}
      </section>

      <ThresholdForm thresholds={thresholds} />
    </div>
  );
}
