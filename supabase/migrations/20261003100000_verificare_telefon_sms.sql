-- =====================================================================
-- Verificarea numărului de telefon prin SMS
--
-- Baza cere `phone_verified` în opt locuri: publicarea unei cereri de
-- către o persoană fizică, dezvăluirea unui contact, acceptarea unei
-- oferte, crearea unei comenzi. Până acum singura cale către el era
-- `staff_set_phone_verified()` — cineva din echipă sună și bifează.
-- Merge la zece conturi, nu la o sută.
--
-- Ce se adaugă aici este **drumul**, nu furnizorul. Fără un secret de
-- furnizor nu se trimite niciun SMS și nimic nu se preface că s-a
-- trimis: funcția refuză tare, numește variabila care lipsește, iar
-- `/admin/notificari` o arată. Bifa manuală rămâne exact cum era, ca să
-- nu se blocheze pilotul pe o decizie de contract.
--
-- Codul în clar nu ajunge niciodată într-un rând: funcția marginală îl
-- generează, îl trimite și scrie numai `sha256`-ul lui. Confirmarea
-- rehașează ce a tastat omul și compară. Un dump al bazei nu conține
-- niciun cod valid.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Butoanele
--
-- Într-o tabelă și nu în constante, pentru că prima dată când un
-- furnizor ne limitează sau un atacator ne costă, răspunsul trebuie să
-- fie o linie schimbată din `/admin`, nu o migrare.
-- ---------------------------------------------------------------------
create table if not exists public.phone_verification_settings (
  id boolean primary key default true,
  code_ttl_seconds integer not null default 600
    check (code_ttl_seconds between 60 and 3600),
  max_attempts integer not null default 5
    check (max_attempts between 1 and 20),
  /** Câte coduri poate cere un cont într-o oră. */
  per_user_hourly integer not null default 5
    check (per_user_hourly between 1 and 50),
  /** Câte coduri poate primi un număr într-o oră, de la orice cont. */
  per_phone_hourly integer not null default 5
    check (per_phone_hourly between 1 and 50),
  /** Cât așteaptă cineva între două cereri, ca „retrimite" să nu fie un buton de spam. */
  resend_cooldown_seconds integer not null default 60
    check (resend_cooldown_seconds between 10 and 900),
  updated_at timestamptz not null default now(),
  constraint phone_verification_settings_single check (id)
);

insert into public.phone_verification_settings (id) values (true)
on conflict (id) do nothing;

comment on table public.phone_verification_settings is
  'Pragurile verificării prin SMS: cât ține un cod, câte încercări are, cât de des se poate cere. Se schimbă din /admin, nu printr-o migrare.';

alter table public.phone_verification_settings enable row level security;

create policy "phone_verification_settings_read" on public.phone_verification_settings
  for select to authenticated using (true);

create policy "phone_verification_settings_write" on public.phone_verification_settings
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

revoke all on public.phone_verification_settings from public, anon, authenticated;
grant select, update on public.phone_verification_settings to authenticated;
grant select, insert, update on public.phone_verification_settings to service_role;

-- ---------------------------------------------------------------------
-- 2. Provocările
--
-- Un rând pe cod cerut. Rândul rămâne după ce codul este folosit sau
-- expiră, fiindcă el este și limitatorul: „câte în ultima oră" se
-- numără de aici.
-- ---------------------------------------------------------------------
create table if not exists public.phone_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  /** Numărul în forma în care a fost cerut, normalizat la E.164. */
  phone text not null,
  /** `sha256` al codului, hex. Codul în clar nu este scris nicăieri. */
  code_hash text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  attempts integer not null default 0,
  sent_at timestamptz,
  consumed_at timestamptz,
  /** Id-ul furnizorului, ca un SMS nelivrat să poată fi căutat la el. */
  provider_id text,
  provider text,
  last_error text
);

comment on table public.phone_verifications is
  'O provocare pe cod cerut. Ține numai hash-ul codului. Rândurile rămân după folosire fiindcă ele sunt și limitatorul de frecvență.';
comment on column public.phone_verifications.code_hash is
  'sha256 hex. Null până când funcția marginală chiar a trimis SMS-ul: un cod scris înainte de trimitere este un cod valid pentru ceva ce nu a plecat.';

create index phone_verifications_user_idx
  on public.phone_verifications (user_id, created_at desc);
create index phone_verifications_phone_idx
  on public.phone_verifications (phone, created_at desc);
create index phone_verifications_live_idx
  on public.phone_verifications (user_id, expires_at)
  where consumed_at is null;

alter table public.phone_verifications enable row level security;

