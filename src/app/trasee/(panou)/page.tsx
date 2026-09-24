import type { Metadata } from 'next';
import Link from 'next/link';
import { JourneyBanner } from '@/components/onboarding/journey-banner';
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
import { EmptyState as EmptyCard } from '@/components/ui/empty-state';
import { DEPARTURE_SORTS, SORT_KEY, parseSort } from '@/lib/board-simplicity';
import { sortDepartures } from '@/lib/board-sort';
import { loadJourney } from '@/lib/journey-source';
import { RememberBoard } from '@/components/continuity/board-memory';

export const metadata: Metadata = {
  title: 'Trasee disponibile',
  description:
    'Trasee publicate de transportatori pe rute din România și Europa. Vezi traseul, perioada și locurile rămase.',
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
  // One „now" for the whole page, so every card on it agrees.
  const now = new Date();

  // The same sentence as on /cereri, for the same reason: a carrier who
  // has just signed up is on a board, not on a form, and this is where
  // the remaining step has to be said.
  const journey = context?.profile?.account_type === 'company' ? await loadJourney(context) : null;

  return (
    <div className="mx-auto w-full max-w-[72rem] px-[clamp(16px,4vw,56px)] py-10 sm:py-14">
      {/* The way back from a detail page returns to these filters. */}
      <RememberBoard board={ROUTES.routes} />
      <header className="max-w-[46rem]">
        <h1 className="text-h1">{c.title}</h1>
        <p className="mt-3 text-body-lg text-muted">{c.lede}</p>
        {context === null ? <p className="mt-2 text-small text-muted">{c.signedOutNote}</p> : null}
      </header>

      <div className="mt-8 flex flex-col gap-8">
        {journey !== null && journey.stage !== 'verified' ? (
          <JourneyBanner stage={journey.stage} minutes={journey.minutes} back={ROUTES.routes} />
        ) : null}

        <aside className="rounded-card border border-border bg-surface p-5 shadow-card">
          <FiltersForm filters={filters} sort={sort} />
        </aside>

        <section aria-label={c.title}>
          {departures.length > 0 ? (
            <>
              <p className="mb-4 text-small text-muted">{c.count(departures.length)}</p>
              <ul className="flex flex-col gap-4">
                {departures.map((departure) => (
                  <DepartureCard key={departure.truck_listing_id} departure={departure} now={now} />
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
  const filtered = hasActiveFilters(filters);

  return (
    <div>
      {/* One sentence saying what will appear here, and one button. The
          screen used to carry two buttons, two alert forms, a paragraph
          and a link — five things to choose between, on the screen where
          a person has the least to go on. */}
      <EmptyCard
        figure="route"
        title={filtered ? c.filteredTitle : c.title}
        body={filtered ? c.filteredBody : c.body}
        action={
          filtered ? (
            <Link
              href={`${ROUTES.routes}${filtersToQuery({ ...EMPTY_FILTERS, tab: filters.tab })}`}
              className={buttonClasses('primary', 'md')}
            >
              {c.clear}
            </Link>
          ) : (
            <Link href={ROUTES.newRequest} className={buttonClasses('primary', 'md')}>
              {c.request}
            </Link>
          )
        }
      />

      {/* Nothing was removed, it moved one level down. Whoever is reading
          an empty board is either looking for a carrier — the button
          above — or is a carrier with nothing to look at, and that person
          wants to be told when a request appears on the corridor they
          just typed in rather than to come back and check. */}
      <details className="mt-4 rounded-input border border-border bg-ground-alt/60">
        <summary className="cursor-pointer list-none px-4 py-2.5 text-small font-medium">
          {c.more}
        </summary>
        <div className="flex flex-col gap-5 border-t border-border px-4 py-4">
          <SavedSearchButton filters={filters} signedIn={signedIn} />
          <div>
            <p className="mb-3 max-w-[58ch] text-small text-muted">{c.carrierAlert}</p>
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
        </div>
      </details>
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
