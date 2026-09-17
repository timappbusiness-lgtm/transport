import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/layout/placeholder-page';

export const metadata: Metadata = { title: 'Cereri de transport' };

export default function Page() {
  return (
    <PlaceholderPage title="Cereri de transport">
      Lista completă a cererilor, cu filtre pe rută, vehicul și perioadă, este în
      construcție. Cele mai noi cereri se văd deja pe prima pagină.
    </PlaceholderPage>
  );
}
