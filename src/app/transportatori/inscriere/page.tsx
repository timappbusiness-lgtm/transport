import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/layout/placeholder-page';

export const metadata: Metadata = { title: 'Înscrierea transportatorilor' };

export default function Page() {
  return (
    <PlaceholderPage title="Înscrierea transportatorilor">
      Înscrierea firmelor, cu verificarea CUI la ANAF și încărcarea documentelor, e în construcție.
    </PlaceholderPage>
  );
}
