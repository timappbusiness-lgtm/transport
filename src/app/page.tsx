import type { Metadata } from 'next';
import { Activity } from '@/components/home/activity';
import { CarrierCta } from '@/components/home/carrier-cta';
import { Carriers } from '@/components/home/carriers';
import { Comparison } from '@/components/home/comparison';
import { Faq } from '@/components/home/faq';
import { DataPanel } from '@/components/home/data-panel';
import { FinalCta } from '@/components/home/final-cta';
import { Forwarders } from '@/components/home/forwarders';
import { Hero } from '@/components/home/hero';
import { Trust } from '@/components/home/trust';
import { Prices } from '@/components/home/prices';
import { StatsBand } from '@/components/home/stats-band';
import { BRAND_NAME } from '@/config/brand';

const TITLE = `${BRAND_NAME} — transport auto cu firme verificate`;
const DESCRIPTION =
  'Publici gratuit cererea de transport auto și primești oferte doar de la transportatori cu documente valabile. Rute naționale și internaționale, tarife orientative.';

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'ro_RO',
    title: TITLE,
    description: DESCRIPTION,
    url: '/',
  },
};

export default function Page() {
  return (
    <>
      <Hero />
      <Activity />
      <CarrierCta />
      <Trust />
      <DataPanel />
      <Comparison />
      <Carriers />
      <Forwarders />
      <Prices />
      <StatsBand />
      <Faq />
      <FinalCta />
    </>
  );
}
