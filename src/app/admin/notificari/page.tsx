import { RetryNotification } from '@/components/admin/retry-notification';
import { TestNotification } from '@/components/admin/test-notification';
import { EyebrowPill, Figure } from '@/components/ui/primitives';
import { loadNotificationsAdminData } from '@/lib/notifications-admin-source';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

const CHANNELS = ['email', 'inapp', 'push', 'sms', 'whatsapp'];
const STATUSES = ['queued', 'sending', 'sent', 'failed', 'skipped'];

function one(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  const single = Array.isArray(value) ? value[0] : value;
  return single === '' ? undefined : single;
}

function when(value: string | null): string {
  if (value === null) return '—';
  return new Date(value).toLocaleString('ro-RO', {
    timeZone: 'Europe/Bucharest',
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

/**
 * Notificări și joburi.
 *
 * The page answers the question nobody could answer before: is anything
 * actually running, and if not, since when. Job health is at the top
 * because a queue that looks healthy while the dispatcher is dead is the
 * exact illusion this whole change exists to remove.
 */
export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const filters = {
    status: one(params, 'stare'),
    channel: one(params, 'canal'),
    template: one(params, 'tip'),
    search: one(params, 'cauta'),
  };

  const { health, healthError, stats, rows, runs, mail, provider, sms, smsProvider } =
    await loadNotificationsAdminData(filters);

  const totals = new Map<string, number>();
  for (const stat of stats) {
    totals.set(stat.status, (totals.get(stat.status) ?? 0) + Number(stat.count));
  }
  const late = health.filter((job) => job.is_late);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <EyebrowPill>Staff</EyebrowPill>
        <h1 className="mt-2 text-h2">Notificări și joburi</h1>
        <p className="mt-2 max-w-[62ch] text-body text-muted">
          Ce trimitem, ce a eșuat și dacă joburile programate chiar rulează. Un job care nu mai
          rulează nu anunță pe nimeni — de asta se vede aici.
        </p>
      </div>

      <section aria-labelledby="furnizor" className="flex flex-col gap-3">
        <h2 id="furnizor" className="text-h3">
          Furnizorul de e-mail
        </h2>

        {provider.configured === 'nu' ? (
          <p role="alert" className="rounded-card border border-danger/45 bg-danger/8 p-4 text-body">
            <strong>Neconfigurat.</strong> Dispecerul a refuzat să pornească pentru că lipsește{' '}
            <code className="font-mono">{provider.missing}</code>
            {provider.reportedAt !== null ? <> (ultima dată {when(provider.reportedAt)})</> : null}.
            Cât timp lipsește, nu pleacă niciun e-mail și coada crește. Pașii sunt în{' '}
            <code className="font-mono">docs/configurare-externa.md</code>.
          </p>
        ) : provider.configured === 'necunoscut' ? (
          <p className="rounded-card border border-border-strong bg-surface p-4 text-body text-muted">
            Necunoscut: dispecerul nu a rulat încă niciodată, deci nu a avut ocazia să spună dacă
            îi lipsește ceva. Se va ști după prima rulare — cel mult cinci minute.
          </p>
        ) : (
          <p className="rounded-card border border-success/45 bg-success/8 p-4 text-body">
            <strong>Configurat.</strong> Ultima rulare a dispecerului nu a raportat nicio variabilă
            lipsă.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-card border border-border bg-surface p-4">
            <p className="text-small text-muted">Ultimul e-mail trimis</p>
            <p className="mt-1 text-body">{when(mail?.last_sent_at ?? null)}</p>
          </div>
          <div className="rounded-card border border-border bg-surface p-4">
            <p className="text-small text-muted">Trimise în 24 h</p>
            <Figure as="p" size="sm" tone="plain" className="mt-1">{mail?.sent_24h ?? 0}</Figure>
          </div>
          <div className="rounded-card border border-border bg-surface p-4">
            <p className="text-small text-muted">Eșuate în 24 h</p>
            <Figure as="p" size="sm" tone="plain" className="mt-1">{mail?.failed_24h ?? 0}</Figure>
          </div>
          <div className="rounded-card border border-border bg-surface p-4">
            <p className="text-small text-muted">Adrese nelivrabile</p>
            <Figure as="p" size="sm" tone="plain" className="mt-1">{mail?.undeliverable_addresses ?? 0}</Figure>
          </div>
        </div>

        <TestNotification />
      </section>

      <section aria-labelledby="sms" className="flex flex-col gap-3">
        <h2 id="sms" className="text-h3">
          Furnizorul de SMS
        </h2>

        {smsProvider.configured === 'nu' ? (
          <p role="alert" className="rounded-card border border-warning/45 bg-warning/8 p-4 text-body">
            <strong>Neconfigurat.</strong> Funcția <code className="font-mono">sms-verify</code> a
            refuzat să trimită pentru că lipsește{' '}
            <code className="font-mono">{smsProvider.missing}</code>
            {smsProvider.reportedAt !== null ? (
              <> (ultima dată {when(smsProvider.reportedAt)})</>
            ) : null}
            . Nu se blochează nimic: numerele se confirmă în continuare de mână, din{' '}
            <code className="font-mono">/admin/pilot</code>. Pașii pentru furnizor sunt în{' '}
            <code className="font-mono">docs/configurare-externa.md</code>.
          </p>
        ) : smsProvider.configured === 'necunoscut' ? (
          <p className="rounded-card border border-border-strong bg-surface p-4 text-body text-muted">
            Necunoscut: nimeni nu a cerut încă un cod prin SMS, deci funcția nu a avut ocazia să
            spună dacă îi lipsește ceva. Până atunci, numerele se confirmă de mână din{' '}
            <code className="font-mono">/admin/pilot</code>.
          </p>
        ) : (
          <p className="rounded-card border border-success/45 bg-success/8 p-4 text-body">
            <strong>Configurat.</strong> Ultima cerere de cod nu a raportat nicio variabilă lipsă.
          </p>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-card border border-border bg-surface p-4">
            <p className="text-small text-muted">Ultimul SMS trimis</p>
            <p className="mt-1 text-body">{when(sms?.last_sent_at ?? null)}</p>
          </div>
          <div className="rounded-card border border-border bg-surface p-4">
            <p className="text-small text-muted">Coduri trimise în 24 h</p>
            <Figure as="p" size="sm" tone="plain" className="mt-1">{sms?.sent_24h ?? 0}</Figure>
          </div>
          <div className="rounded-card border border-border bg-surface p-4">
            <p className="text-small text-muted">Numere confirmate în 24 h</p>
            <Figure as="p" size="sm" tone="plain" className="mt-1">{sms?.confirmed_24h ?? 0}</Figure>
          </div>
          <div className="rounded-card border border-border bg-surface p-4">
            <p className="text-small text-muted">Conturi cu numărul confirmat</p>
            <Figure as="p" size="sm" tone="plain" className="mt-1">{sms?.verified_accounts ?? 0}</Figure>
            <p className="mt-1 text-small text-muted">
              dintre care {sms?.verified_by_staff ?? 0} de mână
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="joburi" className="flex flex-col gap-3">
        <h2 id="joburi" className="text-h3">
          Joburi programate
        </h2>

        {healthError !== null ? (
          <p role="alert" className="rounded-card border border-danger/45 bg-danger/8 p-4 text-body">
            Starea joburilor nu se poate citi: {healthError}
          </p>
        ) : null}

        {late.length > 0 ? (
          <p
            role="alert"
            className="rounded-card border border-danger/45 bg-danger/8 px-4 py-3 text-body"
          >
            {late.length === 1
              ? `Jobul ${late[0]!.job} nu a mai rulat de prea mult timp.`
              : `${late.length} joburi nu au mai rulat de prea mult timp.`}{' '}
            Verifică în Supabase că pg_cron este activat și că joburile există.
          </p>
        ) : null}

        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full min-w-[40rem] text-body">
            <thead className="border-b border-border text-left text-small text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Job</th>
                <th className="px-4 py-3 font-medium">Programat</th>
                <th className="px-4 py-3 font-medium">Ultima rulare</th>
                <th className="px-4 py-3 font-medium">Rezultat</th>
                <th className="px-4 py-3 font-medium">Stare</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {health.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted">
                    Nu se poate citi starea joburilor.
                  </td>
                </tr>
              ) : (
                health.map((job) => (
                  <tr key={job.job}>
                    <td className="px-4 py-3 font-mono text-small">{job.job}</td>
                    <td className="px-4 py-3">{job.scheduled ? 'da' : 'nu'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{when(job.last_run)}</td>
                    <td className="px-4 py-3">{job.last_status}</td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-small',
                          job.is_late
                            ? 'border border-danger/45 bg-danger/10'
                            : 'border border-success/45 bg-success/10',
                        )}
                      >
                        {job.is_late ? 'întârziat' : 'la zi'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {runs.length > 0 ? (
          <details className="rounded-card border border-border bg-surface px-4 py-3">
            <summary className="cursor-pointer text-body">Ultimele rulări</summary>
            <ul className="mt-3 flex flex-col gap-1 text-body">
              {runs.map((run) => (
                <li key={run.id} className="flex flex-wrap gap-x-3 text-muted">
                  <span className="whitespace-nowrap">{when(run.ran_at)}</span>
                  <span className="font-mono text-small">{run.workflow}</span>
                  <span>
                    {run.processed} trimise, {run.failed} eșuate
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <section aria-labelledby="coada" className="flex flex-col gap-3">
        <h2 id="coada" className="text-h3">
          Coada
        </h2>

        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {STATUSES.map((status) => (
            <div key={status} className="rounded-card border border-border bg-surface p-4">
              <p className="text-small text-muted">{status}</p>
              <Figure as="p" size="sm" tone="plain" className="mt-1">{totals.get(status) ?? 0}</Figure>
            </div>
          ))}
        </div>

        <form className="flex flex-wrap items-end gap-3 rounded-card border border-border bg-ground-alt p-4">
          <label className="flex flex-col gap-1 text-body">
            Stare
            <select
              name="stare"
              defaultValue={filters.status ?? ''}
              className="rounded-input border border-border-strong bg-surface px-3 py-2 text-body"
            >
              <option value="">toate</option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-body">
            Canal
            <select
              name="canal"
              defaultValue={filters.channel ?? ''}
              className="rounded-input border border-border-strong bg-surface px-3 py-2 text-body"
            >
              <option value="">toate</option>
              {CHANNELS.map((channel) => (
                <option key={channel} value={channel}>
                  {channel}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-body">
            Tip
            <input
              name="tip"
              defaultValue={filters.template ?? ''}
              placeholder="company_verified"
              className="rounded-input border border-border-strong bg-surface px-3 py-2 text-body"
            />
          </label>
          <label className="flex flex-col gap-1 text-body">
            Caută
            <input
              name="cauta"
              defaultValue={filters.search ?? ''}
              placeholder="e-mail sau id"
              className="rounded-input border border-border-strong bg-surface px-3 py-2 text-body"
            />
          </label>
          <button
            type="submit"
            className="rounded-pill border border-border-strong px-4 py-2 text-body"
          >
            Filtrează
          </button>
        </form>

        {rows.length === 0 ? (
          <p className="rounded-card border border-dashed border-border-strong bg-surface p-4 text-body text-muted">
            Nicio notificare pentru filtrele astea.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-card border border-border bg-surface">
            <table className="w-full min-w-[52rem] text-body">
              <thead className="border-b border-border text-left text-small text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">Când</th>
                  <th className="px-4 py-3 font-medium">Canal</th>
                  <th className="px-4 py-3 font-medium">Tip</th>
                  <th className="px-4 py-3 font-medium">Destinatar</th>
                  <th className="px-4 py-3 font-medium">Stare</th>
                  <th className="px-4 py-3 font-medium">Motiv</th>
                  <th className="px-4 py-3 font-medium">Id furnizor</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3 whitespace-nowrap">{when(row.created_at)}</td>
                    <td className="px-4 py-3">{row.channel}</td>
                    <td className="px-4 py-3 font-mono text-small">{row.template}</td>
                    <td className="px-4 py-3">{row.to_email ?? '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {row.status}
                      {row.attempts > 0 ? (
                        <span className="text-muted"> · {row.attempts}</span>
                      ) : null}
                    </td>
                    <td className="max-w-[24ch] truncate px-4 py-3 text-muted" title={row.last_error ?? ''}>
                      {row.last_error ?? '—'}
                    </td>
                    <td
                      className="max-w-[18ch] truncate px-4 py-3 font-mono text-small text-muted"
                      title={row.provider_message_id ?? ''}
                    >
                      {row.provider_message_id ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {row.status === 'failed' || row.status === 'skipped' ? (
                        <RetryNotification id={row.id} />
                      ) : null}
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
