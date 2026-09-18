import type { Metadata } from 'next';

/**
 * Whether this deployment may be indexed at all.
 *
 * One flag, read in one place. Until launch every page carries
 * `noindex`, which is what the root layout has said since the first
 * commit; flipping `NEXT_PUBLIC_SEO_INDEXABLE` to `1` on the production
 * environment turns indexing on for the whole site at once.
 *
 * `NEXT_PUBLIC_` because the value has to be identical in the metadata
 * Next.js renders on the server and in `robots.txt` — a site that says
 * `noindex` in a meta tag and `Allow` in robots.txt is a site giving a
 * crawler two answers.
 *
 * A preview deployment must never be indexable whatever the flag says:
 * `VERCEL_ENV` is `preview` there, and a preview that got indexed would
 * compete with production for the same searches.
 */
export function isIndexable(): boolean {
  if (process.env.NEXT_PUBLIC_VERCEL_ENV === 'preview') return false;
  return process.env.NEXT_PUBLIC_SEO_INDEXABLE === '1';
}

/**
 * The `robots` half of a page's metadata.
 *
 * `allowed` is the page's own answer — an unpublished page passes false
 * and stays out whatever the flag says. The flag can only ever take
 * permission away, never grant it.
 */
export function indexingMetadata(allowed: boolean): Pick<Metadata, 'robots'> {
  const index = allowed && isIndexable();
  return { robots: { index, follow: true } };
}
