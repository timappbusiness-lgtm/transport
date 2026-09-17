-- =====================================================================
-- 0026 - A public list of verified companies
--
-- The reference competitor puts "2.500+ firme" and five decorative stars on
-- its homepage. We cannot write that sentence, and would not want to: the
-- number would be ours to invent and the stars mean nothing.
--
-- What we can do is show the companies themselves — but only the ones that
-- asked to be shown, are verified, and are not suspended. Three conditions,
-- all in the view, so no page can widen them by forgetting a filter.
--
-- Deliberately absent from everything public here: phone, e-mail, address
-- beyond the city, document files, expiry dates finer than a month, plates,
-- VINs. The CUI is present, because it is public company data at ANAF and
-- hiding it would only make the entry harder to trust.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Turning a company name into a URL
--
-- Stable is the whole requirement: a slug that changed when a company
-- edited its display name would break every link anybody had shared. So it
-- is written once and then protected like an identifier, which is what it
-- is.
-- ---------------------------------------------------------------------
create or replace function public.slugify(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $fn$
  select nullif(
    trim(both '-' from
      regexp_replace(
        lower(translate(
          coalesce(p_text, ''),
          'ăâîșşțţĂÂÎȘŞȚŢáàäéèëíìïóòöúùüçñ',
          'aaissttAAISSTTaaaeeeiiiooouuucn'
        )),
        '[^a-z0-9]+', '-', 'g'
      )
    ),
    ''
  );
$fn$;

comment on function public.slugify(text) is
  'ASCII slug from Romanian text. Diacritics are transliterated rather than stripped, so "Brașov" becomes "brasov" and not "braov".';

/**
 * A slug nobody else has.
 *
 * The city is part of it because two hauliers called "Trans Expres SRL" in
 * different counties are a normal thing, not a collision to resolve with a
 * number. The number is only there for the case where even that repeats.
 */
create or replace function public.company_slug(p_legal_name text, p_city text, p_company_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_base text;
  v_slug text;
  v_n integer := 1;
begin
  v_base := public.slugify(
    coalesce(p_legal_name, '') ||
    case when coalesce(p_city, '') = '' then '' else '-' || p_city end
  );
  if v_base is null then
    v_base := 'firma';
  end if;

  v_slug := v_base;
  while exists (
    select 1 from public.companies c
    where c.slug = v_slug and (p_company_id is null or c.id <> p_company_id)
  ) loop
    v_n := v_n + 1;
    v_slug := v_base || '-' || v_n;
  end loop;

  return v_slug;
end;
$fn$;

-- ---------------------------------------------------------------------
-- The columns
-- ---------------------------------------------------------------------
alter table public.companies
  add column public_profile_enabled boolean not null default false,
  add column slug text unique,
  add column public_description text
    check (public_description is null or length(public_description) <= 300),
  add column logo_path text;

comment on column public.companies.public_profile_enabled is
  'Opt-in. A verified company appears in the public directory only when it asked to.';
comment on column public.companies.slug is
  'Written once, then protected: a slug that moved would break every shared link.';

create index companies_directory_idx
  on public.companies (verified_at desc)
  where public_profile_enabled and verification_status = 'verified' and not is_suspended;

-- Existing rows, and everything inserted from now on.
create or replace function public.set_company_slug()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.slug is null then
    new.slug := public.company_slug(new.legal_name, new.city, new.id);
  end if;
  return new;
end;
$fn$;

create trigger companies_set_slug
  before insert on public.companies
  for each row execute function public.set_company_slug();

update public.companies
set slug = public.company_slug(legal_name, city, id)
where slug is null;

-- The guard gains the three columns a manager may write and the one it may
-- not. Same function as migration 20260917140000, with slug added to the
-- protected list — `public_profile_enabled`, `public_description` and
-- `logo_path` are deliberately absent from it, because those are the
-- company's to change.
create or replace function public.guard_company_write()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if current_user not in ('authenticated', 'anon') or public.is_platform_admin() then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by
     or new.slug is distinct from old.slug
     or new.verification_status is distinct from old.verification_status
     or new.verified_at is distinct from old.verified_at
     or new.verification_note is distinct from old.verification_note
     or new.is_suspended is distinct from old.is_suspended
     or new.suspended_at is distinct from old.suspended_at
     or new.suspension_reason is distinct from old.suspension_reason
     or new.trust_score is distinct from old.trust_score
     or new.rating_avg is distinct from old.rating_avg
     or new.rating_count is distinct from old.rating_count
     or new.anaf_payload is distinct from old.anaf_payload
     or new.anaf_checked_at is distinct from old.anaf_checked_at
     or new.anaf_is_inactive is distinct from old.anaf_is_inactive then
    raise exception 'Starea de verificare, suspendarea, scorul și datele ANAF nu pot fi modificate din cont'
      using errcode = '42501';
  end if;

  if old.verification_status <> 'draft'
     and (new.cui is distinct from old.cui
          or new.country is distinct from old.country
          or new.legal_name is distinct from old.legal_name
          or new.reg_com is distinct from old.reg_com
          or new.company_type is distinct from old.company_type) then
    raise exception 'Datele de identificare ale unei firme verificate nu pot fi modificate din cont'
      using errcode = '42501';
  end if;

  return new;
end;
$fn$;

-- ---------------------------------------------------------------------
-- The directory
--
-- security_invoker is off, so this reads `companies` past RLS on purpose.
-- The protection is the three conditions in the WHERE and the column list,
-- both pinned by tests in supabase/tests/rls_test.sql.
-- ---------------------------------------------------------------------
create view public.v_public_companies as
select
  c.slug,
  coalesce(c.display_name, c.legal_name) as name,
  c.legal_name,
  c.cui,
  c.city,
  c.county,
  c.company_type,
  c.logo_path,
  c.public_description,
  c.verified_at as verified_since,
  c.rating_avg,
  c.rating_count,

  -- Vehicles whose ITP, RCA and copie conformă are all approved and in
  -- date. The nightly sweep maintains the flag; this only counts it.
  (
    select count(*)::integer from public.vehicles v
    where v.company_id = c.id and v.is_active and v.is_compliant
  ) as compliant_vehicles,

  -- What the company actually runs, from the routes it has published —
  -- not from a checkbox it ticked about itself.
  exists (
    select 1 from public.truck_listings t
    where t.company_id = c.id and t.status = 'active'
      and t.from_country = t.to_country
  ) as serves_national,
  exists (
    select 1 from public.truck_listings t
    where t.company_id = c.id and t.status = 'active'
      and t.from_country <> t.to_country
  ) as serves_international,

  -- When somebody last looked at this company's paperwork.
  greatest(
    (select max(d.reviewed_at) from public.documents d
     where d.company_id = c.id and d.status = 'approved'),
    (select max(v.compliance_checked_at) from public.vehicles v where v.company_id = c.id)
  ) as last_checked_at
from public.companies c
where c.public_profile_enabled
  and c.verification_status = 'verified'
  and not c.is_suspended
  and c.slug is not null;

comment on view public.v_public_companies is
  'The public directory: opted in, verified, not suspended. No phone, no e-mail, no address beyond the city, no documents, no plates.';

revoke all on public.v_public_companies from public;
grant select on public.v_public_companies to anon, authenticated;

-- ---------------------------------------------------------------------
-- The compliance shield on a profile
--
-- States, never files, and never a date finer than the month: "valabilă
-- până în octombrie 2027" tells a client what they need and does not hand
-- anybody a document's exact particulars.
-- ---------------------------------------------------------------------
create view public.v_public_company_documents as
select
  c.slug,
  r.kind,
  r.label_ro,
  case
    when d.valid_until is null then 'valid'
    when d.valid_until < current_date then 'expired'
    when d.valid_until <= current_date + 30 then 'expiring_soon'
    else 'valid'
  end as state,
  date_trunc('month', d.valid_until)::date as valid_month
from public.companies c
join public.document_requirements r
  on r.scope = 'company'
 and r.is_active
 and r.is_blocking
 and (r.for_company_types is null or c.company_type = any (r.for_company_types))
join public.documents d
  on d.company_id = c.id and d.scope = 'company' and d.kind = r.kind
 and d.status = 'approved'
where c.public_profile_enabled
  and c.verification_status = 'verified'
  and not c.is_suspended
  and c.slug is not null;

comment on view public.v_public_company_documents is
  'Which required company documents are approved and roughly how long they run. Month precision on purpose: a client needs the state, not the paperwork.';

revoke all on public.v_public_company_documents from public;
grant select on public.v_public_company_documents to anon, authenticated;

-- ---------------------------------------------------------------------
-- The two numbers the homepage band states
--
-- The third one it shows — requests published — comes from
-- homepage_activity(), so there is one definition of it rather than two
-- that can drift.
-- ---------------------------------------------------------------------
create or replace function public.directory_stats()
returns table (verified_companies integer, compliant_vehicles integer, listed_companies integer)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    (select count(*)::integer from public.companies c
      where c.verification_status = 'verified'
        and not c.is_suspended
        and c.company_type in ('transport', 'both')),
    (select count(*)::integer from public.vehicles v
      join public.companies c on c.id = v.company_id
      where v.is_active and v.is_compliant
        and c.verification_status = 'verified' and not c.is_suspended),
    (select count(*)::integer from public.v_public_companies);
$fn$;

comment on function public.directory_stats() is
  'Verified carriers, vehicles with their papers in date, and how many companies appear in the directory. Aggregates only: anon cannot read the rows behind them.';

grant execute on function public.directory_stats() to anon, authenticated;

-- ---------------------------------------------------------------------
-- Thresholds and the trial, and what a plan says about itself
-- ---------------------------------------------------------------------
alter table public.homepage_settings
  add column stats_min_companies integer not null default 20
    check (stats_min_companies between 0 and 100000),
  add column directory_min_companies integer not null default 12
    check (directory_min_companies between 0 and 100000),
  add column trial_days integer not null default 30
    check (trial_days between 0 and 365);

alter table public.plans
  add column display_features text[] not null default '{}';

comment on column public.plans.display_features is
  'What the price card lists, in the words a carrier reads. Separate from the enforced limits above it, which are numbers the database applies.';

update public.plans
set display_features = array[
  'Publicare nelimitată pe tur și pe retur',
  'Acces la cererile compatibile cu traseele tale',
  'Alerte pe e-mail pentru cereri de pe traseele tale',
  'Evidența documentelor firmei și ale vehiculelor',
  'Notificare înainte să expire un document'
]
where code = 'carrier';

-- Reading is already open to anon for public plans (migration
-- 20260916120500). What changes is writing: `plans_update_admin` let a staff
-- member change a price through PostgREST with no audit row, which is the
-- one thing every other settings table in this schema does not allow. The
-- RPC below becomes the only way in, and it writes to audit_log.
drop policy if exists "plans_update_admin" on public.plans;

revoke update on public.plans from anon, authenticated;

create or replace function public.set_plan(
  p_code text,
  p_price_ron_month numeric,
  p_is_public boolean,
  p_display_features text[]
)
returns public.plans
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.plans;
  v_after public.plans;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate modifica planurile' using errcode = '42501';
  end if;

  if p_price_ron_month is null or p_price_ron_month < 0 then
    raise exception 'Prețul trebuie să fie un număr pozitiv' using errcode = '22023';
  end if;

  select * into v_before from public.plans where code = p_code;
  if v_before.code is null then
    raise exception 'Planul nu există' using errcode = 'P0002';
  end if;

  update public.plans
  set price_ron_month = p_price_ron_month,
      is_public = p_is_public,
      display_features = coalesce(p_display_features, '{}')
  where code = p_code
  returning * into v_after;

  perform public.write_audit(
    'plan.updated', 'plans', null, to_jsonb(v_before), to_jsonb(v_after), null
  );

  return v_after;
end;
$fn$;

create or replace function public.set_directory_settings(
  p_stats_min_companies integer,
  p_directory_min_companies integer,
  p_trial_days integer
)
returns public.homepage_settings
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.homepage_settings;
  v_after public.homepage_settings;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate modifica pragurile de afișare' using errcode = '42501';
  end if;

  if p_stats_min_companies is null or p_stats_min_companies < 1
     or p_directory_min_companies is null or p_directory_min_companies < 1 then
    raise exception 'Pragurile trebuie să fie cel puțin 1' using errcode = '22023';
  end if;

  if p_trial_days is null or p_trial_days < 0 or p_trial_days > 365 then
    raise exception 'Perioada gratuită trebuie să fie între 0 și 365 de zile' using errcode = '22023';
  end if;

  select * into v_before from public.homepage_settings where id;

  update public.homepage_settings
  set stats_min_companies = p_stats_min_companies,
      directory_min_companies = p_directory_min_companies,
      trial_days = p_trial_days,
      updated_by = auth.uid()
  where id
  returning * into v_after;

  perform public.write_audit(
    'homepage_settings.updated', 'homepage_settings', null,
    to_jsonb(v_before), to_jsonb(v_after), 'Praguri pentru lista de firme'
  );

  return v_after;
end;
$fn$;

-- ---------------------------------------------------------------------
-- Moderation: taking a profile out of the list
--
-- Not a suspension and not a rejection — the company keeps its account and
-- its verified status. It simply stops being advertised by us, which is the
-- proportionate answer to a profile that is wrong rather than a company
-- that is.
-- ---------------------------------------------------------------------
create or replace function public.set_company_public_profile(
  p_company_id uuid,
  p_enabled boolean,
  p_reason text default null
)
returns public.companies
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.companies;
  v_after public.companies;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate ascunde un profil public' using errcode = '42501';
  end if;

  if not p_enabled and v_reason is null then
    raise exception 'Ascunderea unui profil are nevoie de un motiv' using errcode = '22023';
  end if;

  select * into v_before from public.companies where id = p_company_id;
  if v_before.id is null then
    raise exception 'Firma nu există' using errcode = 'P0002';
  end if;

  update public.companies
  set public_profile_enabled = p_enabled
  where id = p_company_id
  returning * into v_after;

  perform public.write_audit(
    case when p_enabled then 'company.profile_shown' else 'company.profile_hidden' end,
    'companies', p_company_id, to_jsonb(v_before), to_jsonb(v_after), v_reason
  );

  return v_after;
end;
$fn$;

-- ---------------------------------------------------------------------
-- Logos
--
-- A public bucket, because a logo on a public directory is public by
-- definition. Writes are scoped to the company's own folder, the same
-- convention the documents bucket uses.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'company-logos', 'company-logos', true, 1048576,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "company_logos_read_all" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'company-logos');

create policy "company_logos_write_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'company-logos'
    and public.is_company_manager((storage.foldername(name))[1]::uuid)
  );

create policy "company_logos_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'company-logos'
    and public.is_company_manager((storage.foldername(name))[1]::uuid)
  );

create policy "company_logos_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'company-logos'
    and public.is_company_manager((storage.foldername(name))[1]::uuid)
  );

-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------
grant execute on function public.slugify(text) to authenticated;
grant execute on function public.company_slug(text, text, uuid) to authenticated;
grant execute on function public.set_plan(text, numeric, boolean, text[]) to authenticated;
grant execute on function public.set_directory_settings(integer, integer, integer) to authenticated;
grant execute on function public.set_company_public_profile(uuid, boolean, text) to authenticated;
