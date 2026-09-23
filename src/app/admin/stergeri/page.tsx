import { AnonymiseAccount, CancelDeletion } from '@/components/admin/anonymise-account';
import { EyebrowPill } from '@/components/ui/primitives';
import { personalDataCopy } from '@/content/date-personale';
import { loadDeletionAdminData } from '@/lib/account-deletion-source';

const c = personalDataCopy.admin;

export const dynamic = 'force-dynamic';

function when(value: string | null): string {
  if (value === null) return '—';
  return new Date(value).toLocaleString('ro-RO', {
    timeZone: 'Europe/Bucharest',
    dateStyle: 'short',
    timeStyle: 'short',
  });
}

const TONES: Record<string, string> = {
  blocked: 'border-danger/45 bg-danger/8',
  scheduled: 'border-warning/45 bg-warning/8',
  completed: 'border-border bg-ground-alt',
  cancelled: 'border-border bg-ground-alt',
  requested: 'border-border bg-ground-alt',
};

/**
 * Ștergeri de cont.
 *
 * The list is the whole screen. A deletion that is blocked, and why, is
 * the thing staff are asked about on the telephone, and it is a sentence
 * the database wrote rather than one this page assembled — so what is
 * read out matches what the person saw.
 */
export default async function Page() {
  const { rows, jobLate } = await loadDeletionAdminData();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <EyebrowPill>Staff</EyebrowPill>
        <h1 className="mt-2 text-h2">{c.title}</h1>
        <p className="mt-2 max-w-[62ch] text-body text-muted">{c.lede}</p>
      </div>

      {jobLate === true ? (
        <p role="alert" className="rounded-card border border-danger/45 bg-danger/8 p-4 text-body">
          {c.jobWarning}
        </p>
      ) : null}

      <section aria-labelledby="cereri" className="flex flex-col gap-3">
        <h2 id="cereri" className="text-h3">
          Cereri
        </h2>
        {rows.length === 0 ? (
          // Deletions: words only, no drawing.
          <p className="rounded-card border border-border bg-surface p-6 text-body text-muted">{c.empty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((row) => (
              <li
                key={row.id}
                className={`rounded-card border p-4 ${TONES[row.status] ?? 'border-border bg-surface'}`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-body font-medium">
                    {c.kinds[row.kind]} · {c.statuses[row.status]}
                  </p>
                  <p className="text-small text-muted">
                    cerută {when(row.requested_at)}
                    {row.scheduled_for !== null ? ` · programată ${when(row.scheduled_for)}` : ''}
                    {row.completed_at !== null ? ` · finalizată ${when(row.completed_at)}` : ''}
                  </p>
                </div>
                <p className="mt-1 break-all font-mono text-small text-muted">
                  {row.user_id ?? 'cont șters'}
                  {row.company_id !== null ? ` · firmă ${row.company_id}` : ''}
                </p>
                {row.reason_blocked !== null ? (
                  <p className="mt-2 text-body">{row.reason_blocked}</p>
                ) : null}
                {row.staff_reason !== null ? (
                  <p className="mt-2 text-body text-muted">Motiv staff: {row.staff_reason}</p>
                ) : null}
                {row.status === 'scheduled' || row.status === 'blocked' ? (
                  <div className="mt-3">
                    <CancelDeletion requestId={row.id} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section
        aria-labelledby="anonimizare"
        className="rounded-card border border-border bg-surface p-5"
      >
        <h2 id="anonimizare" className="text-h3">
          {c.anonymiseTitle}
        </h2>
        <p className="mt-2 max-w-[62ch] text-body text-muted">{c.anonymiseBody}</p>
        <div className="mt-4">
          <AnonymiseAccount />
        </div>
      </section>
    </div>
  );
}
