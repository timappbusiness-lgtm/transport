-- =====================================================================
-- Delivering what the outbox already holds
--
-- `notification_outbox` has been filling correctly since migration 0007:
-- expiry reminders, suspensions, reactivations, verification results,
-- invitations, saved-route alerts, subscription events. Nothing has ever
-- emptied it. `n8n/README.md` described four workflows that were never
-- built, so four finished features have been silent.
--
-- This migration gives the queue a drain, and gives the scheduled jobs a
-- way to be seen.
--
-- Two decisions worth stating, because both are reversals:
--
--   1. **n8n is dropped.** It was never deployed and nobody maintains an
--      instance; a README is not a dependency. The dispatcher is an edge
--      function called by pg_cron through pg_net, which is the same
--      mechanism the three existing jobs already rely on. `n8n_run_log`
--      is renamed `job_run_log` and keeps its rows.
--
--   2. **A missing extension now aborts this migration.** The previous
--      cron block printed a notice and carried on, so a project without
--      pg_cron looked identical to a project with it — every test passed
--      while the nightly compliance sweep did not exist. That is the
--      failure mode that hid the whole problem, and it does not get a
--      second chance.
--
--      The throwaway database in `pnpm db:test` can never have pg_cron
--      (it needs shared_preload_libraries), so the harness sets
--      `coridor.allow_missing_cron` and only the harness does. Anywhere
--      that setting is absent, a missing extension is an error.
-- =====================================================================

-- ---------------------------------------------------------------------
-- job_run_log — was n8n_run_log
--
-- Renamed rather than recreated: the rows are the history of what ran,
-- and dropping them to change a name would be paying for the rename with
-- the thing the table is for.
-- ---------------------------------------------------------------------
do $rename$
begin
  if to_regclass('public.n8n_run_log') is not null
     and to_regclass('public.job_run_log') is null then
    alter table public.n8n_run_log rename to job_run_log;
    alter index if exists n8n_run_log_workflow_idx rename to job_run_log_job_idx;
  end if;
end;
$rename$;

create table if not exists public.job_run_log (
  id uuid primary key default gen_random_uuid(),
  ran_at timestamptz not null default now(),
  workflow text not null,
  processed integer not null default 0,
  failed integer not null default 0,
  details jsonb
);

comment on table public.job_run_log is
  'One row per run of a scheduled job. A job that stops logging here is how we notice it stopped running — which is exactly what nobody noticed about the outbox.';

create index if not exists job_run_log_job_idx on public.job_run_log (workflow, ran_at desc);

alter table public.job_run_log enable row level security;

drop policy if exists "n8n_run_log_select_staff" on public.job_run_log;
drop policy if exists "job_run_log_select_staff" on public.job_run_log;
create policy "job_run_log_select_staff" on public.job_run_log
  for select to authenticated
  using (public.is_platform_admin());

revoke insert, update, delete, truncate on public.job_run_log from anon, authenticated;

-- ---------------------------------------------------------------------
-- Claiming a batch
--
-- Email and in-app only. The push channel has its own claim function
-- (`claim_push_batch`, migration 20260918120000) and its own sender; two
-- functions claiming the same rows is the one bug this shape exists to
-- prevent, so they do not overlap at all.
--
-- sms and whatsapp are deliberately not claimed: no provider has been
-- chosen, and nothing queues them today. The admin screen counts them so
-- a row that appears is seen rather than silently drained into nowhere.
-- ---------------------------------------------------------------------
create or replace function public.claim_outbox_batch(p_limit integer default 50)
returns table (
  id uuid,
  channel text,
  template text,
  recipient_user_id uuid,
  recipient_company_id uuid,
  to_email text,
  payload jsonb,
  attempts integer
)
language plpgsql
security definer
set search_path = public
as $fn$
begin
  return query
  update public.notification_outbox o
  set status = 'sending', attempts = o.attempts + 1
  where o.id in (
    select x.id
    from public.notification_outbox x
    where x.channel in ('email', 'inapp')
      and x.status = 'queued'
      and x.send_after <= now()
    order by x.send_after
    limit greatest(1, least(p_limit, 200))
    -- Two overlapping runs must never take the same row. Without this a
    -- slow run and the next one five minutes later both send the same
    -- e-mail.
    for update skip locked
  )
  returning o.id, o.channel, o.template, o.recipient_user_id,
            o.recipient_company_id, o.to_email, o.payload, o.attempts;
end;
$fn$;

