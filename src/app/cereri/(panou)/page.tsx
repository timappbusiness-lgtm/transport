import type { Metadata } from 'next';
import Link from 'next/link';
import { BoardFilters } from '@/components/requests/board-filters';
import { SaveSearch } from '@/components/requests/save-search';
import { BoardRequestCard } from '@/components/requests/board-card';
import { EmptyState as EmptyCard } from '@/components/ui/empty-state';
import { CarrierBanner } from '@/components/onboarding/carrier-banner';
import { buttonClasses } from '@/components/ui/button';
import { ROUTES } from '@/config/routes';
import { appCopy } from '@/content/app';
import { requestsCopy } from '@/content/cereri';
import { getAccountContext, type Company } from '@/lib/auth/account';
import { ROUTE_COLUMNS, toCarrierRoutes } from '@/lib/dashboard-source';
import {
  bestRouteDetour,
  carries,
  detourOk,
  type CarrierProfile,
  type CarrierRoute,
  type DetourFit,
} from '@/lib/matching';
import { loadDetourSettings } from '@/lib/matching-settings-source';
import { filtersFromBoard } from '@/lib/saved-searches';
import {
  EMPTY_REQUEST_FILTERS,
  conditionIsRunning,
  hasActiveRequestFilters,
  parseRequestFilters,
  requestFiltersToQuery,
  tabBoard,
  type RequestFilters,
} from '@/lib/request-filters';
import { cityValue } from '@/lib/cities';
import { boundingBox, withinRadius } from '@/lib/radius';
import type { PublicRequest } from '@/lib/requests';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { REQUEST_SORTS, SORT_KEY, parseSort } from '@/lib/board-simplicity';
import { sortRequests } from '@/lib/board-sort';
import { carrierStage } from '@/lib/carrier-onboarding';

export const metadata: Metadata = {
  title: 'Cereri de transport',
  description:
    'Vehicule care așteaptă un transportator, cu ruta, perioada de încărcare și starea lor. Filtrează după traseu, dată și categorie.',
};

const BOARD_LIMIT = 60;

/**
 * How many rows the two filters that finish in this file look at.
 *
 * „Potrivite cu firma mea" runs after the query because coverage,
 * categories, equipment and the detour are not columns on the board
 * view. The radius runs after it too, because a great-circle distance
 * is not a column either — the query narrows to a bounding box and the
 * circle is applied here.
 *
 * Sixty would mean a firm matching one row in twenty sees three matches
 * and concludes the board is empty for them. Two hundred is still one
 * page of rows from Postgres and gives both filters something to work
 * with; the count on screen says which window it examined rather than
 * implying it saw everything.
 */
const SCAN_LIMIT = 200;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const filters = parseRequestFilters(params);
  const sort = parseSort(typeof params[SORT_KEY] === 'string' ? (params[SORT_KEY] as string) : null, REQUEST_SORTS);
  const c = requestsCopy.board;

  const widened = filters.mine || filters.near !== null;
  const [all, context] = await Promise.all([
    loadRequests(filters, widened ? SCAN_LIMIT : BOARD_LIMIT),
    getAccountContext(),
  ]);

  // „Doar cele potrivite cu firma mea" is applied here rather than in the
  // query: what a firm carries is coverage, categories, equipment and the
  // detour its own routes allow, and none of those are columns on the
  // board view. The rule is `src/lib/matching.ts` — the same one the
  // dashboard and the alert e-mails use, so the three cannot disagree.
  const company = context?.activeCompany ?? null;
  const canFilterByCompany = company !== null && company.company_type !== 'expeditie';
  const applyMine = filters.mine && canFilterByCompany;
  const mine = applyMine ? await onlyForCompany(all, company) : null;
  const requests = sortRequests(mine?.requests ?? all, sort).slice(0, BOARD_LIMIT);
  // One „now" for the whole page, so every card on it agrees.
  const now = new Date();

  // A carrier who has just signed up lands here rather than on a form,
  // so the board is where the remaining step has to be said.
  const stage =
    context?.profile?.account_type === 'company' ? carrierStage(companyState(company)) : 'ready';

  return (
    <div className="mx-auto w-full max-w-[72rem] px-[clamp(16px,4vw,56px)] py-10 sm:py-14">
      <header className="max-w-[46rem]">
        <h1 className="text-h1">{c.title}</h1>
        <p className="mt-3 text-body-lg text-muted">{c.lede}</p>
        {context === null ? <p className="mt-2 text-small text-muted">{c.signedOutNote}</p> : null}
      </header>

      <div className="mt-8 flex flex-col gap-8">
        {stage === 'ready' ? null : <CarrierBanner stage={stage} />}
        <aside className="rounded-card border border-border bg-surface p-5 shadow-card">
          {/* Whatever is filtered right now is what a saved search would
              watch, so it sits beside „Caută" — as a text link, not a
              second button. A bordered control on its own row under the
              filters is a fourth thing to decide about above the list. */}
          <BoardFilters filters={filters} sort={sort} showMine={canFilterByCompany}>
            <SaveSearch
              filters={filtersFromBoard({
                fromCountry: filters.fromCountry,
                toCountry: filters.toCountry,
                category: filters.category,
                condition: filters.condition,
                service: filters.service,
                scope: filters.scope,
                near: filters.near ? cityValue(filters.near) : null,
                radiusKm: filters.radiusKm === null ? null : String(filters.radiusKm),
                maxWeightKg: filters.maxWeightKg === null ? null : String(filters.maxWeightKg),
              })}
              signedIn={context !== null}
              variant="quiet"
            />
          </BoardFilters>
        </aside>

        <section aria-label={c.title}>
          {filters.mine && !canFilterByCompany ? (
            <p className="mb-4 rounded-card border border-border bg-surface p-4 text-sm text-muted">
              {requestsCopy.filters.mineNoCompany}
            </p>
          ) : null}

          {requests.length > 0 ? (
            <>
              <p className="mb-4 text-small text-muted">
                {mine === null
                  ? c.count(requests.length)
                  : requestsCopy.filters.mineCount(mine.requests.length, all.length)}
              </p>
              <ul className="flex flex-col gap-4">
                {requests.map((request) => (
                  <BoardRequestCard
                    key={request.id}
                    request={request}
                    now={now}
                    // The tolerance is what decided this card was here, so
                    // it says so rather than leaving the carrier to wonder
                    // why a Hamburg run is on their list.
                    {...detourNote(mine?.detours[request.id])}
                  />
                ))}
              </ul>
            </>
          ) : applyMine ? (
            <MineEmptyState filters={filters} />
          ) : (
            <EmptyState filters={filters} signedIn={context !== null} />
          )}
        </section>
      </div>
    </div>
  );
}

