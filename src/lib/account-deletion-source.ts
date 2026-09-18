import 'server-only';
import type { AccountContext } from '@/lib/auth/account';
import { createClient } from '@/lib/supabase/server';

/**
 * What the „Date personale" screen and `/admin/stergeri` read.
 *
 * Every query here goes through the caller's own session, so the policies
 * decide what comes back and this file never has to. The one thing it
 * does decide is what to do when a query fails: nothing is invented, and
 * a screen with a missing section says so rather than rendering an empty
 * one that reads as „you have no deletion request".
 */

export type DeletionStatus =
  | 'requested'
  | 'blocked'
  | 'scheduled'
  | 'completed'
  | 'cancelled';

export interface DeletionRequest {
  id: string;
  kind: 'user' | 'company';
  status: DeletionStatus;
  company_id: string | null;
  reason_blocked: string | null;
  requested_at: string;
  scheduled_for: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  staff_reason: string | null;
}

export interface ExportRequest {
  id: string;
  status: string;
  created_at: string;
  expires_at: string | null;
  download_token: string;
  size_bytes: number | null;
}

export interface DeletableCompany {
  id: string;
  name: string;
  blockers: string[];
}

export interface PersonalDataView {
  graceDays: number;
  supportEmail: string | null;
  /** The caller's own open request, if there is one. */
  own: DeletionRequest | null;
  /** Why a personal deletion cannot start today. Empty means it can. */
  ownBlockers: string[];
  /** Firms the caller owns, each with its own obstacles and its own request. */
  companies: DeletableCompany[];
  companyRequests: DeletionRequest[];
  latestExport: ExportRequest | null;
}

const REQUEST_COLUMNS =
  'id, kind, status, company_id, reason_blocked, requested_at, scheduled_for, completed_at, cancelled_at, staff_reason';

const OPEN: DeletionStatus[] = ['requested', 'blocked', 'scheduled'];

export async function loadPersonalData(context: AccountContext): Promise<PersonalDataView> {
  const supabase = await createClient();

  const owned = context.memberships
    .filter((m) => m.role === 'owner')
    .map((m) => ({ id: m.company.id, name: m.company.display_name ?? m.company.legal_name }));

  const [settings, requests, exports, ownBlockers, companyBlockers] = await Promise.all([
    supabase.from('deletion_settings').select('grace_days, support_email').maybeSingle(),
    supabase
      .from('account_deletion_requests')
      .select(REQUEST_COLUMNS)
      .in('status', OPEN)
      .order('requested_at', { ascending: false }),
    supabase
      .from('data_export_requests')
      .select('id, status, created_at, expires_at, download_token, size_bytes')
      .order('created_at', { ascending: false })
      .limit(1),
    supabase.rpc('my_deletion_blockers', { p_kind: 'user' }),
    Promise.all(
      owned.map((company) =>
        supabase
          .rpc('my_deletion_blockers', { p_kind: 'company', p_company_id: company.id })
          .then((result) => ({ id: company.id, blockers: (result.data ?? []) as string[] })),
      ),
    ),
  ]);

  const rows = (requests.data ?? []) as DeletionRequest[];
  const byCompany = new Map(companyBlockers.map((entry) => [entry.id, entry.blockers]));

  return {
    graceDays: settings.data?.grace_days ?? 14,
    supportEmail: settings.data?.support_email ?? null,
    own: rows.find((row) => row.kind === 'user') ?? null,
    ownBlockers: (ownBlockers.data ?? []) as string[],
    companies: owned.map((company) => ({
      ...company,
      blockers: byCompany.get(company.id) ?? [],
    })),
    companyRequests: rows.filter((row) => row.kind === 'company'),
    latestExport: ((exports.data ?? [])[0] as ExportRequest | undefined) ?? null,
  };
}

export interface DeletionAdminRow extends DeletionRequest {
  user_id: string | null;
  processed_by: string | null;
  updated_at: string;
}

export interface DeletionAdminView {
  rows: DeletionAdminRow[];
  /** Null when the health query itself failed, which is not the same as "fine". */
  jobLate: boolean | null;
}

export async function loadDeletionAdminData(): Promise<DeletionAdminView> {
  const supabase = await createClient();

  const [requests, health] = await Promise.all([
    supabase
      .from('account_deletion_requests')
      .select(`${REQUEST_COLUMNS}, user_id, processed_by, updated_at`)
      .order('requested_at', { ascending: false })
      .limit(200),
    supabase.rpc('job_health'),
  ]);

  const jobs = (health.data ?? []) as { job: string; is_late: boolean }[];
  const deletionJob = jobs.find((job) => job.job === 'account-deletion');

  return {
    rows: (requests.data ?? []) as DeletionAdminRow[],
    jobLate: health.error ? null : (deletionJob?.is_late ?? null),
  };
}
