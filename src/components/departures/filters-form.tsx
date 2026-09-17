import { buttonClasses } from '@/components/ui/button';
import { ROUTES } from '@/config/routes';
import { departuresCopy } from '@/content/departures';
import { FILTER_KEYS, filtersToQuery, hasActiveFilters, type DepartureFilters } from '@/lib/departure-filters';
import { CARGO_CATEGORY_LABELS, FILTERABLE_CATEGORIES } from '@/lib/departures';
import { COUNTRY_OPTIONS } from '@/lib/vehicles';

const CONTROL =
  'w-full rounded-input border border-border-strong bg-surface px-3 py-2 text-sm';

/**
 * The board's filters, as a plain GET form.
 *
 * No JavaScript: submitting navigates, which puts every filter in the URL
 * and makes a search shareable and bookmarkable. The tab is carried through
 * as a hidden field so switching country does not silently drop it.
 */
export function FiltersForm({ filters }: { filters: DepartureFilters }) {
  const c = departuresCopy.filters;

  return (
    <form method="get" action={ROUTES.routes} className="flex flex-col gap-4">
      {filters.tab !== 'toate' ? (
        <input type="hidden" name={FILTER_KEYS.tab} value={filters.tab} />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="f-from-country" className="text-xs font-medium">
            {c.fromCountry}
          </label>
          <select
            id="f-from-country"
            name={FILTER_KEYS.fromCountry}
            defaultValue={filters.fromCountry ?? ''}
            className={CONTROL}
          >
            <option value="">{c.any}</option>
            {COUNTRY_OPTIONS.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="f-to-country" className="text-xs font-medium">
            {c.toCountry}
          </label>
          <select
            id="f-to-country"
            name={FILTER_KEYS.toCountry}
            defaultValue={filters.toCountry ?? ''}
            className={CONTROL}
          >
            <option value="">{c.any}</option>
            {COUNTRY_OPTIONS.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="f-scope" className="text-xs font-medium">
            {c.scope}
          </label>
          <select
            id="f-scope"
            name={FILTER_KEYS.scope}
            defaultValue={filters.scope ?? ''}
            className={CONTROL}
          >
            <option value="">{c.any}</option>
            <option value="intern">{c.scopeDomestic}</option>
            <option value="international">{c.scopeInternational}</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="f-date-from" className="text-xs font-medium">
            {c.dateFrom}
          </label>
          <input
            id="f-date-from"
            type="date"
            name={FILTER_KEYS.dateFrom}
            defaultValue={filters.dateFrom ?? ''}
            className={CONTROL}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="f-date-to" className="text-xs font-medium">
            {c.dateTo}
          </label>
          <input
            id="f-date-to"
            type="date"
            name={FILTER_KEYS.dateTo}
            defaultValue={filters.dateTo ?? ''}
            className={CONTROL}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="f-seats" className="text-xs font-medium">
            {c.minSeats}
          </label>
          <select
            id="f-seats"
            name={FILTER_KEYS.minSeats}
            defaultValue={filters.minSeats === null ? '' : String(filters.minSeats)}
            className={CONTROL}
          >
            <option value="">{c.any}</option>
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="f-vehicle" className="text-xs font-medium">
            {c.vehicleType}
          </label>
          <select
            id="f-vehicle"
            name={FILTER_KEYS.vehicleType}
            defaultValue={filters.vehicleType ?? ''}
            className={CONTROL}
          >
            <option value="">{c.any}</option>
            {FILTERABLE_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {CARGO_CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={buttonClasses('primary', 'sm')}>
          {c.apply}
        </button>
        {hasActiveFilters(filters) ? (
          <a
            href={`${ROUTES.routes}${filtersToQuery({ ...filters, tab: filters.tab, fromCountry: null, fromCounty: null, toCountry: null, toCounty: null, dateFrom: null, dateTo: null, minSeats: null, vehicleType: null })}`}
            className="text-sm text-muted underline-offset-4 hover:underline"
          >
            {c.clear}
          </a>
        ) : null}
      </div>
    </form>
  );
}