comment on function public.claim_outbox_batch is
  'Claims up to p_limit queued email and in-app rows and marks them sending. `for update skip locked` is what makes overlapping runs safe.';

-- ---------------------------------------------------------------------
-- Finishing one
--
-- The backoff is 10, 20, 30, 40 minutes — linear rather than doubling,
-- because a provider outage is usually minutes and a doubling schedule
-- has the fifth attempt land three hours later, long after anybody would
-- have cared about the e-mail.
-- ---------------------------------------------------------------------
create or replace function public.finish_outbox(
  p_id uuid,
  p_status text,
  p_error text default null,
  p_now timestamptz default now()
)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v public.notification_outbox;
  v_next text;
begin
  if p_status not in ('sent', 'failed') then
    raise exception 'Stare necunoscută pentru o notificare: %', p_status using errcode = '22023';
  end if;

  select * into v from public.notification_outbox where id = p_id;
  if v.id is null then
    raise exception 'Notificarea % nu există', p_id using errcode = 'P0002';
  end if;

  if p_status = 'sent' then
    update public.notification_outbox
    set status = 'sent', sent_at = p_now, last_error = null
    where id = p_id;
    return 'sent';
  end if;

  -- Five attempts, then it stays failed and a person has to look at it.
  if v.attempts >= 5 then
    update public.notification_outbox
    set status = 'failed', last_error = left(coalesce(p_error, 'necunoscut'), 500)
    where id = p_id;
    return 'failed';
  end if;

  update public.notification_outbox
  set status = 'queued',
      last_error = left(coalesce(p_error, 'necunoscut'), 500),
      send_after = p_now + (public.outbox_backoff_minutes(v.attempts) || ' minutes')::interval
  where id = p_id;
  return 'queued';
end;
$fn$;

comment on function public.finish_outbox is
  'Marks a claimed row sent, or queues it again with backoff until the fifth attempt, after which it stays failed with its last error.';

-- Its own function so the interface and the tests agree on one table of
-- numbers rather than two copies of it.
create or replace function public.outbox_backoff_minutes(p_attempts integer)
returns integer
language sql
immutable
set search_path = public
as $fn$
  select case
    when p_attempts <= 1 then 10
    when p_attempts = 2 then 20
    when p_attempts = 3 then 30
    else 40
  end;
$fn$;

comment on function public.outbox_backoff_minutes is
  'Minutes to wait after a failed attempt: 10, 20, 30, 40. Linear, because a doubling schedule puts the last try hours after anybody cared.';

