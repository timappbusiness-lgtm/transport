import type { Metadata } from 'next';
import { LegalPage } from '@/components/legal/legal-page';
import { LEGAL_DOCUMENTS } from '@/content/legal';

const doc = LEGAL_DOCUMENTS.cookies;

export const metadata: Metadata = {
  title: doc.title,
  description: 'Două cookie-uri, ambele strict necesare. Fără publicitate și fără analytics.',
};

export default function Page() {
  return <LegalPage document={doc} />;
}
