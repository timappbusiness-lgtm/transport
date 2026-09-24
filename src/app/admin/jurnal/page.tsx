import Link from 'next/link';
import { AuditEntryRow } from '@/components/admin/audit-entry';
import { buttonClasses } from '@/components/ui/button';
import { FilterField, FilterPanel } from '@/components/ui/filter-panel';
import { EyebrowPill } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { filtersCopy } from '@/content/filtre';
import { auditCopy } from '@/content/jurnal';
import { AUDIT_PAGE_SIZE, loadAuditFacets, loadAuditPage, type AuditQuery } from '@/lib/audit-source';
import { chipsFromParams, paramsFromSearch, periodChipDefs } from '@/lib/filter-disclosure';
import { formatNumber } from '@/lib/requests';
import { EmptyState } from '@/components/ui/empty-state';

export const dynamic = 'force-dynamic';

const c = auditCopy;
const CONTROL = 'w-full rounded-input border border-border-strong bg-surface px-3 py-2 text-body';

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
  // A page past the end is a dead end too, so it counts as „narrowed":
  // without it somebody who typed ?p=99 gets an empty screen with no way
  // back to the list.
  const filtered = toSearch(query, 1) !== '' || query.page > 1;

  const actions = facets.filter((facet) => facet.kind === 'action');
  const entities = facets.filter((facet) => facet.kind === 'entity');

  return (
    <div className="flex flex-col gap-6">
      <div>
        <EyebrowPill>{c.hero.eyebrow}</EyebrowPill>
        <h1 className="mt-2 text-h2">{c.hero.title}</h1>
        <p className="mt-2 max-w-[62ch] text-body text-muted">{c.hero.lede}</p>
      </div>

      <div className="rounded-card border border-border bg-surface p-5">
        <h2 className="mb-4 text-body font-medium">{c.filters.title}</h2>
        {/* What, on what, by whom — the three questions an entry answers.
            The period narrows them and waits, closed. */}
        <FilterPanel
          action={ROUTES.adminAuditLog}
          screen="admin-jurnal"
          chips={chipsFromParams(
            ROUTES.adminAuditLog,
            paramsFromSearch(toSearch(query, 1)),
            periodChipDefs(c.filters.from, c.filters.to),
            'p',
          )}
          canReset={filtered}
          resetHref={ROUTES.adminAuditLog}
          labels={{
            more: filtersCopy.more,
            active: filtersCopy.active,
            apply: c.filters.apply,
            clear: c.filters.clear,
          }}
          simple={
            <>
              <FilterField id="ja-action" label={c.filters.action}>
                <select id="ja-action" name="actiune" defaultValue={query.action ?? ''} className={CONTROL}>
                  <option value="">{c.filters.any}</option>
                  {actions.map((facet) => (
                    <option key={facet.value} value={facet.value}>
                      {facet.value} ({facet.occurrences})
                    </option>
                  ))}
                </select>
              </FilterField>

              <FilterField id="ja-entity" label={c.filters.entity}>
                <select id="ja-entity" name="entitate" defaultValue={query.entity ?? ''} className={CONTROL}>
                  <option value="">{c.filters.any}</option>
                  {entities.map((facet) => (
                    <option key={facet.value} value={facet.value}>
                      {facet.value} ({facet.occurrences})
                    </option>
                  ))}
                </select>
              </FilterField>

              <FilterField id="ja-actor" label={c.filters.actor} hint={c.filters.actorHint}>
                <input
                  id="ja-actor"
                  name="autor"
                  defaultValue={query.actor ?? ''}
                  placeholder="00000000-0000-0000-0000-000000000000"
                  className={`${CONTROL} font-mono text-small`}
                />
              </FilterField>
            </>
          }
          advanced={
            <div className="grid gap-3 sm:grid-cols-2">
              <FilterField id="ja-from" label={c.filters.from}>
                <input id="ja-from" name="de-la" type="date" defaultValue={query.from ?? ''} className={CONTROL} />
              </FilterField>
              <FilterField id="ja-to" label={c.filters.to}>
                <input id="ja-to" name="pana-la" type="date" defaultValue={query.to ?? ''} className={CONTROL} />
              </FilterField>
            </div>
          }
        >
          <a
            href={`${ROUTES.adminAuditLog}/export${toSearch(query, 1)}`}
            className={buttonClasses('secondary', 'sm')}
          >
            {c.filters.export}
          </a>
        </FilterPanel>
        <p className="mt-2 text-small text-muted">{c.filters.exportHint}</p>
      </div>

      {page.error !== null ? (
        <p role="alert" className="rounded-card border border-danger/45 bg-danger/8 p-4 text-body">
          Nu se poate citi jurnalul acum.
        </p>
      ) : null}

      {/* A failed read already says so above; an empty state under it
          would claim there is nothing, which nobody knows. */}
      {page.error !== null ? null : page.entries.length === 0 ? (
        <EmptyState
          figure={filtered ? 'search' : 'list'}
          title={c.empty.title}
          body={c.empty.body}
          action={
            filtered ? (
              <Link href={ROUTES.adminAuditLog} className={buttonClasses('secondary', 'sm')}>
                {c.empty.action}
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