-- Nicio politică, deci nimeni nu citește tabela prin API — nici măcar
-- proprietarul rândului. Ecranul nu are ce afla din ea în afară de ce
-- îi întorc funcțiile, iar `code_hash` nu are ce căuta într-un răspuns
-- PostgREST. Aceeași alegere ca la `carrier_count_probes`.
revoke all on public.phone_verifications from public, anon, authenticated;
grant select, insert, update, delete on public.phone_verifications to service_role;

-- ---------------------------------------------------------------------
-- 3. Deschiderea unei provocări
--
-- O cheamă funcția marginală, cu cheia de serviciu, după ce a stabilit
-- cine este apelantul din JWT-ul lui. Aici se pun limitele, fiindcă
-- limitele sunt reguli de business și regulile de business stau în
-- Postgres — o limită numărată în TypeScript este o limită pe care o
-- ocolește cine cheamă altceva decât ecranul nostru.
-- ---------------------------------------------------------------------
create or replace function public.open_phone_verification(
  p_user uuid,
  p_phone text
)
returns public.phone_verifications
language plpgsql
security definer
set search_path = public
as $fn$
declare
  s public.phone_verification_settings;
  v_phone text;
  v_profile public.profiles;
  v_last timestamptz;
  v_row public.phone_verifications;
begin
  if auth.uid() is not null then
    raise exception 'Provocarea se deschide de funcția marginală, nu dintr-o sesiune'
      using errcode = '42501';
  end if;

  select * into s from public.phone_verification_settings where id;
  select * into v_profile from public.profiles where id = p_user;
  if v_profile.id is null then
    raise exception 'Contul nu există' using errcode = 'P0002';
  end if;

  -- Ridică dacă numărul nu este unul: mai bine un refuz clar decât un
  -- SMS trimis în gol și un om care așteaptă.
  v_phone := public.normalise_phone(p_phone);

  if v_profile.phone_verified and v_profile.phone = v_phone then
    raise exception 'Numărul este deja confirmat' using errcode = '22023';
  end if;

  -- Răcirea, ca „retrimite" să nu fie un buton de spam.
  select max(created_at) into v_last
  from public.phone_verifications where user_id = p_user;
  if v_last is not null
     and v_last > now() - make_interval(secs => s.resend_cooldown_seconds) then
    raise exception 'Mai așteaptă % secunde înainte să ceri alt cod',
      ceil(extract(epoch from
        (v_last + make_interval(secs => s.resend_cooldown_seconds)) - now()))::integer
      using errcode = '53400';
  end if;

  if (select count(*) from public.phone_verifications
      where user_id = p_user and created_at > now() - interval '1 hour') >= s.per_user_hourly then
    raise exception 'Prea multe coduri cerute într-o oră. Încearcă mai târziu sau scrie-ne.'
      using errcode = '53400';
  end if;

  -- Și pe număr, nu doar pe cont: altfel zece conturi noi trimit zece
  -- SMS-uri către același telefon, ceea ce pentru omul de la capăt este
  -- hărțuire și pentru noi este o factură.
  if (select count(*) from public.phone_verifications
      where phone = v_phone and created_at > now() - interval '1 hour') >= s.per_phone_hourly then
    raise exception 'Prea multe coduri cerute pentru numărul ăsta într-o oră'
      using errcode = '53400';
  end if;

  -- Provocările nefolosite ale aceluiași cont se închid: un singur cod
  -- viu odată, altfel „ultimul cod" nu înseamnă nimic.
  update public.phone_verifications
  set expires_at = now()
  where user_id = p_user and consumed_at is null and expires_at > now();

  insert into public.phone_verifications (user_id, phone, expires_at)
  values (p_user, v_phone, now() + make_interval(secs => s.code_ttl_seconds))
  returning * into v_row;

  return v_row;
end;
$fn$;

comment on function public.open_phone_verification(uuid, text) is
  'Deschide o provocare după ce trec limitele. Nu scrie niciun cod: funcția marginală generează codul, îl trimite și abia apoi întoarce hash-ul prin sent_phone_verification().';

