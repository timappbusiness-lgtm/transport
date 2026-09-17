import { DirectorySettingsForm } from '@/components/admin/directory-settings-form';
import { DataRow, EyebrowPill, StatusBadge } from '@/components/ui/primitives';
import { adminDirectoryCopy } from '@/content/admin-directory';
import { showCompanyGrid, showStatsBand } from '@/lib/directory';
import { loadHomepageDirectory } from '@/lib/directory-source';
import { formatNumber } from '@/lib/requests';

const c = adminDirectoryCopy.settings;

/** Staff membership is the session, so nothing here is ever prerendered. */
export const dynamic = 'force-dynamic';

/**
 * Where the directory's thresholds and the trial length are set.
 *
 * Access is the layout's job — `src/app/admin/layout.tsx` gives a non-staff
 * visitor a 404 — and the RPC behind the form refuses them a second time.
 * What this screen adds is the part that is hard to hold in your head: what
 * the numbers are right now, and therefore what a visitor is seeing.
 */
export default async function Page() {
  const { stats, thresholds, companies } = await loadHomepageDirectory();
  const bandVisible = showStatsBand(stats, thresholds);
  const gridVisible = showCompanyGrid(companies, stats, thresholds);

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
              <DataRow label={c.state.verified} value={formatNumber(stats.verifiedCompanies)} />
              <DataRow label={c.state.listed} value={formatNumber(stats.listedCompanies)} />
              <DataRow label={c.state.vehicles} value={formatNumber(stats.compliantVehicles)} />
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              <StatusBadge tone={bandVisible ? 'success' : 'neutral'}>
                {bandVisible ? c.state.bandShown : c.state.bandHidden}
              </StatusBadge>
              <StatusBadge tone={gridVisible ? 'success' : 'neutral'}>
                {gridVisible ? c.state.gridShown : c.state.gridHidden}
              </StatusBadge>
            </div>
            <p className="mt-3 max-w-[62ch] text-[0.8125rem] text-muted">{c.state.cached}</p>
          </>
        ) : (
          <p className="mt-3 text-sm text-muted">{c.state.unavailable}</p>
        )}
      </section>

      <DirectorySettingsForm thresholds={thresholds} />
    </div>
  );
}
