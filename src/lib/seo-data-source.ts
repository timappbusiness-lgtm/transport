import { unstable_cache } from 'next/cache';
import { corridorEnds, routeEnds, VEHICLE_TYPE_PAGES, type SeoPage } from './seo-pages';
import type { PublicDeparture } from './departures';
import {
  estimate,
  straightLineKm,
  type Estimate,
  type PriceRate,
  type PriceSettings,
} from './pricing';
import { isPublished, loadPrices } from './prices-source';
import type { PublicRequest } from './requests';
import { createPublicClient } from './supabase/public';
import { isSupabaseConfigured } from './supabase/env';

/**
 * The live half of a landing page.
 *
 * The row in `seo_pages` carries the words. Everything with a number in it
 * is read here, at render time, from the table that owns it — the price
 * from `price_rates`, the firms from `companies`, the requests and the
 * departures from the two public views a visitor can already see.
 *
 * Which means every block can be empty, and every block says so in its own
 * words rather than disappearing. A landing page that hides its empty
 * sections is a page that looks identical whether the marketplace has ten
 * carriers or none, and the whole argument for these pages is that we can
 * show the real number.
 */

export const SEO_DATA_TAG = 'seo-page-data';
const REVALIDATE_SECONDS = 300;

/**
 * Straight-line kilometres turned into a plausible road distance.
 *
 * Used only when no price settings are published. When they are, the
 * factor comes from `price_settings.road_distance_factor`, so the distance
 * a page states and the distance its price was computed from are the same
 * number — two different road factors on one page is the kind of detail
 * that makes a visitor stop believing the rest of it.
 */
const FALLBACK_ROAD_FACTOR = 1.25;
/** Motorway-ish, with the stops a platform actually makes. */
const AVERAGE_KMH = 65;

export interface RouteFacts {
  /** Road kilometres, estimated from the straight line. */
  km: number;
  /** Hours of driving, rounded. Not a delivery promise. */
  hours: number;
  /** Labelled on screen when the two ends are an example, not the route. */
  isExample: boolean;
  fromName: string;
  toName: string;
}

export interface SeoPageData {
  facts: RouteFacts | null;
  /** null when no price is published, which is a state the page renders. */
  price: Estimate | null;
  priceRates: PriceRate[];
  priceSettings: PriceSettings | null;
  requests: PublicRequest[];
  departures: PublicDeparture[];
  companies: number;
}

export const NO_SEO_DATA: SeoPageData = {
  facts: null,
  price: null,
  priceRates: [],
  priceSettings: null,
  requests: [],
  departures: [],
  companies: 0,
};

const LIST_LIMIT = 6;

/**
 * Distance and duration for whichever two ends the page has.
 *
 * A corridor is not a route — "Germania — România" has no single distance —
 * so a corridor page uses a named example pair and the screen says so.
 * Free of the database: the coordinates are in `cities.ts`.
 */
export function routeFacts(
  page: SeoPage,
  roadFactor: number = FALLBACK_ROAD_FACTOR,
): RouteFacts | null {
  const ends = routeEnds(page) ?? corridorEnds(page);
  if (!ends) return null;

  const km = Math.round((straightLineKm(ends.from, ends.to) * roadFactor) / 10) * 10;

  return {
    km,
    hours: Math.max(1, Math.round(km / AVERAGE_KMH)),
    isExample: page.type === 'corridor_international',
    fromName: ends.from.name,
    toName: ends.to.name,
  };
}

export async function loadSeoPageData(page: SeoPage): Promise<SeoPageData> {
  if (!isSupabaseConfigured()) return { ...NO_SEO_DATA, facts: routeFacts(page) };

  const [prices, live] = await Promise.all([loadPrices(), loadLive(page)]);

  const facts = routeFacts(page, prices.settings?.road_distance_factor);
  const ends = routeEnds(page) ?? corridorEnds(page);

  // The vehicle class a page prices against. A corridor or a route page has
  // no class of its own, so it quotes the commonest one and labels it.
  const vehicleClass =
    page.type === 'vehicle_type' && page.vehicleType === 'motocicleta'
      ? 'motocicleta'
      : page.type === 'vehicle_type' && page.vehicleType === 'autoutilitara'
        ? 'autoutilitara'
        : 'sedan';

  const rate = prices.rates.find((r) => r.vehicle_class === vehicleClass) ?? null;
  const isRunning = page.vehicleType
    ? (VEHICLE_TYPE_PAGES[page.vehicleType]?.isRunning ?? true)
    : true;

  const price =
    isPublished(prices) && rate && prices.settings && ends
      ? estimate(
          { from: ends.from, to: ends.to, vehicleClass, isRunning, express: false },
          rate,
          prices.settings,
        )
      : null;

  return {
    facts,
    price,
    priceRates: prices.rates,
    priceSettings: prices.settings,
    ...live,
  };
}

