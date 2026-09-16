import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/layout/placeholder-page';

export const metadata: Metadata = { title: 'Termeni și condiții' };

export default function Page() {
  return (
    <PlaceholderPage title="Termeni și condiții">
      Termenii de utilizare sunt în redactare.
    </PlaceholderPage>
  );
}
