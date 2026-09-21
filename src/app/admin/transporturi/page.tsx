import Link from 'next/link';
import { buttonClasses } from '@/components/ui/button';
import { EyebrowPill, StatusBadge } from '@/components/ui/primitives';
import { ROUTES, adminOrderRoute } from '@/config/routes';
import { ordersCopy } from '@/content/comenzi';
import { formatMoney } from '@/lib/offers';
import { ORDER_STEPS, formatMoment, orderStatusLabel, type OrderStatus } from '@/lib/orders';
import {
  ADMIN_ORDERS_PAGE_SIZE,
  loadAdminOrderCompanies,
  loadAdminOrders,
  type AdminOrderQuery,
} from '@/lib/orders-source';
import { formatNumber } from '@/lib/requests';

export const dynamic = 'force-dynamic';

const c = ordersCopy.admin;
const CONTROL = 'w-full rounded-input border border-border-strong bg-surface px-3 py-2 text-sm';

/** Everything the filter may offer, the run plus the two side states. */
const FILTERABLE: readonly OrderStatus[] = [...ORDER_STEPS, 'disputed', 'cancelled'];

type Params = Record<string, string | string[] | undefined>;

function one(params: Params, key: string): string | null {
  const value = params[key];
  const text = Array.isArray(value) ? value[0] : value;
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  return trimmed === '' ? null : trimmed;
}

