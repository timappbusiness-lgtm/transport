import { buttonClasses } from '@/components/ui/button';
import { ROUTES } from '@/config/routes';
import { directoryCopy } from '@/content/directory';
import { hasFilters, type DirectoryFilters } from '@/lib/directory';

const CONTROL = 'w-full rounded-input border border-border-strong bg-surface px-3 py-2 text-body';

const c = directoryCopy.page.filters;

/**
 * The directory's filters, as a plain GET form.
 *
 * No JavaScript: submitting navigates, which puts every filter in the URL
 * and makes a filtered list shareable. The page number is deliberately not
 * carried through — changing a filter starts at page one, because page
 * seven of the old result set is rarely page seven of the new one.
 */
export function DirectoryFiltersForm({
  filters,
  counties,
}: {
  filters: DirectoryFilters;
  counties: readonly string[];
}) {
  return (
    <form method="get" action={ROUTES.companies} className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-4 border-0 p-0">
        <legend className="sr-only">{c.legend}</legend>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="d-search" className="text-small font-medium">
            {c.search}
          </label>
          <input
            id="d-search"
            type="search"
            name="q"
            defaultValue={filters.query ?? ''}
            placeholder={c.searchPlaceholder}
            maxLength={80}
            className={CONTROL}
          />
        </div>

        {counties.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="d-county" className="text-small font-medium">
              {c.county}
            </label>
            <select id="d-county" name="judet" defaultValue={filters.county ?? ''} className={CONTROL}>
              <option value="">{c.anyCounty}</option>
              {counties.map((county) => (
                <option key={county} value={county}>
                  {county}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="d-type" className="text-small font-medium">
            {c.type}
          </label>
          <select id="d-type" name="tip" defaultValue={filters.companyType ?? ''} className={CONTROL}>
            <option value="">{c.anyType}</option>
            <option value="transport">{c.transport}</option>
            <option value="expeditie">{c.forwarder}</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="d-scope" className="text-small font-medium">
            {c.scope}
          </label>
          <select id="d-scope" name="acoperire" defaultValue={filters.scope ?? ''} className={CONTROL}>
            <option value="">{c.anyScope}</option>
            <option value="intern">{c.domestic}</option>
            <option value="international">{c.international}</option>
          </select>
        </div>
      </fieldset>

      <button type="submit" className={buttonClasses('primary', 'sm')}>
        {c.submit}
      </button>

      {hasFilters(filters) ? (
        <a
          href={ROUTES.companies}
          className="text-center text-body text-muted underline underline-offset-4 decoration-border-strong hover:text-foreground"
        >
          {c.clear}
        </a>
      ) : null}
    </form>
  );
}
