import { unstable_cache } from 'next/cache';
import { createPublicClient } from './supabase/public';
import { isSupabaseConfigured } from './supabase/env';
import type { FaqItem, SeoPage, SeoPageType } from './seo-pages';

/**
 * Reading landing pages.
 *
 * Everything here goes through `createPublicClient`, which is anon — and
 * anon can only see published rows, because that is what the policy says.
 * So there is no `is_published` filter in this file at all: the rule lives
 * in one place, and a loader added later cannot forget it.
 *
 * The one exception is the admin screen, which reads through the session
 * and gets the drafts because `is_platform_admin()` is in the same policy.
 *
 * Cached with revalidation rather than statically generated: the root
 * layout is `force-dynamic` because the header reads the session, and the
 * comment there says turning that into partial prerendering is a decision
 * for the team rather than a flag to slip into a pull request. Caching the
 * reads gets most of the benefit and makes none of that decision.
 */

export const SEO_TAG = 'seo-pages';
const REVALIDATE_SECONDS = 600;

const COLUMNS =
  'id, type, slug, title, h1, h1_soft, intro, origin, destination, vehicle_type, faq, is_published, published_at, updated_at' as const;

interface Row {
  id: string;
  type: SeoPageType;
  slug: string;
  title: string;
  h1: string;
  h1_soft: string | null;
  intro: string;
  origin: string | null;
  destination: string | null;
  vehicle_type: string | null;
  faq: unknown;
  is_published: boolean;
  published_at: string | null;
  updated_at: string;
}

function toPage(row: Row): SeoPage {
  return {
    id: row.id,
    type: row.type,
    slug: row.slug,
    title: row.title,
    h1: row.h1,
    h1Soft: row.h1_soft,
    intro: row.intro,
    origin: row.origin,
    destination: row.destination,
    vehicleType: row.vehicle_type,
    faq: toFaq(row.faq),
    isPublished: row.is_published,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  };
}

/**
 * `faq` is jsonb, so it arrives as whatever was stored. The RPC refuses an
 * entry missing either half, but this is the boundary of a typed world and
 * a malformed row should cost one question rather than the page.
 */
function toFaq(value: unknown): FaqItem[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return [];
    const q = (item as Record<string, unknown>).q;
    const a = (item as Record<string, unknown>).a;
    return typeof q === 'string' && typeof a === 'string' && q.trim() !== '' && a.trim() !== ''
      ? [{ q, a }]
      : [];
  });
}

async function fetchPublishedPages(): Promise<SeoPage[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = createPublicClient();
  const { data, error } = await supabase.from('seo_pages').select(COLUMNS).order('slug');

  if (error) {
    console.error('[seo] pages query failed', { code: error.code, message: error.message });
    return [];
  }
  return ((data ?? []) as unknown as Row[]).map(toPage);
}

/**
 * Every published page.
 *
 * One read rather than one per page: 161 rows of short text is smaller
 * than the HTML of the page rendering them, and every landing page needs
 * the list anyway for its "see also" links. The sitemap reads the same
 * cache entry.
 */
export const loadPublishedPages = unstable_cache(fetchPublishedPages, [SEO_TAG], {
  revalidate: REVALIDATE_SECONDS,
  tags: [SEO_TAG],
});

/** One published page, or null — which the route turns into a 404. */
export async function loadPage(
  slug: string,
  type?: SeoPageType,
): Promise<SeoPage | null> {
  const pages = await loadPublishedPages();
  const page = pages.find((p) => p.slug === slug);
  if (!page) return null;
  // A county slug reached through the corridor route, or the other way
  // round, is a URL nobody meant: two addresses for one page is the thing
  // canonical tags exist to clean up after, and not creating it is better.
  if (type !== undefined && page.type !== type) return null;
  return page;
}

/** Everything, drafts included, for /admin/pagini. Reads as the session. */
export async function loadAllPagesForStaff(): Promise<SeoPage[]> {
  if (!isSupabaseConfigured()) return [];

  const { createClient } = await import('./supabase/server');
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('seo_pages')
    .select(COLUMNS)
    .order('type')
    .order('slug');

  if (error) {
    console.error('[admin/pagini] query failed', { code: error.code, message: error.message });
    return [];
  }
  return ((data ?? []) as unknown as Row[]).map(toPage);
}
