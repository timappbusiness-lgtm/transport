import 'server-only';
import { bucharestMidnight, bucharestNextMidnight, type AuditEntry, type AuditFacet } from './audit';
import { createClient } from './supabase/server';
import { isSupabaseConfigured } from './supabase/env';

/**
 * What `/admin/jurnal` reads.
 *
 * Both RPCs are SECURITY DEFINER and re-check `is_platform_admin()`
 * themselves, so this file adds no access rule of its own — the layout's
 * 404 for non-staff is a convenience, the function is the boundary.
 */

export interface AuditQuery {
  actor: string | null;
  action: string | null;
  entity: string | null;
  from: string | null;
  to: string | null;
  page: number;
}

export const AUDIT_PAGE_SIZE = 50;

export interface AuditPage {
  entries: AuditEntry[];
  /** Everything the filters match, not just this page. */
  total: number;
  error: string | null;
}

export const NO_AUDIT: AuditPage = { entries: [], total: 0, error: null };

/** A `YYYY-MM-DD` from the form as an instant, in the timezone people use. */
function dayStart(day: string | null): string | undefined {
  return day === null ? undefined : bucharestMidnight(day);
}

/** The end of the range is exclusive in SQL, so „până la 21" includes the 21st. */
function dayAfter(day: string | null): string | undefined {
  return day === null ? undefined : bucharestNextMidnight(day);
}

export async function loadAuditPage(query: AuditQuery): Promise<AuditPage> {
  if (!isSupabaseConfigured()) return NO_AUDIT;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('audit_entries', {
    p_actor: query.actor ?? undefined,
    p_action: query.action ?? undefined,
    p_entity: query.entity ?? undefined,
    p_from: dayStart(query.from),
    p_to: dayAfter(query.to),
    p_limit: AUDIT_PAGE_SIZE,
    p_offset: Math.max(0, query.page - 1) * AUDIT_PAGE_SIZE,
  });

  if (error) {
    console.error('[jurnal] query failed', { code: error.code, message: error.message });
    return { ...NO_AUDIT, error: error.message };
  }

  const rows = (data ?? []) as (AuditEntry & { total_count: number })[];
  return {
    entries: rows.map(withoutCount),
    // The window function rides along on every row, so any row carries it.
    total: rows[0]?.total_count ?? 0,
    error: null,
  };
}

/**
 * Every entry the filters match, for the CSV.
 *
 * Paged through rather than asked for in one call, because
 * `audit_entries` caps a page at 500 on purpose — a function that would
 * return the whole table in one row set is a function that will one day
 * be asked to.
 */
export async function loadAuditForExport(
  query: Omit<AuditQuery, 'page'>,
  cap = 5000,
): Promise<AuditEntry[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const size = 500;
  const all: AuditEntry[] = [];

  for (let offset = 0; offset < cap; offset += size) {
    const { data, error } = await supabase.rpc('audit_entries', {
      p_actor: query.actor ?? undefined,
      p_action: query.action ?? undefined,
      p_entity: query.entity ?? undefined,
      p_from: dayStart(query.from),
      p_to: dayAfter(query.to),
      p_limit: size,
      p_offset: offset,
    });

    if (error) {
      console.error('[jurnal] export failed', { message: error.message });
      break;
    }

    const rows = (data ?? []) as (AuditEntry & { total_count: number })[];
    for (const row of rows) all.push(withoutCount(row));
    if (rows.length < size) break;
  }

  return all;
}

/** The paging total travels on every row; the entry itself does not want it. */
function withoutCount(row: AuditEntry & { total_count: number }): AuditEntry {
  return {
    id: row.id,
    created_at: row.created_at,
    actor_user_id: row.actor_user_id,
    actor_name: row.actor_name,
    actor_role: row.actor_role,
    action: row.action,
    entity: row.entity,
    entity_id: row.entity_id,
    before: row.before,
    after: row.after,
    reason: row.reason,
  };
}

export async function loadAuditFacets(): Promise<AuditFacet[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('audit_facets');
  if (error) {
    console.error('[jurnal] facets query failed', { message: error.message });
    return [];
  }
  return (data ?? []) as AuditFacet[];
}
