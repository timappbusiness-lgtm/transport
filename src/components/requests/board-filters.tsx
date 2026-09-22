import { buttonClasses } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ICON_GAP, iconForAction } from '@/lib/icons';
import { cn } from '@/lib/utils';
import { ROUTES } from '@/config/routes';
import { requestsCopy } from '@/content/cereri';
import { CITY_GROUPS, cityLabel, cityValue } from '@/lib/cities';
import { CARGO_CATEGORY_LABELS } from '@/lib/departures';
import { OFFERED_CATEGORIES } from '@/lib/vehicle-categories';
import { DEFAULT_RADIUS_KM, RADIUS_STEPS_KM } from '@/lib/radius';
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
export function BoardFilters({
  filters,
  showMine = false,
}: {
  filters: RequestFilters;
  /** Only a carrier with a firm has a firm to match against. */
  showMine?: boolean;
}) {
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
            {OFFERED_CATEGORIES.map((category) => (
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

      {/*
        Rază și greutate stau sub restul, cu o linie deasupra: sunt
        filtrele pe care le pune cineva care caută de lucru în zona lui,
        nu cineva care caută o rută anume. Localitatea este un select și
        nu o casetă de text, fiindcă raza are nevoie de coordonate, iar
        coordonate avem numai pentru localitățile din listă.
      */}
      <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="rf-near" className="text-xs font-medium">
            {c.near}
          </label>
          <select
            id="rf-near"
            name={REQUEST_FILTER_KEYS.near}
            defaultValue={filters.near ? cityValue(filters.near) : ''}
            className={CONTROL}
          >
            <option value="">{c.any}</option>
            {CITY_GROUPS.map((group) => (
              <optgroup key={group.key} label={group.key === 'ro' ? 'România' : 'Europa'}>
                {group.cities.map((city) => (
                  <option key={cityValue(city)} value={cityValue(city)}>
                    {cityLabel(city)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="rf-radius" className="text-xs font-medium">
            {c.radius}
          </label>
          <select
            id="rf-radius"
            name={REQUEST_FILTER_KEYS.radiusKm}
            defaultValue={String(filters.radiusKm ?? DEFAULT_RADIUS_KM)}
            className={CONTROL}
          >
            {RADIUS_STEPS_KM.map((km) => (
              <option key={km} value={km}>
                {c.radiusOption(km)}
              </option>
            ))}
          </select>
        </div>

        <p className="text-xs text-muted sm:col-span-2">{c.radiusHint}</p>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="rf-weight" className="text-xs font-medium">
            {c.maxWeight}
          </label>
          <input
            id="rf-weight"
            name={REQUEST_FILTER_KEYS.maxWeightKg}
            type="number"
            inputMode="numeric"
            min={1}
            max={20000}
            // `step` rămâne 1. Cu `step={100}` și `min={1}`, singurele
            // valori valide ar fi 1, 101, 201… — iar browserul refuză
            // trimiterea formularului pentru orice altceva, tăcut. Cine
            // scria 2400 apăsa „Caută" și nu se întâmpla nimic.
            step={1}
            defaultValue={filters.maxWeightKg ?? ''}
            className={CONTROL}
          />
          <p className="text-xs text-muted">{c.maxWeightHint}</p>
        </div>
      </div>

      {showMine ? (
        <label className="flex items-start gap-2.5 border-t border-border pt-4 text-sm">
          <input
            type="checkbox"
            name={REQUEST_FILTER_KEYS.mine}
            value="firma"
            defaultChecked={filters.mine}
            className="mt-0.5 size-4 accent-[#1C262B]"
          />
          <span>
            {c.mine}
            <span className="mt-0.5 block text-xs text-muted">{c.mineHint}</span>
          </span>
        </label>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className={cn(buttonClasses('primary', 'sm'), 'inline-flex items-center', ICON_GAP)}
        >
          <Icon as={iconForAction('search')} size="sm" />
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
