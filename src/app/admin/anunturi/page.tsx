import Link from 'next/link';
import { ExportModeration } from '@/components/admin/export-moderation';
import { AdminListingFilters } from '@/components/admin/list-filters';
import { ModerateListing } from '@/components/admin/moderate-listing';
import { EyebrowPill, StatusBadge } from '@/components/ui/primitives';
import { ROUTES, requestRoute } from '@/config/routes';
import { messagesCopy } from '@/content/mesaje';
import { formatMoment } from '@/lib/orders';
import { loadAdminOrderCompanies } from '@/lib/orders-source';
import {
  ADMIN_LISTINGS_PAGE_SIZE,
  loadAdminListings,
  type AdminListingQuery,
} from '@/lib/messages-source';
import { formatNumber } from '@/lib/requests';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';
import { withParam } from '@/lib/continuity/query';

export const dynamic = 'force-dynamic';

const c = messagesCopy.admin.listings;
const LISTING_STATUSES = ['active', 'assigned', 'completed', 'cancelled', 'expired', 'suspended'];

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

/**
 * Anunțurile, pentru echipă.
 *
 * Ascunderea scoate anunțul de pe panoul public și îl lasă la
 * proprietar, cu motivul. Nu este o stare a anunțului — dacă ar fi fost,
 * ascunderea ar fi șters „activ" sau „are oferte", și la repunere n-am
 * mai fi știut unde să ne întoarcem.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;

  const kind = one(params, 'fel') === 'trasee' ? 'trasee' : 'cereri';
  const page = Math.max(1, Number(one(params, 'pagina') ?? '1') || 1);
  const query: AdminListingQuery = {
    kind,
    status: one(params, 'stare'),
    companyId: uuid(one(params, 'firma')),
    hidden: one(params, 'ascunse') === 'da' ? true : null,
    reported: one(params, 'sesizate') === 'da' ? true : null,
    from: isoDay(one(params, 'de-la')),
    to: isoDay(one(params, 'pana-la')),
    page,
  };

  const [{ rows, total, error }, companies] = await Promise.all([
    loadAdminListings(query),
    loadAdminOrderCompanies(),
  ]);

  const lastPage = Math.max(1, Math.ceil(total / ADMIN_LISTINGS_PAGE_SIZE));

  // What the page actually applied, not what the address said: a date
  // it ignored as malformed draws no chip claiming otherwise.
  const viewHref = kind === 'trasee' ? `${ROUTES.adminListings}?fel=trasee` : ROUTES.adminListings;
  const filterParams: Record<string, string> = {};
  if (kind === 'trasee') filterParams.fel = kind;
  if (query.status) filterParams.stare = query.status;
  if (query.companyId) filterParams.firma = query.companyId;
  if (query.reported) filterParams.sesizate = 'da';
  if (query.from) filterParams['de-la'] = query.from;
  if (query.to) filterParams['pana-la'] = query.to;
  if (query.hidden) filterParams.ascunse = 'da';

  return (
    <div className="flex flex-col gap-6">
      <div>
        <EyebrowPill>{c.eyebrow}</EyebrowPill>
        <h1 className="mt-2 text-h2">{c.title}</h1>
        <p className="mt-2 max-w-[64ch] text-body text-muted">{c.lede}</p>
      </div>

      <nav aria-label={c.title} className="flex flex-wrap gap-2">
        {(['cereri', 'trasee'] as const).map((k) => (
          <Link
            key={k}
            href={k === 'cereri' ? ROUTES.adminListings : `${ROUTES.adminListings}?fel=trasee`}
            aria-current={k === kind ? 'page' : undefined}
            className={cn(
              'rounded-pill border px-3.5 py-1.5 text-small',
              k === kind
                ? 'border-transparent bg-foreground text-white'
                : 'border-border-strong text-muted hover:text-foreground',
            )}
          >
            {c.tabs[k]}
          </Link>
        ))}
      </nav>

      <AdminListingFilters
        action={ROUTES.adminListings}
        resetHref={viewHref}
        params={filterParams}
        canReset={Object.keys(filterParams).some((key) => key !== 'fel') || page > 1}
        hidden={<input type="hidden" name="fel" value={kind} />}
        statuses={LISTING_STATUSES.map((value) => ({ value, label: value }))}
        companies={companies.map((company) => ({
          value: company.company_id,
          label: company.company_name,
        }))}
      >
        <span className="text-small text-muted">{c.total(formatNumber(total))}</span>
      </AdminListingFilters>

      <ExportModeration />

      {error !== null ? (
        <p className="rounded-card border border-danger/40 bg-danger/8 p-4 text-body">{error}</p>
      ) : rows.length === 0 ? (
        <EmptyState figure="search" title={c.empty} body={c.emptyBody} />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-card border border-border bg-surface p-5">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-body">{row.title ?? '—'}</span>
                <StatusBadge tone="neutral">{row.status}</StatusBadge>
                {row.hidden_at !== null ? (
                  <StatusBadge tone="danger">{c.hiddenLabel}</StatusBadge>
                ) : null}
                {row.report_count > 0 ? (
                  <StatusBadge tone="warning">{c.reports(row.report_count)}</StatusBadge>
                ) : null}
              </div>

              <p className="mt-1 text-small text-muted">
                {row.company_name ?? row.owner_name ?? '—'} · {formatMoment(row.created_at)}
                {row.photo_count > 0 ? ` · ${c.photos(row.photo_count)}` : ''}
              </p>

              {row.hidden_reason !== null ? (
                <p className="mt-2 rounded-input border border-border-strong bg-ground-alt px-3 py-2 text-small">
                  {row.hidden_reason}
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-small">
                {kind === 'cereri' ? (
                  <Link href={requestRoute(row.id)} className="underline underline-offset-4">
                    {c.openListing}
                  </Link>
                ) : null}
                {row.company_id !== null ? (
                  <Link
                    href={`${ROUTES.adminCompanies}?firma=${row.company_id}`}
                    className="text-muted underline underline-offset-4"
                  >
                    {c.suspendCompany}
                  </Link>
                ) : null}
                <ModerateListing
                  {...(kind === 'cereri' ? { requestId: row.id } : { routeId: row.id })}
                  hidden={row.hidden_at !== null}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {lastPage > 1 ? (
        <nav aria-label={c.title} className="flex flex-wrap items-center gap-3 text-body">
          {page > 1 ? (
            <Link
              href={withParam(ROUTES.adminListings, params, 'pagina', page - 1 > 1 ? String(page - 1) : null)}
              className="underline underline-offset-4"
            >
              Înapoi
            </Link>
          ) : null}
          <span className="text-muted">{`${page} / ${lastPage}`}</span>
          {page < lastPage ? (
            <Link
              href={withParam(ROUTES.adminListings, params, 'pagina', String(page + 1))}
              className="underline underline-offset-4"
            >
              Mai departe
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
