import { ImportSettingsForm } from '@/components/admin/import-settings-form';
import { EyebrowPill, Figure } from '@/components/ui/primitives';
import { REFUSALS } from '@/lib/listing-import';
import { loadImportAdminData } from '@/lib/import-settings-source';

/** Staff membership is the session, so nothing here is ever prerendered. */
export const dynamic = 'force-dynamic';

/**
 * What the import costs, and the dials that decide it.
 *
 * The attempt list is deliberately thin. It carries who tried, from what
 * kind of source, how long it took, whether it worked and what it cost —
 * and, for a link, the hostname. Not the address, not the page, not what
 * was extracted. A listing URL identifies a particular car somebody is
 * selling, and there is no operational question here that needs it.
 */
export default async function Page() {
  const { settings, budget, attempts } = await loadImportAdminData();

  if (settings === null) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-h2">Import din anunț</h1>
        <p className="text-body text-muted">
          Setările nu se pot citi. Verifică legătura cu baza de date.
        </p>
      </div>
    );
  }

  const spent = budget?.spent_usd ?? 0;
  const cap = budget?.budget_usd ?? settings.monthly_budget_usd;
  const pct = budget?.used_pct;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <EyebrowPill>Staff</EyebrowPill>
        <h1 className="mt-2 text-h2">Import din anunț</h1>
        <p className="mt-2 max-w-[62ch] text-body text-muted">
          Cât consumă completarea automată a formularului de cerere și unde se schimbă limitele.
          Nu păstrăm nimic din paginile citite — nici adresa, nici textul.
        </p>
      </div>

      <section aria-labelledby="luna" className="flex flex-col gap-3">
        <h2 id="luna" className="text-h3">
          Luna curentă
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-card border border-border bg-surface p-4">
            <p className="text-small text-muted">Consumat</p>
            <Figure as="p" size="sm" tone="plain" className="mt-1">${spent.toFixed(2)}</Figure>
            <p className="mt-1 text-small text-muted">
              din ${cap.toFixed(2)}
              {pct === null || pct === undefined ? '' : ` — ${pct}%`}
            </p>
          </div>
          <div className="rounded-card border border-border bg-surface p-4">
            <p className="text-small text-muted">Încercări</p>
            <Figure as="p" size="sm" tone="plain" className="mt-1">{budget?.extractions ?? 0}</Figure>
            <p className="mt-1 text-small text-muted">reușite și eșuate, împreună</p>
          </div>
          <div className="rounded-card border border-border bg-surface p-4">
            <p className="text-small text-muted">Cost mediu</p>
            <Figure as="p" size="sm" tone="plain" className="mt-1">
              {(budget?.extractions ?? 0) === 0
                ? '—'
                : `$${(spent / (budget?.extractions ?? 1)).toFixed(4)}`}
            </Figure>
            <p className="mt-1 text-small text-muted">pe încercare</p>
          </div>
        </div>
        <p className="text-small text-muted">
          Luna se socotește pe ora Bucureștiului. Un buget care se resetează la 02:00 pe 1 ale
          lunii nu se potrivește cu nicio factură.
        </p>
      </section>

      <section aria-labelledby="limite" className="flex flex-col gap-3">
        <h2 id="limite" className="text-h3">
          Limitele
        </h2>
        <ImportSettingsForm settings={settings} />
      </section>

      <section aria-labelledby="incercari" className="flex flex-col gap-3">
        <h2 id="incercari" className="text-h3">
          Ultimele încercări
        </h2>
        {attempts.length === 0 ? (
          <p className="rounded-card border border-dashed border-border-strong bg-surface p-4 text-body text-muted">
            Nicio încercare încă.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-card border border-border bg-surface">
            <table className="w-full min-w-[42rem] text-body">
              <thead className="border-b border-border text-left text-small text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Când</th>
                  <th className="px-4 py-3 font-medium">Sursă</th>
                  <th className="px-4 py-3 font-medium">Site</th>
                  <th className="px-4 py-3 font-medium">Rezultat</th>
                  <th className="px-4 py-3 font-medium">Durată</th>
                  <th className="px-4 py-3 font-medium">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {attempts.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {new Date(row.created_at).toLocaleString('ro-RO', {
                        timeZone: 'Europe/Bucharest',
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </td>
                    <td className="px-4 py-3">{row.source_type === 'link' ? 'Link' : 'Poză'}</td>
                    <td className="px-4 py-3 font-mono text-small">{row.source_host ?? '—'}</td>
                    <td className="px-4 py-3">
                      {row.status === 'ok' ? (
                        <span>
                          {row.fields_kept ?? 0} câmpuri
                        </span>
                      ) : row.status === 'running' ? (
                        <span className="text-muted">în curs</span>
                      ) : (
                        <span title={REFUSALS[row.failure_reason ?? 'unknown']?.message}>
                          {row.failure_reason ?? 'unknown'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-small">
                      {row.duration_ms === null ? '—' : `${row.duration_ms} ms`}
                    </td>
                    <td className="px-4 py-3 font-mono text-small">
                      ${Number(row.cost_usd).toFixed(4)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
