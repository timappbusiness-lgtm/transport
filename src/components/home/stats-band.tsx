import { Container } from '@/components/layout/container';
import { directoryCopy } from '@/content/directory';
import {
  showStatsBand,
  type DirectoryStats,
  type DirectoryThresholds,
} from '@/lib/directory';
import { loadHomepageDirectory } from '@/lib/directory-source';
import { loadHomepageActivity } from '@/lib/requests-source';
import { formatNumber } from '@/lib/requests';

const c = directoryCopy.stats;

/**
 * Three numbers, or no band at all.
 *
 * Every figure is a count the database can produce and a visitor could, in
 * principle, check: firms whose documents are approved and in date, the
 * vehicles behind them, and the requests people have published. None of
 * them carries a "+", because a "+" turns a count into a claim.
 *
 * Below the threshold the team sets, the whole band is absent. "7 firme
 * verificate" answers the question it raises with "barely any", and a
 * marketplace that has to say that is better off not raising it.
 */
export async function StatsBand() {
  const [{ stats, thresholds }, activity] = await Promise.all([
    loadHomepageDirectory(),
    loadHomepageActivity(),
  ]);

  return (
    <StatsBandBody
      stats={stats}
      thresholds={thresholds}
      publishedTotal={activity.stats?.publishedTotal ?? null}
    />
  );
}

/** The band, given its three numbers rather than fetching them. */
export function StatsBandBody({
  stats,
  thresholds,
  publishedTotal,
}: {
  stats: DirectoryStats | null;
  thresholds: DirectoryThresholds;
  /** null when the activity query failed; the figure is then left out. */
  publishedTotal: number | null;
}) {
  if (!showStatsBand(stats, thresholds)) return null;

  const figures: { value: number | null; label: string }[] = [
    { value: stats.verifiedCompanies, label: c.companies },
    { value: stats.compliantVehicles, label: c.vehicles },
    // Published requests come from homepage_activity(), which is the one
    // definition of that number on this page.
    { value: publishedTotal, label: c.requests },
  ];
  const shown = figures.filter(
    (figure): figure is { value: number; label: string } => figure.value !== null,
  );

  return (
    <section aria-label={c.note} className="border-y border-border bg-surface">
      <Container className="py-10 sm:py-12">
        <dl className="grid gap-8 sm:grid-cols-3">
          {shown.map((figure) => (
            // flex-col-reverse so the value reads above the label while the
            // DOM keeps dt before dd, which is what a definition list is.
            <div key={figure.label} className="flex flex-col-reverse justify-end gap-1">
              <dt className="text-[0.9375rem] text-muted">{figure.label}</dt>
              <dd className="font-display text-[2.25rem] leading-none font-light tracking-[-0.03em] tabular-nums">
                {formatNumber(figure.value)}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-8 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-muted">
          {c.note}
        </p>
      </Container>
    </section>
  );
}
