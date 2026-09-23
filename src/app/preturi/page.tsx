import type { Metadata } from 'next';
import Link from 'next/link';
import { PriceFaq } from '@/components/prices/faq';
import { PricesView } from '@/components/prices/prices-view';
import { buttonClasses } from '@/components/ui/button';
import { Lede, StatusBadge } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { pricesCopy } from '@/content/preturi';
import { parsePrefill } from '@/lib/price-prefill';
import { SeoLinkCloud } from '@/components/seo/link-cloud';
import { isPublished, loadPrices } from '@/lib/prices-source';

export const metadata: Metadata = {
  title: pricesCopy.meta.title,
  description: pricesCopy.meta.description,
  alternates: { canonical: ROUTES.prices },
  // Not indexed while the figures are reference points the team is still
  // settling: a search result that lands on a price is read as a quote.
  robots: { index: false, follow: true },
};

/**
 * What this page shows depends on the session — staff see the table before
 * it is published — so it is never prerendered.
 */
export const dynamic = 'force-dynamic';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [params, data] = await Promise.all([searchParams, loadPrices()]);
  const prefill = parsePrefill(params);
  const settings = data.settings;
  const published = isPublished(data);
  // Staff reading the table before anyone else can: the policy lets them,
  // and the banner says plainly that no visitor sees this yet.
  const staffPreview = !published && settings !== null && data.rates.length > 0;
  const c = pricesCopy.hero;

  return (
    <div className="mx-auto w-full max-w-[72rem] px-[clamp(16px,4vw,56px)] py-10 sm:py-14">
      <header className="max-w-[46rem]">
        <h1 className="text-h1">{c.heading}</h1>
        <Lede className="mt-4">
          {published || staffPreview ? c.lede : c.ledeUnpublished}
        </Lede>
      </header>

      {staffPreview ? (
        <p className="mt-6">
          <StatusBadge tone="warning">Nepublicat · vizibil doar pentru echipă</StatusBadge>
        </p>
      ) : null}

      {settings && (published || staffPreview) ? (
        <PricesView rates={data.rates} settings={settings} initial={prefill} />
      ) : (
        <Unpublished />
      )}

      <SeoLinkCloud
        types={['corridor_international', 'route_internal']}
        title="Prețuri pe rutele cele mai cerute"
        className="mt-12"
      />

      <PriceFaq />
    </div>
  );
}

/**
 * Before the team publishes.
 *
 * No figures and no calculator — a calculator running on rates nobody has
 * approved would be the invented number this site does not show. What is
 * left is the thing that actually gets someone a price: the request form.
 */
function Unpublished() {
  const c = pricesCopy.unpublished;
  return (
    <div className="mt-10 rounded-card border border-border bg-surface p-6 sm:p-8">
      <h2 className="text-h3">{c.title}</h2>
      <p className="mt-2 max-w-[60ch] text-body leading-relaxed text-muted">{c.body}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        <Link href={ROUTES.newRequest} className={buttonClasses('primary', 'md')}>
          {c.cta}
        </Link>
        <Link href={ROUTES.routes} className={buttonClasses('secondary', 'md')}>
          {c.secondary}
        </Link>
      </div>
    </div>
  );
}
