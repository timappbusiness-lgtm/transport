import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/layout/placeholder-page';

export const metadata: Metadata = { title: 'Adaugă o cerere de transport' };

export default function Page() {
  return (
    <PlaceholderPage title="Adaugă o cerere de transport">
      Formularul de cerere, gratuit și fără cont, e în construcție.
    </PlaceholderPage>
  );
}
