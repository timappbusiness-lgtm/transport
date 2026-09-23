import Link from 'next/link';
import { ExportModeration } from '@/components/admin/export-moderation';
import { ModerateListing } from '@/components/admin/moderate-listing';
import { buttonClasses } from '@/components/ui/button';
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

export const dynamic = 'force-dynamic';

const c = messagesCopy.admin.listings;
const CONTROL = 'w-full rounded-input border border-border-strong bg-surface px-3 py-2 text-sm';

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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <EyebrowPill>{c.eyebrow}</EyebrowPill>
        <h1 className="mt-2 text-h2">{c.title}</h1>
        <p className="mt-2 max-w-[64ch] text-sm text-muted">{c.lede}</p>
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
                ? 'border-transparent bg-foreground text-ground'
                : 'border-border-strong text-muted hover:text-foreground',
            )}
          >
            {c.tabs[k]}
          </Link>
        ))}
      </nav>

      <form
        method="get"
        className="grid gap-3 rounded-card border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <input type="hidden" name="fel" value={kind} />

        <label className="flex flex-col gap-1 text-xs text-muted">
          {c.filters.status}
          <select name="stare" defaultValue={one(params, 'stare') ?? ''} className={CONTROL}>
            <option value="">{c.filters.any}</option>
            {['active', 'assigned', 'completed', 'cancelled', 'expired', 'suspended'].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted">
          {c.filters.company}
          <select name="firma" defaultValue={one(params, 'firma') ?? ''} className={CONTROL}>
            <option value="">{c.filters.any}</option>
            {companies.map((company) => (
              <option key={company.company_id} value={company.company_id}>
                {company.company_name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted">
          {c.filters.from}
          <input type="date" name="de-la" defaultValue={one(params, 'de-la') ?? ''} className={CONTROL} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          {c.filters.to}
          <input type="date" name="pana-la" defaultValue={one(params, 'pana-la') ?? ''} className={CONTROL} />
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="ascunse" value="da" defaultChecked={one(params, 'ascunse') === 'da'} />
          {c.filters.hidden}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="sesizate" value="da" defaultChecked={one(params, 'sesizate') === 'da'} />
          {c.filters.reported}
        </label>

        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <button type="submit" className={buttonClasses('primary', 'sm')}>
            {c.filters.apply}
          </button>
          <Link href={ROUTES.adminListings} className={buttonClasses('secondary', 'sm')}>
            {c.filters.clear}
          </Link>
          <span className="text-xs text-muted">{c.total(formatNumber(total))}</span>
        </div>
      </form>

      <ExportModeration />

      {error !== null ? (
        <p className="rounded-card border border-danger/40 bg-danger/8 p-4 text-sm">{error}</p>
      ) : rows.length === 0 ? (
        <div className="rounded-card border border-border bg-surface p-6">
          <p className="text-body-lg">{c.empty}</p>
          <p className="mt-1 text-sm text-muted">{c.emptyBody}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-card border border-border bg-surface p-5">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-base">{row.title ?? '—'}</span>
                <StatusBadge tone="neutral">{row.status}</StatusBadge>
                {row.hidden_at !== null ? (
                  <StatusBadge tone="danger">{c.hiddenLabel}</StatusBadge>
                ) : null}
                {row.report_count > 0 ? (
                  <StatusBadge tone="warning">{c.reports(row.report_count)}</StatusBadge>
                ) : null}
              </div>

              <p className="mt-1 text-xs text-muted">
                {row.company_name ?? row.owner_name ?? '—'} · {formatMoment(row.created_at)}
                {row.photo_count > 0 ? ` · ${c.photos(row.photo_count)}` : ''}
              </p>

              {row.hidden_reason !== null ? (
                <p className="mt-2 rounded-input border border-border-strong bg-ground-alt px-3 py-2 text-xs">
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
        <nav aria-label={c.title} className="flex flex-wrap items-center gap-3 text-sm">
          {page > 1 ? (
            <Link
              href={`${ROUTES.adminListings}?fel=${kind}&pagina=${page - 1}`}
              className="underline underline-offset-4"
            >
              Înapoi
            </Link>
          ) : null}
          <span className="text-muted">{`${page} / ${lastPage}`}</span>
          {page < lastPage ? (
            <Link
              href={`${ROUTES.adminListings}?fel=${kind}&pagina=${page + 1}`}
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
