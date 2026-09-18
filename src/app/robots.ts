import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/config/brand';
import { isIndexable } from '@/lib/seo-indexing';

/**
 * `robots.txt`.
 *
 * Until `NEXT_PUBLIC_SEO_INDEXABLE` is set, everything is disallowed — the
 * same answer the meta tags give, from the same flag, because a site that
 * says `noindex` in a tag and `Allow` in robots.txt is a site handing a
 * crawler two answers and letting it pick.
 *
 * The account area and the staff area stay disallowed either way. They
 * redirect an anonymous visitor to sign in, so a crawler would only ever
 * index the sign-in page under a hundred different addresses.
 */
export default function robots(): MetadataRoute.Robots {
  if (!isIndexable()) {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/cont/', '/admin/', '/api/', '/autentificare', '/inregistrare'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
