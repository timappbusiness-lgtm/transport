import Link from 'next/link';
import { AdminOfferFilters } from '@/components/admin/list-filters';
import { buttonClasses } from '@/components/ui/button';
import { EyebrowPill, StatusBadge } from '@/components/ui/primitives';
import { ROUTES, adminOfferRoute } from '@/config/routes';
import { offersCopy } from '@/content/oferte';
import {
  OFFER_STATUS_LABELS,
  OFFER_STATUS_ORDER,
  formatMoney,
  type OfferStatus,
} from '@/lib/offers';
import {
  ADMIN_OFFERS_PAGE_SIZE,
  loadAdminOfferCompanies,
  loadAdminOffers,
  type AdminOfferQuery,
} from '@/lib/offers-admin-source';
import { paramsFromSearch } from '@/lib/filter-disclosure';
import { formatNumber } from '@/lib/requests';
import { EmptyState } from '@/components/ui/empty-state';

export const dynamic = 'force-dynamic';

const c = offersCopy.admin;

type Params = Record<string, string | string[] | undefined>;

function one(params: Params, key: string): string | null {
  const value = params[key];
  const text = Array.isArray(value) ? value[0] : value;
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  return trimmed === '' ? null : trimmed;
}

/** Everything below arrives from a query string, so nothing is trusted. */
function uuid(value: string | null): string | null {
  return value !== null &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function isoDay(value: string | null): string | null {
  return value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function status(value: string | null): OfferStatus | null {
  return OFFER_STATUS_ORDER.includes(value as OfferStatus) ? (value as OfferStatus) : null;
}

function queryFrom(params: Params): AdminOfferQuery {
  const page = Number(one(params, 'p') ?? '1');
  return {
    status: status(one(params, 'stare')),
    companyId: uuid(one(params, 'firma')),
    from: isoDay(one(params, 'de-la')),
    to: isoDay(one(params, 'pana-la')),
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
  };
}

function toSearch(query: AdminOfferQuery, page: number): string {
  const search = new URLSearchParams();
  if (query.status) search.set('stare', query.status);
  if (query.companyId) search.set('firma', query.companyId);
  if (query.from) search.set('de-la', query.from);
  if (query.to) search.set('pana-la', query.to);
  if (page > 1) search.set('p', String(page));
  const text = search.toString();
  return text === '' ? '' : `?${text}`;
}

function tone(value: OfferStatus): 'success' | 'warning' | 'danger' | 'neutral' {
  if (value === 'accepted') return 'success';
  if (value === 'pending') return 'warning';
  if (value === 'rejected') return 'danger';
  return 'neutral';
}

/**
 * Oferte, for the team.
 *
 * Read-only by construction rather than by restraint: `admin_offers()`
 * and `admin_offer()` select, `offers` has no update policy staff could
 * write through, and the one action anywhere near this screen — hiding
 * a message — lives on the detail page and writes to `messages`.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const query = queryFrom(params);

  const [page, companies] = await Promise.all([
    loadAdminOffers(query),
    loadAdminOfferCompanies(),
  ]);
  const lastPage = Math.max(1, Math.ceil(page.total / ADMIN_OFFERS_PAGE_SIZE));
  const filtered = toSearch(query, 1) !== '' || query.page > 1;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <EyebrowPill>{c.eyebrow}</EyebrowPill>
        <h1 className="mt-2 text-h2">{c.title}</h1>
        <p className="mt-2 max-w-[62ch] text-body text-muted">{c.lede}</p>
      </div>

      <AdminOfferFilters
        action={ROUTES.adminOffers}
        resetHref={ROUTES.adminOffers}
        params={paramsFromSearch(toSearch(query, 1))}
        canReset={filtered}
        statuses={OFFER_STATUS_ORDER.map((value) => ({ value, label: OFFER_STATUS_LABELS[value] }))}
        companies={companies.map((company) => ({
          value: company.company_id,
          label: `${company.company_name} (${company.offers_count})`,
        }))}
      />

      {page.error !== null ? (
        <p role="alert" className="rounded-card border border-danger/45 bg-danger/8 p-4 text-body">
          Nu se pot citi ofertele acum.
        </p>
      ) : null}

      {/* A failed read already says so above; an empty state under it
          would claim there is nothing, which nobody knows. */}
      {page.error !== null ? null : page.rows.length === 0 ? (
        <EmptyState
          figure={filtered ? 'search' : 'list'}
          title={c.empty.title}
          body={c.empty.body}
          action={
            filtered ? (
              <Link href={ROUTES.adminOffers} className={buttonClasses('secondary', 'sm')}>
                {c.filters.clear}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <p className="text-body text-muted">
            {c.list.total(formatNumber(page.total))} · {c.list.page(query.page, lastPage)}
          </p>

          <ul className="flex flex-col gap-3">
            {page.rows.map((row) => (
              <li key={row.id} className="rounded-card border border-border bg-surface p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-body">
                      {row.company_name ?? c.list.individual}
                      <span className="text-muted"> — </span>
                      {formatMoney(row.price_amount, row.currency)}
                    </p>
                    <p className="mt-1 text-small text-muted">
                      {row.from_city !== null && row.to_city !== null
                        ? `${row.from_city} → ${row.to_city}`
                        : c.list.noRequest}
                      {' · '}
                      {row.messages_count > 0
                        ? c.list.messages(row.messages_count)
                        : c.list.noMessages}
                    </p>
                    <p className="mt-1 font-mono text-label text-muted">
                      {new Date(row.created_at).toLocaleString('ro-RO')}
                    </p>
                  </div>
                  <div className="flex flex-none flex-col items-end gap-2">
                    <StatusBadge tone={tone(row.status)}>
                      {OFFER_STATUS_LABELS[row.status]}
                    </StatusBadge>
                    <Link
                      href={adminOfferRoute(row.id)}
                      className={buttonClasses('secondary', 'sm')}
                    >
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
                href={`${ROUTES.adminOffers}${toSearch(query, query.page - 1)}`}
                className={buttonClasses('secondary', 'sm')}
              >
                {c.list.previous}
              </Link>
            ) : null}
            {query.page < lastPage ? (
              <Link
                href={`${ROUTES.adminOffers}${toSearch(query, query.page + 1)}`}
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
