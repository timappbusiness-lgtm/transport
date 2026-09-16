import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/layout/placeholder-page';

export const metadata: Metadata = { title: 'Politica de confidențialitate' };

export default function Page() {
  return (
    <PlaceholderPage title="Politica de confidențialitate">
      Politica de confidențialitate este în redactare.
    </PlaceholderPage>
  );
}