revoke all on function public.open_phone_verification(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.open_phone_verification(uuid, text) to service_role;

/** Codul a plecat. Abia acum hash-ul devine valid. */
create or replace function public.sent_phone_verification(
  p_id uuid,
  p_code_hash text,
  p_provider text,
  p_provider_id text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if auth.uid() is not null then
    raise exception 'Numai funcția marginală' using errcode = '42501';
  end if;
  update public.phone_verifications
  set code_hash = p_code_hash, sent_at = now(),
      provider = p_provider, provider_id = p_provider_id, last_error = null
  where id = p_id;
end;
$fn$;

revoke all on function public.sent_phone_verification(uuid, text, text, text)
  from public, anon, authenticated, service_role;
grant execute on function public.sent_phone_verification(uuid, text, text, text) to service_role;

/** Furnizorul a refuzat. Provocarea moare pe loc, cu motivul pe ea. */
create or replace function public.failed_phone_verification(p_id uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if auth.uid() is not null then
    raise exception 'Numai funcția marginală' using errcode = '42501';
  end if;
  update public.phone_verifications
  set expires_at = now(), last_error = left(coalesce(p_error, ''), 500)
  where id = p_id;
end;
$fn$;

revoke all on function public.failed_phone_verification(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.failed_phone_verification(uuid, text) to service_role;

-- ---------------------------------------------------------------------
-- 4. Confirmarea
--
-- Asta o cheamă contul, direct. Codul călătorește în cerere, se
-- hașurează aici și se compară — niciodată invers, fiindcă un hash
-- calculat în browser ar face din hash-ul din bază chiar parola.
--
-- Fiecare încercare greșită se numără pe rând. La a `max_attempts`-a,
-- provocarea moare: altfel șase cifre se ghicesc prin încercare.
-- ---------------------------------------------------------------------
create or replace function public.confirm_phone_verification(p_code text)
returns table (ok boolean, message text, attempts_left integer)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  s public.phone_verification_settings;
  v_row public.phone_verifications;
  v_before public.profiles;
  v_after public.profiles;
  v_hash text;
begin
  if auth.uid() is null then
    raise exception 'Trebuie să fii conectat' using errcode = '42501';
  end if;

  select * into s from public.phone_verification_settings where id;

  select * into v_row from public.phone_verifications
  where user_id = auth.uid() and consumed_at is null and code_hash is not null
  order by created_at desc limit 1;

  if v_row.id is null then
    return query select false, 'Nu ai niciun cod în așteptare. Cere unul nou.'::text, 0;
    return;
  end if;
  if v_row.expires_at <= now() then
    return query select false, 'Codul a expirat. Cere unul nou.'::text, 0;
    return;
  end if;
  if v_row.attempts >= s.max_attempts then
    return query select false,
      'Prea multe încercări pentru codul ăsta. Cere unul nou.'::text, 0;
    return;
  end if;

  update public.phone_verifications set attempts = attempts + 1
  where id = v_row.id returning * into v_row;

  v_hash := encode(sha256(convert_to(btrim(coalesce(p_code, '')), 'UTF8')), 'hex');
  if v_hash is distinct from v_row.code_hash then
    if v_row.attempts >= s.max_attempts then
      update public.phone_verifications set expires_at = now() where id = v_row.id;
      return query select false,
        'Codul nu este bun, iar încercările s-au terminat. Cere unul nou.'::text, 0;
      return;
    end if;
    return query select false, 'Codul nu este bun'::text,
      greatest(s.max_attempts - v_row.attempts, 0);
    return;
  end if;

  select * into v_before from public.profiles where id = auth.uid();

  update public.phone_verifications set consumed_at = now() where id = v_row.id;

  -- `phone` se aliniază cu numărul confirmat: a confirma un număr și a
  -- păstra altul pe profil ar face bifa o minciună.
  update public.profiles set
    phone = v_row.phone,
    phone_verified = true,
    phone_verified_by_staff = false,
    phone_verified_at = now(),
    phone_verified_by = auth.uid(),
    phone_verified_note = null
  where id = auth.uid()
  returning * into v_after;

  perform public.write_audit('profile.phone_verified', 'profiles', auth.uid(),
    to_jsonb(v_before), to_jsonb(v_after), 'cod SMS');

  return query select true, 'Numărul a fost confirmat.'::text, 0;
end;
$fn$;

comment on function public.confirm_phone_verification(text) is
  'Un cod greșit este un rând, nu o excepție. Trebuie să fie: `raise` anulează scrierile propriei funcții, deci numărătoarea încercărilor s-ar pierde exact pe drumul care o cere — și șase cifre s-ar putea ghici la nesfârșit.';

revoke all on function public.confirm_phone_verification(text) from public, anon;
grant execute on function public.confirm_phone_verification(text) to authenticated;

/**
 * Numărul propriu, cu numai ultimele cifre.
 *
 * „Ți-am trimis codul la ···· 0099" spune omului că am luat numărul pe
 * care îl crede el, fără să scrie tot numărul într-un răspuns care
 * trece prin oriunde trece un răspuns.
 */
create or replace function public.mask_phone_tail(p_phone text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $fn$
  select case
    when coalesce(p_phone, '') = '' then ''
    when length(p_phone) <= 4 then repeat('•', length(p_phone))
    else repeat('•', length(p_phone) - 4) || right(p_phone, 4)
  end;
$fn$;

revoke all on function public.mask_phone_tail(text)
  from public, anon, authenticated, service_role;
grant execute on function public.mask_phone_tail(text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Ce vede contul despre propria provocare
--
-- Tabela nu se citește prin API (n-are nicio politică), deci starea se
-- întoarce de aici: câte încercări mai are, până când e bun codul, și
-- când poate cere altul. Fără `code_hash`, fără numărul altcuiva.
-- ---------------------------------------------------------------------
create or replace function public.my_phone_verification()
returns table (
  phone_masked text,
  expires_at timestamptz,
  attempts_left integer,
  can_resend_at timestamptz,
  sent boolean
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  s public.phone_verification_settings;
  v_row public.phone_verifications;
begin
  if auth.uid() is null then return; end if;
  select * into s from public.phone_verification_settings where id;

  select * into v_row from public.phone_verifications
  where user_id = auth.uid() and consumed_at is null
  order by created_at desc limit 1;

  if v_row.id is null or v_row.expires_at <= now() then return; end if;

  return query select
    public.mask_phone_tail(v_row.phone),
    v_row.expires_at,
    greatest(s.max_attempts - v_row.attempts, 0),
    v_row.created_at + make_interval(secs => s.resend_cooldown_seconds),
    v_row.code_hash is not null;
end;
$fn$;

revoke all on function public.my_phone_verification() from public, anon;
grant execute on function public.my_phone_verification() to authenticated;

-- ---------------------------------------------------------------------
-- 6. Ce vede echipa pe /admin/notificari
--
-- Aceeași formă ca `mail_provider_state()`: cifre, nu secrete. Dacă
-- furnizorul este configurat sau nu se citește din `job_run_log`, unde
-- funcția marginală scrie numele variabilei care îi lipsește — aceeași
-- mecanică ca la e-mail, fiindcă aplicația nu are cum să vadă secretele
-- unei funcții marginale.
-- ---------------------------------------------------------------------
create or replace function public.sms_provider_state()
returns table (
  last_sent_at timestamptz,
  sent_24h integer,
  failed_24h integer,
  confirmed_24h integer,
  pending_now integer,
  verified_accounts integer,
  verified_by_staff integer
)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    (select max(v.sent_at) from public.phone_verifications v),
    (select count(*)::integer from public.phone_verifications v
      where v.sent_at > now() - interval '24 hours'),
    (select count(*)::integer from public.phone_verifications v
      where v.last_error is not null and v.created_at > now() - interval '24 hours'),
    (select count(*)::integer from public.phone_verifications v
      where v.consumed_at > now() - interval '24 hours'),
    (select count(*)::integer from public.phone_verifications v
      where v.consumed_at is null and v.expires_at > now()),
    (select count(*)::integer from public.profiles p where p.phone_verified),
    (select count(*)::integer from public.profiles p where p.phone_verified_by_staff);
$fn$;

comment on function public.sms_provider_state() is
  'Cifre pentru /admin/notificari: ultimul SMS, ultimele 24 de ore, câte conturi au numărul confirmat și câte dintre ele de mână.';

revoke all on function public.sms_provider_state() from public, anon;
grant execute on function public.sms_provider_state() to authenticated;

-- ---------------------------------------------------------------------
-- 7. Curățenia
--
-- O provocare consumată sau expirată nu mai are ce spune după ce a
-- trecut fereastra de limitare. Numărul de telefon din ea este dată
-- personală (regula 9), deci nu rămâne „pentru statistici".
-- ---------------------------------------------------------------------
create or replace function public.purge_phone_verifications()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_deleted integer;
begin
  if auth.uid() is not null then
    raise exception 'Numai un job' using errcode = '42501';
  end if;
  delete from public.phone_verifications
  where created_at < now() - interval '7 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$fn$;

revoke all on function public.purge_phone_verifications()
  from public, anon, authenticated, service_role;
grant execute on function public.purge_phone_verifications() to service_role;

do $cron$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise warning 'cron.schedule lipsește: jobul nightly-phone-verifications nu a fost programat';
    return;
  end if;
  perform cron.schedule('nightly-phone-verifications', '20 4 * * *',
    $job$select public.purge_phone_verifications()$job$);
end
$cron$;

-- ---------------------------------------------------------------------
-- 8. `job_health()` trebuie să știe și de jobul nou
--
-- Două liste, una pentru starea curentă și una pentru întârzieri. Un
-- job care lipsește din ele arată sănătos fără să ruleze vreodată.
-- Reprodusă din 20260929100000 cu un rând în plus în fiecare.
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
      ('nightly-phone-verifications', 36.0),
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
      ('nightly-phone-verifications', 36.0),
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
