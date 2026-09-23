import { FILTER_CONTROL, FilterField, FilterPanel } from '@/components/ui/filter-panel';
import { ROUTES } from '@/config/routes';
import { departuresCopy } from '@/content/departures';
import { CITY_GROUPS, cityLabel, cityValue } from '@/lib/cities';
import { DEPARTURE_SORTS, countAdvancedDepartureFilters, type BoardSort } from '@/lib/board-simplicity';
import {
  EMPTY_FILTERS,
  FILTER_KEYS,
  filtersToQuery,
  hasActiveFilters,
  type DepartureFilters,
} from '@/lib/departure-filters';
import { CARGO_CATEGORY_LABELS } from '@/lib/departures';
import { OFFERED_CATEGORIES } from '@/lib/vehicle-categories';
import { DEFAULT_RADIUS_KM, RADIUS_STEPS_KM } from '@/lib/radius';
import { COUNTRY_OPTIONS } from '@/lib/vehicles';

/**
 * The routes board's filters, as a plain GET form.
 *
 * The same three questions as the requests board, in the same places,
 * because a dispatcher who has learnt one board has learnt both. Here
 * „De unde" is a județ rather than a town: a route leaves a region and
 * passes through towns, and asking for a town would return almost
 * nothing.
 *
 * Everything else is one click down under „Mai multe filtre", still in
 * the URL under the keys it always had.
 */
export function FiltersForm({
  filters,
  sort,
}: {
  filters: DepartureFilters;
  sort: BoardSort;
}) {
  const c = departuresCopy.filters;

  return (
    <FilterPanel
      action={ROUTES.routes}
      title={c.title}
      sort={sort}
      sorts={DEPARTURE_SORTS}
      advancedCount={countAdvancedDepartureFilters(filters)}
      canReset={hasActiveFilters(filters)}
      resetHref={`${ROUTES.routes}${filtersToQuery(EMPTY_FILTERS)}`}
      labels={{
        more: c.more,
        active: c.moreActive,
        sort: c.sort,
        apply: c.apply,
        clear: c.clear,
      }}
      simple={
        <>
          <FilterField id="f-from-county" label={c.fromShort}>
            <input
              id="f-from-county"
              name={FILTER_KEYS.fromCounty}
              defaultValue={filters.fromCounty ?? ''}
              placeholder={c.countyPlaceholder}
              className={FILTER_CONTROL}
            />
          </FilterField>

          <FilterField id="f-to-county" label={c.toShort}>
            <input
              id="f-to-county"
              name={FILTER_KEYS.toCounty}
              defaultValue={filters.toCounty ?? ''}
              placeholder={c.countyPlaceholder}
              className={FILTER_CONTROL}
            />
          </FilterField>

          <FilterField id="f-vehicle" label={c.vehicleShort}>
            <select
              id="f-vehicle"
              name={FILTER_KEYS.vehicleType}
              defaultValue={filters.vehicleType ?? ''}
              className={FILTER_CONTROL}
            >
              <option value="">{c.any}</option>
              {OFFERED_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {CARGO_CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
          </FilterField>
        </>
      }
      advanced={
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <FilterField id="f-tab" label={c.tab}>
              <select
                id="f-tab"
                name={FILTER_KEYS.tab}
                defaultValue={filters.tab}
                className={FILTER_CONTROL}
              >
                <option value="toate">{c.tabAll}</option>
                <option value="tur">{c.tabOutbound}</option>
                <option value="retur">{c.tabReturn}</option>
              </select>
            </FilterField>

            <FilterField id="f-seats" label={c.minSeats}>
              <select
                id="f-seats"
                name={FILTER_KEYS.minSeats}
                defaultValue={filters.minSeats === null ? '' : String(filters.minSeats)}
                className={FILTER_CONTROL}
              >
                <option value="">{c.any}</option>
                {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField id="f-from-country" label={c.fromCountry}>
              <select
                id="f-from-country"
                name={FILTER_KEYS.fromCountry}
                defaultValue={filters.fromCountry ?? ''}
                className={FILTER_CONTROL}
              >
                <option value="">{c.any}</option>
                {COUNTRY_OPTIONS.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.name}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField id="f-to-country" label={c.toCountry}>
              <select
                id="f-to-country"
                name={FILTER_KEYS.toCountry}
                defaultValue={filters.toCountry ?? ''}
                className={FILTER_CONTROL}
              >
                <option value="">{c.any}</option>
                {COUNTRY_OPTIONS.map((country) => (
                  <option key={country.code} value={country.code}>
                    {country.name}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField id="f-date-from" label={c.dateFrom}>
              <input
                id="f-date-from"
                name={FILTER_KEYS.dateFrom}
                type="date"
                defaultValue={filters.dateFrom ?? ''}
                className={FILTER_CONTROL}
              />
            </FilterField>

            <FilterField id="f-date-to" label={c.dateTo}>
              <input
                id="f-date-to"
                name={FILTER_KEYS.dateTo}
                type="date"
                defaultValue={filters.dateTo ?? ''}
                className={FILTER_CONTROL}
              />
            </FilterField>

            <FilterField id="f-scope" label={c.scope} className="sm:col-span-2">
              <select
                id="f-scope"
                name={FILTER_KEYS.scope}
                defaultValue={filters.scope ?? ''}
                className={FILTER_CONTROL}
              >
                <option value="">{c.any}</option>
                <option value="intern">{c.scopeDomestic}</option>
                <option value="international">{c.scopeInternational}</option>
              </select>
            </FilterField>
          </div>

          {/*
            Rază și capacitate: filtrele cuiva care caută pe cine îl ia de
            lângă el, nu o rută anume. Localitatea este un select fiindcă
            raza are nevoie de coordonate, iar coordonate avem numai
            pentru localitățile din listă.
          */}
          <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
            <FilterField id="f-near" label={c.near}>
              <select
                id="f-near"
                name={FILTER_KEYS.near}
                defaultValue={filters.near ? cityValue(filters.near) : ''}
                className={FILTER_CONTROL}
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
            </FilterField>

            <FilterField id="f-radius" label={c.radius} hint={c.radiusHint}>
              <select
                id="f-radius"
                name={FILTER_KEYS.radiusKm}
                defaultValue={String(filters.radiusKm ?? DEFAULT_RADIUS_KM)}
                className={FILTER_CONTROL}
              >
                {RADIUS_STEPS_KM.map((km) => (
                  <option key={km} value={km}>
                    {c.radiusOption(km)}
                  </option>
                ))}
              </select>
            </FilterField>

            <FilterField
              id="f-capacity"
              label={c.minCapacity}
              hint={c.minCapacityHint}
              className="sm:col-span-2"
            >
              <input
                id="f-capacity"
                name={FILTER_KEYS.minCapacityKg}
                type="number"
                inputMode="numeric"
                min={1}
                max={20000}
                step={1}
                defaultValue={filters.minCapacityKg ?? ''}
                className={FILTER_CONTROL}
              />
            </FilterField>
          </div>
        </>
      }
    />
  );
}
