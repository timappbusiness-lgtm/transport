import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SeoPageBody } from '@/components/seo/page-body';
import { BRAND_NAME, SITE_URL } from '@/config/brand';
import { OG_IMAGE } from '@/config/brand-assets';
import { loadPage, loadPublishedPages } from '@/lib/seo-pages-source';
import { loadSeoPageData } from '@/lib/seo-data-source';
import { indexingMetadata } from '@/lib/seo-indexing';
import { pageHref, relatedPages } from '@/lib/seo-pages';

type Params = Promise<{ slug: string }>;

/**
 * County pages.
 *
 * A segment of their own so a county slug can never collide with a
 * corridor or a vehicle type — `arad` the county and `arad` inside a city
 * pair are different pages, and a shared namespace checked by hand breaks
 * the first time somebody adds a row.
 */

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const page = await loadPage((await params).slug, 'county');
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
      siteName: BRAND_NAME,
      images: [OG_IMAGE],
      locale: 'ro_RO',
    },
    ...indexingMetadata(true),
  };
}

export default async function Page({ params }: { params: Params }) {
  const page = await loadPage((await params).slug, 'county');
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
