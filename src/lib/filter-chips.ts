import { ROUTES } from '@/config/routes';
import { requestsCopy } from '@/content/cereri';
import { departuresCopy } from '@/content/departures';
import { DEFAULT_BOARD_SORT, SORT_KEY, type BoardSort } from '@/lib/board-simplicity';
import { cityLabel } from '@/lib/cities';
import {
  EMPTY_FILTERS as EMPTY_DEPARTURE_FILTERS,
  filtersToQuery,
  type DepartureFilters,
} from '@/lib/departure-filters';
import { chipDate, type FilterChip } from '@/lib/filter-disclosure';
import { DEFAULT_RADIUS_KM } from '@/lib/radius';
import {
  EMPTY_REQUEST_FILTERS,
  requestFiltersToQuery,
  type RequestFilterOptions,
  type RequestFilters,
} from '@/lib/request-filters';
import { COUNTRY_OPTIONS } from '@/lib/vehicles';

/**
 * The chips each board draws for its active advanced filters.
 *
 * One chip per thing a person set inside „Mai multe filtre", in the
 * panel's own order, labelled the way the panel labels it, each linking
 * to the same board without it — the sort kept, because removing a
 * filter is not asking for a different order. The chips' number is the
 * number on the button: one list, so the two cannot disagree.
 */

const COUNTRY_NAME = new Map(COUNTRY_OPTIONS.map((c) => [c.code, c.name]));
const country = (code: string) => COUNTRY_NAME.get(code) ?? code;
const kg = (n: number) => `${new Intl.NumberFormat('ro-RO').format(n)} kg`;

/** The sort, appended, unless it is the default the board opens on. */
function withSort(base: string, query: string, sort: BoardSort): string {
  if (sort === DEFAULT_BOARD_SORT) return `${base}${query}`;
  const joiner = query === '' ? '?' : '&';
  return `${base}${query}${joiner}${SORT_KEY}=${sort}`;
}

// ---------------------------------------------------------------------
// /cereri
// ---------------------------------------------------------------------

export function requestAdvancedChips(
  filters: RequestFilters,
  sort: BoardSort,
  options: RequestFilterOptions = {},
): FilterChip[] {
  const c = requestsCopy.filters;
  const without = (patch: Partial<RequestFilters>) =>
    withSort(ROUTES.requests, requestFiltersToQuery({ ...filters, ...patch }, options), sort);
  const chips: FilterChip[] = [];

  if (filters.tab !== 'toate') {
    chips.push({
      id: 'tab',
      label: `${c.tab}: ${filters.tab === 'curse' ? c.tabCompanies : c.tabIndividuals}`,
      href: without({ tab: EMPTY_REQUEST_FILTERS.tab }),
    });
  }
  if (filters.service) {
    chips.push({
      id: 'service',
      label: `${c.service}: ${filters.service === 'expres' ? 'Expres' : 'Pe sens'}`,
      href: without({ service: null }),
    });
  }
  if (filters.fromCountry) {
    chips.push({
      id: 'fromCountry',
      label: `${c.fromCountry}: ${country(filters.fromCountry)}`,
      href: without({ fromCountry: null }),
    });
  }
  if (filters.toCountry) {
    chips.push({
      id: 'toCountry',
      label: `${c.toCountry}: ${country(filters.toCountry)}`,
      href: without({ toCountry: null }),
    });
  }
  if (filters.dateFrom) {
    chips.push({
      id: 'dateFrom',
      label: `${c.dateFrom} ${chipDate(filters.dateFrom)}`,
      href: without({ dateFrom: null }),
    });
  }
  if (filters.dateTo) {
    chips.push({
      id: 'dateTo',
      label: `${c.dateTo} ${chipDate(filters.dateTo)}`,
      href: without({ dateTo: null }),
    });
  }
  if (filters.condition) {
    chips.push({
      id: 'condition',
      label: `${c.condition}: ${filters.condition === 'ruleaza' ? c.conditionRunning : c.conditionNotRunning}`,
      href: without({ condition: null }),
    });
  }
  if (filters.scope) {
    chips.push({
      id: 'scope',
      label: `${c.scope}: ${filters.scope === 'intern' ? c.scopeDomestic : c.scopeInternational}`,
      href: without({ scope: null }),
    });
  }
  if (filters.near) {
    chips.push({
      id: 'near',
      label: `${c.near} ${cityLabel(filters.near)}, ${filters.radiusKm ?? DEFAULT_RADIUS_KM} km`,
      href: without({ near: null, radiusKm: null }),
    });
  }
  if (filters.maxWeightKg !== null) {
    chips.push({
      id: 'maxWeightKg',
      label: `Greutate până la ${kg(filters.maxWeightKg)}`,
      href: without({ maxWeightKg: null }),
    });
  }
  return chips;
}

// ---------------------------------------------------------------------
// /trasee
// ---------------------------------------------------------------------

export function departureAdvancedChips(filters: DepartureFilters, sort: BoardSort): FilterChip[] {
  const c = departuresCopy.filters;
  const without = (patch: Partial<DepartureFilters>) =>
    withSort(ROUTES.routes, filtersToQuery({ ...filters, ...patch }), sort);
  const chips: FilterChip[] = [];

  if (filters.tab !== 'toate') {
    chips.push({
      id: 'tab',
      label: `${c.tab}: ${filters.tab === 'tur' ? c.tabOutbound : c.tabReturn}`,
      href: without({ tab: EMPTY_DEPARTURE_FILTERS.tab }),
    });
  }
  if (filters.minSeats !== null) {
    chips.push({
      id: 'minSeats',
      label: `${c.minSeats} ${filters.minSeats}`,
      href: without({ minSeats: null }),
    });
  }
  if (filters.fromCountry) {
    chips.push({
      id: 'fromCountry',
      label: `${c.fromCountry}: ${country(filters.fromCountry)}`,
      href: without({ fromCountry: null }),
    });
  }
  if (filters.toCountry) {
    chips.push({
      id: 'toCountry',
      label: `${c.toCountry}: ${country(filters.toCountry)}`,
      href: without({ toCountry: null }),
    });
  }
  if (filters.dateFrom) {
    chips.push({
      id: 'dateFrom',
      label: `${c.dateFrom} ${chipDate(filters.dateFrom)}`,
      href: without({ dateFrom: null }),
    });
  }
  if (filters.dateTo) {
    chips.push({
      id: 'dateTo',
      label: `${c.dateTo} ${chipDate(filters.dateTo)}`,
      href: without({ dateTo: null }),
    });
  }
  if (filters.scope) {
    chips.push({
      id: 'scope',
      label: `${c.scope}: ${filters.scope === 'intern' ? c.scopeDomestic : c.scopeInternational}`,
      href: without({ scope: null }),
    });
  }
  if (filters.near) {
    chips.push({
      id: 'near',
      label: `${c.near} ${cityLabel(filters.near)}, ${filters.radiusKm ?? DEFAULT_RADIUS_KM} km`,
      href: without({ near: null, radiusKm: null }),
    });
  }
  if (filters.minCapacityKg !== null) {
    chips.push({
      id: 'minCapacityKg',
      label: `Capacitate liberă de cel puțin ${kg(filters.minCapacityKg)}`,
      href: without({ minCapacityKg: null }),
    });
  }
  return chips;
}