/** The two fields `carrierStage` reads, or null when there is no firm. */
function companyState(company: Company | null) {
  return company === null
    ? null
    : { verificationStatus: company.verification_status, isSuspended: company.is_suspended };
}

/**
 * The empty state is the common case at launch, so it is a real screen
 * rather than a shrug — and the one action it offers is the one that makes
 * the board fill up.
 */
function EmptyState({ filters, signedIn }: { filters: RequestFilters; signedIn: boolean }) {
  const c = requestsCopy.empty;
  const filtered = hasActiveRequestFilters(filters);

  return (
    <div>
      {/* One sentence saying what will appear here, and one button. It
          used to be two buttons, a three-clause paragraph, an alert form
          and a link — five things to choose between, on the screen where
          a person has the least to go on. */}
      <EmptyCard
        figure="list"
        title={filtered ? c.filteredTitle : c.title}
        body={filtered ? c.filteredBody : c.body}
        action={
          filtered ? (
            <Link
              href={`${ROUTES.requests}${requestFiltersToQuery({
                ...EMPTY_REQUEST_FILTERS,
                tab: filters.tab,
              })}`}
              className={buttonClasses('primary', 'md')}
            >
              {c.clear}
            </Link>
          ) : (
            <Link href={ROUTES.newRequest} className={buttonClasses('primary', 'md')}>
              {c.publish}
            </Link>
          )
        }
      />

      {/* Nothing was removed, it moved one level down. A carrier who
          finds the board empty did not come here to publish a request:
          the other board is what they came for, and being told when one
          appears beats coming back to check. */}
      <details className="mt-4 rounded-input border border-border bg-ground-alt/60">
        <summary className="cursor-pointer list-none px-4 py-2.5 text-small font-medium">
          {c.more}
        </summary>
        <div className="flex flex-col gap-5 border-t border-border px-4 py-4">
          <p className="text-small">
            <Link href={ROUTES.routes} className="link-accent">
              {c.departures}
            </Link>
          </p>
          <SaveSearch
            filters={filtersFromBoard({
              fromCountry: filters.fromCountry,
              toCountry: filters.toCountry,
              category: filters.category,
              condition: filters.condition,
              service: filters.service,
              scope: filters.scope,
            })}
            signedIn={signedIn}
            label="Anunță-mă când apare ceva"
          />
        </div>
      </details>
    </div>
  );
}

/** The detour sentence as a prop, or no prop at all when there is none. */
function detourNote(fit: DetourFit | undefined): { note?: string } {
  if (fit === undefined) return {};
  return {
    note: appCopy.carrier.matches.detour(
      fit.detourKm,
      fit.toleranceKm,
      fit.fromCity,
      fit.toCity,
    ),
  };
}

