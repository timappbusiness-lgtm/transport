import type { Metadata } from 'next';
import Link from 'next/link';
import { DepartureCard } from '@/components/departures/departure-card';
import { FiltersForm } from '@/components/departures/filters-form';
import { SavedSearchButton } from '@/components/departures/saved-search-button';
import { buttonClasses } from '@/components/ui/button';
import { EyebrowPill, Headline, Lede } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { departuresCopy } from '@/content/departures';
import { getAccountContext } from '@/lib/auth/account';
import {
  EMPTY_FILTERS,
  filtersToQuery,
  hasActiveFilters,
  parseFilters,
  tabDirection,
  type Tab,
} from '@/lib/departure-filters';
import type { PublicDeparture } from '@/lib/departures';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Trasee disponibile',
  description:
    'Platforme auto cu locuri libere pe rute din România și Europa. Vezi traseul, perioada și locurile rămase.',
};

const TABS: readonly Tab[] = ['toate', 'tur', 'retur'];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseFilters(params);
  const c = departuresCopy.board;

  const [departures, context] = await Promise.all([loadDepartures(filters), getAccountContext()]);

  return (
    <div className="mx-auto w-full max-w-[72rem] px-[clamp(16px,4vw,56px)] py-10 sm:py-14">
      <header className="max-w-[46rem]">
        <EyebrowPill>{c.eyebrow}</EyebrowPill>
        <Headline strong={c.title} soft={c.titleSoft} className="mt-5" />
        <Lede className="mt-4">{c.lede}</Lede>
        {context === null ? (
          <p className="mt-3 text-sm text-muted">{c.signedOutNote}</p>
        ) : null}
      </header>

      <nav aria-label={departuresCopy.board.title} className="mt-8 flex flex-wrap gap-1.5">
        {TABS.map((tab) => {
          const href = `${ROUTES.routes}${filtersToQuery({ ...filters, tab })}`;
          const active = filters.tab === tab;
          return (
            <Link
              key={tab}
              href={href === `${ROUTES.routes}` ? ROUTES.routes : href}
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
          <h2 className="mb-4 text-sm font-medium">{departuresCopy.filters.title}</h2>
          <FiltersForm filters={filters} />
        </aside>

        <section aria-label={c.title}>
          {departures.length > 0 ? (
            <>
              <p className="mb-4 text-sm text-muted">
                {c.count(departures.length)} · {c.sortNote}
              </p>
              <ul className="flex flex-col gap-4">
                {departures.map((departure) => (
                  <DepartureCard key={departure.truck_listing_id} departure={departure} />
                ))}
              </ul>
            </>
          ) : (
            <EmptyState filters={filters} signedIn={context !== null} />
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * The empty state is the common case at launch, so it is a real screen
 * rather than a shrug: one way to create demand, one way to be told when
 * supply arrives.
 */
function EmptyState({
  filters,
  signedIn,
}: {
  filters: ReturnType<typeof parseFilters>;
  signedIn: boolean;
}) {
  const c = departuresCopy.empty;
  return (
    <div className="rounded-card border border-border bg-surface p-6 sm:p-8">
      <h2 className="text-[1.125rem]">{c.title}</h2>
      <p className="mt-2 max-w-[54ch] text-sm text-muted">{c.body}</p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href={ROUTES.newRequest} className={buttonClasses('primary', 'md')}>
          {c.request}
        </Link>
        <SavedSearchButton filters={filters} signedIn={signedIn} />
      </div>

      {hasActiveFilters(filters) ? (
        <p className="mt-5 text-sm">
          <Link
            href={`${ROUTES.routes}${filtersToQuery({ ...EMPTY_FILTERS, tab: filters.tab })}`}
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
 * The board reads `v_departures_public` — city level, no company — so this
 * query is identical for a visitor and for a signed-in carrier. Who is
 * driving is added on the detail page, and only with a session.
 */
async function loadDepartures(
  filters: ReturnType<typeof parseFilters>,
): Promise<PublicDeparture[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  let query = supabase
    .from('v_departures_public')
    .select('*')
    .order('available_from', { ascending: true })
    .limit(60);

  const direction = tabDirection(filters.tab);
  if (direction) query = query.eq('direction', direction);
  if (filters.fromCountry) query = query.eq('from_country', filters.fromCountry);
  if (filters.toCountry) query = query.eq('to_country', filters.toCountry);
  if (filters.fromCounty) query = query.ilike('from_county', filters.fromCounty);
  if (filters.toCounty) query = query.ilike('to_county', filters.toCounty);
  // The window overlaps the range asked for, rather than starting inside it:
  // a route running 12–20 March is a match for someone searching 15 March.
  if (filters.dateFrom) {
    query = query.or(`available_to.gte.${filters.dateFrom},available_to.is.null`);
  }
  if (filters.dateTo) query = query.lte('available_from', filters.dateTo);
  if (filters.minSeats !== null) query = query.gte('slots_free', filters.minSeats);
  if (filters.vehicleType) query = query.contains('accepted_vehicle_types', [filters.vehicleType]);

  const { data, error } = await query;
  if (error) {
    console.error('[trasee] board query failed', { code: error.code, message: error.message });
    return [];
  }
  return (data ?? []) as PublicDeparture[];
}
