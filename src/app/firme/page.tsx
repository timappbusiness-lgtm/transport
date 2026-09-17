import type { Metadata } from 'next';
import Link from 'next/link';
import { CompanyCard } from '@/components/directory/company-card';
import { DirectoryFiltersForm } from '@/components/directory/filters-form';
import { buttonClasses } from '@/components/ui/button';
import { EyebrowPill, Headline, Lede } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { directoryCopy } from '@/content/directory';
import {
  DIRECTORY_PAGE_SIZE,
  filtersToQuery,
  hasFilters,
  pageCount,
  parseFilters,
  type DirectoryFilters,
} from '@/lib/directory';
import { companyLogoUrl, loadDirectoryPage } from '@/lib/directory-source';
import { formatCompanies } from '@/lib/trust';
import { cn } from '@/lib/utils';

const c = directoryCopy.page;

export const metadata: Metadata = {
  title: c.meta.title,
  description: c.meta.description,
  alternates: { canonical: ROUTES.companies },
  // Nothing on this site is indexed before launch; the app-wide default in
  // the root layout says so, and this repeats it so a later change there
  // does not quietly expose the page.
  robots: { index: false, follow: true },
};

/** Filtered per visitor, so there is nothing to prerender. */
export const dynamic = 'force-dynamic';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseFilters(await searchParams);
  const { companies, total, counties } = await loadDirectoryPage(filters);
  const pages = pageCount(total, DIRECTORY_PAGE_SIZE);

  return (
    <div className="mx-auto w-full max-w-[72rem] px-[clamp(16px,4vw,56px)] py-10 sm:py-14">
      <header className="max-w-[46rem]">
        <EyebrowPill>{c.eyebrow}</EyebrowPill>
        <Headline as="h1" strong={c.strong} soft={c.soft} className="mt-5" />
        <Lede className="mt-4">{c.note}</Lede>
      </header>

      <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
        <aside className="rounded-card border border-border bg-surface p-5 lg:sticky lg:top-24 lg:self-start">
          <h2 className="mb-4 text-sm font-medium">{c.filters.legend}</h2>
          <DirectoryFiltersForm filters={filters} counties={counties} />
        </aside>

        <section aria-label={c.meta.title}>
          {companies.length > 0 ? (
            <>
              <p className="mb-4 text-sm text-muted">{c.count(formatCompanies(total))}</p>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {companies.map((company) => (
                  <li key={company.slug} className="min-w-0">
                    <CompanyCard
                      company={company}
                      logoUrl={companyLogoUrl(company.logoPath)}
                      detailed
                    />
                  </li>
                ))}
              </ul>
              <Pagination filters={filters} pages={pages} />
            </>
          ) : (
            <EmptyState filtered={hasFilters(filters)} />
          )}
        </section>
      </div>
    </div>
  );
}

/**
 * The empty state says which kind of empty it is.
 *
 * A filtered search that found nothing is the visitor's to fix; a directory
 * that is still filling up is ours, and saying so is more honest than
 * showing sample cards nobody can click.
 */
function EmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="rounded-card border border-border bg-surface p-6 sm:p-8">
      <h2 className="text-[1.125rem]">{filtered ? c.emptyFiltered : c.empty}</h2>
      <div className="mt-5 flex flex-wrap gap-3">
        {filtered ? (
          <Link href={ROUTES.companies} className={buttonClasses('secondary', 'md')}>
            {c.filters.clear}
          </Link>
        ) : null}
        <Link
          href={`${ROUTES.signUpCompany}?tip=transport`}
          className={buttonClasses(filtered ? 'secondary' : 'primary', 'md')}
        >
          {c.emptyCta}
        </Link>
      </div>
    </div>
  );
}

function Pagination({ filters, pages }: { filters: DirectoryFilters; pages: number }) {
  if (pages <= 1) return null;

  const previous = filters.page > 1 ? filters.page - 1 : null;
  const next = filters.page < pages ? filters.page + 1 : null;
  const link = (page: number) => `${ROUTES.companies}${filtersToQuery({ ...filters, page })}`;

  return (
    <nav aria-label={c.pagination.status(filters.page, pages)} className="mt-8 flex items-center gap-3">
      <PageLink href={previous === null ? null : link(previous)}>{c.pagination.previous}</PageLink>
      <p className="text-sm text-muted">{c.pagination.status(filters.page, pages)}</p>
      <PageLink href={next === null ? null : link(next)}>{c.pagination.next}</PageLink>
    </nav>
  );
}

/** A disabled pager control is text, not a link nobody can follow. */
function PageLink({ href, children }: { href: string | null; children: React.ReactNode }) {
  if (href === null) {
    return <span className={cn(buttonClasses('secondary', 'sm'), 'opacity-40')}>{children}</span>;
  }
  return (
    <Link href={href} className={buttonClasses('secondary', 'sm')}>
      {children}
    </Link>
  );
}
