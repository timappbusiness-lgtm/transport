import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/config/brand';
import { ROUTES } from '@/config/routes';
import { isIndexable } from '@/lib/seo-indexing';
import { loadPublishedPages } from '@/lib/seo-pages-source';
import { pageHref, SEO_ROOT } from '@/lib/seo-pages';

/**
 * `sitemap.xml`.
 *
 * Only published landing pages, and only because `loadPublishedPages`
 * reads as anon and anon cannot see an unpublished row. There is no
 * `is_published` filter here on purpose: the rule lives in the policy, so
 * this file cannot get it wrong.
 *
 * Empty while the site is not indexable. A sitemap on a `noindex` site is
 * an invitation to crawl pages we have just told the crawler to ignore.
 */
/**
 * Rendered per request rather than at build time.
 *
 * Statically prerendered, this file would freeze whatever was published
 * the moment the site was built, and publishing a page from /admin/pagini
 * would not reach a crawler until the next deploy. The read underneath is
 * cached and tagged, so the cost of being dynamic is a render, not a
 * query — and publishing busts the tag.
 */
export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!isIndexable()) return [];

  const base = (path: string, priority: number, frequency: 'daily' | 'weekly' | 'monthly') => ({
    url: `${SITE_URL}${path}`,
    lastModified: new Date(),
    changeFrequency: frequency,
    priority,
  });

  const statics: MetadataRoute.Sitemap = [
    base('/', 1, 'daily'),
    base(SEO_ROOT, 0.8, 'weekly'),
    base(ROUTES.requests, 0.8, 'daily'),
    base(ROUTES.routes, 0.8, 'daily'),
    base(ROUTES.companies, 0.7, 'weekly'),
    base(ROUTES.prices, 0.7, 'weekly'),
    base(ROUTES.plans, 0.5, 'monthly'),
    base(ROUTES.verification, 0.5, 'monthly'),
    base(ROUTES.faq, 0.5, 'monthly'),
    base(ROUTES.terms, 0.2, 'monthly'),
    base(ROUTES.privacy, 0.2, 'monthly'),
  ];

  const pages = await loadPublishedPages();

  return [
    ...statics,
    ...pages.map((page) => ({
      url: `${SITE_URL}${pageHref(page)}`,
      // What the page last said, not when it was last crawled. A `lastmod`
      // that moves on every build teaches a crawler to ignore it.
      lastModified: new Date(page.updatedAt),
      changeFrequency: 'weekly' as const,
      priority: page.type === 'corridor_international' ? 0.8 : 0.6,
    })),
  ];
}
