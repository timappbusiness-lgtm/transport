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
  /** The provider's id for the message, once it has one. */
  provider_message_id: string | null;
}

export interface MailProviderState {
  last_sent_at: string | null;
  sent_24h: number;
  failed_24h: number;
  queued_now: number;
  undeliverable_addresses: number;
}

/**
 * Whether the mail provider is configured, as far as we can tell.
 *
 * The application cannot read the edge function's secrets — different
 * deployment, different environment — so it does not guess. The
 * dispatcher writes the name of the missing variable into `job_run_log`
 * before refusing, and this reads it back. No row saying so means we have
 * no evidence either way, which is a third answer and is shown as one.
 */
export type ProviderConfigured = 'da' | 'nu' | 'necunoscut';

export interface ProviderStatus {
  configured: ProviderConfigured;
  /** Which variable the dispatcher last complained about, if any. */
  missing: string | null;
  /** When it last said so. */
  reportedAt: string | null;
}

export interface JobRun {
  id: string;
  ran_at: string;
  workflow: string;
  processed: number;
  failed: number;
  /** Whatever the run wrote about itself. `missing` names an unset secret. */
  details: Record<string, unknown> | null;
}

export interface NotificationsAdminData {
  health: JobHealth[];
  stats: OutboxStat[];
  rows: OutboxRow[];
  runs: JobRun[];
  /** True when the health query itself could not run. */
  healthError: string | null;
  mail: MailProviderState | null;
  provider: ProviderStatus;
  sms: SmsProviderState | null;
  /** The same reading, for `sms-verify`: it writes its own missing secret. */
  smsProvider: ProviderStatus;
}

/** What /admin/notificari shows about the SMS side. Counts, never a secret. */
export interface SmsProviderState {
  last_sent_at: string | null;
  sent_24h: number;
  failed_24h: number;
  confirmed_24h: number;
  pending_now: number;
  verified_accounts: number;
  verified_by_staff: number;
}

/**
 * Reading the dispatcher's own account of itself.
 *
 * The newest run decides. An older complaint about a missing variable
 * that has since been set would otherwise keep the screen red long after
 * somebody fixed it.
 */
export function providerStatusFrom(
  runs: readonly JobRun[],
  workflow = 'outbox-dispatcher',
): ProviderStatus {
  const last = runs.find((run) => run.workflow === workflow);
  if (last === undefined) return { configured: 'necunoscut', missing: null, reportedAt: null };

  const missing = typeof last.details?.missing === 'string' ? last.details.missing : null;
  return {
    configured: missing === null ? 'da' : 'nu',
    missing,
    reportedAt: last.ran_at,
  };
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
      'id, created_at, channel, template, status, attempts, last_error, send_after, sent_at, to_email, recipient_user_id, recipient_company_id, provider_message_id',
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

  const [health, stats, rows, runs, mail, sms, smsRun] = await Promise.all([
    supabase.rpc('job_health'),
    supabase.rpc('outbox_stats'),
    query,
    supabase
      .from('job_run_log')
      .select('id, ran_at, workflow, processed, failed, details')
      .order('ran_at', { ascending: false })
      .limit(20),
    supabase.rpc('mail_provider_state'),
    supabase.rpc('sms_provider_state'),
    // Asked for on its own rather than found in the twenty rows above.
    // The dispatcher writes one of those every five minutes, so it fills
    // that window in under two hours — and the SMS card would go back to
    // saying „nimeni nu a cerut încă un cod" while the truth was that
    // somebody did, an hour ago, and it failed for a missing secret.
    supabase
      .from('job_run_log')
      .select('id, ran_at, workflow, processed, failed, details')
      .eq('workflow', 'sms-verify')
      .order('ran_at', { ascending: false })
      .limit(1),
  ]);

  const runRows = (runs.data as JobRun[] | null) ?? [];
  const mailRow = Array.isArray(mail.data) ? (mail.data[0] as MailProviderState) : null;
  const smsRow = Array.isArray(sms.data) ? (sms.data[0] as SmsProviderState) : null;
  const smsRunRows = (smsRun.data as JobRun[] | null) ?? [];

  return {
    health: (health.data as JobHealth[] | null) ?? [],
    healthError: health.error?.message ?? null,
    stats: (stats.data as OutboxStat[] | null) ?? [],
    rows: (rows.data as OutboxRow[] | null) ?? [],
    runs: runRows,
    mail: mailRow ?? null,
    provider: providerStatusFrom(runRows),
    sms: smsRow ?? null,
    smsProvider: providerStatusFrom(smsRunRows, 'sms-verify'),
  };
}

/**
 * A search term that is not a uuid would make the `or` filter invalid and
 * lose the e-mail match with it, so it becomes an id that matches nothing.
 */
function asUuid(term: string): string {
  return /^[0-9a-f-]{36}$/i.test(term) ? term : '00000000-0000-0000-0000-000000000000';
}
