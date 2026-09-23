import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SeoPageForm } from '@/components/admin/seo-page-form';
import { EyebrowPill, StatusBadge } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { loadAllPagesForStaff } from '@/lib/seo-pages-source';
import { pageHref, pageSubject } from '@/lib/seo-pages';

export const dynamic = 'force-dynamic';

type Params = Promise<{ slug: string }>;

export default async function Page({ params }: { params: Params }) {
  const { slug } = await params;
  const page = (await loadAllPagesForStaff()).find((p) => p.slug === slug);
  if (!page) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="text-body">
          <Link
            href={ROUTES.adminPages}
            className="text-muted underline underline-offset-4 decoration-border-strong hover:text-foreground"
          >
            Toate paginile
          </Link>
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <EyebrowPill>{pageSubject(page)}</EyebrowPill>
          <StatusBadge tone={page.isPublished ? 'success' : 'neutral'}>
            {page.isPublished ? 'Publicată' : 'Ciornă'}
          </StatusBadge>
        </div>
        <h1 className="mt-2 text-h2">{page.h1}</h1>
        <p className="mt-2 font-mono text-small text-muted">{pageHref(page)}</p>
        <p className="mt-3 text-body">
          <Link
            href={
              page.isPublished
                ? pageHref(page)
                : `${ROUTES.adminPages}/${page.slug}/previzualizare`
            }
            className="underline underline-offset-4 decoration-border-strong hover:decoration-foreground"
          >
            {page.isPublished ? 'Vezi pagina' : 'Previzualizează'}
          </Link>
        </p>
      </div>

      <section className="rounded-card border border-border bg-surface p-5">
        <SeoPageForm page={page} />
      </section>
    </div>
  );
}
