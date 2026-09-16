import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/layout/placeholder-page';

export const metadata: Metadata = { title: 'Contact' };

export default function Page() {
  return (
    <PlaceholderPage title="Contact">
      Datele de contact vor fi publicate înainte de lansare.
    </PlaceholderPage>
  );
}
