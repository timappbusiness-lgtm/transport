import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/layout/placeholder-page';

export const metadata: Metadata = { title: 'Cerere de transport' };

/**
 * The detail page belongs to the requests board, which is the next piece of
 * work. Until then this answers rather than 404s, because the cards on the
 * homepage already point here.
 */
export default function Page() {
  return (
    <PlaceholderPage title="Cerere de transport">
      Pagina fiecărei cereri, cu detaliile vehiculului și formularul de ofertă,
      vine odată cu lista completă.
    </PlaceholderPage>
  );
}
