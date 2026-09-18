import 'server-only';
import { createClient } from '@/lib/supabase/server';

/**
 * What `/admin/notificari` reads.
 *
 * Both the job health and the queue come from functions that refuse a
 * non-staff caller in the database, rather than trusting this file to
 * have checked. The outbox rows come through the table's own policy.
 */

export interface JobHealth {
  job: string;
  scheduled: boolean;
  last_run: string | null;
  last_status: string;
  hours_since: number | null;
  is_late: boolean;
}

export interface OutboxStat {
  channel: string;
  status: string;
  count: number;
  oldest: string | null;
}

export interface OutboxRow {
  id: string;
  created_at: string;
  channel: string;
  template: string;
  status: string;
  attempts: number;
  last_error: string | null;
  send_after: string;
  sent_at: string | null;
  to_email: string | null;
  recipient_user_id: string | null;
  recipient_company_id: string | null;
}

export interface JobRun {
  id: string;
  ran_at: string;
  workflow: string;
  processed: number;
  failed: number;
}

export interface NotificationsAdminData {
  health: JobHealth[];
  stats: OutboxStat[];
  rows: OutboxRow[];
  runs: JobRun[];
  /** True when the health query itself could not run. */
  healthError: string | null;
}

export interface QueueFilters {
  status?: string | undefined;
  channel?: string | undefined;
  template?: string | undefined;
  search?: string | undefined;
}

export async function loadNotificationsAdminData(
  filters: QueueFilters = {},
): Promise<NotificationsAdminData> {
  const supabase = await createClient();

  let query = supabase
    .from('notification_outbox')
    .select(
      'id, created_at, channel, template, status, attempts, last_error, send_after, sent_at, to_email, recipient_user_id, recipient_company_id',
    )
    .order('created_at', { ascending: false })
    .limit(100);

  // Failed first is the default, because a screen whose job is to show
  // what went wrong should not open on a list of things that went right.
  if (filters.status !== undefined && filters.status !== '') {
    query = query.eq('status', filters.status);
  }
  if (filters.channel !== undefined && filters.channel !== '') {
    query = query.eq('channel', filters.channel);
  }
  if (filters.template !== undefined && filters.template !== '') {
    query = query.eq('template', filters.template);
  }
  if (filters.search !== undefined && filters.search.trim() !== '') {
    const term = filters.search.trim();
    // An id or an address: both are things a person pastes from a support
    // conversation.
    query = query.or(
      `to_email.ilike.%${term}%,recipient_user_id.eq.${asUuid(term)},recipient_company_id.eq.${asUuid(term)}`,
    );
  }

  const [health, stats, rows, runs] = await Promise.all([
    supabase.rpc('job_health'),
    supabase.rpc('outbox_stats'),
    query,
    supabase
      .from('job_run_log')
      .select('id, ran_at, workflow, processed, failed')
      .order('ran_at', { ascending: false })
      .limit(20),
  ]);

  return {
    health: (health.data as JobHealth[] | null) ?? [],
    healthError: health.error?.message ?? null,
    stats: (stats.data as OutboxStat[] | null) ?? [],
    rows: (rows.data as OutboxRow[] | null) ?? [],
    runs: (runs.data as JobRun[] | null) ?? [],
  };
}

/**
 * A search term that is not a uuid would make the `or` filter invalid and
 * lose the e-mail match with it, so it becomes an id that matches nothing.
 */
function asUuid(term: string): string {
  return /^[0-9a-f-]{36}$/i.test(term) ? term : '00000000-0000-0000-0000-000000000000';
}
