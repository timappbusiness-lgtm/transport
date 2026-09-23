import { MatchingForm } from '@/components/requests/matching-form';
import { ThresholdForm } from '@/components/requests/threshold-form';
import { DataRow, EyebrowPill, StatusBadge } from '@/components/ui/primitives';
import { activityAdminCopy } from '@/content/activitate';
import { loadDetourSettings } from '@/lib/matching-settings-source';
import { formatNumber, pluralRo, showCategories, showFeed, showStats } from '@/lib/requests';
import { showCarrierCount } from '@/lib/trust';
import { loadVerification } from '@/lib/trust-source';
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
  const [
    { stats, thresholds, requests, verifiedCarriers, categories, categoryWindowDays },
    { reviewTimeLabel },
    detourSettings,
  ] = await Promise.all([loadHomepageActivity(), loadVerification(), loadDetourSettings()]);
  const statsVisible = showStats(stats, thresholds);
  const feedVisible = showFeed(stats, requests, thresholds);
  const countVisible = showCarrierCount(verifiedCarriers, thresholds.verifiedCompaniesMin);
  const categoriesVisible = showCategories(stats, categories, thresholds);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <EyebrowPill>Staff</EyebrowPill>
        <h1 className="mt-2 text-h2">{c.title}</h1>
        <p className="mt-2 max-w-[62ch] text-sm text-muted">{c.lede}</p>
      </div>

      <section>
        <h2 className="text-h3">{c.state.title}</h2>
        {stats ? (
          <>
            <div className="mt-4 rounded-card border border-border bg-surface px-5 py-2">
              <DataRow label={c.state.publishedTotal} value={formatNumber(stats.publishedTotal)} />
              <DataRow label={c.state.activeTotal} value={formatNumber(stats.activeTotal)} />
              <DataRow label={c.state.week} value={formatNumber(stats.publishedLast7d)} />
              <DataRow label={c.state.km} value={`${formatNumber(stats.totalKm)} km`} />
              <DataRow
                label={c.state.carriers}
                value={verifiedCarriers === null ? '—' : formatNumber(verifiedCarriers)}
              />
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <StatusBadge tone={statsVisible ? 'success' : 'neutral'}>
                {statsVisible ? c.state.statsShown : c.state.statsHidden}
              </StatusBadge>
              <StatusBadge tone={feedVisible ? 'success' : 'neutral'}>
                {feedVisible ? c.state.feedShown : c.state.feedHidden}
              </StatusBadge>
              <StatusBadge tone={countVisible ? 'success' : 'neutral'}>
                {countVisible ? c.state.countShown : c.state.countHidden}
              </StatusBadge>
              <StatusBadge tone={categoriesVisible ? 'success' : 'neutral'}>
                {categoriesVisible
                  ? c.matching.visible(pluralRo(categories.length, 'categorie', 'categorii'))
                  : c.matching.hidden}
              </StatusBadge>
            </div>
            <p className="mt-3 max-w-[62ch] text-small text-muted">{c.state.cached}</p>
          </>
        ) : (
          <p className="mt-3 text-sm text-muted">{c.state.unavailable}</p>
        )}
      </section>

      <ThresholdForm thresholds={thresholds} reviewTimeLabel={reviewTimeLabel} />

      <MatchingForm
        defaultDetourKm={detourSettings.defaultDetourKm}
        categoryWindowDays={categoryWindowDays}
      />
    </div>
  );
}