-- ---------------------------------------------------------------------
-- Logging a run
-- ---------------------------------------------------------------------
create or replace function public.log_job_run(
  p_workflow text,
  p_processed integer default 0,
  p_failed integer default 0,
  p_details jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id uuid;
begin
  insert into public.job_run_log (workflow, processed, failed, details)
  values (p_workflow, coalesce(p_processed, 0), coalesce(p_failed, 0), p_details)
  returning id into v_id;
  return v_id;
end;
$fn$;

-- ---------------------------------------------------------------------
-- What the queue looks like right now
-- ---------------------------------------------------------------------
create or replace function public.outbox_stats()
returns table (channel text, status text, count bigint, oldest timestamptz)
language sql
stable
security definer
set search_path = public
as $fn$
  select o.channel, o.status, count(*)::bigint, min(o.created_at)
  from public.notification_outbox o
  group by o.channel, o.status
  order by o.channel, o.status;
$fn$;

-- ---------------------------------------------------------------------
-- Whether the jobs are actually running
--
-- The question this answers is the one nobody could answer before: not
-- "is the job scheduled" but "did it run, and when". `cron.job_run_details`
-- has the truth for the three SQL jobs; `job_run_log` has it for anything
-- that runs outside the database. Both are read, because a project where
-- pg_cron is missing entirely must show that rather than an empty table.
-- ---------------------------------------------------------------------
create or replace function public.job_health(p_now timestamptz default now())
returns table (
  job text,
  scheduled boolean,
  last_run timestamptz,
  last_status text,
  hours_since numeric,
  is_late boolean
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_has_cron boolean := to_regclass('cron.job') is not null;
  v_has_details boolean := to_regclass('cron.job_run_details') is not null;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate vedea starea joburilor'
      using errcode = '42501';
  end if;

  return query
  with expected(job, late_after_hours) as (
    values
      ('nightly-compliance-sweep', 36.0),
      ('nightly-expiry-reminders', 36.0),
      ('hourly-listing-cleanup', 3.0),
      ('outbox-dispatcher', 1.0)
  ),
  from_cron as (
    select d.jobname::text as job, max(d.end_time) as last_run,
           (array_agg(d.status order by d.end_time desc))[1]::text as last_status
    from (
      select j.jobname, r.end_time, r.status
      from cron.job j
      left join cron.job_run_details r on r.jobid = j.jobid
      where v_has_cron and v_has_details
    ) d
    group by d.jobname
  ),
  from_log as (
    select l.workflow as job, max(l.ran_at) as last_run,
           case when max(l.failed) > 0 then 'failed' else 'succeeded' end as last_status
    from public.job_run_log l
    group by l.workflow
  ),
  scheduled_jobs as (
    select j.jobname::text as job from cron.job j where v_has_cron
  )
  select
    e.job,
    exists (select 1 from scheduled_jobs s where s.job = e.job),
    greatest(c.last_run, g.last_run),
    coalesce(
      case when g.last_run is not null and (c.last_run is null or g.last_run >= c.last_run)
           then g.last_status else c.last_status end,
      'niciodată'
    ),
    round(extract(epoch from (p_now - greatest(c.last_run, g.last_run))) / 3600.0, 1),
    greatest(c.last_run, g.last_run) is null
      or (p_now - greatest(c.last_run, g.last_run)) > (e.late_after_hours || ' hours')::interval
  from expected e
  left join from_cron c on c.job = e.job
  left join from_log g on g.job = e.job
  order by e.job;
exception
  -- A project with no pg_cron at all: `cron.job` does not resolve at plan
  -- time however carefully the CTE is guarded. Answer the question anyway,
  -- with every job marked unscheduled and late, which is the truth.
  when undefined_table or invalid_schema_name then
    return query
    select e.job, false, g.last_run,
           coalesce(g.last_status, 'niciodată'),
           round(extract(epoch from (p_now - g.last_run)) / 3600.0, 1),
           -- Unscheduled is not the same as never run: a job driven from
           -- outside the database still logs, and a health screen that
           -- called it late anyway would cry wolf every single day.
           g.last_run is null
             or (p_now - g.last_run) > (e.late_after_hours || ' hours')::interval
    from (values
      ('nightly-compliance-sweep', 36.0), ('nightly-expiry-reminders', 36.0),
      ('hourly-listing-cleanup', 3.0), ('outbox-dispatcher', 1.0)
    ) as e(job, late_after_hours)
    left join (
      select l.workflow as job, max(l.ran_at) as last_run,
             case when max(l.failed) > 0 then 'failed' else 'succeeded' end as last_status
      from public.job_run_log l group by l.workflow
    ) g on g.job = e.job
    order by e.job;
end;
$fn$;

comment on function public.job_health is
  'Per scheduled job: is it scheduled, when did it last run, how did it end, and is it late. The compliance sweep is late after 36 hours.';

-- ---------------------------------------------------------------------
-- Retrying one row by hand
-- ---------------------------------------------------------------------
create or replace function public.retry_outbox_row(p_id uuid)
returns public.notification_outbox
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.notification_outbox;
  v_after public.notification_outbox;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate reîncerca o notificare'
      using errcode = '42501';
  end if;

  select * into v_before from public.notification_outbox where id = p_id;
  if v_before.id is null then
    raise exception 'Notificarea % nu există', p_id using errcode = 'P0002';
  end if;

  if v_before.status not in ('failed', 'skipped') then
    raise exception 'Se pot reîncerca doar notificările eșuate sau sărite'
      using errcode = '22023';
  end if;

  -- The attempt counter goes back to zero: a person looked at this row and
  -- decided it deserves another five tries, which is the whole point of a
  -- manual retry.
  update public.notification_outbox
  set status = 'queued', attempts = 0, send_after = now(), last_error = null
  where id = p_id
  returning * into v_after;

  perform public.write_audit(
    'notification.retry', 'notification_outbox', p_id,
    to_jsonb(v_before), to_jsonb(v_after), null
  );

  return v_after;
end;
$fn$;

-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------
grant execute on function public.claim_outbox_batch(integer) to service_role;
grant execute on function public.finish_outbox(uuid, text, text, timestamptz) to service_role;
grant execute on function public.log_job_run(text, integer, integer, jsonb) to service_role;
grant execute on function public.outbox_backoff_minutes(integer) to service_role, authenticated;
grant execute on function public.outbox_stats() to authenticated;
grant execute on function public.job_health(timestamptz) to authenticated;
grant execute on function public.retry_outbox_row(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Scheduling, and the end of silent success
--
-- The old block printed a notice when pg_cron was missing and carried on.
-- That is why nobody could tell a project with a nightly compliance sweep
-- from one without: the migration succeeded either way, and every test
-- passed either way, because no test asked.
--
-- Now a missing extension raises. The only place allowed to be without it
-- is the throwaway database in `pnpm db:test`, which sets
-- `coridor.allow_missing_cron` in `supabase/tests/supabase_shim.sql` —
-- the one file that can never run against a real project.
-- ---------------------------------------------------------------------
do $cron$
declare
  v_harness boolean := coalesce(
    current_setting('coridor.allow_missing_cron', true), 'off'
  ) = 'on';
  v_has_cron boolean := to_regproc('cron.schedule(text,text,text)') is not null;
begin
  if not v_has_cron then
    if v_harness then
      raise notice 'pg_cron absent; test harness, scheduling skipped.';
      return;
    end if;

    raise exception using
      errcode = 'feature_not_supported',
      message = 'pg_cron nu este activat pe acest proiect.',
      detail  = 'Fără el, măturarea de conformitate, memento-urile de expirare, '
                'curățarea anunțurilor și livrarea notificărilor nu rulează deloc. '
                'Cerința clientului privind expirarea asigurării nu este aplicată în practică.',
      hint    = 'Supabase → Database → Extensions → activează pg_cron, apoi rulează din nou migrația.';
  end if;

  perform cron.schedule('nightly-compliance-sweep', '0 2 * * *',
                        'select public.run_compliance_sweep();');
  perform cron.schedule('nightly-expiry-reminders', '15 2 * * *',
                        'select public.queue_expiry_reminders();');
  perform cron.schedule('hourly-listing-cleanup', '5 * * * *',
                        'select public.expire_stale_listings();');

  -- The dispatcher is an HTTP call, not SQL, so it needs pg_net. Same
  -- rule: missing means loud.
  if to_regproc('net.http_post(text,jsonb,jsonb,jsonb,integer)') is null then
    raise exception using
      errcode = 'feature_not_supported',
      message = 'pg_net nu este activat pe acest proiect.',
      detail  = 'Dispecerul de notificări este o funcție edge, iar pg_cron o poate '
                'apela doar prin net.http_post. Fără el, coada nu se golește.',
      hint    = 'Supabase → Database → Extensions → activează pg_net, apoi rulează din nou migrația.';
  end if;

  perform cron.schedule('outbox-dispatcher', '*/5 * * * *',
                        'select public.dispatch_outbox_http();');
exception
  when duplicate_object or unique_violation then
    raise notice 'Joburile există deja; le las cum sunt.';
end;
$cron$;

-- ---------------------------------------------------------------------
-- dispatch_outbox_http
--
-- The bridge from pg_cron to the edge function. The URL and the shared
-- secret come from Vault, never from this file: a migration is in git,
-- and a secret in git is a secret nobody can rotate.
--
-- Defined after the schedule block on purpose — pg_cron stores the command
-- as text and resolves it at run time, so the order here does not matter,
-- and putting it last keeps the loud failure at the top where it is read.
-- ---------------------------------------------------------------------
create or replace function public.dispatch_outbox_http()
returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_url text;
  v_secret text;
  v_request_id bigint;
begin
  begin
    select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'outbox_dispatcher_url';
    select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'cron_secret';
  exception when undefined_table or invalid_schema_name or insufficient_privilege then
    raise exception using
      errcode = 'feature_not_supported',
      message = 'Vault nu este disponibil, deci dispecerul nu are cum să afle unde să sune.',
      hint    = 'Creează secretele outbox_dispatcher_url și cron_secret în Supabase → Vault.';
  end;

  if v_url is null or v_secret is null then
    raise exception using
      errcode = 'invalid_parameter_value',
      message = 'Lipsesc secretele pentru dispecerul de notificări.',
      detail  = 'Sunt necesare outbox_dispatcher_url și cron_secret în Vault.',
      hint    = 'Supabase → Project Settings → Vault → New secret.';
  end if;

  select net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    params := '{}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', v_secret
    ),
    timeout_milliseconds := 30000
  ) into v_request_id;

  return v_request_id;
end;
$fn$;

comment on function public.dispatch_outbox_http is
  'Called by pg_cron every five minutes. Reads the function URL and the shared secret from Vault — never from this file, because a migration is in git and a secret in git cannot be rotated.';

revoke execute on function public.dispatch_outbox_http() from public, anon, authenticated;
