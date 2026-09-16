import type { Metadata } from 'next';
import { CarrierCta } from '@/components/home/carrier-cta';
import { Categories } from '@/components/home/categories';
import { Compliance } from '@/components/home/compliance';
import { Hero } from '@/components/home/hero';
import { Platforms } from '@/components/home/platforms';
import { Prices } from '@/components/home/prices';
import { SampleRequests } from '@/components/home/sample-requests';
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
        <Hero />
        <SampleRequests />
        <Compliance />
        <Prices />
        <Platforms />
        <Categories />
        <CarrierCta />
    </>
  );
}
