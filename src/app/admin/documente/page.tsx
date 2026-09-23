import { ReviewQueue, type PendingCompany, type PendingDocument } from '@/components/admin/review-queue';
import { EyebrowPill } from '@/components/ui/primitives';
import { adminReviewCopy } from '@/content/admin';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';

const c = adminReviewCopy;

/** The queue is the session: staff membership, and rows that change all day. */
export const dynamic = 'force-dynamic';

/**
 * The review queue.
 *
 * Access is the layout's job — a non-staff visitor gets a 404 there — and
 * both RPCs behind the forms check again. This page only reads.
 */
export default async function Page() {
  const { documents, companies } = await load();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <EyebrowPill>Staff</EyebrowPill>
        <h1 className="mt-2 text-h2">{c.title}</h1>
        <p className="mt-2 max-w-[62ch] text-body text-muted">{c.lede}</p>
      </div>

      <ReviewQueue documents={documents} companies={companies} />
    </div>
  );
}

/**
 * Everything the queue needs, read as staff.
 *
 * RLS lets a platform admin read every company and document; a reviewer who
 * somehow lost that membership sees two empty lists rather than a leak.
 */
async function load(): Promise<{ documents: PendingDocument[]; companies: PendingCompany[] }> {
  if (!isSupabaseConfigured()) return { documents: [], companies: [] };

  const supabase = await createClient();
  const [docsResult, reqResult, companiesResult] = await Promise.all([
    supabase
      .from('documents')
      .select(
        'id, kind, scope, valid_until, created_at, company:companies(legal_name), vehicle:vehicles(plate_number)',
      )
      .in('status', ['uploaded', 'parsing', 'pending'])
      .order('created_at', { ascending: true })
      .limit(100),
    supabase.from('document_requirements').select('scope, kind, label_ro, has_expiry'),
    supabase
      .from('companies')
      .select('id, legal_name, cui, company_type, updated_at')
      .eq('verification_status', 'pending')
      .order('updated_at', { ascending: true })
      .limit(50),
  ]);

  for (const [label, result] of [
    ['documents', docsResult],
    ['requirements', reqResult],
    ['companies', companiesResult],
  ] as const) {
    if (result.error) {
      console.error(`[admin/documente] ${label} query failed`, {
        code: result.error.code,
        message: result.error.message,
      });
    }
  }

  const requirements = new Map(
    (reqResult.data ?? []).map((row) => [`${row.scope}:${row.kind}`, row]),
  );

  const documents: PendingDocument[] = (docsResult.data ?? []).map((row) => {
    const requirement = requirements.get(`${row.scope}:${row.kind}`);
    const company = Array.isArray(row.company) ? row.company[0] : row.company;
    const vehicle = Array.isArray(row.vehicle) ? row.vehicle[0] : row.vehicle;
    return {
      id: row.id,
      kind: row.kind,
      scope: row.scope,
      valid_until: row.valid_until,
      created_at: row.created_at,
      companyName: company?.legal_name ?? '—',
      plate: vehicle?.plate_number ?? null,
      label: requirement?.label_ro ?? row.kind,
      hasExpiry: requirement?.has_expiry ?? true,
    };
  });

  const pending = companiesResult.data ?? [];
  const companies: PendingCompany[] = await Promise.all(
    pending.map(async (row) => {
      const [readiness, missing, vehicles] = await Promise.all([
        supabase.rpc('company_review_readiness', { p_company_id: row.id }),
        supabase
          .from('v_company_missing_documents')
          .select('state, is_blocking')
          .eq('company_id', row.id),
        supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('company_id', row.id),
      ]);

      const blocking = (missing.data ?? []).filter((d) => d.is_blocking);
      const ready = Array.isArray(readiness.data) ? readiness.data[0] : readiness.data;

      return {
        id: row.id,
        legal_name: row.legal_name,
        cui: row.cui,
        company_type: row.company_type,
        submitted_at: row.updated_at,
        documentsTotal: blocking.length,
        documentsIn: blocking.filter((d) => d.state === 'ok' || d.state === 'in_review').length,
        vehicles: vehicles.count ?? 0,
        ready: ready?.is_ready === true,
      };
    }),
  );

  return { documents, companies };
}
