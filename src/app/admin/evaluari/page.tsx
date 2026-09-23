import Link from 'next/link';
import { ModerateRating } from '@/components/admin/moderate-rating';
import { Stars } from '@/components/ratings/star-input';
import { buttonClasses } from '@/components/ui/button';
import { EyebrowPill, StatusBadge } from '@/components/ui/primitives';
import { ROUTES, adminOrderRoute, companyRoute } from '@/config/routes';
import { ratingsCopy } from '@/content/evaluari';
import { formatMoment } from '@/lib/ratings';
import {
  ADMIN_RATINGS_PAGE_SIZE,
  loadAdminRatings,
  type AdminRatingQuery,
} from '@/lib/ratings-source';
import { loadAdminOrderCompanies } from '@/lib/orders-source';
import { formatNumber } from '@/lib/requests';
import { EmptyState } from '@/components/ui/empty-state';

export const dynamic = 'force-dynamic';

const c = ratingsCopy.admin;
const CONTROL = 'w-full rounded-input border border-border-strong bg-surface px-3 py-2 text-body';

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

function score(value: string | null): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

/**
 * Toate evaluările, pentru echipă.
 *
 * Singurele lucruri care se pot face de aici sunt ascunderea și
 * repunerea, amândouă cu motiv și amândouă în jurnal. Nu există niciun
 * câmp în care să se scrie peste ce a scris cineva — `ratings` nu are o
 * politică de UPDATE prin care echipa să ajungă la text, iar triggerul
 * ar refuza-o dacă ar avea.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;

  const page = Math.max(1, Number(one(params, 'pagina') ?? '1') || 1);
  const query: AdminRatingQuery = {
    score: score(one(params, 'nota')),
    companyId: uuid(one(params, 'firma')),
    hidden: one(params, 'ascunse') === 'da' ? true : null,
    afterDispute: one(params, 'dispute') === 'da' ? true : null,
    page,
  };

  const [{ rows, total, error }, companies] = await Promise.all([
    loadAdminRatings(query),
    loadAdminOrderCompanies(),
  ]);

  const lastPage = Math.max(1, Math.ceil(total / ADMIN_RATINGS_PAGE_SIZE));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <EyebrowPill>{c.eyebrow}</EyebrowPill>
        <h1 className="mt-2 text-h2">{c.title}</h1>
        <p className="mt-2 max-w-[64ch] text-body text-muted">{c.lede}</p>
      </div>

      <form
        method="get"
        className="grid gap-3 rounded-card border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        <label className="flex flex-col gap-1 text-small text-muted">
          {c.filters.score}
          <select name="nota" defaultValue={one(params, 'nota') ?? ''} className={CONTROL}>
            <option value="">{c.filters.any}</option>
            {[5, 4, 3, 2, 1].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-small text-muted">
          {c.filters.company}
          <select name="firma" defaultValue={one(params, 'firma') ?? ''} className={CONTROL}>
            <option value="">{c.filters.any}</option>
            {/* The same list the orders screen filters by: a firm with
                orders is a firm that can have ratings, and a second
                query would be a second answer to the same question. */}
            {companies.map((company) => (
              <option key={company.company_id} value={company.company_id}>
                {company.company_name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-body sm:mt-5">
          <input
            type="checkbox"
            name="ascunse"
            value="da"
            defaultChecked={one(params, 'ascunse') === 'da'}
          />
          {c.filters.hidden}
        </label>

        <label className="flex items-center gap-2 text-body sm:mt-5">
          <input
            type="checkbox"
            name="dispute"
            value="da"
            defaultChecked={one(params, 'dispute') === 'da'}
          />
          {c.filters.afterDispute}
        </label>

        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-4">
          <button type="submit" className={buttonClasses('primary', 'sm')}>
            {c.filters.apply}
          </button>
          <Link href={ROUTES.adminRatings} className={buttonClasses('secondary', 'sm')}>
            {c.filters.clear}
          </Link>
          <span className="text-small text-muted">{c.list.total(formatNumber(total))}</span>
        </div>
      </form>

      {error !== null ? (
        <p className="rounded-card border border-danger/40 bg-danger/8 p-4 text-body">{error}</p>
      ) : rows.length === 0 ? (
        <EmptyState figure="search" title={c.empty.title} body={c.empty.body} />
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-card border border-border bg-surface p-5">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <Stars score={row.score} />
                {row.hidden_at !== null ? (
                  <StatusBadge tone="danger">{c.list.hiddenLabel}</StatusBadge>
                ) : null}
                {row.after_dispute ? (
                  <StatusBadge tone="warning">{ratingsCopy.profile.afterDispute}</StatusBadge>
                ) : null}
                {row.report_count > 0 ? (
                  <StatusBadge tone="warning">{c.list.reports(row.report_count)}</StatusBadge>
                ) : null}
                <span className="text-small text-muted">
                  {row.rater_name ?? '—'} → {row.rated_name ?? '—'} · {formatMoment(row.created_at)}
                  {row.edited_at !== null ? ` · ${ratingsCopy.form.edited}` : ''}
                </span>
              </div>

              {row.comment !== null ? (
                <p className="mt-2 whitespace-pre-line break-words text-body">{row.comment}</p>
              ) : null}
              {row.was_masked ? (
                <p className="mt-1 text-small text-muted">{c.list.masked}</p>
              ) : null}

              {row.hidden_reason !== null ? (
                <p className="mt-2 rounded-input border border-border-strong bg-ground-alt px-3 py-2 text-small">
                  {row.hidden_reason}
                </p>
              ) : null}

              {row.reply_body !== null ? (
                <div className="mt-3 border-l-2 border-border-strong pl-3">
                  <p className="text-small font-medium text-muted">
                    {ratingsCopy.reply.label}
                    {row.reply_hidden_at !== null ? ` · ${c.list.hiddenLabel}` : ''}
                  </p>
                  <p className="mt-1 whitespace-pre-line break-words text-body">{row.reply_body}</p>
                  {row.reply_id !== null && row.reply_hidden_at === null ? (
                    <div className="mt-1.5">
                      <ModerateRating kind="hideReply" replyId={row.reply_id} />
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-small">
                <Link
                  href={adminOrderRoute(row.order_id)}
                  className="underline underline-offset-4"
                >
                  {c.list.order}
                </Link>
                <Link
                  href={`${adminOrderRoute(row.order_id)}#dovezi`}
                  className="text-muted underline underline-offset-4"
                >
                  {c.list.evidence}
                </Link>
                {row.rated_slug !== null ? (
                  <Link
                    href={companyRoute(row.rated_slug)}
                    className="text-muted underline underline-offset-4"
                  >
                    {ratingsCopy.profile.title}
                  </Link>
                ) : null}
                {row.hidden_at === null ? (
                  <ModerateRating kind="hide" ratingId={row.id} />
                ) : (
                  <ModerateRating kind="unhide" ratingId={row.id} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {lastPage > 1 ? (
        <nav aria-label={c.title} className="flex flex-wrap items-center gap-3 text-body">
          {page > 1 ? (
            <Link
              href={`${ROUTES.adminRatings}?pagina=${page - 1}`}
              className="underline underline-offset-4"
            >
              {ratingsCopy.profile.previous}
            </Link>
          ) : null}
          <span className="text-muted">{`${page} / ${lastPage}`}</span>
          {page < lastPage ? (
            <Link
              href={`${ROUTES.adminRatings}?pagina=${page + 1}`}
              className="underline underline-offset-4"
            >
              {ratingsCopy.profile.next}
            </Link>
          ) : null}
        </nav>
      ) : null}
    </div>
  );
}
