import { FILTER_CONTROL, FilterField, FilterPanel } from '@/components/ui/filter-panel';
import { ROUTES } from '@/config/routes';
import { requestsCopy } from '@/content/cereri';
import { CITY_GROUPS, cityLabel, cityValue } from '@/lib/cities';
import { CARGO_CATEGORY_LABELS } from '@/lib/departures';
import { OFFERED_CATEGORIES } from '@/lib/vehicle-categories';
import { DEFAULT_RADIUS_KM, RADIUS_STEPS_KM } from '@/lib/radius';
import { REQUEST_SORTS, countAdvancedRequestFilters, type BoardSort } from '@/lib/board-simplicity';
import {
  EMPTY_REQUEST_FILTERS,
  REQUEST_FILTER_KEYS,
  hasActiveRequestFilters,
  requestFiltersToQuery,
  type RequestFilters,
} from '@/lib/request-filters';
import { COUNTRY_OPTIONS } from '@/lib/vehicles';

/**
 * The board's filters, as a plain GET form.
 *
 * No JavaScript: submitting navigates, which puts every filter in the URL
 * and makes a search shareable and bookmarkable.
 *
 * Three of them are on screen — where from, where to, what kind of
 * vehicle. The other ten are one click down, under „Mai multe filtre",
 * with a badge counting the ones doing something. Nothing was removed:
 * the keys are the ones they always were, so a link somebody saved last
 * month still applies, and it opens the panel so they can see what is
 * narrowing the board.
 *
 * The country pair moved down with the rest. „De unde" for a dispatcher
 * is a town, not a country; somebody filtering a whole country is doing
 * something more deliberate and can afford the click.
 */