interface LiveBlocks {
  requests: PublicRequest[];
  departures: PublicDeparture[];
  companies: number;
}

/**
 * What is on the board for this page, right now.
 *
 * Read through the anon client and the same two public views a visitor can
 * already see — a landing page is not allowed to know more about a request
 * than the board does.
 */
async function fetchLive(page: SeoPage): Promise<LiveBlocks> {
  const supabase = createPublicClient();

  let requests = supabase
    .from('v_requests_public')
    .select('*')
    .order('published_at', { ascending: false })
    .limit(LIST_LIMIT);

  let departures = supabase
    .from('v_departures_public')
    .select('*')
    .order('available_from', { ascending: true })
    .limit(LIST_LIMIT);

  let companies = supabase
    .from('v_public_companies')
    .select('slug', { count: 'exact', head: true });

  switch (page.type) {
    case 'corridor_international':
      requests = requests.eq('from_country', page.origin ?? '').eq('to_country', 'RO');
      departures = departures.eq('from_country', page.origin ?? '').eq('to_country', 'RO');
      companies = companies
        .eq('coverage_scope', 'international')
        .contains('coverage_countries', [page.origin ?? '']);
      break;

    case 'route_internal':
      // Either direction: the page covers the pair, not one sense of it.
      requests = requests.or(
        `and(from_city.eq.${page.origin},to_city.eq.${page.destination}),and(from_city.eq.${page.destination},to_city.eq.${page.origin})`,
      );
      departures = departures.or(
        `and(from_city.eq.${page.origin},to_city.eq.${page.destination}),and(from_city.eq.${page.destination},to_city.eq.${page.origin})`,
      );
      // A national or international carrier serves every county, so the
      // count is everybody except the county-only firms that did not name
      // one of these two.
      companies = companies.in('coverage_scope', ['national', 'international']);
      break;

    case 'county':
      requests = requests.or(
        `from_county.eq.${page.origin},to_county.eq.${page.origin}`,
      );
      companies = companies.or(
        `coverage_scope.in.(national,international),coverage_counties.cs.{${page.origin}}`,
      );
      break;

    case 'vehicle_type': {
      const type = page.vehicleType ? VEHICLE_TYPE_PAGES[page.vehicleType] : undefined;
      if (type?.category) requests = requests.eq('category', type.category);
      if (type?.isRunning === false) requests = requests.eq('needs_winch', true);
      if (type?.category) departures = departures.contains('accepted_vehicle_types', [type.category]);
      break;
    }
  }

  const [r, d, c] = await Promise.all([requests, departures, companies]);

  if (r.error) console.error('[seo] requests', { message: r.error.message });
  if (d.error) console.error('[seo] departures', { message: d.error.message });
  if (c.error) console.error('[seo] companies', { message: c.error.message });

  return {
    requests: (r.data ?? []) as unknown as PublicRequest[],
    departures: (d.data ?? []) as unknown as PublicDeparture[],
    companies: c.count ?? 0,
  };
}

/**
 * Cached per slug. The three queries behind a landing page are the same
 * for every visitor to it, and a crawler asking for 161 of them in a
 * minute should cost 161 cache entries rather than 483 round trips.
 */
function loadLive(page: SeoPage): Promise<LiveBlocks> {
  return unstable_cache(() => fetchLive(page), [SEO_DATA_TAG, page.slug], {
    revalidate: REVALIDATE_SECONDS,
    tags: [SEO_DATA_TAG],
  })();
}
