import Link from 'next/link';
import { loadPublishedPages } from '@/lib/seo-pages-source';
import { pageHref, pageSubject, type SeoPageType } from '@/lib/seo-pages';

/**
 * A row of links to published landing pages.
 *
 * Absent entirely when nothing of that kind is published — which is the
 * state this ships in, since the whole starting set lands unpublished.
 * That is the same rule the directory grid and the stats band follow:
 * nothing is claimed when there is nothing to show, and a heading over an
 * empty list is a claim.
 */
export async function SeoLinkCloud({
  types,
  title,
  limit = 12,
  className,
}: {
  types: readonly SeoPageType[];
  title: string;
  limit?: number;
  className?: string | undefined;
}) {
  const pages = (await loadPublishedPages())
    .filter((page) => types.includes(page.type))
    .slice(0, limit);

  if (pages.length === 0) return null;

  return (
    <section aria-labelledby="pagini-seo" className={className}>
      <h2 id="pagini-seo" className="text-[1.0625rem]">
        {title}
      </h2>
      <ul className="mt-4 flex flex-wrap gap-2">
        {pages.map((page) => (
          <li key={page.slug}>
            <Link
              href={pageHref(page)}
              className="inline-flex rounded-pill border border-border px-3 py-1.5 text-[0.8125rem] text-muted hover:border-border-strong hover:text-foreground"
            >
              {pageSubject(page)}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
