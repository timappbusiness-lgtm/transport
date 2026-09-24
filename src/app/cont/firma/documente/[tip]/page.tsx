import { redirect } from 'next/navigation';
import { ROUTES } from '@/config/routes';
import { requirementAnchor } from '@/lib/document-checklist';

/**
 * One document per screen was replaced by one screen for every document
 * (`/cont/firma/documente`). An old link or bookmark lands on the row it
 * meant, on that screen.
 */
export default async function Page({ params }: { params: Promise<{ tip: string }> }) {
  const { tip } = await params;
  const kind = /^[a-z_]{1,64}$/.test(tip) ? tip : null;
  redirect(kind === null ? ROUTES.accountDocuments : `${ROUTES.accountDocuments}#${requirementAnchor(kind, null)}`);
}
