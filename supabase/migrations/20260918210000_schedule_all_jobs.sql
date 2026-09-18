-- =====================================================================
-- 0029 - Schedule all five jobs, with the signature-aware lookup
--
-- `to_regproc()` takes a bare function name. Given a signature it returns
-- NULL every time, whether or not the function exists. Migration
-- 20260916145000 found that out in September and fixed the three jobs it
-- knew about — and then 20260918160000 and 20260918180000 copied the
-- broken pattern from 20260916120600 and reintroduced it for the two new
-- ones.
--
-- The consequence is worse than a job not running, because of what the
-- warning said. Both migrations printed „pg_cron nu este disponibil" and
-- carried on, on every deploy, whether or not pg_cron was there. That
-- message was read as evidence about the project when it was only ever
-- evidence about `to_regproc`. A guard that reports the same failure in
-- both states is not a guard, it is a rumour.
--
-- So: `to_regprocedure`, all five jobs in one place, and — the part that
-- stops this happening a third time — the JOB block in
-- `supabase/tests/rls_test.sql`, which stubs `cron.schedule` and
-- `net.http_post` and then asserts that all five are really scheduled and
-- that `job_health()` watches exactly those. A migration that silently
-- schedules nothing now fails the suite.
--
-- `cron.schedule` upserts by job name on pg_cron 1.4+, so this is safe to
-- re-run and safe to run on a project where some of the jobs already
-- exist.
-- =====================================================================

do $cron$
declare
  v_has_cron boolean := to_regprocedure('cron.schedule(text,text,text)') is not null;
  v_has_net boolean := to_regprocedure('net.http_post(text,jsonb,jsonb,jsonb,integer)') is not null;
begin
  if not v_has_cron then
    raise warning
      'pg_cron nu este disponibil, deci niciun job nu este programat: nici măturarea de conformitate, nici memento-urile, nici curățarea anunțurilor, nici livrarea notificărilor, nici ștergerile de cont. Activează extensia (Dashboard > Database > Extensions) și rulează din nou SQL-ul din docs/DEPLOYMENT.md.';
    return;
  end if;

  -- The three that are plain SQL and need nothing but pg_cron.
  perform cron.schedule('nightly-compliance-sweep', '0 2 * * *',
                        'select public.run_compliance_sweep();');
  perform cron.schedule('nightly-expiry-reminders', '15 2 * * *',
                        'select public.queue_expiry_reminders();');
  perform cron.schedule('hourly-listing-cleanup', '5 * * * *',
                        'select public.expire_stale_listings();');

  -- The two that reach an edge function over HTTP, and therefore need
  -- pg_net as well. Warned about separately: „three of five are running"
  -- is a different situation from „none are", and the person reading the
  -- log has to be able to tell which one they are in.
  if not v_has_net then
    raise warning
      'pg_net nu este disponibil. Cele trei joburi SQL sunt programate, dar dispecerul de notificări și ștergerile de cont nu — coada nu se golește și cererile de ștergere nu se duc la capăt. Vezi docs/DEPLOYMENT.md.';
    return;
  end if;

  perform cron.schedule('outbox-dispatcher', '*/5 * * * *',
                        'select public.dispatch_outbox_http();');
  perform cron.schedule('account-deletion', '10 3 * * *',
                        'select public.dispatch_account_deletions_http();');
exception
  when duplicate_object or unique_violation then
    raise notice 'Joburile există deja; le las cum sunt.';
end;
$cron$;

-- ---------------------------------------------------------------------
-- And watch all of them
--
-- `job_health()` listed five. Seven are scheduled: the push cleanup and
-- the booking-expiry alerts have been running since 20260918120000 and
-- nobody was watching either, which is the same failure as a job that
-- does not run — it just takes longer to notice.
--
-- The two lists are now asserted against each other in the JOB block, so
-- a job added without a row here fails the suite rather than going
-- quietly unwatched.
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
      ('account-deletion', 36.0),
      ('hourly-booking-expiry-alerts', 3.0),
      ('hourly-listing-cleanup', 3.0),
      ('hourly-push-cleanup', 3.0),
      ('nightly-compliance-sweep', 36.0),
      ('nightly-expiry-reminders', 36.0),
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
  when undefined_table or invalid_schema_name then
    return query
    select e.job, false, g.last_run,
           coalesce(g.last_status, 'niciodată'),
           round(extract(epoch from (p_now - g.last_run)) / 3600.0, 1),
           g.last_run is null
             or (p_now - g.last_run) > (e.late_after_hours || ' hours')::interval
    from (values
      ('account-deletion', 36.0), ('hourly-booking-expiry-alerts', 3.0),
      ('hourly-listing-cleanup', 3.0), ('hourly-push-cleanup', 3.0),
      ('nightly-compliance-sweep', 36.0), ('nightly-expiry-reminders', 36.0),
      ('outbox-dispatcher', 1.0)
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
  'Per scheduled job: is it scheduled, when did it last run, how did it end, and is it late. Watches every job any migration schedules — the JOB block in rls_test.sql asserts the two lists match.';
