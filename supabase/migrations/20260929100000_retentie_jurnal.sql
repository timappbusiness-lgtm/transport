-- =====================================================================
-- R3 — jurnalul de audit: retenție, și ștergerea la cerere dusă până
-- la capăt
--
-- `audit_log.before` și `.after` sunt instantanee `jsonb` ale
-- rândurilor: nume, telefon, e-mail, CUI, textul unei evaluări.
-- Tabela **nu are nicio cheie străină**, deci nimic nu cascadează; iar
-- `purge_audit_log()` exista din prima zi și nu a fost programată
-- niciodată. Un om care cerea ștergerea contului rămânea acolo,
-- integral, pentru totdeauna.
--
-- Nu se exploatează — jurnalul este citibil numai de echipă. Este o
-- problemă de conformitate, și una reală: ștergerea la cerere nu se
-- putea duce până la capăt.
--
-- **Rândul nu se șterge.** Că am făcut o ștergere, când, și cine a
-- cerut-o, este exact evidența pe care trebuie să o putem arăta. Ce
-- iese din el este conținutul personal.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Cât ține jurnalul
--
-- O setare, nu un număr în cod: fereastra corectă se stabilește la
-- revizia juridică (`docs/09-verificare-juridica.md`), iar până atunci
-- douăzeci și patru de luni este o valoare de pornire, nu o
-- recomandare legală.
-- ---------------------------------------------------------------------
alter table public.deletion_settings
  add column if not exists audit_retention_months integer not null default 24
    check (audit_retention_months between 1 and 120);

comment on column public.deletion_settings.audit_retention_months is
  'După câte luni se șterg rândurile din audit_log. Se schimbă din setări, '
  'nu dintr-o migrare. Valoarea de pornire nu este o recomandare juridică.';

-- ---------------------------------------------------------------------
-- Ce s-a scos dintr-un rând, și când
--
-- Fără coloana asta, „nu are date personale" și „nu a avut niciodată"
-- arată la fel, iar întrebarea „i-ați șters datele?" nu are un răspuns
-- pe care să îl poți arăta.
-- ---------------------------------------------------------------------
alter table public.audit_log
  add column if not exists scrubbed_at timestamptz;

comment on column public.audit_log.scrubbed_at is
  'Când i s-a scos conținutul personal, la ștergerea contului. '
  'Evenimentul rămâne; payload-ul nu.';

