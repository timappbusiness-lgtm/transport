import { SeoBulkPublish } from '@/components/admin/seo-bulk-publish';
import { SeoPageRow } from '@/components/admin/seo-page-row';
import { EyebrowPill } from '@/components/ui/primitives';
import { seoCopy } from '@/content/transport-auto';
import { loadAllPagesForStaff } from '@/lib/seo-pages-source';
import { SEO_PAGE_TYPES, type SeoPageType } from '@/lib/seo-pages';

/** Staff membership is the session, so nothing here is ever prerendered. */
export const dynamic = 'force-dynamic';

const TITLES: Record<SeoPageType, string> = {
  corridor_international: seoCopy.index.corridors,
  route_internal: seoCopy.index.routes,
  county: seoCopy.index.counties,
  vehicle_type: seoCopy.index.vehicleTypes,
};

/**
 * Every landing page, drafts included.
 *
 * Access is the layout's job — a non-staff visitor gets a 404 — and the
 * three RPCs behind the buttons refuse them a second time.
 *
 * The whole starting set ships unpublished on purpose, so this screen
 * opens on 161 drafts. That is the point: somebody reads each page before
 * it is on the internet, and the bulk button is there for the day they
 * have read a whole type.
 */
export default async function Page() {
  const pages = await loadAllPagesForStaff();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <EyebrowPill>Staff</EyebrowPill>
        <h1 className="mt-2 text-h2">Pagini de destinație</h1>
        <p className="mt-2 max-w-[62ch] text-sm text-muted">
          Paginile care aduc clienți din căutări. Nimic nu se publică automat: citește
          pagina, corectează ce trebuie, apoi public-o. O pagină nepublicată nu apare
          nicăieri — nici în sitemap, nici în legături, nici la adresa ei.
        </p>
        <p className="mt-2 text-sm text-muted">
          {pages.filter((page) => page.isPublished).length} publicate din {pages.length}.
        </p>
      </div>

      {SEO_PAGE_TYPES.map((type) => {
        const inType = pages.filter((page) => page.type === type);
        if (inType.length === 0) return null;
        const drafts = inType.filter((page) => !page.isPublished).length;

        return (
          <section key={type} aria-labelledby={type}>
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 id={type} className="text-h3">
                {TITLES[type]}{' '}
                <span className="text-sm text-muted">
                  ({inType.length - drafts}/{inType.length})
                </span>
              </h2>
              <SeoBulkPublish type={type} drafts={drafts} />
            </div>

            <ul className="mt-3 divide-y divide-border rounded-card border border-border bg-surface px-4 sm:px-5">
              {inType.map((page) => (
                <SeoPageRow key={page.slug} page={page} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