function uuid(value: string | null): string | null {
  return value !== null &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function isoDay(value: string | null): string | null {
  return value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function status(value: string | null): OrderStatus | null {
  return FILTERABLE.includes(value as OrderStatus) ? (value as OrderStatus) : null;
}

function queryFrom(params: Params): AdminOrderQuery {
  const page = Number(one(params, 'p') ?? '1');
  return {
    status: status(one(params, 'stare')),
    companyId: uuid(one(params, 'firma')),
    disputedOnly: one(params, 'dispute') === 'da',
    from: isoDay(one(params, 'de-la')),
    to: isoDay(one(params, 'pana-la')),
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
  };
}

function toSearch(query: AdminOrderQuery, page: number): string {
  const search = new URLSearchParams();
  if (query.status) search.set('stare', query.status);
  if (query.companyId) search.set('firma', query.companyId);
  if (query.disputedOnly) search.set('dispute', 'da');
  if (query.from) search.set('de-la', query.from);
  if (query.to) search.set('pana-la', query.to);
  if (page > 1) search.set('p', String(page));
  const text = search.toString();
  return text === '' ? '' : `?${text}`;
}

/**
 * Transporturi, for the team.
 *
 * Read-only apart from the three things a dispute needs: closing one,
 * cancelling with a reason, and hiding a piece of evidence with a
 * reason. All three are audited and none of them touches what was
 * captured — `order_evidence` refuses an update to anything but its
 * hidden flag, whoever is asking.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const query = queryFrom(params);

  const [page, companies] = await Promise.all([
    loadAdminOrders(query),
    loadAdminOrderCompanies(),
  ]);
  const lastPage = Math.max(1, Math.ceil(page.total / ADMIN_ORDERS_PAGE_SIZE));
  const filtered = toSearch(query, 1) !== '' || query.page > 1;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <EyebrowPill>{c.eyebrow}</EyebrowPill>
        <h1 className="mt-2 text-[clamp(1.5rem,4vw,2rem)]">{c.title}</h1>
        <p className="mt-2 max-w-[66ch] text-sm text-muted">{c.lede}</p>
      </div>

      <form
        method="get"
        action={ROUTES.adminOrders}
        className="rounded-card border border-border bg-surface p-5"
      >
        <h2 className="mb-4 text-sm font-medium">{c.filters.title}</h2>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="at-status" className="text-xs font-medium">
              {c.filters.status}
            </label>
            <select id="at-status" name="stare" defaultValue={query.status ?? ''} className={CONTROL}>
              <option value="">{c.filters.any}</option>
              {FILTERABLE.map((value) => (
                <option key={value} value={value}>
                  {orderStatusLabel(value)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="at-company" className="text-xs font-medium">
              {c.filters.company}
            </label>
            <select
              id="at-company"
              name="firma"
              defaultValue={query.companyId ?? ''}
              className={CONTROL}
            >
              <option value="">{c.filters.any}</option>
              {companies.map((company) => (
                <option key={company.company_id} value={company.company_id}>
                  {company.company_name} ({company.orders_count})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="at-from" className="text-xs font-medium">
              {c.filters.from}
            </label>
            <input
              id="at-from"
              name="de-la"
              type="date"
              defaultValue={query.from ?? ''}
              className={CONTROL}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="at-to" className="text-xs font-medium">
              {c.filters.to}
            </label>
            <input
              id="at-to"
              name="pana-la"
              type="date"
              defaultValue={query.to ?? ''}
              className={CONTROL}
            />
          </div>
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm">
          <input type="checkbox" name="dispute" value="da" defaultChecked={query.disputedOnly} />
          {c.filters.disputed}
        </label>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="submit" className={buttonClasses('primary', 'sm')}>
            {c.filters.apply}
          </button>
          {filtered ? (
            <a href={ROUTES.adminOrders} className="text-sm text-muted underline-offset-4 hover:underline">
              {c.filters.clear}
            </a>
          ) : null}
        </div>
      </form>

      {page.error !== null ? (
        <p role="alert" className="rounded-card border border-danger/45 bg-danger/8 p-4 text-sm">
          Nu se pot citi comenzile acum.
        </p>
      ) : null}

      {page.rows.length === 0 ? (
        <div className="rounded-card border border-dashed border-border-strong bg-surface p-6 sm:p-8">
          <h2 className="text-[1.0625rem]">{c.empty.title}</h2>
          <p className="mt-2 max-w-[54ch] text-sm text-muted">{c.empty.body}</p>
          {filtered ? (
            <p className="mt-5 text-sm">
              <Link href={ROUTES.adminOrders} className="underline underline-offset-4">
                {c.filters.clear}
              </Link>
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <p className="text-sm text-muted">
            {c.list.total(formatNumber(page.total))} · {c.list.page(query.page, lastPage)}
          </p>

          <ul className="flex flex-col gap-3">
            {page.rows.map((row) => (
              <li
                key={row.id}
                className={`rounded-card border bg-surface p-4 ${
                  row.status === 'disputed' ? 'border-warning/45' : 'border-border'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[0.9375rem]">
                      {row.from_city ?? '—'} → {row.to_city ?? '—'}
                      <span className="text-muted"> · </span>
                      {formatMoney(row.agreed_price, row.currency as never)}
                    </p>
                    <p className="mt-1 text-[0.8125rem] text-muted">
                      {row.carrier_name ?? '—'}
                      {' → '}
                      {row.client_name ?? '—'}
                      {' · '}
                      {row.evidence_count > 0
                        ? c.list.evidence(row.evidence_count)
                        : c.list.noEvidence}
                    </p>
                    <p className="mt-1 font-mono text-[0.6875rem] text-muted">
                      {formatMoment(row.created_at)}
                      {row.disputed_at !== null
                        ? ` · ${ordersCopy.dispute.openedAt} ${formatMoment(row.disputed_at)}`
                        : ''}
                    </p>
                  </div>
                  <div className="flex flex-none flex-col items-end gap-2">
                    <StatusBadge tone={row.status === 'disputed' ? 'warning' : 'neutral'}>
                      {orderStatusLabel(row.status)}
                    </StatusBadge>
                    <Link href={adminOrderRoute(row.id)} className={buttonClasses('secondary', 'sm')}>
                      {c.list.open}
                    </Link>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <nav aria-label="Paginare" className="flex flex-wrap items-center gap-3">
            {query.page > 1 ? (
              <Link
                href={`${ROUTES.adminOrders}${toSearch(query, query.page - 1)}`}
                className={buttonClasses('secondary', 'sm')}
              >
                {c.list.previous}
              </Link>
            ) : null}
            {query.page < lastPage ? (
              <Link
                href={`${ROUTES.adminOrders}${toSearch(query, query.page + 1)}`}
                className={buttonClasses('secondary', 'sm')}
              >
                {c.list.next}
              </Link>
            ) : null}
          </nav>
        </>
      )}
    </div>
  );
}
