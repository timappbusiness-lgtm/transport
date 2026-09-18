-- =====================================================================
-- 0031 - Retention for the contact-reveal log
--
-- `docs/06-gdpr-and-antifraud.md` has said „24 months" since the document
-- was written, and nothing enforced it. A retention period that exists
-- only in a document is not a retention period; it is a sentence we would
-- have had to explain to somebody asking why we still hold a record of
-- who looked at their telephone number in 2024.
--
-- The log itself is worth keeping for the two reasons it was built for —
-- fraud and billing — and both of those are about the recent past. Two
-- years is the number in the policy, so two years is the number here, and
-- it is a setting rather than a constant so that changing the policy does
-- not need a migration.
--
-- Deleted, not anonymised. A reveal row is (who, which listing, when);
-- strip the who and nothing is left that answers either question. There
-- is no useful shell to keep.
-- =====================================================================

alter table public.deletion_settings
  add column contact_reveal_months integer not null default 24
    check (contact_reveal_months between 1 and 120);

comment on column public.deletion_settings.contact_reveal_months is
  'How long the contact-reveal log is kept. 24 months, from docs/06-gdpr-and-antifraud.md.';

create or replace function public.purge_contact_reveals(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_months integer;
  v_deleted integer;
begin
  select contact_reveal_months into v_months from public.deletion_settings where id;
  v_months := coalesce(v_months, 24);

  delete from public.contact_reveals
  where created_at < p_now - (v_months || ' months')::interval;
  get diagnostics v_deleted = row_count;

  -- Logged even when it deletes nothing. A retention job that only
  -- reports on the days it finds something looks identical, on every
  -- other day, to a retention job that stopped running.
  perform public.log_job_run('nightly-retention', v_deleted, 0,
    jsonb_build_object('contact_reveals_deleted', v_deleted, 'months', v_months));

  return v_deleted;
end;
$fn$;

comment on function public.purge_contact_reveals(timestamptz) is
  'Deletes contact-reveal rows past the retention period in deletion_settings. Deleted rather than anonymised: a reveal is (who, what, when) and without the who there is nothing left worth keeping.';

grant execute on function public.purge_contact_reveals(timestamptz) to service_role;

-- ---------------------------------------------------------------------
-- The setting, and the rest of them
--
-- `set_deletion_settings` gains the retention period, so `/admin/setari`
-- has one call for everything on that screen rather than one per field.
-- ---------------------------------------------------------------------
create or replace function public.set_deletion_settings(
  p_grace_days integer,
  p_support_email text,
  p_contact_reveal_months integer default null
)
returns public.deletion_settings
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before jsonb;
  v_row public.deletion_settings;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate schimba setările de ștergere'
      using errcode = '42501';
  end if;

  select to_jsonb(d) into v_before from public.deletion_settings d where d.id;

  update public.deletion_settings
  set grace_days = coalesce(p_grace_days, grace_days),
      support_email = nullif(trim(coalesce(p_support_email, '')), ''),
      contact_reveal_months = coalesce(p_contact_reveal_months, contact_reveal_months),
      updated_at = now()
  where id
  returning * into v_row;

  perform public.write_audit('settings.deletion_changed', 'settings', null,
    v_before, to_jsonb(v_row));
  return v_row;
end;
$fn$;

grant execute on function public.set_deletion_settings(integer, text, integer) to authenticated;

-- The two-argument version would still be callable, and would still work,
-- which is exactly how a screen ends up writing through the old door and
-- nobody noticing the new field is never saved.
drop function if exists public.set_deletion_settings(integer, text);

-- ---------------------------------------------------------------------
-- Schedule it
-- ---------------------------------------------------------------------
do $cron$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise warning 'pg_cron nu este disponibil, deci jobul de retenție NU este programat. Vezi docs/DEPLOYMENT.md.';
    return;
  end if;
  perform cron.schedule('nightly-retention', '40 2 * * *',
                        'select public.purge_contact_reveals();');
exception
  when duplicate_object or unique_violation then
    raise notice 'Jobul de retenție există deja; îl las cum este.';
end;
$cron$;
