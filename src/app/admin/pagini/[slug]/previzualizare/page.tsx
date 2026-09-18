import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SeoPageBody } from '@/components/seo/page-body';
import { ROUTES } from '@/config/routes';
import { loadSeoPageData } from '@/lib/seo-data-source';
import { loadAllPagesForStaff } from '@/lib/seo-pages-source';
import { relatedPages } from '@/lib/seo-pages';

export const dynamic = 'force-dynamic';

type Params = Promise<{ slug: string }>;

/**
 * A draft, rendered as it will look.
 *
 * It lives under `/admin` rather than being a flag on the public route,
 * and that is the whole design. The public route reads through the anon
 * client and caches what it gets; teaching it to return drafts for staff
 * would put a draft in a cache that anon also reads, which is a leak one
 * bad cache key away. Here the read is the session's, the layout 404s a
 * non-staff visitor, and the public path never learns about drafts at all.
 */
export default async function Page({ params }: { params: Params }) {
  const { slug } = await params;
  const all = await loadAllPagesForStaff();
  const page = all.find((p) => p.slug === slug);
  if (!page) notFound();

  const data = await loadSeoPageData(page);

  return (
    <>
      <div className="mb-4 rounded-card border border-border-strong bg-ground-alt px-4 py-3">
        <p className="text-sm">
          Previzualizare{page.isPublished ? '' : ' a unei ciorne'}. Nu este vizibilă public.{' '}
          <Link
            href={`${ROUTES.adminPages}/${page.slug}`}
            className="underline underline-offset-4 decoration-border-strong hover:decoration-foreground"
          >
            Înapoi la editare
          </Link>
        </p>
      </div>

      <SeoPageBody
        page={page}
        data={data}
        related={relatedPages(page, all.filter((p) => p.isPublished))}
        now={new Date()}
      />
    </>
  );
}
