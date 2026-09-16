-- =====================================================================
-- 0016 - Schedule the nightly jobs for real
--
-- Migration 0007 guarded its cron.schedule() calls with
--   to_regproc('cron.schedule(text,text,text)')
-- but to_regproc() takes a bare function name, not a signature, so it always
-- returned NULL: the migration printed "pg_cron is not enabled" and scheduled
-- nothing, even with pg_cron enabled. The compliance sweep, the expiry
-- reminders and the listing cleanup never ran on a schedule.
--
-- to_regprocedure() is the signature-aware lookup. cron.schedule() upserts by
-- job name on pg_cron 1.4+, so re-running this is harmless.
-- =====================================================================

do $cron$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise notice 'pg_cron is not enabled - enable it (Dashboard > Database > Extensions), then re-run this migration.';
    return;
  end if;

  perform cron.schedule('nightly-compliance-sweep', '0 2 * * *',
                        'select public.run_compliance_sweep();');
  perform cron.schedule('nightly-expiry-reminders', '15 2 * * *',
                        'select public.queue_expiry_reminders();');
  perform cron.schedule('hourly-listing-cleanup', '5 * * * *',
                        'select public.expire_stale_listings();');
end
$cron$;
