import type { Metadata } from 'next';
import Link from 'next/link';
import { BoardFilters } from '@/components/requests/board-filters';
import { BoardRequestCard } from '@/components/requests/board-card';
import { buttonClasses } from '@/components/ui/button';
import { EyebrowPill, Headline, Lede } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { requestsCopy } from '@/content/cereri';
import { getAccountContext } from '@/lib/auth/account';
import {
  EMPTY_REQUEST_FILTERS,
  conditionIsRunning,
  hasActiveRequestFilters,
  parseRequestFilters,
  requestFiltersToQuery,
  tabBoard,
  type RequestFilters,
  type Tab,
} from '@/lib/request-filters';
import type { PublicRequest } from '@/lib/requests';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Cereri de transport',
  description:
    'Vehicule care așteaptă un transportator, cu ruta, perioada de încărcare și starea lor. Filtrează după traseu, dată și categorie.',
};

const TABS: readonly Tab[] = ['toate', 'curse', 'retur'];
const BOARD_LIMIT = 60;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseRequestFilters(await searchParams);
  const c = requestsCopy.board;

  const [requests, context] = await Promise.all([loadRequests(filters), getAccountContext()]);

  return (
    <div className="mx-auto w-full max-w-[72rem] px-[clamp(16px,4vw,56px)] py-10 sm:py-14">
      <header className="max-w-[46rem]">
        <EyebrowPill>{c.eyebrow}</EyebrowPill>
        <Headline as="h1" strong={c.title} soft={c.titleSoft} className="mt-5" />
        <Lede className="mt-4">{c.lede}</Lede>
        {context === null ? <p className="mt-3 text-sm text-muted">{c.signedOutNote}</p> : null}
      </header>

      <nav aria-label={c.eyebrow} className="mt-8 flex flex-wrap gap-1.5">
        {TABS.map((tab) => {
          const query = requestFiltersToQuery({ ...filters, tab });
          const active = filters.tab === tab;
          return (
            <Link
              key={tab}
              href={`${ROUTES.requests}${query}`}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'rounded-pill border px-4 py-1.5 text-sm',
                active
                  ? 'border-foreground bg-foreground text-white'
                  : 'border-border text-muted hover:border-border-strong',
              )}
            >
              {c.tabs[tab]}
            </Link>
          );
        })}
      </nav>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
        <aside className="rounded-card border border-border bg-surface p-5 lg:sticky lg:top-24 lg:self-start">
          <h2 className="mb-4 text-sm font-medium">{requestsCopy.filters.title}</h2>
          <BoardFilters filters={filters} />
        </aside>

        <section aria-label={c.title}>
          {requests.length > 0 ? (
            <>
              <p className="mb-4 text-sm text-muted">
                {c.count(requests.length)} · {c.sortNote}
              </p>
              <ul className="flex flex-col gap-4">
                {requests.map((request) => (
                  <BoardRequestCard key={request.id} request={request} />
                ))}
              </ul>
            </>
          ) : (
            <EmptyState filters={filters} />
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * The empty state is the common case at launch, so it is a real screen
 * rather than a shrug — and the one action it offers is the one that makes
 * the board fill up.
 */
function EmptyState({ filters }: { filters: RequestFilters }) {
  const c = requestsCopy.empty;
  return (
    <div className="rounded-card border border-border bg-surface p-6 sm:p-8">
      <h2 className="text-[1.125rem]">{c.title}</h2>
      <p className="mt-2 max-w-[54ch] text-sm text-muted">{c.body}</p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href={ROUTES.newRequest} className={buttonClasses('primary', 'md')}>
          {requestsCopy.board.publish}
        </Link>
      </div>

      {hasActiveRequestFilters(filters) ? (
        <p className="mt-5 text-sm">
          <Link
            href={`${ROUTES.requests}${requestFiltersToQuery({
              ...EMPTY_REQUEST_FILTERS,
              tab: filters.tab,
            })}`}
            className="text-foreground underline underline-offset-4 decoration-border-strong hover:decoration-foreground"
          >
            {c.clear}
          </Link>
        </p>
      ) : null}
    </div>
  );
}

/**
 * The board reads `v_requests_public` — locality level, no owner — so the
 * query is identical for a visitor and for a signed-in carrier. What a
 * session adds is on the detail page, and what a plan adds is the contact.
 */
async function loadRequests(filters: RequestFilters): Promise<PublicRequest[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  let query = supabase
    .from('v_requests_public')
    .select('*')
    .order('loading_from', { ascending: true })
    .limit(BOARD_LIMIT);

  const board = tabBoard(filters.tab);
  if (board) query = query.eq('board', board);
  if (filters.fromCountry) query = query.eq('from_country', filters.fromCountry);
  if (filters.toCountry) query = query.eq('to_country', filters.toCountry);
  if (filters.fromCity) query = query.ilike('from_city', filters.fromCity);
  if (filters.toCity) query = query.ilike('to_city', filters.toCity);
  // The loading window overlaps the range asked for, rather than starting
  // inside it: a car loadable 12–20 March answers somebody searching 15.
  if (filters.dateFrom) {
    query = query.or(`loading_to.gte.${filters.dateFrom},loading_to.is.null`);
  }
  if (filters.dateTo) query = query.lte('loading_from', filters.dateTo);
  if (filters.category) query = query.eq('category', filters.category);

  const running = conditionIsRunning(filters.condition);
  if (running !== null) query = query.eq('is_running', running);
  if (filters.scope) query = query.eq('is_domestic', filters.scope === 'intern');

  const { data, error } = await query;
  if (error) {
    console.error('[cereri] board query failed', { code: error.code, message: error.message });
    return [];
  }
  return (data ?? []) as PublicRequest[];
}