-- ---------------------------------------------------------------------
-- Jurnalul rămâne append-only, cu o singură excepție numită
--
-- `audit_log_guard()` reprodusă din 20260916130000. Ștergerea sub flag
-- exista deja, pentru retenție; acum trece și modificarea, sub același
-- flag și numai ea — altfel scrub-ul de mai jos nu ar avea pe unde.
--
-- Flagul îl pun două funcții, amândouă `service_role`:
-- `purge_audit_log()` și `scrub_audit_for_subject()`.
-- ---------------------------------------------------------------------
create or replace function public.audit_log_guard()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if current_setting('app.audit_retention', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception 'audit_log este append-only' using errcode = '42501';
end;
$fn$;

/**
 * Scoate datele personale ale unui om sau ale unei firme din jurnal.
 *
 * Chemată de ștergerea la cerere, nu de un om: `service_role`. Un cont
 * de staff nu are ce căuta aici — un jurnal pe care îl poate curăța
 * cineva din interfață nu mai este un jurnal.
 *
 * Caută în trei feluri, pentru că un om apare în jurnal în trei roluri:
 * ca actor, ca subiect al unei acțiuni, și în numele unei firme.
 */
create or replace function public.scrub_audit_for_subject(
  p_user_id uuid,
  p_company_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_scrubbed integer;
begin
  if p_user_id is null and p_company_id is null then
    raise exception 'Scrub fără subiect' using errcode = '22023';
  end if;

  perform set_config('app.audit_retention', 'on', true);

  update public.audit_log
  set before = case when before is null then null else '{"sters": true}'::jsonb end,
      after = case when after is null then null else '{"sters": true}'::jsonb end,
      reason = case when reason is null then null else 'șters la cererea persoanei' end,
      scrubbed_at = now()
  where scrubbed_at is null
    and (
      (p_user_id is not null and (
        actor_user_id = p_user_id
        or (entity in ('profile', 'user') and entity_id = p_user_id)))
      or (p_company_id is not null and (
        on_behalf_of_company_id = p_company_id
        or (entity = 'company' and entity_id = p_company_id)))
    );

  get diagnostics v_scrubbed = row_count;
  perform set_config('app.audit_retention', 'off', true);
  return v_scrubbed;
end;
$fn$;

comment on function public.scrub_audit_for_subject(uuid, uuid) is
  'Scoate conținutul personal din rândurile de jurnal ale unui om sau ale '
  'unei firme, păstrând evenimentul. Numai service_role.';

revoke all on function public.scrub_audit_for_subject(uuid, uuid) from public, anon, authenticated;
grant execute on function public.scrub_audit_for_subject(uuid, uuid) to service_role;

-- ---------------------------------------------------------------------
-- Ștergerea la cerere cheamă acum și scrub-ul, și golește dovezile
--
-- `complete_account_deletion()` reprodusă din 20260918180000 cu două
-- apeluri în plus. Restul este identic, inclusiv ordinea — citirea
-- e-mailului înainte ca rândul să dispară, și ștergerea din
-- `auth.users` la sfârșit, cu eroarea de privilegiu prinsă.
--
-- Dovezile comenzii: până la migrarea 20260928100000 nu se puteau
-- șterge deloc, pentru că garda testa `current_user` într-o funcție
-- SECURITY DEFINER. Acum există `purge_order_evidence()`, deci
-- ștergerea la cerere poate ajunge și la ele.
-- ---------------------------------------------------------------------
create or replace function public.anonymise_company(p_company_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_order uuid;
begin
  -- NOU. Pozele de la predare-primire arată mașina, numărul, uneori
  -- oameni. Până la migrarea 20260928100000 nu se puteau șterge deloc,
  -- pentru că garda testa `current_user` într-o funcție SECURITY
  -- DEFINER și portița nu se deschidea niciodată.
  for v_order in
    select t.id from public.transports t
    where t.carrier_company_id = p_company_id or t.shipper_company_id = p_company_id
  loop
    perform public.purge_order_evidence(v_order);
  end loop;

  delete from public.documents where company_id = p_company_id;
  delete from public.cargo_listings where company_id = p_company_id;
  delete from public.truck_listings where company_id = p_company_id;
  delete from public.vehicles where company_id = p_company_id;
  delete from public.drivers where company_id = p_company_id;
  delete from public.company_members where company_id = p_company_id;
  delete from public.company_invitations where company_id = p_company_id;

  update public.companies set
    legal_name = 'Firmă ștearsă',
    display_name = null,
    -- Unique, because the index is: a second erased firm must not collide
    -- with the first.
    cui = 'STERS-' || left(replace(p_company_id::text, '-', ''), 12),
    reg_com = null,
    vat_payer = null,
    address = null,
    county = null,
    city = null,
    contact_email = null,
    contact_phone = null,
    website = null,
    anaf_payload = null,
    anaf_checked_at = null,
    anaf_is_inactive = null,
    created_by = null,
    public_profile_enabled = false,
    slug = null,
    public_description = null,
    logo_path = null,
    verification_note = null,
    alerts_enabled = false,
    alerts_email = null,
    indicative_rate_note = null,
    trust_score = 0,
    verification_status = 'rejected',
    is_suspended = true,
    suspension_reason = 'Firma a fost ștearsă la cerere',
    suspended_at = now(),
    anonymised_at = now(),
    deletion_scheduled_at = now()
  where id = p_company_id;

  -- NOU. Jurnalul, la urmă: până acum rămânea întreg, cu nume, telefon
  -- și CUI în `before`/`after`, pentru totdeauna.
  perform public.scrub_audit_for_subject(null, p_company_id);
end;
$fn$;

comment on function public.anonymise_company(uuid) is
  'Leaves a firm as a shell with no identity and no people. Never a delete: a carried transport keeps both its ends.';

revoke all on function public.anonymise_company(uuid) from public, anon, authenticated;
grant execute on function public.anonymise_company(uuid) to service_role;

-- ---------------------------------------------------------------------
-- Ștergerea unui om curăță și jurnalul lui
--
-- `complete_account_deletion()` șterge profilul, iar restul cascadează
-- — dar `audit_log` nu are nicio cheie străină, deci nu cascadează
-- nimic. Un declanșator pe ștergerea profilului este mai sigur decât
-- încă o reproducere a unei funcții de o sută de linii: prinde orice
-- drum către ștergere, nu doar pe cel pe care l-am reprodus.
-- ---------------------------------------------------------------------
create or replace function public.scrub_audit_on_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  perform public.scrub_audit_for_subject(old.id, null);
  return old;
end;
$fn$;

drop trigger if exists profiles_scrub_audit on public.profiles;
create trigger profiles_scrub_audit
  before delete on public.profiles
  for each row execute function public.scrub_audit_on_profile_delete();

-- ---------------------------------------------------------------------
-- Și jobul care chiar taie vechiturile
--
-- `purge_audit_log()` exista din prima zi și nu a fost programată
-- niciodată, deci jurnalul creștea la nesfârșit. Fereastra vine din
-- setări, ca să se poată schimba fără migrare.
-- ---------------------------------------------------------------------
create or replace function public.run_audit_retention()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_months integer;
begin
  select audit_retention_months into v_months from public.deletion_settings where id;
  return public.purge_audit_log(make_interval(months => coalesce(v_months, 24)));
end;
$fn$;

revoke all on function public.run_audit_retention() from public, anon, authenticated;
grant execute on function public.run_audit_retention() to service_role;

do $cron$
begin
  -- Aceeași verificare ca la celelalte joburi: funcția, nu extensia.
  -- Pe o bază de test simplă nu există niciuna, iar migrarea trebuie să
  -- treacă oricum.
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise warning 'pg_cron nu este disponibil, deci retenția jurnalului NU este programată. Vezi docs/DEPLOYMENT.md.';
    return;
  end if;

  -- `cron.schedule` suprascrie după nume, ca la celelalte șaptesprezece
  -- joburi. Fără unschedule: shim-ul de test nu are varianta după nume,
  -- iar aici nu e nevoie de ea.
  perform cron.schedule('nightly-audit-retention', '45 3 * * *',
                        'select public.run_audit_retention();');
end
$cron$;

-- ---------------------------------------------------------------------
-- `job_health()` trebuie să știe și de jobul nou
--
-- Funcția ține două liste de joburi, una pentru starea curentă și una
-- pentru întârzieri, iar un job care lipsește din ele arată sănătos
-- fără să ruleze vreodată. Reprodusă din 20260927100000 cu un rând în
-- plus în fiecare.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.job_health(p_now timestamp with time zone DEFAULT now())
 RETURNS TABLE(job text, scheduled boolean, last_run timestamp with time zone, last_status text, hours_since numeric, is_late boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      ('hourly-listing-cleanup', 3.0), ('hourly-offer-expiry', 3.0),
      ('hourly-order-autocomplete', 3.0),
      ('hourly-push-cleanup', 3.0),
      ('nightly-compliance-sweep', 36.0),
      ('nightly-order-vehicle-check', 36.0),
      ('nightly-conversation-retention', 36.0),
      ('nightly-assisted-sweep', 36.0),
      ('nightly-audit-retention', 36.0),
      ('nightly-route-series', 36.0),
      ('nightly-rating-reminders', 36.0),
      ('nightly-reputation', 36.0),
      ('nightly-expiry-reminders', 36.0),
      ('nightly-listing-expiry-reminders', 36.0),
      ('nightly-retention', 36.0),
      ('nightly-saved-search-digest', 36.0),
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
      ('hourly-listing-cleanup', 3.0), ('hourly-offer-expiry', 3.0),
      ('hourly-order-autocomplete', 3.0), ('hourly-push-cleanup', 3.0),
      ('nightly-compliance-sweep', 36.0), ('nightly-expiry-reminders', 36.0),
      ('nightly-order-vehicle-check', 36.0),
      ('nightly-conversation-retention', 36.0),
      ('nightly-assisted-sweep', 36.0),
      ('nightly-audit-retention', 36.0),
      ('nightly-route-series', 36.0),
      ('nightly-rating-reminders', 36.0), ('nightly-reputation', 36.0),
      ('nightly-listing-expiry-reminders', 36.0),
      ('nightly-retention', 36.0), ('nightly-saved-search-digest', 36.0),
      ('outbox-dispatcher', 1.0)
    ) as e(job, late_after_hours)
    left join (
      select l.workflow as job, max(l.ran_at) as last_run,
             case when max(l.failed) > 0 then 'failed' else 'succeeded' end as last_status
      from public.job_run_log l group by l.workflow
    ) g on g.job = e.job
    order by e.job;
end;
$function$;

revoke all on function public.job_health(timestamptz) from public, anon;
grant execute on function public.job_health(timestamptz) to authenticated;
