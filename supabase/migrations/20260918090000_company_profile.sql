-- =====================================================================
-- The company profile: where a firm says what it actually does
--
-- `companies` has carried identity since migration 20260916120000 and a
-- public profile since 20260917150000 — a name, a city, a description and
-- a logo. None of it says what the firm *carries*, *where*, or *with
-- what*, which is the half a client picks a carrier on and the half
-- matching needs.
--
-- This migration adds that half, and it adds it to `companies` rather
-- than to a new table on purpose: coverage and capabilities are
-- attributes of the firm, they are read on every match, and a join per
-- match to fetch six arrays would be paid on the hot path for nothing.
--
-- Three rules shape everything below.
--
-- 1. **The user never types a derived number.** How many vehicles a firm
--    runs comes from `vehicles`, never from a box. A box would be wrong
--    within a month and nobody would notice.
-- 2. **Free text is normalised before it is stored, not when it is
--    shown.** A website arrives with a tracking query string and a phone
--    number arrives as `0722 000 111`; both are cleaned on the way in, so
--    every reader downstream sees one shape.
-- 3. **A capability is a code from a table, not a word someone typed.**
--    `equipment_options` and `service_options` are the vocabulary;
--    matching compares codes, and the admin screen is what grows it.
-- =====================================================================

-- ---------------------------------------------------------------------
-- How far a firm goes
-- ---------------------------------------------------------------------
create type public.coverage_scope as enum ('judetean', 'national', 'international');

comment on type public.coverage_scope is
  'How far a company carries: inside its own counties, anywhere in Romania, or across borders. Each level implies the ones before it.';

