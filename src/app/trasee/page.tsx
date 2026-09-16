import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/layout/placeholder-page';

export const metadata: Metadata = { title: 'Trasee și prețuri' };

export default function Page() {
  return (
    <PlaceholderPage title="Trasee și prețuri">
      Aici vor fi coridoarele, cu prețuri orientative și, pe măsură ce se strâng transporturi, mediana prețurilor acceptate.
    </PlaceholderPage>
  );
}
