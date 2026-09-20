import 'server-only';
import type { ReportKind, ReportRow, ReportStatus } from './reports';
import { createClient } from './supabase/server';
import { isSupabaseConfigured } from './supabase/env';

/**
 * What `/admin/sesizari` reads.
 *
 * Straight from the table through RLS: `reports_select_own_or_admin`
 * already limits a non-staff caller to their own rows, so there is no
 * filtering here that a mistake could widen. The names come along in
 * embedded selects, because an id is not an answer to „cine".
 */

const COLUMNS = `
  id, created_at, status, kind, reason, details, evidence_path,
  resolution, internal_notes, resolved_at, reporter_notified_at,
  reporter_user_id, reported_company_id, reported_user_id,
  cargo_listing_id, assigned_to, handled_by,
  reporter:profiles!reports_reporter_user_id_fkey(full_name, email),
  assignee:profiles!reports_assigned_to_fkey(full_name),
  company:companies!reports_reported_company_id_fkey(legal_name, display_name)
`;

export interface ReportFilters {
  status: ReportStatus | null;
}

/** One embedded row, which PostgREST types as an array whatever the FK says. */
function one<T>(value: unknown): T | null {
  const row = Array.isArray(value) ? value[0] : value;
  return (row as T | undefined) ?? null;
}

export async function loadReports(filters: ReportFilters): Promise<ReportRow[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  let query = supabase
    .from('reports')
    .select(COLUMNS)
    .order('created_at', { ascending: false })
    .limit(200);

  if (filters.status !== null) query = query.eq('status', filters.status);

  const { data, error } = await query;
  if (error) {
    console.error('[sesizari] query failed', { code: error.code, message: error.message });
    return [];
  }

  return (data ?? []).map((raw) => {
    const row = raw as unknown as Record<string, unknown>;
    const reporter = one<{ full_name: string | null; email: string | null }>(row.reporter);
    const assignee = one<{ full_name: string | null }>(row.assignee);
    const company = one<{ legal_name: string; display_name: string | null }>(row.company);

    return {
      id: row.id as string,
      created_at: row.created_at as string,
      status: row.status as ReportStatus,
      kind: (row.kind as ReportKind | null) ?? 'altul',
      reason: row.reason as string,
      details: (row.details as string | null) ?? null,
      evidence_path: (row.evidence_path as string | null) ?? null,
      resolution: (row.resolution as string | null) ?? null,
      internal_notes: (row.internal_notes as string | null) ?? null,
      resolved_at: (row.resolved_at as string | null) ?? null,
      reporter_notified_at: (row.reporter_notified_at as string | null) ?? null,
      reporter_user_id: row.reporter_user_id as string,
      reporter_name: reporter?.full_name ?? null,
      reporter_email: reporter?.email ?? null,
      reported_company_id: (row.reported_company_id as string | null) ?? null,
      reported_company_name: company === null ? null : (company.display_name ?? company.legal_name),
      reported_user_id: (row.reported_user_id as string | null) ?? null,
      cargo_listing_id: (row.cargo_listing_id as string | null) ?? null,
      assigned_to: (row.assigned_to as string | null) ?? null,
      assigned_name: assignee?.full_name ?? null,
      handled_by: (row.handled_by as string | null) ?? null,
    };
  });
}