export function BoardFilters({
  filters,
  sort,
  showMine = false,
  children,
}: {
  filters: RequestFilters;
  sort: BoardSort;
  /** Only a carrier with a firm has a firm to match against. */
  showMine?: boolean;
  /** „Salvează căutarea", beside the search button rather than under it. */
  children?: React.ReactNode;
}) {
  const c = requestsCopy.filters;

  return (
    <FilterPanel
      action={ROUTES.requests}
      title={c.title}
      sort={sort}
      sorts={REQUEST_SORTS}
      advancedCount={countAdvancedRequestFilters(filters)}
      canReset={hasActiveRequestFilters(filters)}
      resetHref={`${ROUTES.requests}${requestFiltersToQuery(EMPTY_REQUEST_FILTERS)}`}
      labels={{
        more: c.more,
        active: c.moreActive,
        sort: c.sort,
        apply: c.apply,
        clear: c.clear,
      }}
      simple={
        <>
          <FilterField id="rf-from-city" label={c.fromCityShort}>
            <input
              id="rf-from-city"
              name={REQUEST_FILTER_KEYS.fromCity}
              defaultValue={filters.fromCity ?? ''}
              placeholder={c.cityPlaceholder}
              className={FILTER_CONTROL}
            />
          </FilterField>

          <FilterField id="rf-to-city" label={c.toCityShort}>
            <input
              id="rf-to-city"
              name={REQUEST_FILTER_KEYS.toCity}
              defaultValue={filters.toCity ?? ''}
              placeholder={c.cityPlaceholder}
              className={FILTER_CONTROL}
            />
          </FilterField>

          <FilterField id="rf-category" label={c.categoryShort}>
            <select
              id="rf-category"
              name={REQUEST_FILTER_KEYS.category}
              defaultValue={filters.category ?? ''}
              className={FILTER_CONTROL}
            >
              <option value="">{c.any}</option>
              {OFFERED_CATEGORIES.map((code) => (
                <option key={code} value={code}>
                  {CARGO_CATEGORY_LABELS[code]}
                </option>
              ))}
            </select>
          </FilterField>
        </>
      }
      advanced={
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <FilterField id="rf-tab" label={c.tab}>
              <select
                id="rf-tab"
                name={REQUEST_FILTER_KEYS.tab}
                defaultValue={filters.tab}
                className={FILTER_CONTROL}
              >
                <option value="toate">{c.tabAll}</option>
                <option value="curse">{c.tabCompanies}</option>
                <option value="retur">{c.tabIndividuals}</option>
              </select>
            </FilterField>

            <FilterField id="rf-service" label={c.service}>
              <select
                id="rf-service"
                name={REQUEST_FILTER_KEYS.service}
                defaultValue={filters.service ?? ''}
                className={FILTER_CONTROL}
              >
                <option value="">{c.any}</option>
                <option value="pe_sens">{c.servicePeSens}</option>
                <option value="expres">{c.serviceExpres}</option>
              </select>
            </FilterField>

            <FilterField id="rf-from-country" label={c.fromCountry}>
              <select
                id="rf-from-country"
                name={REQUEST_FILTER_KEYS.fromCountry}
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

            <FilterField id="rf-to-country" label={c.toCountry}>
              <select
                id="rf-to-country"
                name={REQUEST_FILTER_KEYS.toCountry}
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

            <FilterField id="rf-date-from" label={c.dateFrom}>
              <input
                id="rf-date-from"
                name={REQUEST_FILTER_KEYS.dateFrom}
                type="date"
                defaultValue={filters.dateFrom ?? ''}
                className={FILTER_CONTROL}
              />
            </FilterField>

            <FilterField id="rf-date-to" label={c.dateTo}>
              <input
                id="rf-date-to"
                name={REQUEST_FILTER_KEYS.dateTo}
                type="date"
                defaultValue={filters.dateTo ?? ''}
                className={FILTER_CONTROL}
              />
            </FilterField>

            <FilterField id="rf-condition" label={c.condition}>
              <select
                id="rf-condition"
                name={REQUEST_FILTER_KEYS.condition}
                defaultValue={filters.condition ?? ''}
                className={FILTER_CONTROL}
              >
                <option value="">{c.any}</option>
                <option value="ruleaza">{c.conditionRunning}</option>
                <option value="nu-ruleaza">{c.conditionNotRunning}</option>
              </select>
            </FilterField>

            <FilterField id="rf-scope" label={c.scope}>
              <select
                id="rf-scope"
                name={REQUEST_FILTER_KEYS.scope}
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
            Rază și greutate: filtrele pe care le pune cineva care caută
            de lucru în zona lui, nu cineva care caută o rută anume.
            Localitatea este un select fiindcă raza are nevoie de
            coordonate, iar coordonate avem numai pentru lista noastră.
          */}
          <div className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
            <FilterField id="rf-near" label={c.near}>
              <select
                id="rf-near"
                name={REQUEST_FILTER_KEYS.near}
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

            <FilterField id="rf-radius" label={c.radius} hint={c.radiusHint}>
              <select
                id="rf-radius"
                name={REQUEST_FILTER_KEYS.radiusKm}
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
              id="rf-weight"
              label={c.maxWeight}
              hint={c.maxWeightHint}
              className="sm:col-span-2"
            >
              <input
                id="rf-weight"
                name={REQUEST_FILTER_KEYS.maxWeightKg}
                type="number"
                inputMode="numeric"
                min={1}
                max={20000}
                // `step` rămâne 1. Cu `step={100}` și `min={1}`, singurele
                // valori valide ar fi 1, 101, 201… — iar browserul refuză
                // trimiterea formularului pentru orice altceva, tăcut.
                step={1}
                defaultValue={filters.maxWeightKg ?? ''}
                className={FILTER_CONTROL}
              />
            </FilterField>
          </div>

          {showMine ? (
            <label className="flex items-start gap-2.5 border-t border-border pt-4 text-small">
              <input
                type="checkbox"
                name={REQUEST_FILTER_KEYS.mine}
                value="firma"
                defaultChecked={filters.mine}
                className="mt-0.5 size-4 accent-accent"
              />
              <span>
                {c.mine}
                <span className="mt-0.5 block text-xs text-muted">{c.mineHint}</span>
              </span>
            </label>
          ) : null}
        </>
      }
    >
      {children}
    </FilterPanel>
  );
}
