import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { DocumentHistory, type HistoryRow } from '@/components/account/document-history';
import { DocumentUpload } from '@/components/account/document-upload';
import { RequirementList, type RequirementRow } from '@/components/account/requirement-list';
import { SubmitForReview } from '@/components/account/submit-for-review';
import { EyebrowPill } from '@/components/ui/primitives';
import { HelpLink } from '@/components/help/help-link';
import { ROUTES } from '@/config/routes';
import { accountCopy } from '@/content/account';
import { requireAccountContext } from '@/lib/auth/account';
import { isRequirementState } from '@/lib/documents';
import { reviewProgress } from '@/lib/review';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';

type DocumentKind = Database['public']['Enums']['document_kind'];

export const metadata: Metadata = { title: accountCopy.documents.title };

export default async function Page() {
  const context = await requireAccountContext(ROUTES.accountDocuments);
  const company = context.activeCompany;
  if (!company) redirect(ROUTES.accountCompanyCreate);

  const supabase = await createClient();
  const [requirementsResult, labelsResult, historyResult] = await Promise.all([
    supabase
      .from('v_company_missing_documents')
      .select('kind, label_ro, is_blocking, state, valid_until')
      .eq('company_id', company.id)
      .order('is_blocking', { ascending: false }),
    supabase.from('document_requirements').select('kind, label_ro'),
    supabase
      .from('documents')
      .select('id, kind, status, valid_until, rejection_reason, created_at')
      .eq('company_id', company.id)
      .eq('scope', 'company')
      .neq('status', 'replaced')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  const requirements = (requirementsResult.data ?? []) as RequirementRow[];
  const progress = reviewProgress(
    requirements.map((row) => {
      const state = row.state ?? null;
      return {
        is_blocking: row.is_blocking ?? false,
        state: isRequirementState(state) ? state : ('missing' as const),
      };
    }),
  );

  // A carrier is not ready until every vehicle is covered too. Forwarders
  // are not asked for a fleet, and the RPC applies the same rule.
  const vehiclesReady = await fleetIsCovered(company.id, company.company_type);
  const labels = Object.fromEntries(
    ((labelsResult.data ?? []) as { kind: string; label_ro: string }[]).map((row) => [
      row.kind,
      row.label_ro,
    ]),
  );
  const kinds = requirements.flatMap((row) =>
    row.kind && row.label_ro ? [{ kind: row.kind as DocumentKind, label: row.label_ro }] : [],
  );
  const c = accountCopy.documents;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <EyebrowPill>{accountCopy.nav.company}</EyebrowPill>
        <h1 className="mt-2 text-h2">{c.title}</h1>
        <p className="mt-2 max-w-[54ch] text-sm text-muted">
          {c.lede}{' '}
          <Link href={ROUTES.accountFleet} className="underline underline-offset-4">
            {c.vehicleHint}
          </Link>
        </p>
        <p className="mt-2 flex flex-wrap gap-x-4">
          <HelpLink topic="documents" />
          <HelpLink topic="expiry" label="Ce se întâmplă la expirare" />
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="flex flex-col gap-6">
          <section className="rounded-card border border-border bg-surface p-5">
            <h2 className="text-sm font-medium">{c.required}</h2>
            <div className="mt-3">
              <RequirementList rows={requirements} />
            </div>
          </section>

          <SubmitForReview
            companyId={company.id}
            status={company.verification_status}
            progress={progress}
            needsVehicles={company.company_type !== 'expeditie'}
            vehiclesReady={vehiclesReady}
            note={company.verification_note ?? null}
          />
        </div>

        <div className="flex flex-col gap-6">
          <section className="rounded-card border border-border bg-surface p-5">
            <h2 className="mb-4 text-sm font-medium">{c.upload}</h2>
            <DocumentUpload companyId={company.id} kinds={kinds} />
          </section>

          <section className="rounded-card border border-border bg-surface p-5">
            <h2 className="mb-4 text-sm font-medium">{c.history}</h2>
            <DocumentHistory rows={(historyResult.data ?? []) as HistoryRow[]} labels={labels} />
          </section>
        </div>
      </div>
    </div>
  );
}

/**
 * True when the company has at least one vehicle and none of them is
 * missing a blocking document. Mirrors the fleet half of
 * `company_review_readiness()`.
 */
async function fleetIsCovered(companyId: string, companyType: string): Promise<boolean> {
  if (companyType === 'expeditie') return true;

  const supabase = await createClient();
  const [vehicles, missing] = await Promise.all([
    supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('company_id', companyId),
    supabase
      .from('v_vehicle_missing_documents')
      .select('vehicle_id, is_blocking, state')
      .eq('company_id', companyId),
  ]);

  if ((vehicles.count ?? 0) === 0) return false;

  return !(missing.data ?? []).some(
    (row) => row.is_blocking && row.state !== 'ok' && row.state !== 'in_review',
  );
}
