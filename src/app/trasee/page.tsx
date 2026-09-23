import type { Metadata } from 'next';
import Link from 'next/link';
import { DepartureCard } from '@/components/departures/departure-card';
import { FiltersForm } from '@/components/departures/filters-form';
import { SavedSearchButton } from '@/components/departures/saved-search-button';
import { SaveSearch } from '@/components/requests/save-search';
import { buttonClasses } from '@/components/ui/button';
import { ROUTES } from '@/config/routes';
import { departuresCopy } from '@/content/departures';
import { getAccountContext } from '@/lib/auth/account';
import { filtersFromBoard } from '@/lib/saved-searches';
import {
  EMPTY_FILTERS,
  filtersToQuery,
  hasActiveFilters,
  parseFilters,
  tabDirection,
} from '@/lib/departure-filters';
import type { PublicDeparture } from '@/lib/departures';
import { boundingBox, withinRadius } from '@/lib/radius';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { EmptyFigure } from '@/components/ui/empty-state';
import { DEPARTURE_SORTS, SORT_KEY, parseSort } from '@/lib/board-simplicity';
import { sortDepartures } from '@/lib/board-sort';

export const metadata: Metadata = {
  title: 'Trasee disponibile',
  description:
    'Platforme auto cu locuri libere pe rute din România și Europa. Vezi traseul, perioada și locurile rămase.',
};

const BOARD_LIMIT = 60;

/**
 * How many rows the radius filter looks at.
 *
 * The bounding box goes into the query, the exact circle is applied to
 * what comes back, so the window decides how much the circle can find.
 * The same reasoning and the same number as „potrivite cu firma mea"
 * on the request board.
 */
const RADIUS_SCAN_LIMIT = 200;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseFilters(params);
  const sort = parseSort(typeof params[SORT_KEY] === 'string' ? (params[SORT_KEY] as string) : null, DEPARTURE_SORTS);
  const c = departuresCopy.board;

  const [loaded, context] = await Promise.all([loadDepartures(filters), getAccountContext()]);
  const departures = sortDepartures(loaded, sort);

  return (
    <div className="mx-auto w-full max-w-[72rem] px-[clamp(16px,4vw,56px)] py-10 sm:py-14">
      <header className="max-w-[46rem]">
        <h1 className="text-h1">{c.title}</h1>
        <p className="mt-3 text-body-lg text-muted">{c.lede}</p>
        {context === null ? <p className="mt-2 text-small text-muted">{c.signedOutNote}</p> : null}
      </header>

      <div className="mt-8 flex flex-col gap-8">
        <aside className="rounded-card border border-border bg-surface p-5 shadow-card">
          <FiltersForm filters={filters} sort={sort} />
        </aside>

        <section aria-label={c.title}>
          {departures.length > 0 ? (
            <>
              <p className="mb-4 text-small text-muted">{c.count(departures.length)}</p>
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
    <div className="rounded-card border border-border bg-surface p-6 shadow-card sm:p-8">
      <EmptyFigure kind="route" className="mb-4" />
      <h2 className="text-lg">{c.title}</h2>
      <p className="mt-2 max-w-[54ch] text-sm text-muted">{c.body}</p>

      <div className="mt-6 flex flex-wrap gap-3">
        <Link href={ROUTES.newRequest} className={buttonClasses('primary', 'md')}>
          {c.request}
        </Link>
        <SavedSearchButton filters={filters} signedIn={signedIn} />
      </div>

      {/* The other half of an empty board. Whoever is reading this is
          either looking for a carrier — the button above — or is a
          carrier with nothing to look at, and that person wants to be
          told when a request appears on the corridor they just typed
          in, not to come back and check. */}
      <div className="mt-6 border-t border-border pt-5">
        <p className="mb-3 max-w-[58ch] text-sm text-muted">{c.carrierAlert}</p>
        <SaveSearch
          filters={filtersFromBoard({
            fromCountry: filters.fromCountry,
            fromCounty: filters.fromCounty,
            toCountry: filters.toCountry,
            toCounty: filters.toCounty,
            category: filters.vehicleType,
            scope: filters.scope,
          })}
          signedIn={signedIn}
          label={c.carrierAlertAction}
        />
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
  // A radius is applied twice: the box narrows the query, the circle
  // narrows what came back. The box has corners the circle never
  // reaches, so skipping the second step would show a client a platform
  // further away than they asked for. Scanning wider when a radius is
  // set is the same trade the „firma mea" filter already makes.
  const box = filters.near && filters.radiusKm
    ? boundingBox(filters.near, filters.radiusKm)
    : null;

  let query = supabase
    .from('v_departures_public')
    .select('*')
    .order('available_from', { ascending: true })
    .limit(box ? RADIUS_SCAN_LIMIT : BOARD_LIMIT);

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
  // is_domestic is computed in the view, so "intern" means the same thing
  // here as it does on a company profile.
  if (filters.scope) query = query.eq('is_domestic', filters.scope === 'intern');
  // A platform that never wrote down its free capacity stays in the
  // list: the field is new, and hiding a route nobody measured helps
  // nobody. `saved_search_match` reads it the same way.
  if (filters.minCapacityKg !== null) {
    query = query.or(
      `free_capacity_kg.gte.${filters.minCapacityKg},free_capacity_kg.is.null`,
    );
  }
  if (box) {
    query = query
      .gte('from_locality_lat', box.minLat)
      .lte('from_locality_lat', box.maxLat)
      .gte('from_locality_lng', box.minLng)
      .lte('from_locality_lng', box.maxLng);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[trasee] board query failed', { code: error.code, message: error.message });
    return [];
  }

  const rows = (data ?? []) as PublicDeparture[];
  if (!box || filters.near === null || filters.radiusKm === null) return rows;

  return rows
    .filter((row) =>
      withinRadius(
        filters.near as NonNullable<typeof filters.near>,
        { lat: row.from_locality_lat, lng: row.from_locality_lng },
        filters.radiusKm as number,
      ),
    )
    .slice(0, BOARD_LIMIT);
}
