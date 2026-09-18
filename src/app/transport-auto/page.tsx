import type { Metadata } from 'next';
import Link from 'next/link';
import { SITE_URL } from '@/config/brand';
import { seoCopy } from '@/content/transport-auto';
import { indexingMetadata } from '@/lib/seo-indexing';
import { loadPublishedPages } from '@/lib/seo-pages-source';
import { SEO_ROOT, pageHref, pageSubject, type SeoPage, type SeoPageType } from '@/lib/seo-pages';

const c = seoCopy.index;

export const metadata: Metadata = {
  title: c.title,
  description: c.lede,
  alternates: { canonical: `${SITE_URL}${SEO_ROOT}` },
  ...indexingMetadata(true),
};

/**
 * The hub every landing page hangs off.
 *
 * It lists only what is published, which is what makes it useful as an
 * internal-linking surface: a crawler that reaches this page reaches every
 * page we meant it to and none of the drafts.
 *
 * While nothing is published it says so rather than rendering four empty
 * headings — which is also exactly what it looks like on the day this
 * merges, since the whole starting set ships unpublished.
 */
export default async function Page() {
  const pages = await loadPublishedPages();

  const groups: { type: SeoPageType; title: string }[] = [
    { type: 'corridor_international', title: c.corridors },
    { type: 'route_internal', title: c.routes },
    { type: 'county', title: c.counties },
    { type: 'vehicle_type', title: c.vehicleTypes },
  ];

  return (
    <div className="mx-auto w-full max-w-[64rem] px-[clamp(16px,4vw,56px)] py-10 sm:py-14">
      <h1 className="text-[clamp(1.75rem,4.5vw,2.75rem)] leading-tight">
        {c.h1}
        <span className="text-ink-soft"> {c.h1Soft}</span>
      </h1>
      <p className="mt-4 max-w-[62ch] text-[1.0625rem] text-muted">{c.lede}</p>

      {pages.length === 0 ? (
        <p className="mt-10 text-[0.9375rem] text-muted">{c.empty}</p>
      ) : (
        groups.map((group) => {
          const inGroup = pages.filter((page) => page.type === group.type);
          if (inGroup.length === 0) return null;
          return <Group key={group.type} title={group.title} pages={inGroup} />;
        })
      )}
    </div>
  );
}

function Group({ title, pages }: { title: string; pages: SeoPage[] }) {
  return (
    <section className="mt-10">
      <h2 className="text-[1.0625rem]">{title}</h2>
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
