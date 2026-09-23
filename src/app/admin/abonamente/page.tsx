import { RequestActions } from '@/components/admin/request-actions';
import { EyebrowPill, StatusBadge, type StatusTone } from '@/components/ui/primitives';
import { adminDirectoryCopy } from '@/content/admin-directory';
import { formatDateRo } from '@/lib/format';
import { formatLei, type BillingMonths } from '@/lib/plans';
import { pluralRo } from '@/lib/requests';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';

const c = adminDirectoryCopy.requests;

/** Staff membership is the session, so nothing here is ever prerendered. */
export const dynamic = 'force-dynamic';

type Status = 'new' | 'contacted' | 'activated' | 'rejected';

/** Only an open request has actions, and the type says so. */
type OpenStatus = Extract<Status, 'new' | 'contacted'>;

interface QueueRow {
  id: string;
  status: Status;
  months: BillingMonths;
  createdAt: string;
  notes: string | null;
  companyName: string;
  companyCui: string;
  planName: string;
  total: number | null;
}

const TONES: Record<Status, StatusTone> = {
  new: 'warning',
  contacted: 'neutral',
  activated: 'success',
  rejected: 'neutral',
};

/**
 * The queue.
 *
 * Nothing is charged from here: staff invoice outside the platform and
 * mark the row when the money arrives. Activation is what gives the
 * company its plan, and it is the only action that touches a subscription.
 */
export default async function Page() {
  const rows = await load();
  const open = rows.filter(
    (row): row is QueueRow & { status: OpenStatus } =>
      row.status === 'new' || row.status === 'contacted',
  );
  const closed = rows.filter((row) => row.status === 'activated' || row.status === 'rejected');

  return (
    <div className="flex flex-col gap-8">
      <div>
        <EyebrowPill>Staff</EyebrowPill>
        <h1 className="mt-2 text-h2">{c.title}</h1>
        <p className="mt-2 max-w-[62ch] text-sm text-muted">{c.lede}</p>
      </div>

      {open.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {open.map((row) => (
            <Row key={row.id} row={row} />
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">{c.empty}</p>
      )}

      {closed.length > 0 ? (
        <section aria-labelledby="inchise">
          <h2 id="inchise" className="text-h3">
            {c.status.activated} / {c.status.rejected}
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {closed.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-card border border-border bg-surface px-4 py-2.5 text-small"
              >
                <span>{row.companyName}</span>
                <span className="text-muted">{row.planName}</span>
                <StatusBadge tone={TONES[row.status]}>{c.status[row.status]}</StatusBadge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function Row({ row }: { row: QueueRow & { status: OpenStatus } }) {
  return (
    <li className="grid gap-4 rounded-card border border-border bg-surface p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <p className="font-medium">{row.companyName}</p>
          <StatusBadge tone={TONES[row.status]}>{c.status[row.status]}</StatusBadge>
        </div>
        <p className="mt-1 font-mono text-xs text-muted">CUI {row.companyCui}</p>

        <dl className="mt-3 grid gap-1 text-small">
          <div className="flex gap-2">
            <dt className="text-muted">{c.columns.plan}:</dt>
            <dd>{row.planName}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted">{c.columns.period}:</dt>
            <dd>
              {pluralRo(row.months, 'lună', 'luni')}
              {row.total !== null ? ` · ${formatLei(row.total)}` : ''}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted">{c.columns.requested}:</dt>
            <dd>{formatDateRo(row.createdAt)}</dd>
          </div>
        </dl>

        {row.notes ? (
          <p className="mt-3 rounded-input border border-border bg-ground-alt px-3 py-2 text-small">
            <span className="text-muted">{c.notes}: </span>
            {row.notes}
          </p>
        ) : null}
      </div>

      <RequestActions id={row.id} status={row.status} />
    </li>
  );
}

async function load(): Promise<QueueRow[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const [requests, plans, periods] = await Promise.all([
    supabase
      .from('subscription_requests')
      .select('id,status,months,created_at,notes,plan_code,company:companies(legal_name,cui)')
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.from('plans').select('code,name'),
    supabase.from('plan_billing_periods').select('plan_code,months,total_price_ron'),
  ]);

  for (const [label, result] of [
    ['requests', requests],
    ['plans', plans],
    ['periods', periods],
  ] as const) {
    if (result.error) {
      console.error(`[admin] ${label} query failed`, {
        code: result.error.code,
        message: result.error.message,
      });
    }
  }

  const planNames = new Map((plans.data ?? []).map((p) => [p.code, p.name]));

  return (requests.data ?? []).map((row) => {
    // PostgREST returns an embedded row as an object, but the typings widen
    // it to an array when the relationship is not provably to-one.
    const company = Array.isArray(row.company) ? row.company[0] : row.company;
    const period = (periods.data ?? []).find(
      (p) => p.plan_code === row.plan_code && p.months === row.months,
    );

    return {
      id: row.id,
      status: row.status as Status,
      months: row.months as BillingMonths,
      createdAt: row.created_at,
      notes: row.notes,
      companyName: company?.legal_name ?? '—',
      companyCui: company?.cui ?? '—',
      planName: planNames.get(row.plan_code) ?? row.plan_code,
      total: period ? Number(period.total_price_ron) : null,
    };
  });
}
