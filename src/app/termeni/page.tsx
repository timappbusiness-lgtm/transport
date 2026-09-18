import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/legal-page';
import { LEGAL_DOCUMENTS } from '@/content/legal';

const doc = LEGAL_DOCUMENTS.termeni;

export const metadata: Metadata = {
  title: doc.title,
  description: 'Termenii în care poți folosi platforma: ce facem, ce nu facem și ce își asumă fiecare.',
};

export default function Page() {
  return <LegalPage document={doc} />;
}