-- ---------------------------------------------------------------------
-- The vocabulary
--
-- Two tables rather than two enums, because this list grows: a new piece
-- of kit should be a row an admin adds, not a migration. `code` is what
-- is stored on the company and compared by matching; `label_ro` is what
-- is read, and it can be reworded without touching a single company row.
-- ---------------------------------------------------------------------
create table public.equipment_options (
  code text primary key check (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  label_ro text not null check (length(btrim(label_ro)) between 2 and 60),
  description_ro text check (description_ro is null or length(description_ro) <= 200),
  sort_order integer not null default 100,
  is_active boolean not null default true
);

comment on table public.equipment_options is
  'What a carrier can have on the truck. Codes are stored on companies.equipment; labels are shown. Grown from /admin/optiuni, never from a migration after this one.';

create table public.service_options (
  code text primary key check (code ~ '^[a-z][a-z0-9_]{1,40}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  label_ro text not null check (length(btrim(label_ro)) between 2 and 60),
  description_ro text check (description_ro is null or length(description_ro) <= 200),
  sort_order integer not null default 100,
  is_active boolean not null default true
);

comment on table public.service_options is
  'What a carrier offers as a job, as opposed to what it owns. Same shape and same rules as equipment_options.';

create trigger equipment_options_set_updated_at
  before update on public.equipment_options
  for each row execute function public.set_updated_at();

create trigger service_options_set_updated_at
  before update on public.service_options
  for each row execute function public.set_updated_at();

insert into public.equipment_options (code, label_ro, description_ro, sort_order) values
  ('troliu', 'Troliu', 'Urcă pe platformă un vehicul care nu se deplasează singur.', 10),
  ('platforma_hidraulica', 'Platformă hidraulică', 'Platforma coboară la sol, fără rampe.', 20),
  ('rampe', 'Rampe de încărcare', null, 30),
  ('chingi', 'Chingi și dispozitive de ancorare', 'Ancorare pe roți sau pe caroserie.', 40),
  ('roti_transport', 'Roți de transport', 'Skate-uri pentru un vehicul cu roțile blocate.', 50),
  ('prelata', 'Prelată', 'Acoperire împotriva prafului și a pietrelor.', 60),
  ('remorca_inchisa', 'Remorcă închisă', 'Transport ferit complet de drum și de vreme.', 70),
  ('cric', 'Cric', null, 80),
  ('robot_pornire', 'Robot de pornire', null, 90),
  ('lant_tractare', 'Lanț de tractare', null, 100);

insert into public.service_options (code, label_ro, description_ro, sort_order) values
  ('transport_platforma', 'Transport pe platformă', null, 10),
  ('tractare', 'Tractare', 'Ridicarea unui vehicul rămas în pană sau accidentat.', 20),
  ('transport_inchis', 'Transport în remorcă închisă', null, 30),
  ('transport_nefunctional', 'Vehicule care nu pornesc', null, 40),
  ('transport_avariat', 'Vehicule avariate', null, 50),
  ('transport_motociclete', 'Motociclete', null, 60),
  ('transport_utilaje', 'Utilaje', null, 70),
  ('ridicare_domiciliu', 'Ridicare de la adresă', 'Vehiculul este preluat de unde se află, nu dintr-un punct de colectare.', 80),
  ('livrare_domiciliu', 'Livrare la adresă', null, 90),
  ('transport_expres', 'Transport expres', 'Plecare dedicată, fără așteptarea completării platformei.', 100);

-- Reading the vocabulary is open: the options appear on a public profile
-- and in the filters of a board that anon can see. Writing is not — the
-- two RPCs at the end of this file are the only way in, and they audit.
alter table public.equipment_options enable row level security;
alter table public.service_options enable row level security;

create policy "equipment_options_read_all" on public.equipment_options
  for select to anon, authenticated using (is_active or public.is_platform_admin());

create policy "service_options_read_all" on public.service_options
  for select to anon, authenticated using (is_active or public.is_platform_admin());

revoke all on public.equipment_options from anon, authenticated;
revoke all on public.service_options from anon, authenticated;
grant select on public.equipment_options to anon, authenticated;
grant select on public.service_options to anon, authenticated;

-- ---------------------------------------------------------------------
-- Two immutable vocabularies a CHECK can call
--
-- A check constraint cannot read another table, and these two lists do
-- not change: the counties of Romania are fixed by law, and "two capital
-- letters" is what ISO 3166-1 alpha-2 is. Immutable functions holding a
-- constant are the honest way to say that in a constraint.
-- ---------------------------------------------------------------------
create or replace function public.ro_county_codes()
returns text[]
language sql
immutable
parallel safe
set search_path = public
as $fn$
  select array[
    'AB','AR','AG','BC','BH','BN','BT','BV','BR','B','BZ','CS','CL','CJ',
    'CT','CV','DB','DJ','GL','GR','GJ','HR','HD','IL','IS','IF','MM','MH',
    'MS','NT','OT','PH','SM','SJ','SB','SV','TR','TM','TL','VS','VL','VN'
  ]::text[];
$fn$;

comment on function public.ro_county_codes() is
  'The 41 counties and București, as ISO 3166-2:RO codes. Immutable so a CHECK can call it.';

create or replace function public.is_country_code_array(p_codes text[])
returns boolean
language sql
immutable
parallel safe
set search_path = public
as $fn$
  select p_codes is null
      or not exists (
        select 1 from unnest(p_codes) as code
        where code !~ '^[A-Z]{2}$'
      );
$fn$;

comment on function public.is_country_code_array(text[]) is
  'Every element is an ISO 3166-1 alpha-2 code. Says nothing about whether the country exists — that is a list that changes, and a wrong code costs a missed match, not a wrong one.';

-- ---------------------------------------------------------------------
-- Normalising what people type
--
-- Both run on the way in. A reader — matching, the public profile, an
-- e-mail template — should never have to wonder whether this particular
-- row was typed with spaces.
-- ---------------------------------------------------------------------
create or replace function public.normalise_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path = public
as $fn$
declare
  v text := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
begin
  if v = '' then
    return null;
  end if;

  -- `0040...` and `0722...` are both how a Romanian writes a Romanian
  -- number; E.164 is how a telephone network reads one.
  if v like '00%' then
    v := '+' || substring(v from 3);
  elsif v like '0%' then
    v := '+40' || substring(v from 2);
  elsif v not like '+%' then
    v := '+' || v;
  end if;

  -- A second plus anywhere means it was not a telephone number.
  if v !~ '^\+[1-9][0-9]{6,14}$' then
    raise exception 'Numărul de telefon nu este valid. Scrie-l în forma +40722000111'
      using errcode = '22023';
  end if;

  return v;
end;
$fn$;

comment on function public.normalise_phone(text) is
  'E.164 or an error. Accepts 0722..., 0040722... and +40722..., which is how the same number is written in this country.';

create or replace function public.normalise_website(p_url text)
returns text
language plpgsql
immutable
set search_path = public
as $fn$
declare
  v text := btrim(coalesce(p_url, ''));
  v_host text;
  v_tail text;
  v_query text;
  v_kept text;
begin
  if v = '' then
    return null;
  end if;

  -- A person types `firma.ro`. Nobody types a scheme.
  if v !~* '^https?://' then
    v := 'https://' || v;
  end if;

  -- http is upgraded rather than refused: the address is right, the
  -- scheme is a habit, and storing it as typed would publish a link that
  -- browsers now warn about.
  v := regexp_replace(v, '^http://', 'https://', 'i');

  -- Scheme and host are case-insensitive; the path is not, so the two are
  -- split and only the host is lowered. `regexp_replace` cannot do this in
  -- one pass: its replacement string is a template, so `lower('\1')` would
  -- lower-case the two characters of the back-reference and nothing else.
  v_host := lower(substring(v from '^https://([^/?#]+)'));
  v_tail := substring(v from '^https://[^/?#]*(.*)$');
  if v_host is null then
    raise exception 'Adresa site-ului nu este validă. Scrie-o în forma https://firma.ro'
      using errcode = '22023';
  end if;
  v := 'https://' || v_host || coalesce(v_tail, '');

  if v !~ '^https://([a-z0-9-]+\.)+[a-z]{2,}(:[0-9]{1,5})?(/|\?|#|$)' then
    raise exception 'Adresa site-ului nu este validă. Scrie-o în forma https://firma.ro'
      using errcode = '22023';
  end if;

  -- A fragment identifies a place on a page, which a directory link has
  -- no use for.
  v := regexp_replace(v, '#.*$', '');

  -- Tracking parameters belong to whoever copied the link out of a
  -- campaign, not to the company. Storing them would have this site
  -- report visits to somebody else's analytics for years.
  if position('?' in v) > 0 then
    v_query := split_part(v, '?', 2);
    select string_agg(part, '&' order by ord)
      into v_kept
      from unnest(string_to_array(v_query, '&')) with ordinality as t(part, ord)
     where part <> ''
       and lower(split_part(part, '=', 1)) not like 'utm\_%'
       and lower(split_part(part, '=', 1)) not in
           ('fbclid', 'gclid', 'gbraid', 'wbraid', 'msclkid', 'mc_eid', 'mc_cid',
            'igshid', 'ttclid', 'twclid', 'yclid', 'ref', 'referrer', 'source');

    v := split_part(v, '?', 1) || coalesce('?' || v_kept, '');
  end if;

  -- A bare host reads better without the slash the scheme check allowed.
  v := regexp_replace(v, '^(https://[^/?#]+)/$', '\1');

  if length(v) > 200 then
    raise exception 'Adresa site-ului este prea lungă' using errcode = '22023';
  end if;

  return v;
end;
$fn$;

comment on function public.normalise_website(text) is
  'https, lower-cased host, no fragment, no tracking parameters. What is stored is the company''s address, not the campaign somebody copied it from.';

-- ---------------------------------------------------------------------
-- The columns
-- ---------------------------------------------------------------------
alter table public.companies
  add column coverage_scope public.coverage_scope not null default 'national',
  add column coverage_counties text[] not null default '{}'::text[],
  add column coverage_countries text[] not null default '{}'::text[],
  add column vehicle_types_accepted public.cargo_category[] not null default '{}'::public.cargo_category[],
  add column equipment text[] not null default '{}'::text[],
  add column services text[] not null default '{}'::text[],
  add column indicative_rate_ron_per_km numeric(6,2),
  add column indicative_rate_note text,
  add column base_address_hidden boolean not null default false,
  add column alerts_enabled boolean not null default false,
  add column alerts_email text,
  add column profile_updated_at timestamptz;

comment on column public.companies.coverage_scope is
  'How far the firm goes. Each level implies the ones before it: a national carrier serves every county without listing them.';
comment on column public.companies.coverage_counties is
  'Which counties, when the scope is judetean. Ignored above that scope, because a national carrier that also ticked six counties means the six, which is not what it said.';
comment on column public.companies.coverage_countries is
  'Which countries besides Romania, when the scope is international.';
comment on column public.companies.vehicle_types_accepted is
  'Which of the thirteen cargo categories this firm carries. Empty means it has not said, which matching reads as "all" rather than "none" — see company_matches_request.';
comment on column public.companies.equipment is
  'Codes from equipment_options. What is on the truck.';
comment on column public.companies.services is
  'Codes from service_options. What the firm will take on.';
comment on column public.companies.indicative_rate_ron_per_km is
  'An indication, shown as one and never used to compute a price. Offers carry the price; this is what a client reads before asking.';
comment on column public.companies.base_address_hidden is
  'The street address is never public whatever this says. When true, the city is not public either and the profile shows only the county — for a firm operating from a home address.';
comment on column public.companies.alerts_enabled is
  'Whether a new matching request queues an e-mail to this firm. Off until asked for.';
comment on column public.companies.alerts_email is
  'Where alerts go, when that is not the company contact address.';
comment on column public.companies.profile_updated_at is
  'When the profile half was last changed. Maintained by trigger; a company account cannot write it.';

-- ---------------------------------------------------------------------
-- What the database refuses outright
--
-- The cross-field rules live in the trigger below, where a message can
-- name the field. These are the ones a constraint says better.
-- ---------------------------------------------------------------------

-- Existing rows first: the constraints below are added validating, so
-- anything already stored has to be in shape. In practice this is a
-- handful of draft companies, and normalise_phone raises rather than
-- guesses on anything that is not a number at all.
update public.companies
set contact_phone = case
      when regexp_replace(coalesce(contact_phone, ''), '[^0-9+]', '', 'g') = '' then null
      else public.normalise_phone(contact_phone)
    end
where contact_phone is not null;

update public.companies
set website = public.normalise_website(website)
where website is not null and btrim(website) <> '';

alter table public.companies
  add constraint companies_contact_phone_ck
    check (contact_phone is null or contact_phone ~ '^\+[1-9][0-9]{6,14}$'),
  add constraint companies_contact_email_ck
    check (contact_email is null or contact_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-zA-Z]{2,}$'),
  add constraint companies_alerts_email_ck
    check (alerts_email is null or alerts_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[a-zA-Z]{2,}$'),
  add constraint companies_website_ck
    check (website is null or (website like 'https://%' and length(website) <= 200)),
  add constraint companies_coverage_counties_ck
    check (coverage_counties <@ public.ro_county_codes()),
  add constraint companies_coverage_countries_ck
    check (public.is_country_code_array(coverage_countries)),
  add constraint companies_indicative_rate_ck
    check (indicative_rate_ron_per_km is null
           or indicative_rate_ron_per_km between 0.10 and 100.00),
  add constraint companies_indicative_rate_note_ck
    check (indicative_rate_note is null or length(indicative_rate_note) <= 200);

create index companies_coverage_counties_idx
  on public.companies using gin (coverage_counties);
create index companies_coverage_countries_idx
  on public.companies using gin (coverage_countries);
create index companies_equipment_idx
  on public.companies using gin (equipment);
create index companies_services_idx
  on public.companies using gin (services);
create index companies_vehicle_types_idx
  on public.companies using gin (vehicle_types_accepted);

-- The alert trigger's working set: firms that asked for e-mail and are
-- allowed to receive it.
create index companies_alerts_idx
  on public.companies (id)
  where alerts_enabled and verification_status = 'verified' and not is_suspended;

create or replace function public.tidy_codes(p_codes text[], p_upper boolean)
returns text[]
language sql
immutable
parallel safe
set search_path = public
as $fn$
  select coalesce(
    (
      select array_agg(code order by code)
      from (
        select distinct
          case when p_upper then upper(btrim(c)) else lower(btrim(c)) end as code
        from unnest(coalesce(p_codes, '{}'::text[])) as c
        where btrim(c) <> ''
      ) t
    ),
    '{}'::text[]
  );
$fn$;

comment on function public.tidy_codes(text[], boolean) is
  'Trim, case-fold, drop blanks, de-duplicate, sort. One shape per set of codes, so equality on these columns means what it looks like.';

-- ---------------------------------------------------------------------
-- What a profile has to add up to
--
-- The constraints above refuse a value. This refuses a combination, which
-- is where a message is worth writing: "judetean cu zero judete" is not a
-- typo, it is a half-filled form, and saying which half is missing is the
-- whole difference between fixing it and giving up.
--
-- It also normalises. Both jobs belong in one BEFORE trigger because they
-- run on the same row at the same moment, and splitting them would mean
-- validating a phone number that has not been cleaned yet.
-- ---------------------------------------------------------------------
create or replace function public.normalise_company_profile()
returns trigger
language plpgsql
set search_path = public
as $fn$
declare
  v_unknown text;
begin
  new.contact_phone := public.normalise_phone(new.contact_phone);
  new.website := public.normalise_website(new.website);
  new.contact_email := lower(nullif(btrim(coalesce(new.contact_email, '')), ''));
  new.alerts_email := lower(nullif(btrim(coalesce(new.alerts_email, '')), ''));
  new.indicative_rate_note := nullif(btrim(coalesce(new.indicative_rate_note, '')), '');

  -- Upper-cased, de-duplicated and sorted, so two firms that ticked the
  -- same counties in a different order hold the same array — which is what
  -- makes `=` on these columns mean anything in a test or a query plan.
  new.coverage_counties := public.tidy_codes(new.coverage_counties, true);
  new.coverage_countries := public.tidy_codes(new.coverage_countries, true);
  new.equipment := public.tidy_codes(new.equipment, false);
  new.services := public.tidy_codes(new.services, false);

  -- A scope says what the other two columns mean. Keeping the columns the
  -- scope does not use empty is what stops a firm that moved from
  -- judetean to national from carrying six stale counties that a later
  -- reader would take for the truth.
  if new.coverage_scope <> 'judetean' then
    new.coverage_counties := '{}'::text[];
  end if;
  if new.coverage_scope <> 'international' then
    new.coverage_countries := '{}'::text[];
  end if;

  if new.coverage_scope = 'judetean'
     and coalesce(array_length(new.coverage_counties, 1), 0) = 0 then
    raise exception 'Alege cel puțin un județ în care transporți' using errcode = '22023';
  end if;
  if new.coverage_scope = 'international'
     and coalesce(array_length(new.coverage_countries, 1), 0) = 0 then
    raise exception 'Alege cel puțin o țară în afara României' using errcode = '22023';
  end if;

  -- Only what this write *adds* is checked against the vocabulary. An
  -- option that has been retired since is still on the firms that ticked
  -- it, and validating the whole array would lock every one of them out
  -- of editing their telephone number until they noticed a checkbox that
  -- is no longer on the page.
  -- `t(code)` rather than a bare alias on purpose: with `unnest(...) as code`
  -- the inner `o.code = code` resolves against `equipment_options` itself,
  -- which is a column compared to itself and therefore always true. Naming
  -- the unnest column makes the comparison say what it reads as.
  select string_agg(t.code, ', ' order by t.code) into v_unknown
  from unnest(new.equipment) as t(code)
  where (tg_op = 'INSERT' or not (t.code = any (old.equipment)))
    and not exists (
      select 1 from public.equipment_options o where o.code = t.code and o.is_active
    );
  if v_unknown is not null then
    raise exception 'Dotare necunoscută: %', v_unknown using errcode = '22023';
  end if;

  select string_agg(t.code, ', ' order by t.code) into v_unknown
  from unnest(new.services) as t(code)
  where (tg_op = 'INSERT' or not (t.code = any (old.services)))
    and not exists (
      select 1 from public.service_options o where o.code = t.code and o.is_active
    );
  if v_unknown is not null then
    raise exception 'Serviciu necunoscut: %', v_unknown using errcode = '22023';
  end if;

  -- A note about a rate with no rate beside it is a sentence with nothing
  -- to qualify.
  if new.indicative_rate_note is not null and new.indicative_rate_ron_per_km is null then
    raise exception 'Scrie tariful orientativ înainte de observația despre el'
      using errcode = '22023';
  end if;

  if tg_op = 'UPDATE' and (
       new.coverage_scope is distinct from old.coverage_scope
    or new.coverage_counties is distinct from old.coverage_counties
    or new.coverage_countries is distinct from old.coverage_countries
    or new.vehicle_types_accepted is distinct from old.vehicle_types_accepted
    or new.equipment is distinct from old.equipment
    or new.services is distinct from old.services
    or new.indicative_rate_ron_per_km is distinct from old.indicative_rate_ron_per_km
    or new.indicative_rate_note is distinct from old.indicative_rate_note
    or new.public_description is distinct from old.public_description
    or new.base_address_hidden is distinct from old.base_address_hidden
  ) then
    new.profile_updated_at := now();
  elsif tg_op = 'INSERT' then
    new.profile_updated_at := null;
  end if;

  return new;
end;
$fn$;

comment on function public.normalise_company_profile() is
  'Cleans and cross-checks the profile half of a company row. Runs after guard_company_write, so the guard still sees exactly what the account submitted.';


-- The trigger sorts after companies_guard_write, which is what we want:
-- the guard judges the submission, then this cleans it.
create trigger companies_normalise_profile
  before insert or update on public.companies
  for each row execute function public.normalise_company_profile();

-- ---------------------------------------------------------------------
-- The guard gains one column
--
-- Same function as migration 20260917150000, with profile_updated_at
-- added to the protected list: it is a clock, and a clock an account can
-- set is a clock that says whatever is convenient. Everything else this
-- migration adds is deliberately absent — coverage, capabilities, the
-- indicative rate and the alert settings are the company's to state.
-- ---------------------------------------------------------------------
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
     or new.anaf_is_inactive is distinct from old.anaf_is_inactive
     or new.profile_updated_at is distinct from old.profile_updated_at then
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
-- Does this firm carry this request
--
-- The rule, once, in the place that has to be right: it decides who gets
-- an e-mail. `src/lib/matching.ts` answers the same question for the
-- dashboard's "potrivire după traseu" chips, on rows already fetched and
-- without a round trip; the two are kept deliberately identical and the
-- unit tests in `tests/unit/matching.test.ts` are written against the
-- cases below so a change to one shows up as a failure in the other.
--
-- Everything here is a *filter*, never a score. A marketplace that ranks
-- carriers by a number it invented is a marketplace that has to defend
-- the number.
-- ---------------------------------------------------------------------
create or replace function public.company_matches_request(p_company_id uuid, p_listing_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  c public.companies;
  l public.cargo_listings;
  d public.cargo_vehicle_details;
  v_domestic boolean;
begin
  select * into c from public.companies where id = p_company_id;
  select * into l from public.cargo_listings where id = p_listing_id;
  if c.id is null or l.id is null then
    return false;
  end if;
  select * into d from public.cargo_vehicle_details where cargo_listing_id = p_listing_id;

  -- Its own request is not a match; it is the thing it just posted.
  if l.company_id is not null and l.company_id = c.id then
    return false;
  end if;

  v_domestic := upper(l.loading_country) = upper(l.unloading_country);

  -- Coverage. A scope is a ceiling, not a label: national includes every
  -- county, international includes the whole of national.
  if v_domestic and upper(l.loading_country) = 'RO' then
    if c.coverage_scope = 'judetean' then
      -- An unknown county cannot be proved to be inside the coverage, and
      -- a county-only carrier is exactly the firm that should not be sent
      -- a job on the other side of the country on a guess.
      if l.loading_county is null or l.unloading_county is null then
        return false;
      end if;
      if not (upper(l.loading_county) = any (c.coverage_counties)
              and upper(l.unloading_county) = any (c.coverage_counties)) then
        return false;
      end if;
    end if;
  elsif v_domestic then
    -- Domestic, but inside another country: only a firm that named that
    -- country carries it.
    if c.coverage_scope <> 'international'
       or not (upper(l.loading_country) = any (c.coverage_countries)) then
      return false;
    end if;
  else
    if c.coverage_scope <> 'international' then
      return false;
    end if;
    -- Romania is always one of the two ends a Romanian carrier serves, so
    -- it never has to be ticked.
    if not (upper(l.loading_country) in ('RO')
            or upper(l.loading_country) = any (c.coverage_countries)) then
      return false;
    end if;
    if not (upper(l.unloading_country) in ('RO')
            or upper(l.unloading_country) = any (c.coverage_countries)) then
      return false;
    end if;
  end if;

  -- What it carries. An empty list is "has not said", which is read as
  -- "everything": a firm that never opened the tab should not silently
  -- stop receiving work.
  if d.cargo_listing_id is not null
     and coalesce(array_length(c.vehicle_types_accepted, 1), 0) > 0
     and not (d.category = any (c.vehicle_types_accepted)) then
    return false;
  end if;

  -- A forwarder subcontracts the kit, so the two rules below are about
  -- the vehicle that turns up, and a forwarder is not it.
  if c.company_type in ('transport', 'both') then
    -- The one hard capability rule in this marketplace: a car that does
    -- not roll needs a winch, and a firm without one cannot load it.
    if d.cargo_listing_id is not null and d.needs_winch
       and not ('troliu' = any (c.equipment)) then
      return false;
    end if;

    -- Recovery is a different job from carriage. Same "empty means has
    -- not said" reading as above.
    if l.service_type = 'tractare'
       and coalesce(array_length(c.services, 1), 0) > 0
       and not ('tractare' = any (c.services)) then
      return false;
    end if;
  end if;

  return true;
end;
$fn$;

comment on function public.company_matches_request(uuid, uuid) is
  'Whether a company carries a given request: coverage, category, winch and recovery. A filter, never a score. Internal — the alert trigger is its only caller.';

-- ---------------------------------------------------------------------
-- Telling a carrier a request turned up
--
-- The outbox is the same one migration 20260916120600 built and the n8n
-- `outbox-dispatcher` drains: Postgres decides who and when, n8n delivers
-- and retries. A row here is a decision, not a sent e-mail, which is why
-- the account screen says "primești un e-mail" only where a row is
-- actually written.
-- ---------------------------------------------------------------------
create or replace function public.queue_request_alerts()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_queued integer;
begin
  insert into public.notification_outbox
    (channel, template, recipient_company_id, to_email, payload, dedupe_key)
  select
    'email',
    'request_match_alert',
    c.id,
    coalesce(c.alerts_email, c.contact_email),
    jsonb_build_object(
      'company_name', coalesce(c.display_name, c.legal_name),
      'request_id', new.id,
      'title', new.title,
      'from_city', new.loading_city,
      'from_country', new.loading_country,
      'to_city', new.unloading_city,
      'to_country', new.unloading_country,
      'loading_from', new.loading_from,
      'loading_to', new.loading_to,
      'service_type', new.service_type
    ),
    'request_match:' || new.id || ':' || c.id
  from public.companies c
  where c.alerts_enabled
    and c.verification_status = 'verified'
    and not c.is_suspended
    and coalesce(c.alerts_email, c.contact_email) is not null
    and public.company_matches_request(c.id, new.id)
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  get diagnostics v_queued = row_count;
  if v_queued > 0 then
    perform public.write_audit('request.alerts_queued', 'cargo_listings', new.id,
                               null, jsonb_build_object('queued', v_queued));
  end if;
  return null;
end;
$fn$;

comment on function public.queue_request_alerts() is
  'Queues one e-mail per matching carrier when a request reaches the board. Deduped per request and company, so republishing does not send it twice.';

-- Fires on publish and on reopen alike, because both are the moment a
-- request becomes visible — and the dedupe key means a request that goes
-- round twice still only sends once.
create trigger cargo_listings_queue_alerts
  after update of status on public.cargo_listings
  for each row
  when (new.status = 'active' and old.status is distinct from 'active'
        and new.listing_kind = 'vehicul')
  execute function public.queue_request_alerts();

-- ---------------------------------------------------------------------
-- The public profile grows the half it was missing
--
-- `create or replace view` may add columns at the end and may change what
-- an existing column computes, as long as its name and type stay put.
-- Both are used here: the new capability columns are appended, and `city`
-- learns to go quiet for a firm working from a home address.
--
-- The street address was never in this view and still is not, whatever
-- base_address_hidden says. That column only decides whether the city
-- goes with it.
-- ---------------------------------------------------------------------
create or replace view public.v_public_companies as
select
  c.slug,
  coalesce(c.display_name, c.legal_name) as name,
  c.legal_name,
  c.cui,
  case when c.base_address_hidden then null else c.city end as city,
  c.county,
  c.company_type,
  c.logo_path,
  c.public_description,
  c.verified_at as verified_since,
  c.rating_avg,
  c.rating_count,

  (
    select count(*)::integer from public.vehicles v
    where v.company_id = c.id and v.is_active and v.is_compliant
  ) as compliant_vehicles,

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

  greatest(
    (select max(d.reviewed_at) from public.documents d
     where d.company_id = c.id and d.status = 'approved'),
    (select max(v.compliance_checked_at) from public.vehicles v where v.company_id = c.id)
  ) as last_checked_at,

  -- Appended by migration 20260918090000.
  c.coverage_scope,
  c.coverage_counties,
  c.coverage_countries,
  c.vehicle_types_accepted,
  c.equipment,
  c.services,
  c.indicative_rate_ron_per_km,
  c.indicative_rate_note,
  c.website,

  -- Derived from the fleet, never typed. A firm cannot claim eleven
  -- platforms and register two.
  (
    select count(*)::integer from public.vehicles v
    where v.company_id = c.id and v.is_active
  ) as vehicles_total
from public.companies c
where c.public_profile_enabled
  and c.verification_status = 'verified'
  and not c.is_suspended
  and c.slug is not null;

-- ---------------------------------------------------------------------
-- Growing the vocabulary
--
-- Both tables are read by anon and written by nobody: these two RPCs are
-- the only way in, they check the caller and they audit. A code is
-- written once and then frozen — it is stored in every company row that
-- ticked it, and a rename would quietly unset them all. Retiring an
-- option is `is_active = false`, which stops it being offered and leaves
-- the firms that have it alone.
-- ---------------------------------------------------------------------
create or replace function public.set_equipment_option(
  p_code text,
  p_label_ro text,
  p_description_ro text default null,
  p_sort_order integer default 100,
  p_is_active boolean default true
)
returns public.equipment_options
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.equipment_options;
  v_after public.equipment_options;
  v_code text := lower(btrim(coalesce(p_code, '')));
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate modifica lista de dotări' using errcode = '42501';
  end if;
  if v_code !~ '^[a-z][a-z0-9_]{1,40}$' then
    raise exception 'Codul poate conține doar litere mici, cifre și liniuță de subliniere'
      using errcode = '22023';
  end if;

  select * into v_before from public.equipment_options where code = v_code;

  insert into public.equipment_options (code, label_ro, description_ro, sort_order, is_active)
  values (v_code, btrim(p_label_ro), nullif(btrim(coalesce(p_description_ro, '')), ''),
          coalesce(p_sort_order, 100), coalesce(p_is_active, true))
  on conflict (code) do update
  set label_ro = excluded.label_ro,
      description_ro = excluded.description_ro,
      sort_order = excluded.sort_order,
      is_active = excluded.is_active
  returning * into v_after;

  perform public.write_audit(
    case when v_before.code is null then 'equipment_option.created' else 'equipment_option.updated' end,
    'equipment_options', null, to_jsonb(v_before), to_jsonb(v_after), v_code
  );
  return v_after;
end;
$fn$;

create or replace function public.set_service_option(
  p_code text,
  p_label_ro text,
  p_description_ro text default null,
  p_sort_order integer default 100,
  p_is_active boolean default true
)
returns public.service_options
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.service_options;
  v_after public.service_options;
  v_code text := lower(btrim(coalesce(p_code, '')));
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate modifica lista de servicii' using errcode = '42501';
  end if;
  if v_code !~ '^[a-z][a-z0-9_]{1,40}$' then
    raise exception 'Codul poate conține doar litere mici, cifre și liniuță de subliniere'
      using errcode = '22023';
  end if;

  select * into v_before from public.service_options where code = v_code;

  insert into public.service_options (code, label_ro, description_ro, sort_order, is_active)
  values (v_code, btrim(p_label_ro), nullif(btrim(coalesce(p_description_ro, '')), ''),
          coalesce(p_sort_order, 100), coalesce(p_is_active, true))
  on conflict (code) do update
  set label_ro = excluded.label_ro,
      description_ro = excluded.description_ro,
      sort_order = excluded.sort_order,
      is_active = excluded.is_active
  returning * into v_after;

  perform public.write_audit(
    case when v_before.code is null then 'service_option.created' else 'service_option.updated' end,
    'service_options', null, to_jsonb(v_before), to_jsonb(v_after), v_code
  );
  return v_after;
end;
$fn$;

-- ---------------------------------------------------------------------
-- Grants
--
-- Default privileges grant EXECUTE to nobody (migration 20260916130300),
-- so every function this file adds has to name its callers here.
--
--   ro_county_codes, is_country_code_array, tidy_codes  - read by the
--     account screen to build the same lists the constraints enforce, so
--     the two cannot drift.
--   normalise_phone, normalise_website                  - called by the
--     trigger and by the admin screen's preview; authenticated is enough.
--   set_equipment_option, set_service_option            - RPCs, so
--     authenticated, with is_platform_admin() inside.
--   normalise_company_profile, queue_request_alerts,
--   company_matches_request                             - triggers and
--     their helper. Nobody calls these by hand.
-- ---------------------------------------------------------------------
grant execute on function public.ro_county_codes() to anon, authenticated;
grant execute on function public.is_country_code_array(text[]) to authenticated;
grant execute on function public.tidy_codes(text[], boolean) to authenticated;
grant execute on function public.normalise_phone(text) to authenticated;
grant execute on function public.normalise_website(text) to authenticated;
grant execute on function public.set_equipment_option(text, text, text, integer, boolean) to authenticated;
grant execute on function public.set_service_option(text, text, text, integer, boolean) to authenticated;
