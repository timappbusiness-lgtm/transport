import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SeoPageBody } from '@/components/seo/page-body';
import { SITE_URL } from '@/config/brand';
import { loadPage, loadPublishedPages } from '@/lib/seo-pages-source';
import { loadSeoPageData } from '@/lib/seo-data-source';
import { indexingMetadata } from '@/lib/seo-indexing';
import { pageHref, relatedPages, type SeoPage } from '@/lib/seo-pages';

type Params = Promise<{ slug: string }>;

/**
 * Corridors, internal routes and vehicle types.
 *
 * Counties live one segment deeper, at `/transport-auto/judet/[slug]`, so
 * a county slug can never collide with one of these. A slug reached
 * through the wrong route is a 404 rather than a render: two addresses for
 * one page is what canonical tags exist to clean up after, and not
 * creating the second one is better than declaring it away.
 *
 * An unpublished page is a 404 for the same reason it is invisible
 * everywhere else — anon cannot read the row at all, so there is nothing
 * here to check.
 */

async function find(slug: string): Promise<SeoPage | null> {
  const page = await loadPage(slug);
  return page && page.type !== 'county' ? page : null;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const page = await find((await params).slug);
  if (!page) return { title: 'Transport auto', ...indexingMetadata(false) };

  const url = `${SITE_URL}${pageHref(page)}`;
  return {
    title: page.title,
    description: page.intro.slice(0, 200),
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      url,
      title: page.title,
      description: page.intro.slice(0, 200),
      siteName: 'Coridor',
      locale: 'ro_RO',
    },
    ...indexingMetadata(true),
  };
}

export default async function Page({ params }: { params: Params }) {
  const page = await find((await params).slug);
  if (!page) notFound();

  const [data, all] = await Promise.all([loadSeoPageData(page), loadPublishedPages()]);

  return (
    <SeoPageBody
      page={page}
      data={data}
      related={relatedPages(page, all)}
      now={new Date()}
    />
  );
}
