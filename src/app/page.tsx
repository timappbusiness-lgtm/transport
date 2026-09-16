import type { Metadata } from 'next';
import { CarrierCta } from '@/components/home/carrier-cta';
import { Categories } from '@/components/home/categories';
import { Compliance } from '@/components/home/compliance';
import { Hero } from '@/components/home/hero';
import { Platforms } from '@/components/home/platforms';
import { Prices } from '@/components/home/prices';
import { SampleRequests } from '@/components/home/sample-requests';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { BRAND_NAME } from '@/config/brand';

const TITLE = `${BRAND_NAME} — transport auto cu actele la vedere`;
const DESCRIPTION =
  'Postezi gratuit cererea de transport auto, fără cont. Transportatori cu ITP, RCA și copie conformă urmărite zilnic, și prețuri orientative pe coridoarele spre România.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'ro_RO',
    siteName: BRAND_NAME,
    title: TITLE,
    description: DESCRIPTION,
    url: '/',
  },
};

export default function Page() {
  return (
    <>
      <a
        href="#continut"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-card focus:bg-surface focus:px-4 focus:py-2 focus:text-sm"
      >
        Sari la conținut
      </a>
      <SiteHeader />
      <main id="continut">
        <Hero />
        <SampleRequests />
        <Compliance />
        <Prices />
        <Platforms />
        <Categories />
        <CarrierCta />
      </main>
      <SiteFooter />
    </>
  );
}
