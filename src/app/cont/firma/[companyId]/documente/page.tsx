import type { Metadata } from 'next';
import Link from 'next/link';
import { Card, PageHeader } from '@/components/app/badge';
import { DocumentHistory } from '@/components/app/document-history';
import { DocumentUpload } from '@/components/app/document-upload';
import { RequirementList } from '@/components/app/requirement-list';
import { companyRoutes } from '@/config/routes';
import { requireMembership } from '@/lib/auth';

export const metadata: Metadata = { title: 'Documentele firmei' };

export default async function Page({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params;
  const { session, membership } = await requireMembership(companyId);
  const { supabase } = session;

  const [requirementsResult, labelsResult, historyResult] = await Promise.all([
    supabase
      .from('v_company_missing_documents')
      .select('kind, label_ro, is_blocking, state, valid_until')
      .eq('company_id', companyId)
      .order('is_blocking', { ascending: false }),
    supabase.from('document_requirements').select('kind, label_ro'),
    supabase
      .from('documents')
      .select('id, kind, status, valid_until, rejection_reason, created_at')
      .eq('company_id', companyId)
      .eq('scope', 'company')
      .neq('status', 'replaced')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const requirements = requirementsResult.data ?? [];
  const labels = Object.fromEntries((labelsResult.data ?? []).map((r) => [r.kind, r.label_ro]));
  const kinds = requirements.flatMap((r) => (r.kind && r.label_ro ? [{ kind: r.kind, label: r.label_ro }] : []));

  return (
    <>
      <PageHeader
        title="Documentele firmei"
        description={
          <>
            {membership.name}. Documentele vehiculelor se încarcă din{' '}
            <Link href={companyRoutes(companyId).fleet} className="underline underline-offset-4">
              pagina fiecărui vehicul
            </Link>
            . Un document nou nu înlocuiește pe cel valabil până nu este aprobat.
          </>
        }
      />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Card>
          <h2 className="text-lg font-bold">Ce se cere</h2>
          <div className="mt-2">
            <RequirementList rows={requirements} />
          </div>
        </Card>
        <div className="grid content-start gap-5">
          <Card>
            <h2 className="mb-3 text-lg font-bold">Încarcă un document</h2>
            <DocumentUpload companyId={companyId} kinds={kinds} />
          </Card>
          <Card>
            <h2 className="mb-3 text-lg font-bold">Istoric</h2>
            <DocumentHistory rows={historyResult.data ?? []} labels={labels} />
          </Card>
        </div>
      </div>
    </>
  );
}
