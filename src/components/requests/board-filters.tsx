import { buttonClasses } from '@/components/ui/button';
import { ROUTES } from '@/config/routes';
import { requestsCopy } from '@/content/cereri';
import { CARGO_CATEGORIES, CARGO_CATEGORY_LABELS } from '@/lib/departures';
import {
  EMPTY_REQUEST_FILTERS,
  REQUEST_FILTER_KEYS,
  hasActiveRequestFilters,
  requestFiltersToQuery,
  type RequestFilters,
} from '@/lib/request-filters';
import { COUNTRY_OPTIONS } from '@/lib/vehicles';

const CONTROL = 'w-full rounded-input border border-border-strong bg-surface px-3 py-2 text-sm';

/**
 * The board's filters, as a plain GET form.
 *
 * No JavaScript: submitting navigates, which puts every filter in the URL
 * and makes a search shareable and bookmarkable. The tab rides along as a
 * hidden field so narrowing by country does not silently drop it.
 */
export function BoardFilters({ filters }: { filters: RequestFilters }) {
  const c = requestsCopy.filters;

  return (
    <form method="get" action={ROUTES.requests} className="flex flex-col gap-4">
      {filters.tab !== 'toate' ? (
        <input type="hidden" name={REQUEST_FILTER_KEYS.tab} value={filters.tab} />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="rf-from-country" className="text-xs font-medium">
            {c.fromCountry}
          </label>
          <select
            id="rf-from-country"
            name={REQUEST_FILTER_KEYS.fromCountry}
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
          <label htmlFor="rf-to-country" className="text-xs font-medium">
            {c.toCountry}
          </label>
          <select
            id="rf-to-country"
            name={REQUEST_FILTER_KEYS.toCountry}
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
          <label htmlFor="rf-from-city" className="text-xs font-medium">
            {c.fromCity}
          </label>
          <input
            id="rf-from-city"
            name={REQUEST_FILTER_KEYS.fromCity}
            defaultValue={filters.fromCity ?? ''}
            className={CONTROL}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="rf-to-city" className="text-xs font-medium">
            {c.toCity}
          </label>
          <input
            id="rf-to-city"
            name={REQUEST_FILTER_KEYS.toCity}
            defaultValue={filters.toCity ?? ''}
            className={CONTROL}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="rf-date-from" className="text-xs font-medium">
            {c.dateFrom}
          </label>
          <input
            id="rf-date-from"
            type="date"
            name={REQUEST_FILTER_KEYS.dateFrom}
            defaultValue={filters.dateFrom ?? ''}
            className={CONTROL}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="rf-date-to" className="text-xs font-medium">
            {c.dateTo}
          </label>
          <input
            id="rf-date-to"
            type="date"
            name={REQUEST_FILTER_KEYS.dateTo}
            defaultValue={filters.dateTo ?? ''}
            className={CONTROL}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="rf-category" className="text-xs font-medium">
            {c.category}
          </label>
          <select
            id="rf-category"
            name={REQUEST_FILTER_KEYS.category}
            defaultValue={filters.category ?? ''}
            className={CONTROL}
          >
            <option value="">{c.any}</option>
            {CARGO_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {CARGO_CATEGORY_LABELS[category]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="rf-condition" className="text-xs font-medium">
            {c.condition}
          </label>
          <select
            id="rf-condition"
            name={REQUEST_FILTER_KEYS.condition}
            defaultValue={filters.condition ?? ''}
            className={CONTROL}
          >
            <option value="">{c.any}</option>
            <option value="ruleaza">{c.conditionRunning}</option>
            <option value="nu-ruleaza">{c.conditionNotRunning}</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="rf-service" className="text-xs font-medium">
            {c.service}
          </label>
          <select
            id="rf-service"
            name={REQUEST_FILTER_KEYS.service}
            defaultValue={filters.service ?? ''}
            className={CONTROL}
          >
            <option value="">{c.any}</option>
            <option value="pe_sens">{c.servicePeSens}</option>
            <option value="expres">{c.serviceExpres}</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="rf-scope" className="text-xs font-medium">
            {c.scope}
          </label>
          <select
            id="rf-scope"
            name={REQUEST_FILTER_KEYS.scope}
            defaultValue={filters.scope ?? ''}
            className={CONTROL}
          >
            <option value="">{c.any}</option>
            <option value="intern">{c.scopeDomestic}</option>
            <option value="international">{c.scopeInternational}</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" className={buttonClasses('primary', 'sm')}>
          {c.apply}
        </button>
        {hasActiveRequestFilters(filters) ? (
          <a
            href={`${ROUTES.requests}${requestFiltersToQuery({
              ...EMPTY_REQUEST_FILTERS,
              tab: filters.tab,
            })}`}
            className="text-sm text-muted underline-offset-4 hover:underline"
          >
            {c.clear}
          </a>
        ) : null}
      </div>
    </form>
  );
}