/**
 * The board narrowed to what this firm can actually do.
 *
 * Two rules, both from `src/lib/matching.ts`: `carries()` for coverage,
 * categories and equipment, and the detour for how far off the firm's
 * own published routes each request sits. A firm with no measurable
 * route keeps every request `carries()` allowed — unmeasured is not the
 * same as unsuitable.
 */
async function onlyForCompany(
  requests: readonly PublicRequest[],
  company: Company,
): Promise<{ requests: PublicRequest[]; detours: Record<string, DetourFit> }> {
  const [routes, settings] = await Promise.all([loadCompanyRoutes(company.id), loadDetourSettings()]);
  const profile = profileOf(company);

  const kept = requests.filter(
    (request) => carries(request, profile) && detourOk(request, routes, settings),
  );

  const detours: Record<string, DetourFit> = {};
  for (const request of kept) {
    const fit = bestRouteDetour(request, routes, settings);
    if (fit !== null) detours[request.id] = fit;
  }

  return { requests: kept, detours };
}

function profileOf(company: Company): CarrierProfile {
  return {
    companyType: company.company_type,
    coverageScope: company.coverage_scope,
    coverageCounties: company.coverage_counties,
    coverageCountries: company.coverage_countries,
    vehicleTypesAccepted: company.vehicle_types_accepted,
    equipment: company.equipment,
    services: company.services,
  };
}

async function loadCompanyRoutes(companyId: string): Promise<CarrierRoute[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('truck_listings')
    .select(ROUTE_COLUMNS)
    .eq('company_id', companyId)
    .eq('status', 'active');

  if (error) {
    console.error('[cereri] routes query failed', { message: error.message });
    return [];
  }
  return toCarrierRoutes(data ?? []);
}

/**
 * „Potrivite cu firma mea" found nothing.
 *
 * A different screen from the general empty board: the board is not
 * empty, the filter is strict, and what to do about it is to loosen the
 * tolerance or drop the filter — not to publish a request.
 */
function MineEmptyState({ filters }: { filters: RequestFilters }) {
  const c = requestsCopy.empty;
  return (
    <div>
      <EmptyCard
        figure="search"
        title={c.mineTitle}
        body={c.mineBody}
        action={
          <Link
            href={`${ROUTES.requests}${requestFiltersToQuery({ ...filters, mine: false })}`}
            className={buttonClasses('primary', 'md')}
          >
            {c.mineClear}
          </Link>
        }
      />
      <p className="mt-4 text-center text-small">
        <Link
          href={ROUTES.accountDepartures}
          className="text-muted underline underline-offset-4 hover:text-foreground"
        >
          Lărgește toleranța pe traseele tale
        </Link>
      </p>
    </div>
  );
}

/**
 * The board reads `v_requests_public` — locality level, no owner — so the
 * query is identical for a visitor and for a signed-in carrier. What a
 * session adds is on the detail page, and what a plan adds is the contact.
 */
async function loadRequests(
  filters: RequestFilters,
  limit: number = BOARD_LIMIT,
): Promise<PublicRequest[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  let query = supabase
    .from('v_requests_public')
    .select('*')
    .order('loading_from', { ascending: true })
    .limit(limit);

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
  if (filters.service) query = query.eq('service_type', filters.service);
  // A request with no weight written down stays in the list: the field
  // is optional on the publish form, so excluding it would hide most of
  // the board from anybody who used this filter at all — and the weight,
  // or its absence, is on every card. `saved_search_match` reads it the
  // same way, so the board and the alert cannot disagree.
  if (filters.maxWeightKg !== null) {
    query = query.or(`weight_kg.lte.${filters.maxWeightKg},weight_kg.is.null`);
  }

  // The radius is applied twice: the bounding box narrows the query —
  // it is what `cargo_listings_geo_idx` can serve — and the circle
  // narrows what came back. The box has corners the circle never
  // reaches, so stopping at the box would show a carrier a car further
  // away than they asked for.
  const box = filters.near && filters.radiusKm
    ? boundingBox(filters.near, filters.radiusKm)
    : null;
  if (box) {
    query = query
      .gte('from_lat', box.minLat)
      .lte('from_lat', box.maxLat)
      .gte('from_lng', box.minLng)
      .lte('from_lng', box.maxLng);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[cereri] board query failed', { code: error.code, message: error.message });
    return [];
  }

  const rows = (data ?? []) as PublicRequest[];
  const centre = filters.near;
  const radius = filters.radiusKm;
  if (centre === null || radius === null) return rows;
  return rows.filter((row) =>
    withinRadius(centre, { lat: row.from_lat, lng: row.from_lng }, radius),
  );
}
