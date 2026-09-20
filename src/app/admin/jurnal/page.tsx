import Link from 'next/link';
import { AuditEntryRow } from '@/components/admin/audit-entry';
import { buttonClasses } from '@/components/ui/button';
import { EyebrowPill } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { auditCopy } from '@/content/jurnal';
import { AUDIT_PAGE_SIZE, loadAuditFacets, loadAuditPage, type AuditQuery } from '@/lib/audit-source';
import { formatNumber } from '@/lib/requests';

export const dynamic = 'force-dynamic';

const c = auditCopy;
const CONTROL = 'w-full rounded-input border border-border-strong bg-surface px-3 py-2 text-sm';

type Params = Record<string, string | string[] | undefined>;

function one(params: Params, key: string): string | null {
  const value = params[key];
  const text = Array.isArray(value) ? value[0] : value;
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  return trimmed === '' ? null : trimmed;
}

/** A uuid or nothing: the actor filter goes straight into a uuid parameter. */
function uuid(value: string | null): string | null {
  if (value === null) return null;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function isoDay(value: string | null): string | null {
  return value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function queryFrom(params: Params): AuditQuery {
  const page = Number(one(params, 'p') ?? '1');
  return {
    actor: uuid(one(params, 'autor')),
    action: one(params, 'actiune'),
    entity: one(params, 'entitate'),
    from: isoDay(one(params, 'de-la')),
    to: isoDay(one(params, 'pana-la')),
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
  };
}

function toSearch(query: AuditQuery, page: number): string {
  const search = new URLSearchParams();
  if (query.actor) search.set('autor', query.actor);
  if (query.action) search.set('actiune', query.action);
  if (query.entity) search.set('entitate', query.entity);
  if (query.from) search.set('de-la', query.from);
  if (query.to) search.set('pana-la', query.to);
  if (page > 1) search.set('p', String(page));
  const text = search.toString();
  return text === '' ? '' : `?${text}`;
}

/**
 * Jurnal de acțiuni.
 *
 * The whole point is that it is read-only: there is no action on this
 * page that writes anything, and the table has allowed nobody to write
 * to it through the API since phase 0. What it adds over a SQL console
 * is the diff — the fields that changed, with the timestamps every
 * update touches left out.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const query = queryFrom(params);

  const [page, facets] = await Promise.all([loadAuditPage(query), loadAuditFacets()]);
  const lastPage = Math.max(1, Math.ceil(page.total / AUDIT_PAGE_SIZE));
  const filtered = toSearch(query, 1) !== '';

  const actions = facets.filter((facet) => facet.kind === 'action');
  const entities = facets.filter((facet) => facet.kind === 'entity');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <EyebrowPill>{c.hero.eyebrow}</EyebrowPill>
        <h1 className="mt-2 text-[clamp(1.5rem,4vw,2rem)]">{c.hero.title}</h1>
        <p className="mt-2 max-w-[62ch] text-sm text-muted">{c.hero.lede}</p>
      </div>

      <form
        method="get"
        action={ROUTES.adminAuditLog}
        className="rounded-card border border-border bg-surface p-5"
      >
        <h2 className="mb-4 text-sm font-medium">{c.filters.title}</h2>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="ja-action" className="text-xs font-medium">
              {c.filters.action}
            </label>
            <select
              id="ja-action"
              name="actiune"
              defaultValue={query.action ?? ''}
              className={CONTROL}
            >
              <option value="">{c.filters.any}</option>
              {actions.map((facet) => (
                <option key={facet.value} value={facet.value}>
                  {facet.value} ({facet.occurrences})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="ja-entity" className="text-xs font-medium">
              {c.filters.entity}
            </label>
            <select
              id="ja-entity"
              name="entitate"
              defaultValue={query.entity ?? ''}
              className={CONTROL}
            >
              <option value="">{c.filters.any}</option>
              {entities.map((facet) => (
                <option key={facet.value} value={facet.value}>
                  {facet.value} ({facet.occurrences})
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="ja-actor" className="text-xs font-medium">
              {c.filters.actor}
            </label>
            <input
              id="ja-actor"
              name="autor"
              defaultValue={query.actor ?? ''}
              placeholder="00000000-0000-0000-0000-000000000000"
              className={`${CONTROL} font-mono text-xs`}
            />
            <p className="text-xs text-muted">{c.filters.actorHint}</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="ja-from" className="text-xs font-medium">
              {c.filters.from}
            </label>
            <input
              id="ja-from"
              name="de-la"
              type="date"
              defaultValue={query.from ?? ''}
              className={CONTROL}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="ja-to" className="text-xs font-medium">
              {c.filters.to}
            </label>
            <input
              id="ja-to"
              name="pana-la"
              type="date"
              defaultValue={query.to ?? ''}
              className={CONTROL}
            />
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="submit" className={buttonClasses('primary', 'sm')}>
            {c.filters.apply}
          </button>
          <a
            href={`${ROUTES.adminAuditLog}/export${toSearch(query, 1)}`}
            className={buttonClasses('secondary', 'sm')}
          >
            {c.filters.export}
          </a>
          {filtered ? (
            <a
              href={ROUTES.adminAuditLog}
              className="text-sm text-muted underline-offset-4 hover:underline"
            >
              {c.filters.clear}
            </a>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-muted">{c.filters.exportHint}</p>
      </form>

      {page.error !== null ? (
        <p role="alert" className="rounded-card border border-danger/45 bg-danger/8 p-4 text-sm">
          Nu se poate citi jurnalul acum.
        </p>
      ) : null}

      {page.entries.length === 0 ? (
        <div className="rounded-card border border-dashed border-border-strong bg-surface p-6 sm:p-8">
          <h2 className="text-[1.0625rem]">{c.empty.title}</h2>
          <p className="mt-2 max-w-[54ch] text-sm text-muted">{c.empty.body}</p>
          {filtered ? (
            <p className="mt-5 text-sm">
              <Link href={ROUTES.adminAuditLog} className="underline underline-offset-4">
                {c.empty.action}
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
            {page.entries.map((entry) => (
              <AuditEntryRow key={entry.id} entry={entry} />
            ))}
          </ul>

          <nav aria-label="Paginare" className="flex flex-wrap items-center gap-3">
            {query.page > 1 ? (
              <Link
                href={`${ROUTES.adminAuditLog}${toSearch(query, query.page - 1)}`}
                className={buttonClasses('secondary', 'sm')}
              >
                {c.list.previous}
              </Link>
            ) : null}
            {query.page < lastPage ? (
              <Link
                href={`${ROUTES.adminAuditLog}${toSearch(query, query.page + 1)}`}
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
