import Link from 'next/link';
import { Container } from '@/components/layout/container';
import { SectionHead } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { homeCopy } from '@/content/home';
import { REQUEST_FILTER_KEYS } from '@/lib/request-filters';
import { formatNumber, pluralRo, showCategories, type CategoryCount } from '@/lib/requests';
import { loadHomepageActivity, type HomepageActivity } from '@/lib/requests-source';

const c = homeCopy.activity.categories;

/**
 * What is actually on the board, per kind of vehicle.
 *
 * Every number here is a count of published requests over a window the
 * team sets, with our own accounts excluded — `category_counts()` does
 * all three. Nothing is rounded, nothing carries a „+", and a category
 * with nothing in it is absent rather than shown as zero.
 *
 * Below the same threshold the figures use, the whole block is absent.
 * A grid of ones under a confident heading is worse than no grid.
 */
export async function Categories() {
  const activity = await loadHomepageActivity();
  return <CategoriesSection {...activity} />;
}

/** The section given its data, so it can be rendered without a database. */
export function CategoriesSection({
  stats,
  thresholds,
  categories,
  categoryWindowDays,
}: HomepageActivity) {
  if (!showCategories(stats, categories, thresholds)) return null;

  return (
    <section id="categorii" aria-label={c.eyebrow} className="bg-ground-alt">
      <Container className="py-14 sm:py-16">
        <SectionHead eyebrow={c.eyebrow} strong={c.strong} soft={c.soft} />
        <p className="mt-3 text-[0.8125rem] text-muted">
          {c.note(pluralRo(categoryWindowDays, 'zi', 'zile'))}
        </p>

        <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {categories.map((row) => (
            <CategoryCard key={row.category} row={row} />
          ))}
        </ul>
      </Container>
    </section>
  );
}

/**
 * One category, linking to the board already filtered by it.
 *
 * The accessible name says both numbers in a sentence, because „12" and
 * „Autoturism" read as two unrelated things to somebody who cannot see
 * that they are stacked.
 */
function CategoryCard({ row }: { row: CategoryCount }) {
  const count = pluralRo(row.requests, 'cerere', 'cereri');
  return (
    <li className="min-w-0">
      <Link
        href={`${ROUTES.requests}?${REQUEST_FILTER_KEYS.category}=${row.category}`}
        aria-label={c.linkLabel(count, row.label)}
        className="flex h-full flex-col justify-between gap-2 rounded-card border border-border bg-surface p-4 transition-[border-color] duration-150 hover:border-border-strong"
      >
        <span className="font-display text-[clamp(1.375rem,3vw,1.75rem)] leading-none tabular-nums">
          {formatNumber(row.requests)}
        </span>
        <span className="text-[0.8125rem] text-muted">{row.label}</span>
      </Link>
    </li>
  );
}
