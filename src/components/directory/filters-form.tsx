import { FilterField, FilterPanel } from '@/components/ui/filter-panel';
import { ROUTES } from '@/config/routes';
import { directoryCopy } from '@/content/directory';
import { filtersCopy } from '@/content/filtre';
import { hasFilters, type DirectoryFilters } from '@/lib/directory';
import { chipsFromParams } from '@/lib/filter-disclosure';

const CONTROL = 'w-full rounded-input border border-border-strong bg-surface px-3 py-2 text-body';

const c = directoryCopy.page.filters;

/**
 * The directory's filters, as a plain GET form on the shared panel.
 *
 * Three questions on screen — a name or a CUI, a county, what kind of
 * firm — because that is how somebody looks for a company. Coverage is
 * the fourth, and the one people rarely start from, so it waits under
 * „Mai multe filtre" (closed, with a chip when it is set).
 *
 * Submitting navigates, which puts every filter in the URL and makes a
 * filtered list shareable. The page number is deliberately not carried
 * through: page seven of the old result set is rarely page seven of the
 * new one.
 */
export function DirectoryFiltersForm({
  filters,
  counties,
}: {
  filters: DirectoryFilters;
  counties: readonly string[];
}) {
  const params: Record<string, string> = {};
  if (filters.query) params.q = filters.query;
  if (filters.county) params.judet = filters.county;
  if (filters.companyType) params.tip = filters.companyType;
  if (filters.scope) params.acoperire = filters.scope;

  const chips = chipsFromParams(ROUTES.companies, params, [
    {
      key: 'acoperire',
      label: (v) => `${c.scope}: ${v === 'international' ? c.international : c.domestic}`,
    },
  ]);

  return (
    <FilterPanel
      action={ROUTES.companies}
      screen="firme"
      simpleClassName="flex flex-col gap-4"
      chips={chips}
      canReset={hasFilters(filters)}
      resetHref={ROUTES.companies}
      labels={{
        more: filtersCopy.more,
        active: filtersCopy.active,
        apply: c.submit,
        clear: c.clear,
      }}
      simple={
        <>
          <FilterField id="d-search" label={c.search}>
            <input
              id="d-search"
              type="search"
              name="q"
              defaultValue={filters.query ?? ''}
              placeholder={c.searchPlaceholder}
              maxLength={80}
              className={CONTROL}
            />
          </FilterField>

          {counties.length > 0 ? (
            <FilterField id="d-county" label={c.county}>
              <select id="d-county" name="judet" defaultValue={filters.county ?? ''} className={CONTROL}>
                <option value="">{c.anyCounty}</option>
                {counties.map((county) => (
                  <option key={county} value={county}>
                    {county}
                  </option>
                ))}
              </select>
            </FilterField>
          ) : null}

          <FilterField id="d-type" label={c.type}>
            <select id="d-type" name="tip" defaultValue={filters.companyType ?? ''} className={CONTROL}>
              <option value="">{c.anyType}</option>
              <option value="transport">{c.transport}</option>
              <option value="expeditie">{c.forwarder}</option>
            </select>
          </FilterField>
        </>
      }
      advanced={
        <FilterField id="d-scope" label={c.scope}>
          <select id="d-scope" name="acoperire" defaultValue={filters.scope ?? ''} className={CONTROL}>
            <option value="">{c.anyScope}</option>
            <option value="intern">{c.domestic}</option>
            <option value="international">{c.international}</option>
          </select>
        </FilterField>
      }
    />
  );
}
