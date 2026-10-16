-- =====================================================================
-- Memento expirări auto
--
-- Anyone with an account — a person or a firm — writes down the vehicles
-- they drive and the dates their RCA, ITP, rovinietă and the rest run
-- out, and gets reminded before each one does. Free, quick to start, and
-- a reason for a vehicle owner to have an account here at all.
--
-- The one rule this file is built around: **declared is not verified.**
-- These are dates somebody typed. They live in their own tables, which
-- nothing in the compliance path reads:
--
--   - not `documents` — the staff-reviewed record that decides whether a
--     firm is „verificată" — and nothing here ever writes to it;
--   - not `vehicles` — the fleet whose `is_compliant` the sweep computes;
--     a memento vehicle is a different row in a different table, even
--     when the plate is the same;
--   - not matching, not the public views, not the directory.
--
-- `security_test.sql` holds that apart structurally (no function or view
-- outside the memento reads these tables) and `rls_test.sql` block MEM
-- holds it behaviourally (memento entries change no compliance, no
-- verification status, no public count).
--
-- Reminders ride the job that already exists: `queue_expiry_reminders()`
-- (cron `nightly-expiry-reminders`) keeps every line it had for the
-- verified documents and calls `memento_queue_reminders()` after them, in
-- its own guarded block, so a failure in the memento can never stop the
-- reminders a carrier's licence depends on.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Settings
--
-- One row, like every other feature's settings. Staff change it with
-- `memento_set_settings()`; nothing here needs a migration to tune.
-- ---------------------------------------------------------------------
create table public.memento_settings (
  id boolean primary key default true check (id),
  -- How many vehicles one account may keep. A person rarely has more
  -- than a handful; a firm's whole fleet fits under the second.
  max_vehicles_individual integer not null default 20
    check (max_vehicles_individual between 1 and 500),
  max_vehicles_company integer not null default 500
    check (max_vehicles_company between 1 and 5000),
  max_entries_per_vehicle integer not null default 12
    check (max_entries_per_vehicle between 1 and 50),
  -- Rate limits: vehicles added one by one, CSV imports, AI readings.
  vehicles_per_hour integer not null default 30 check (vehicles_per_hour between 1 and 1000),
  imports_per_hour integer not null default 5 check (imports_per_hour between 1 and 100),
  import_max_rows integer not null default 300 check (import_max_rows between 1 and 5000),
  ai_reads_per_day integer not null default 20 check (ai_reads_per_day between 0 and 1000),
  -- How long an entry stays after its date passed without a renewal, and
  -- how long a replaced date stays in the history.
  history_days integer not null default 365 check (history_days between 30 and 3650),
  -- Days before the date: 30, a week, the day before, and the day itself.
  default_days integer[] not null default '{30,7,1,0}'
    check (cardinality(default_days) between 1 and 8
           and 0 <= all (default_days) and 365 >= all (default_days)
           and array_position(default_days, null) is null),
  -- Entries whose next reminder would come within this many days of one
  -- going out today join it, so close dates make one e-mail, not three.
  group_window_days integer not null default 3 check (group_window_days between 0 and 14),
  updated_at timestamptz not null default now()
);

insert into public.memento_settings default values;

comment on table public.memento_settings is
  'Limits, retention and the default reminder days for the memento. One row; staff edit it through memento_set_settings().';

-- ---------------------------------------------------------------------
-- 2. The vehicles
--
-- Owned by a person (owner_user_id) or by a firm (owner_company_id),
-- never both. A firm may name one of its members as the responsible
-- person for a vehicle; that person is who the reminders go to.
-- ---------------------------------------------------------------------
create table public.memento_vehicles (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references public.profiles (id) on delete cascade,
  owner_company_id uuid references public.companies (id) on delete cascade,
  -- Upper case, letters and digits only: „B 123 ABC" is stored B123ABC.
  plate text not null check (plate ~ '^[A-Z0-9]{2,12}$'),
  make text check (make is null or char_length(make) between 1 and 40),
  model text check (model is null or char_length(model) between 1 and 40),
  -- Optional, and only used to pick the one line of conversion copy a
  -- firm sees. Never for matching.
  vehicle_kind text check (vehicle_kind in ('autoturism', 'duba', 'transportor', 'altul')),
  responsible_user_id uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memento_vehicles_one_owner check (num_nonnulls(owner_user_id, owner_company_id) = 1),
  constraint memento_vehicles_responsible_firm check (responsible_user_id is null or owner_company_id is not null)
);

create unique index memento_vehicles_user_plate
  on public.memento_vehicles (owner_user_id, plate) where owner_user_id is not null;
create unique index memento_vehicles_company_plate
  on public.memento_vehicles (owner_company_id, plate) where owner_company_id is not null;
create index memento_vehicles_responsible on public.memento_vehicles (responsible_user_id)
  where responsible_user_id is not null;

create trigger memento_vehicles_set_updated_at
  before update on public.memento_vehicles
  for each row execute function public.set_updated_at();

comment on table public.memento_vehicles is
  'Vehicles somebody wants reminders for. Self-declared, never verified, never public, never used for matching. Not the fleet: public.vehicles is.';

-- ---------------------------------------------------------------------
-- 3. The dates
-- ---------------------------------------------------------------------
create table public.memento_entries (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.memento_vehicles (id) on delete cascade,
  kind text not null check (kind in ('rca', 'itp', 'rovinieta', 'casco', 'trusa_medicala',
                                     'extinctor', 'revizie', 'altceva')),
  -- Only for „Altceva", where the person names it.
  custom_name text check (custom_name is null or char_length(btrim(custom_name)) between 2 and 60),
  valid_until date,
  -- A service can be due at a mileage instead of, or besides, a date.
  due_km integer check (due_km is null or due_km between 1 and 3000000),
  -- Policy or series number, if they want it here.
  reference text check (reference is null or char_length(reference) between 1 and 60),
  note text check (note is null or char_length(note) between 1 and 500),
  -- `<owner id>/<file id>.jpg` in the private `memento` bucket.
  photo_path text check (photo_path is null or photo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.jpg$'),
  -- The Bucharest day the current date was written. A reminder whose day
  -- had already passed then is not sent: somebody who adds an RCA with
  -- twenty days left does not need the thirty-day reminder the next morning.
  date_set_on date not null default ((now() at time zone 'Europe/Bucharest')::date),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint memento_entries_name check ((kind = 'altceva') = (custom_name is not null)),
  constraint memento_entries_when check (valid_until is not null or (kind = 'revizie' and due_km is not null))
);

create unique index memento_entries_one_kind
  on public.memento_entries (vehicle_id, kind) where kind <> 'altceva';
create unique index memento_entries_one_other
  on public.memento_entries (vehicle_id, lower(custom_name)) where kind = 'altceva';
create index memento_entries_valid_until on public.memento_entries (valid_until)
  where valid_until is not null;

create trigger memento_entries_set_updated_at
  before update on public.memento_entries
  for each row execute function public.set_updated_at();

comment on table public.memento_entries is
  'One expiry date per vehicle and kind, as the owner declared it. A memento, not a verified document: public.documents is the verified record and is never written from here.';

-- The dates an entry had before „Am reînnoit".
create table public.memento_history (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.memento_entries (id) on delete cascade,
  valid_until date,
  due_km integer,
  reference text,
  photo_path text,
  renewed_at timestamptz not null default now(),
  renewed_by uuid references public.profiles (id) on delete set null
);

create index memento_history_entry on public.memento_history (entry_id, renewed_at desc);

comment on table public.memento_history is
  'The previous dates of a memento entry, one row per renewal. Kept for memento_settings.history_days, then removed by memento_purge().';

-- Which reminder went out for which date, so a reminder goes once and a
-- missed night is caught up the next.
create table public.memento_reminder_log (
  entry_id uuid not null references public.memento_entries (id) on delete cascade,
  valid_until date not null,
  milestone integer not null,
  sent_on date not null,
  primary key (entry_id, valid_until, milestone)
);

-- Reminder days per account, per kind. `*` is the account's default.
create table public.memento_schedules (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references public.profiles (id) on delete cascade,
  owner_company_id uuid references public.companies (id) on delete cascade,
  kind text not null check (kind in ('*', 'rca', 'itp', 'rovinieta', 'casco', 'trusa_medicala',
                                     'extinctor', 'revizie', 'altceva')),
  -- Empty means: no reminders for this kind.
  days integer[] not null
    check (cardinality(days) <= 8 and 0 <= all (days) and 365 >= all (days)
           and array_position(days, null) is null),
  updated_at timestamptz not null default now(),
  constraint memento_schedules_one_owner check (num_nonnulls(owner_user_id, owner_company_id) = 1)
);

create unique index memento_schedules_user_kind
  on public.memento_schedules (owner_user_id, kind) where owner_user_id is not null;
create unique index memento_schedules_company_kind
  on public.memento_schedules (owner_company_id, kind) where owner_company_id is not null;

-- What a person did, counted for the rate limits. Two days, then gone.
create table public.memento_events (
  id bigint generated always as identity primary key,
  actor uuid not null references public.profiles (id) on delete cascade,
  action text not null check (action in ('vehicle', 'import', 'ai_read')),
  at timestamptz not null default now()
);

create index memento_events_actor on public.memento_events (actor, action, at desc);

-- The link in a reminder that stops the reminders, without signing in.
create table public.memento_unsubscribe_tokens (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4. Access
--
-- Read: the owner; a firm's operators (owner, admin, dispatcher); the
-- person responsible for a vehicle; staff, read only. Write: nobody
-- directly — every change goes through the functions below, which check
-- the caller, the limits and the rate.
-- ---------------------------------------------------------------------
alter table public.memento_settings enable row level security;
alter table public.memento_vehicles enable row level security;
alter table public.memento_entries enable row level security;
alter table public.memento_history enable row level security;
alter table public.memento_reminder_log enable row level security;
alter table public.memento_schedules enable row level security;
alter table public.memento_events enable row level security;
alter table public.memento_unsubscribe_tokens enable row level security;

revoke all on public.memento_settings, public.memento_vehicles, public.memento_entries,
  public.memento_history, public.memento_reminder_log, public.memento_schedules,
  public.memento_events, public.memento_unsubscribe_tokens
  from anon, authenticated;

grant select on public.memento_settings, public.memento_vehicles, public.memento_entries,
  public.memento_history, public.memento_schedules, public.memento_reminder_log,
  public.memento_events, public.memento_unsubscribe_tokens
  to authenticated;

create policy memento_settings_read on public.memento_settings
  for select to authenticated using (true);

create policy memento_vehicles_read on public.memento_vehicles
  for select to authenticated
  using (
    owner_user_id = auth.uid()
    or (owner_company_id is not null and public.is_company_operator(owner_company_id))
    or (owner_company_id is not null and responsible_user_id = auth.uid()
        and public.is_company_member(owner_company_id))
    or public.is_platform_admin()
  );

-- Through the vehicle: its policy above decides.
create policy memento_entries_read on public.memento_entries
  for select to authenticated
  using (exists (select 1 from public.memento_vehicles v where v.id = vehicle_id));

create policy memento_history_read on public.memento_history
  for select to authenticated
  using (exists (select 1 from public.memento_entries e where e.id = entry_id));

create policy memento_schedules_read on public.memento_schedules
  for select to authenticated
  using (
    owner_user_id = auth.uid()
    or (owner_company_id is not null and public.is_company_member(owner_company_id))
    or public.is_platform_admin()
  );

create policy memento_reminder_log_read on public.memento_reminder_log
  for select to authenticated using (public.is_platform_admin());

create policy memento_events_read on public.memento_events
  for select to authenticated using (public.is_platform_admin());

create policy memento_unsubscribe_tokens_read on public.memento_unsubscribe_tokens
  for select to authenticated using (user_id = auth.uid());

-- ---------------------------------------------------------------------
-- 5. The private bucket for photos
--
-- `<owner id>/<file id>.jpg`, the owner being the person's id or the
-- firm's. Read by the owner, the firm's members and staff; written by
-- the owner and the firm's members (the function that attaches a photo
-- to an entry checks who may edit that entry).
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('memento', 'memento', false, 10485760, array['image/jpeg'])
on conflict (id) do nothing;

create policy memento_photos_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'memento'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_company_member(public.safe_uuid((storage.foldername(name))[1]))
      or public.is_platform_admin()
    )
  );

create policy memento_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'memento'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_company_member(public.safe_uuid((storage.foldername(name))[1]))
    )
  );

create policy memento_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'memento'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_company_operator(public.safe_uuid((storage.foldername(name))[1]))
    )
  );

-- ---------------------------------------------------------------------
-- 6. Small helpers
-- ---------------------------------------------------------------------

-- Today, where the people are.
create or replace function public.memento_today(p_now timestamptz default now())
returns date
language sql
stable
set search_path = public
as $fn$
  select (p_now at time zone 'Europe/Bucharest')::date;
$fn$;

-- „B 123 ABC", „b-123-abc" and „B123ABC" are one plate.
create or replace function public.memento_plate(p_plate text)
returns text
language sql
immutable
set search_path = public
as $fn$
  select upper(regexp_replace(coalesce(p_plate, ''), '[^A-Za-z0-9]', '', 'g'));
$fn$;

-- What a person reads: RCA, ITP, Rovinietă …
create or replace function public.memento_kind_label(p_kind text, p_custom_name text default null)
returns text
language sql
immutable
set search_path = public
as $fn$
  select case p_kind
    when 'rca' then 'RCA'
    when 'itp' then 'ITP'
    when 'rovinieta' then 'Rovinieta'
    when 'casco' then 'CASCO'
    when 'trusa_medicala' then 'Trusa medicală'
    when 'extinctor' then 'Extinctorul'
    when 'revizie' then 'Revizia'
    else coalesce(nullif(btrim(p_custom_name), ''), 'Documentul')
  end;
$fn$;

-- „expiră azi", „expiră mâine", „expiră în 7 zile", „expiră în 30 de zile".
create or replace function public.memento_when(p_days integer)
returns text
language sql
immutable
set search_path = public
as $fn$
  select case
    when p_days < 0 then 'a expirat'
    when p_days = 0 then 'expiră azi'
    when p_days = 1 then 'expiră mâine'
    when p_days % 100 between 1 and 19 then 'expiră în ' || p_days || ' zile'
    else 'expiră în ' || p_days || ' de zile'
  end;
$fn$;

-- „3 documente", „20 de documente".
create or replace function public.memento_count_text(p_count integer)
returns text
language sql
immutable
set search_path = public
as $fn$
  select case
    when p_count = 1 then 'un document'
    when p_count % 100 between 1 and 19 then p_count || ' documente'
    else p_count || ' de documente'
  end;
$fn$;

-- May the caller change this vehicle and its entries?
create or replace function public.memento_may_manage(p_vehicle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.memento_vehicles v
    where v.id = p_vehicle_id
      and auth.uid() is not null
      and (v.owner_user_id = auth.uid()
           or (v.owner_company_id is not null and public.is_company_operator(v.owner_company_id)))
  );
$fn$;

-- May the caller renew this vehicle's entries? The managers, and the
-- person the firm made responsible for it.
create or replace function public.memento_may_renew(p_vehicle_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select public.memento_may_manage(p_vehicle_id)
      or exists (
        select 1 from public.memento_vehicles v
        where v.id = p_vehicle_id
          and v.owner_company_id is not null
          and v.responsible_user_id = auth.uid()
          and public.is_company_member(v.owner_company_id)
      );
$fn$;

-- The reminder days for one entry: the account's choice for the kind,
-- else the account's default, else the platform's.
create or replace function public.memento_days_for(
  p_owner_user_id uuid,
  p_owner_company_id uuid,
  p_kind text
)
returns integer[]
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(
    (select s.days from public.memento_schedules s
     where s.kind = p_kind
       and (s.owner_user_id = p_owner_user_id or s.owner_company_id = p_owner_company_id)
     limit 1),
    (select s.days from public.memento_schedules s
     where s.kind = '*'
       and (s.owner_user_id = p_owner_user_id or s.owner_company_id = p_owner_company_id)
     limit 1),
    (select m.default_days from public.memento_settings m where m.id)
  );
$fn$;

-- Counts one action against its limit, or refuses it.
create or replace function public.memento_note_event(
  p_action text,
  p_limit integer,
  p_window interval
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_count integer;
begin
  select count(*) into v_count from public.memento_events
  where actor = auth.uid() and action = p_action and at > now() - p_window;
  if v_count >= p_limit then
    raise exception '%', case p_action
      when 'vehicle' then 'Ai adăugat multe vehicule într-o oră. Mai încearcă puțin mai târziu.'
      when 'import' then 'Ai importat de mai multe ori în ultima oră. Mai încearcă puțin mai târziu.'
      else 'Ai folosit citirea automată de multe ori azi. Scrie data de mână sau încearcă mâine.'
    end using errcode = '53400';
  end if;
  insert into public.memento_events (actor, action) values (auth.uid(), p_action);
end;
$fn$;

-- The folder a vehicle's photos live in: the person's id or the firm's.
create or replace function public.memento_folder(p_vehicle_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(owner_user_id, owner_company_id)::text
  from public.memento_vehicles where id = p_vehicle_id;
$fn$;

-- One entry's date, validated the same way everywhere.
create or replace function public.memento_check_date(p_date date, p_label text default null)
returns void
language plpgsql
immutable
set search_path = public
as $fn$
begin
  if p_date is not null and (p_date < date '2000-01-01' or p_date > date '2100-01-01') then
    raise exception '%Data % nu pare corectă.',
      coalesce(p_label || ': ', ''), to_char(p_date, 'DD.MM.YYYY') using errcode = '22023';
  end if;
end;
$fn$;

-- ---------------------------------------------------------------------
-- 7. Writing: vehicles
-- ---------------------------------------------------------------------

/**
 * Adds a vehicle, or changes one the caller may manage.
 *
 * Idempotent on the id the device chose: the form sent twice (a retry,
 * the way back from signing in) finds the first one and changes it,
 * instead of refusing it as a duplicate plate.
 */
create or replace function public.memento_save_vehicle(
  p_id uuid,
  p_company_id uuid,
  p_plate text,
  p_make text default null,
  p_model text default null,
  p_vehicle_kind text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_plate text := public.memento_plate(p_plate);
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_existing public.memento_vehicles;
  v_settings public.memento_settings;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'Intră în cont ca să salvezi mementoul.' using errcode = '42501';
  end if;
  if v_plate !~ '^[A-Z0-9]{2,12}$' then
    raise exception 'Numărul de înmatriculare „%" nu pare corect.', coalesce(p_plate, '') using errcode = '22023';
  end if;
  if p_vehicle_kind is not null and p_vehicle_kind not in ('autoturism', 'duba', 'transportor', 'altul') then
    raise exception 'Tipul vehiculului nu este pe listă.' using errcode = '22023';
  end if;

  select * into v_existing from public.memento_vehicles where id = v_id;
  if v_existing.id is not null then
    -- Somebody else's id, or one in another scope: as if it did not exist.
    if not public.memento_may_manage(v_id)
       or v_existing.owner_company_id is distinct from p_company_id
          and not (p_company_id is null and v_existing.owner_user_id = v_uid) then
      raise exception 'Vehiculul nu există.' using errcode = 'P0002';
    end if;
    begin
      update public.memento_vehicles
      set plate = v_plate,
          make = nullif(btrim(coalesce(p_make, '')), ''),
          model = nullif(btrim(coalesce(p_model, '')), ''),
          vehicle_kind = p_vehicle_kind
      where id = v_id;
    exception when unique_violation then
      raise exception 'Vehiculul % este deja în listă.', v_plate using errcode = '23505';
    end;
    return v_id;
  end if;

  select * into v_settings from public.memento_settings where id;

  if p_company_id is not null then
    if not public.is_company_operator(p_company_id) then
      raise exception 'Nu poți adăuga vehicule în flota acestei firme.' using errcode = '42501';
    end if;
    select count(*) into v_count from public.memento_vehicles where owner_company_id = p_company_id;
    if v_count >= v_settings.max_vehicles_company then
      raise exception 'Flota a ajuns la numărul maxim de vehicule din memento (%). Scrie-ne dacă ai nevoie de mai multe.',
        v_settings.max_vehicles_company using errcode = '53400';
    end if;
  else
    select count(*) into v_count from public.memento_vehicles where owner_user_id = v_uid;
    if v_count >= v_settings.max_vehicles_individual then
      raise exception 'Ai ajuns la numărul maxim de vehicule din memento pe un cont (%). Scrie-ne dacă ai nevoie de mai multe.',
        v_settings.max_vehicles_individual using errcode = '53400';
    end if;
  end if;

  perform public.memento_note_event('vehicle', v_settings.vehicles_per_hour, interval '1 hour');

  begin
    insert into public.memento_vehicles
      (id, owner_user_id, owner_company_id, plate, make, model, vehicle_kind, created_by)
    values
      (v_id, case when p_company_id is null then v_uid end, p_company_id, v_plate,
       nullif(btrim(coalesce(p_make, '')), ''), nullif(btrim(coalesce(p_model, '')), ''),
       p_vehicle_kind, v_uid);
  exception when unique_violation then
    raise exception 'Vehiculul % este deja în listă.', v_plate using errcode = '23505';
  end;
  return v_id;
end;
$fn$;

comment on function public.memento_save_vehicle(uuid, uuid, text, text, text, text) is
  'Adds or changes a memento vehicle for the caller (p_company_id null) or a firm the caller operates. Enforces the per-account maximum and the hourly rate.';

/** Removes a vehicle and its dates. Returns the photo paths to remove from storage. */
create or replace function public.memento_delete_vehicle(p_id uuid)
returns text[]
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_paths text[];
begin
  if not public.memento_may_manage(p_id) then
    raise exception 'Vehiculul nu există.' using errcode = 'P0002';
  end if;
  select coalesce(array_agg(p) filter (where p is not null), '{}') into v_paths
  from (
    select e.photo_path as p from public.memento_entries e where e.vehicle_id = p_id
    union
    select h.photo_path from public.memento_history h
      join public.memento_entries e on e.id = h.entry_id where e.vehicle_id = p_id
  ) s;
  delete from public.memento_vehicles where id = p_id;
  return v_paths;
end;
$fn$;

/** Names the member of the firm who receives this vehicle's reminders, or nobody. */
create or replace function public.memento_set_responsible(p_vehicle_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_vehicle public.memento_vehicles;
begin
  select * into v_vehicle from public.memento_vehicles where id = p_vehicle_id;
  if v_vehicle.id is null or v_vehicle.owner_company_id is null
     or not public.is_company_operator(v_vehicle.owner_company_id) then
    raise exception 'Vehiculul nu există.' using errcode = 'P0002';
  end if;
  if p_user_id is not null and not exists (
    select 1 from public.company_members m
    where m.company_id = v_vehicle.owner_company_id and m.user_id = p_user_id
  ) then
    raise exception 'Persoana aleasă nu este în firmă.' using errcode = '22023';
  end if;
  update public.memento_vehicles set responsible_user_id = p_user_id where id = p_vehicle_id;
end;
$fn$;

-- ---------------------------------------------------------------------
-- 8. Writing: dates
-- ---------------------------------------------------------------------

/**
 * Writes one date for a vehicle: a new one, or a correction of the one
 * there (a typo, not a renewal — „Am reînnoit" is memento_renew()).
 */
create or replace function public.memento_save_entry(
  p_vehicle_id uuid,
  p_kind text,
  p_valid_until date,
  p_custom_name text default null,
  p_due_km integer default null,
  p_reference text default null,
  p_note text default null,
  p_photo_path text default null,
  p_entry_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_existing public.memento_entries;
  v_settings public.memento_settings;
  v_name text := case when p_kind = 'altceva' then nullif(btrim(coalesce(p_custom_name, '')), '') end;
  v_folder text;
  v_count integer;
  v_id uuid;
begin
  if not public.memento_may_manage(p_vehicle_id) then
    raise exception 'Vehiculul nu există.' using errcode = 'P0002';
  end if;
  if p_kind is null or p_kind not in ('rca', 'itp', 'rovinieta', 'casco', 'trusa_medicala',
                                      'extinctor', 'revizie', 'altceva') then
    raise exception 'Tipul documentului nu este pe listă.' using errcode = '22023';
  end if;
  if p_kind = 'altceva' and v_name is null then
    raise exception 'Scrie ce document este.' using errcode = '22023';
  end if;
  if p_valid_until is null and not (p_kind = 'revizie' and p_due_km is not null) then
    raise exception 'Scrie data până la care este valabil.' using errcode = '22023';
  end if;
  perform public.memento_check_date(p_valid_until, public.memento_kind_label(p_kind, v_name));

  v_folder := public.memento_folder(p_vehicle_id);
  if p_photo_path is not null and p_photo_path not like v_folder || '/%' then
    raise exception 'Poza nu este a acestui vehicul.' using errcode = '22023';
  end if;

  if p_entry_id is not null then
    select * into v_existing from public.memento_entries where id = p_entry_id;
    if v_existing.id is not null and v_existing.vehicle_id <> p_vehicle_id then
      raise exception 'Documentul nu există.' using errcode = 'P0002';
    end if;
  end if;
  if v_existing.id is null then
    select * into v_existing from public.memento_entries
    where vehicle_id = p_vehicle_id and kind = p_kind
      and (p_kind <> 'altceva' or lower(custom_name) = lower(v_name));
  end if;

  if v_existing.id is not null then
    update public.memento_entries
    set custom_name = v_name,
        valid_until = p_valid_until,
        due_km = p_due_km,
        reference = nullif(btrim(coalesce(p_reference, '')), ''),
        note = nullif(btrim(coalesce(p_note, '')), ''),
        photo_path = coalesce(p_photo_path, photo_path),
        date_set_on = case when valid_until is distinct from p_valid_until
                           then public.memento_today() else date_set_on end
    where id = v_existing.id;
    return v_existing.id;
  end if;

  select * into v_settings from public.memento_settings where id;
  select count(*) into v_count from public.memento_entries where vehicle_id = p_vehicle_id;
  if v_count >= v_settings.max_entries_per_vehicle then
    raise exception 'Vehiculul a ajuns la numărul maxim de documente în memento (%).', v_count using errcode = '53400';
  end if;

  v_id := coalesce(p_entry_id, gen_random_uuid());
  insert into public.memento_entries
    (id, vehicle_id, kind, custom_name, valid_until, due_km, reference, note, photo_path, date_set_on)
  values
    (v_id, p_vehicle_id, p_kind, v_name, p_valid_until, p_due_km,
     nullif(btrim(coalesce(p_reference, '')), ''), nullif(btrim(coalesce(p_note, '')), ''),
     p_photo_path, public.memento_today());
  return v_id;
end;
$fn$;

/**
 * „Am reînnoit": the new date, and the old one kept in the history.
 *
 * Pressing it twice with the same date is the same renewal, not an error.
 */
create or replace function public.memento_renew(
  p_entry_id uuid,
  p_valid_until date,
  p_due_km integer default null,
  p_reference text default null,
  p_photo_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_entry public.memento_entries;
  v_folder text;
begin
  select * into v_entry from public.memento_entries where id = p_entry_id;
  if v_entry.id is null or not public.memento_may_renew(v_entry.vehicle_id) then
    raise exception 'Documentul nu există.' using errcode = 'P0002';
  end if;

  if p_valid_until is null and not (v_entry.kind = 'revizie' and p_due_km is not null) then
    raise exception 'Scrie data nouă.' using errcode = '22023';
  end if;
  perform public.memento_check_date(p_valid_until);

  -- The same renewal sent twice.
  if p_valid_until is not distinct from v_entry.valid_until
     and (p_due_km is null or p_due_km is not distinct from v_entry.due_km) then
    return v_entry.id;
  end if;
  if v_entry.valid_until is not null and p_valid_until is not null and p_valid_until < v_entry.valid_until then
    raise exception 'Data nouă trebuie să fie după cea de acum (%).',
      to_char(v_entry.valid_until, 'DD.MM.YYYY') using errcode = '22023';
  end if;

  v_folder := public.memento_folder(v_entry.vehicle_id);
  if p_photo_path is not null and p_photo_path not like v_folder || '/%' then
    raise exception 'Poza nu este a acestui vehicul.' using errcode = '22023';
  end if;

  insert into public.memento_history (entry_id, valid_until, due_km, reference, photo_path, renewed_by)
  values (v_entry.id, v_entry.valid_until, v_entry.due_km, v_entry.reference, v_entry.photo_path, auth.uid());

  update public.memento_entries
  set valid_until = p_valid_until,
      due_km = coalesce(p_due_km, case when kind = 'revizie' then null else due_km end),
      reference = nullif(btrim(coalesce(p_reference, '')), ''),
      photo_path = p_photo_path,
      date_set_on = public.memento_today()
  where id = v_entry.id;
  return v_entry.id;
end;
$fn$;

/** Removes one date. Returns the photo paths to remove from storage. */
create or replace function public.memento_delete_entry(p_entry_id uuid)
returns text[]
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_entry public.memento_entries;
  v_paths text[];
begin
  select * into v_entry from public.memento_entries where id = p_entry_id;
  if v_entry.id is null or not public.memento_may_manage(v_entry.vehicle_id) then
    raise exception 'Documentul nu există.' using errcode = 'P0002';
  end if;
  select coalesce(array_agg(p) filter (where p is not null), '{}') into v_paths
  from (
    select v_entry.photo_path as p
    union
    select h.photo_path from public.memento_history h where h.entry_id = p_entry_id
  ) s;
  delete from public.memento_entries where id = p_entry_id;
  return v_paths;
end;
$fn$;

/**
 * A fleet at once, from a CSV the screen has already read.
 *
 * p_rows: [{"line": 2, "plate": "B123ABC", "make": "Ford", "model": "Transit",
 *           "dates": {"rca": "2026-12-01", "itp": "2027-03-10"}}, …]
 *
 * All or nothing: a row the database refuses names its line and nothing
 * is imported, so a half-imported fleet never has to be untangled.
 * A plate already in the list has its dates updated, not duplicated.
 */
create or replace function public.memento_import(p_company_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_settings public.memento_settings;
  v_row jsonb;
  v_line integer;
  v_plate text;
  v_vehicle_id uuid;
  v_kind text;
  v_date_text text;
  v_date date;
  v_count integer;
  v_added integer := 0;
  v_updated integer := 0;
  v_dates integer := 0;
  v_index integer := 0;
begin
  if v_uid is null then
    raise exception 'Intră în cont ca să imporți.' using errcode = '42501';
  end if;
  if p_company_id is not null and not public.is_company_operator(p_company_id) then
    raise exception 'Nu poți importa în flota acestei firme.' using errcode = '42501';
  end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'Fișierul nu are niciun rând de importat.' using errcode = '22023';
  end if;

  select * into v_settings from public.memento_settings where id;
  if jsonb_array_length(p_rows) > v_settings.import_max_rows then
    raise exception 'Fișierul trece de numărul maxim de rânduri la un import (%). Împarte-l și importă-l pe bucăți.',
      v_settings.import_max_rows using errcode = '53400';
  end if;
  perform public.memento_note_event('import', v_settings.imports_per_hour, interval '1 hour');

  for v_row in select value from jsonb_array_elements(p_rows) loop
    v_index := v_index + 1;
    v_line := coalesce((v_row ->> 'line')::integer, v_index);
    v_plate := public.memento_plate(v_row ->> 'plate');
    if v_plate !~ '^[A-Z0-9]{2,12}$' then
      raise exception 'Rândul %: numărul de înmatriculare „%" nu pare corect.',
        v_line, coalesce(v_row ->> 'plate', '') using errcode = '22023';
    end if;

    select id into v_vehicle_id from public.memento_vehicles
    where plate = v_plate
      and (case when p_company_id is null then owner_user_id = v_uid
                else owner_company_id = p_company_id end);

    if v_vehicle_id is null then
      select count(*) into v_count from public.memento_vehicles
      where case when p_company_id is null then owner_user_id = v_uid
                 else owner_company_id = p_company_id end;
      if v_count >= (case when p_company_id is null then v_settings.max_vehicles_individual
                          else v_settings.max_vehicles_company end) then
        raise exception 'Rândul %: s-a ajuns la numărul maxim de vehicule din memento (%).', v_line, v_count
          using errcode = '53400';
      end if;
      insert into public.memento_vehicles
        (owner_user_id, owner_company_id, plate, make, model, created_by)
      values
        (case when p_company_id is null then v_uid end, p_company_id, v_plate,
         left(nullif(btrim(coalesce(v_row ->> 'make', '')), ''), 40),
         left(nullif(btrim(coalesce(v_row ->> 'model', '')), ''), 40), v_uid)
      returning id into v_vehicle_id;
      v_added := v_added + 1;
    else
      update public.memento_vehicles
      set make = coalesce(left(nullif(btrim(coalesce(v_row ->> 'make', '')), ''), 40), make),
          model = coalesce(left(nullif(btrim(coalesce(v_row ->> 'model', '')), ''), 40), model)
      where id = v_vehicle_id;
      v_updated := v_updated + 1;
    end if;

    if v_row ? 'dates' and jsonb_typeof(v_row -> 'dates') = 'object' then
      for v_kind, v_date_text in select key, value #>> '{}' from jsonb_each(v_row -> 'dates') loop
        if v_kind not in ('rca', 'itp', 'rovinieta', 'casco', 'trusa_medicala', 'extinctor', 'revizie') then
          raise exception 'Rândul %: coloana „%" nu este un document cunoscut.', v_line, v_kind
            using errcode = '22023';
        end if;
        if v_date_text is null or btrim(v_date_text) = '' then
          continue;
        end if;
        begin
          v_date := v_date_text::date;
        exception when others then
          raise exception 'Rândul %: data „%" pentru % nu este o dată.', v_line, v_date_text,
            public.memento_kind_label(v_kind) using errcode = '22023';
        end;
        if v_date < date '2000-01-01' or v_date > date '2100-01-01' then
          raise exception 'Rândul %: data % pentru % nu pare corectă.', v_line,
            to_char(v_date, 'DD.MM.YYYY'), public.memento_kind_label(v_kind) using errcode = '22023';
        end if;

        update public.memento_entries
        set valid_until = v_date,
            date_set_on = case when valid_until is distinct from v_date
                               then public.memento_today() else date_set_on end
        where vehicle_id = v_vehicle_id and kind = v_kind;
        if not found then
          select count(*) into v_count from public.memento_entries where vehicle_id = v_vehicle_id;
          if v_count >= v_settings.max_entries_per_vehicle then
            raise exception 'Rândul %: vehiculul % a ajuns la numărul maxim de documente (%).', v_line, v_plate, v_count
              using errcode = '53400';
          end if;
          insert into public.memento_entries (vehicle_id, kind, valid_until, date_set_on)
          values (v_vehicle_id, v_kind, v_date, public.memento_today());
        end if;
        v_dates := v_dates + 1;
      end loop;
    end if;
  end loop;

  return jsonb_build_object('vehicles_added', v_added, 'vehicles_updated', v_updated, 'dates_saved', v_dates);
end;
$fn$;

/**
 * The reminder days for one kind, or the account's default (`*`).
 * Null days take the row away, back to the platform's default.
 */
create or replace function public.memento_set_schedule(
  p_company_id uuid,
  p_kind text,
  p_days integer[]
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_days integer[];
begin
  if v_uid is null then
    raise exception 'Intră în cont.' using errcode = '42501';
  end if;
  if p_company_id is not null and not public.is_company_operator(p_company_id) then
    raise exception 'Nu poți schimba mementourile acestei firme.' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('*', 'rca', 'itp', 'rovinieta', 'casco', 'trusa_medicala',
                                      'extinctor', 'revizie', 'altceva') then
    raise exception 'Tipul documentului nu este pe listă.' using errcode = '22023';
  end if;

  if p_days is null then
    delete from public.memento_schedules
    where kind = p_kind
      and (case when p_company_id is null then owner_user_id = v_uid
                else owner_company_id = p_company_id end);
    return;
  end if;

  select coalesce(array_agg(distinct d order by d desc), '{}') into v_days
  from unnest(p_days) d where d is not null;
  if cardinality(v_days) > 8 or exists (select 1 from unnest(v_days) d where d < 0 or d > 365) then
    raise exception 'Alege cel mult opt zile, între 0 și 365.' using errcode = '22023';
  end if;

  if p_company_id is null then
    insert into public.memento_schedules (owner_user_id, kind, days)
    values (v_uid, p_kind, v_days)
    on conflict (owner_user_id, kind) where owner_user_id is not null
    do update set days = excluded.days, updated_at = now();
  else
    insert into public.memento_schedules (owner_company_id, kind, days)
    values (p_company_id, p_kind, v_days)
    on conflict (owner_company_id, kind) where owner_company_id is not null
    do update set days = excluded.days, updated_at = now();
  end if;
end;
$fn$;

/** One AI reading of a photo, counted against the daily limit, or refused. */
create or replace function public.memento_claim_ai_read()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_limit integer;
begin
  if auth.uid() is null then
    raise exception 'Intră în cont.' using errcode = '42501';
  end if;
  select ai_reads_per_day into v_limit from public.memento_settings where id;
  if coalesce(v_limit, 0) = 0 then
    raise exception 'Citirea automată nu este disponibilă acum. Scrie data de mână.' using errcode = '53400';
  end if;
  perform public.memento_note_event('ai_read', v_limit, interval '1 day');
end;
$fn$;

/**
 * The link in a reminder: stops the reminders by e-mail, without
 * signing in. The same answer whether the token exists or not, except
 * the boolean the page needs to say which.
 */
create or replace function public.memento_unsubscribe(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_user uuid;
begin
  select user_id into v_user from public.memento_unsubscribe_tokens where token = p_token;
  if v_user is null then
    return false;
  end if;
  insert into public.notification_preferences (user_id, type, email)
  values (v_user, 'memento_expiry', false)
  on conflict (user_id, type) do update set email = false, updated_at = now();
  return true;
end;
$fn$;

comment on function public.memento_unsubscribe(uuid) is
  'Stops memento reminders by e-mail from the link in the e-mail. Open to anon: the token is a random uuid, one per person, and the only thing it can do is switch this one e-mail type off.';

/** Staff tune the limits and the default schedule. */
create or replace function public.memento_set_settings(
  p_max_vehicles_individual integer,
  p_max_vehicles_company integer,
  p_vehicles_per_hour integer,
  p_imports_per_hour integer,
  p_import_max_rows integer,
  p_ai_reads_per_day integer,
  p_history_days integer,
  p_default_days integer[]
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate schimba setările.' using errcode = '42501';
  end if;
  select to_jsonb(s) into v_before from public.memento_settings s where id;
  update public.memento_settings
  set max_vehicles_individual = p_max_vehicles_individual,
      max_vehicles_company = p_max_vehicles_company,
      vehicles_per_hour = p_vehicles_per_hour,
      imports_per_hour = p_imports_per_hour,
      import_max_rows = p_import_max_rows,
      ai_reads_per_day = p_ai_reads_per_day,
      history_days = p_history_days,
      default_days = (select coalesce(array_agg(distinct d order by d desc), '{}')
                      from unnest(p_default_days) d where d is not null),
      updated_at = now()
  where id;
  perform public.write_audit('settings.memento', 'memento_settings', null, v_before,
    (select to_jsonb(s) from public.memento_settings s where id));
end;
$fn$;

-- ---------------------------------------------------------------------
-- 9. The reminders
--
-- One pass a night, from inside queue_expiry_reminders(). For each entry
-- with a date ahead, the reminder due is the smallest of its days that is
-- not below the days left — so a night the job did not run is caught up
-- the next — unless it was already sent for this date, or its day had
-- passed before the date was even written.
--
-- Grouped by the person who receives them: one e-mail per person per
-- day, listing every reminder due, plus any whose next reminder would
-- come within the grouping window, so dates close together make one
-- message. A push the same way, through queue_push() (preferences, quiet
-- hours, the hourly cap). E-mail respects the person's e-mail preference
-- for this type and their quiet hours, and carries a link that stops it.
-- ---------------------------------------------------------------------
create or replace function public.memento_queue_reminders(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_today date := public.memento_today(p_now);
  v_settings public.memento_settings;
  v_recipient record;
  v_profile public.profiles;
  v_token uuid;
  v_first jsonb;
  v_count integer;
  v_email_rows integer := 0;
  v_items_text text;
  v_ids text;
begin
  select * into v_settings from public.memento_settings where id;

  for v_recipient in
    with live as (
      select e.id as entry_id, e.kind, e.custom_name, e.valid_until, e.date_set_on,
             (e.valid_until - v_today) as days_left,
             v.id as vehicle_id, v.plate, v.make, v.model,
             v.owner_user_id, v.owner_company_id, v.responsible_user_id,
             public.memento_days_for(v.owner_user_id, v.owner_company_id, e.kind) as days
      from public.memento_entries e
      join public.memento_vehicles v on v.id = e.vehicle_id
      where e.valid_until is not null
        and e.valid_until between v_today and v_today + 366
    ),
    marked as (
      select l.*,
             (select min(d) from unnest(l.days) d where d >= l.days_left) as m_due,
             (select max(d) from unnest(l.days) d where d < l.days_left) as m_next
      from live l
    ),
    flagged as (
      select m.*,
             (m.m_due is not null
              and m.m_due < (m.valid_until - m.date_set_on)
              and not exists (select 1 from public.memento_reminder_log r
                              where r.entry_id = m.entry_id and r.valid_until = m.valid_until
                                and r.milestone = m.m_due)) as is_due,
             -- The day itself is never pulled forward: it is always its own.
             (m.m_next is not null
              and m.m_next > 0
              and m.days_left - m.m_next <= v_settings.group_window_days
              and m.m_next < (m.valid_until - m.date_set_on)
              and not exists (select 1 from public.memento_reminder_log r
                              where r.entry_id = m.entry_id and r.valid_until = m.valid_until
                                and r.milestone = m.m_next)) as is_soon
      from marked m
    ),
    items as (
      -- What this reminder stands for. An entry due today: its reminder,
      -- and, when it is a late one (a night the job did not run), the next
      -- one too if it is only days away — otherwise somebody told today
      -- about an RCA eight days out is told again tomorrow. An entry not
      -- due: its next reminder, brought forward to ride along with one
      -- that is, so close dates make one e-mail.
      select f.*,
             case
               when f.is_due and f.is_soon and f.m_due > f.days_left then array[f.m_due, f.m_next]
               when f.is_due then array[f.m_due]
               else array[f.m_next]
             end as milestones
      from flagged f
      where f.is_due or f.is_soon
    ),
    addressed as (
      select i.*, r.user_id
      from items i
      cross join lateral (
        -- A person's own vehicle: the person.
        select i.owner_user_id as user_id where i.owner_user_id is not null
        union
        -- A firm's: the person responsible for it, while still in the firm…
        select i.responsible_user_id
        where i.owner_company_id is not null and i.responsible_user_id is not null
          and exists (select 1 from public.company_members cm
                      where cm.company_id = i.owner_company_id and cm.user_id = i.responsible_user_id)
        union
        -- …else the firm's owner and admins.
        select cm.user_id from public.company_members cm
        where i.owner_company_id is not null
          and cm.company_id = i.owner_company_id
          and cm.role in ('owner', 'admin')
          and not exists (select 1 from public.company_members r
                          where r.company_id = i.owner_company_id and r.user_id = i.responsible_user_id)
      ) r
    )
    select a.user_id,
           jsonb_agg(jsonb_build_object(
             'entry_id', a.entry_id,
             'valid_until', a.valid_until,
             'milestones', to_jsonb(a.milestones),
             'days_left', a.days_left,
             'label', public.memento_kind_label(a.kind, a.custom_name),
             'plate', a.plate,
             'vehicle', a.plate || coalesce(' · ' || nullif(concat_ws(' ', a.make, a.model), ''), '')
           ) order by a.days_left, a.plate) as items
    from addressed a
    group by a.user_id
    having bool_or(a.is_due)
  loop
    -- Logged once per entry and date, whoever receives it and whether or
    -- not a channel is on: the reminder for this day has been given.
    insert into public.memento_reminder_log (entry_id, valid_until, milestone, sent_on)
    select (x ->> 'entry_id')::uuid, (x ->> 'valid_until')::date, m::integer, v_today
    from jsonb_array_elements(v_recipient.items) x
    cross join lateral jsonb_array_elements_text(x -> 'milestones') m
    on conflict do nothing;

    select * into v_profile from public.profiles where id = v_recipient.user_id;
    v_count := jsonb_array_length(v_recipient.items);
    v_first := v_recipient.items -> 0;
    select string_agg(x ->> 'entry_id', ',') into v_ids from jsonb_array_elements(v_recipient.items) x;

    if v_profile.email is not null
       and v_profile.email_undeliverable_at is null
       and public.notification_channel_enabled(v_recipient.user_id, 'memento_expiry', 'email') then
      insert into public.memento_unsubscribe_tokens (user_id) values (v_recipient.user_id)
      on conflict (user_id) do nothing;
      select token into v_token from public.memento_unsubscribe_tokens where user_id = v_recipient.user_id;

      if v_count = 1 then
        insert into public.notification_outbox
          (channel, template, recipient_user_id, to_email, payload, dedupe_key, send_after)
        values (
          'email', 'memento_expiry_reminder', v_recipient.user_id, v_profile.email,
          jsonb_build_object(
            'document_label', v_first ->> 'label',
            'vehicle', v_first ->> 'vehicle',
            'valid_until', to_char((v_first ->> 'valid_until')::date, 'DD.MM.YYYY'),
            'when', public.memento_when((v_first ->> 'days_left')::integer),
            'entry_ids', v_ids,
            'unsubscribe_path', '/memento-expirari/dezabonare?t=' || v_token
          ),
          'memento:' || v_recipient.user_id || ':' || v_today,
          public.push_send_after(v_recipient.user_id, 'memento_expiry', p_now)
        )
        on conflict (dedupe_key) where dedupe_key is not null do nothing;
      else
        select string_agg(
                 '· ' || (x ->> 'label') || ' · ' || (x ->> 'vehicle') || ' · '
                 || to_char((x ->> 'valid_until')::date, 'DD.MM.YYYY') || ' · '
                 || public.memento_when((x ->> 'days_left')::integer),
                 E'\n' order by (x ->> 'days_left')::integer)
          into v_items_text
        from jsonb_array_elements(v_recipient.items) x;

        insert into public.notification_outbox
          (channel, template, recipient_user_id, to_email, payload, dedupe_key, send_after)
        values (
          'email', 'memento_expiry_digest', v_recipient.user_id, v_profile.email,
          jsonb_build_object(
            'count_text', public.memento_count_text(v_count),
            'items', v_items_text,
            'entry_ids', v_ids,
            'unsubscribe_path', '/memento-expirari/dezabonare?t=' || v_token
          ),
          'memento:' || v_recipient.user_id || ':' || v_today,
          public.push_send_after(v_recipient.user_id, 'memento_expiry', p_now)
        )
        on conflict (dedupe_key) where dedupe_key is not null do nothing;
      end if;
      if found then
        v_email_rows := v_email_rows + 1;
      end if;
    end if;

    -- Push decides for itself: preference, a device, quiet hours, the cap.
    perform public.queue_push(
      v_recipient.user_id,
      'memento_expiry',
      case when v_count = 1
           then 'Memento: ' || (v_first ->> 'label') || ' ' || public.memento_when((v_first ->> 'days_left')::integer)
           else 'Memento: ' || public.memento_count_text(v_count) || ' expiră curând' end,
      case when v_count = 1
           then (v_first ->> 'vehicle') || ' · valabil până la '
                || to_char((v_first ->> 'valid_until')::date, 'DD.MM.YYYY')
           else 'Deschide lista și apasă „Am reînnoit" pe cele rezolvate.' end,
      jsonb_build_object('url', '/cont/memento?reinnoieste=' || v_ids),
      'memento:' || v_recipient.user_id || ':' || v_today,
      p_now
    );
  end loop;

  perform public.memento_purge(p_now);
  return v_email_rows;
end;
$fn$;

comment on function public.memento_queue_reminders(timestamptz) is
  'Nightly, from queue_expiry_reminders(): one grouped e-mail and one push per person with memento reminders due today. Logs what it gave; never touches documents or vehicles.';

/**
 * Retention: an entry whose date passed and was never renewed stays
 * visible as „expirat" for history_days, then goes; a replaced date stays
 * in the history as long. The rate-limit counters keep two days.
 */
create or replace function public.memento_purge(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_days integer;
  v_today date := public.memento_today(p_now);
  v_entries integer;
  v_history integer;
begin
  select history_days into v_days from public.memento_settings where id;
  v_days := coalesce(v_days, 365);

  delete from public.memento_entries
  where valid_until is not null and valid_until < v_today - v_days;
  get diagnostics v_entries = row_count;

  delete from public.memento_history where renewed_at < p_now - make_interval(days => v_days);
  get diagnostics v_history = row_count;

  delete from public.memento_reminder_log where valid_until < v_today - v_days;
  delete from public.memento_events where at < p_now - interval '2 days';

  return v_entries + v_history;
end;
$fn$;

-- ---------------------------------------------------------------------
-- 10. The job that already runs every night
--
-- The body is the one from 20260916120600, unchanged line for line, with
-- the memento appended in its own block: whatever happens there, the
-- verified documents' reminders above it are already queued, and a
-- failure is written to the job log instead of rolling them back.
-- ---------------------------------------------------------------------
create or replace function public.queue_expiry_reminders()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_queued integer;
  v_memento integer;
begin
  with due as (
    select
      d.id as document_id,
      d.company_id,
      d.kind,
      d.valid_until,
      (d.valid_until - current_date) as days_left,
      r.label_ro,
      v.plate_number,
      c.contact_email,
      c.contact_phone,
      c.legal_name
    from public.documents d
    join public.document_requirements r on r.scope = d.scope and r.kind = d.kind
    join public.companies c on c.id = d.company_id
    left join public.vehicles v on v.id = d.vehicle_id
    where d.status = 'approved'
      and d.valid_until is not null
      and (d.valid_until - current_date) = any (r.reminder_days)
  )
  insert into public.notification_outbox
    (channel, template, recipient_company_id, to_email, to_phone, payload, dedupe_key)
  select
    'email',
    'document_expiry_reminder',
    due.company_id,
    due.contact_email,
    due.contact_phone,
    jsonb_build_object(
      'company_name', due.legal_name,
      'document_kind', due.kind,
      'document_label', due.label_ro,
      'plate_number', due.plate_number,
      'valid_until', due.valid_until,
      'days_left', due.days_left
    ),
    'expiry:' || due.document_id || ':' || due.days_left
  from due
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  get diagnostics v_queued = row_count;

  -- NOU (20261016100000): the memento, after, and apart. A failure there
  -- is logged under this job's own name, so job_health() shows it to
  -- staff, and the verified reminders queued above stay queued.
  begin
    v_memento := public.memento_queue_reminders(now());
  exception when others then
    perform public.log_job_run('nightly-expiry-reminders', v_queued, 1,
      jsonb_build_object('documents_queued', v_queued, 'memento_error', sqlerrm));
    v_memento := 0;
  end;

  return v_queued + v_memento;
end;
$fn$;

-- ---------------------------------------------------------------------
-- 11. The notification type
-- ---------------------------------------------------------------------
insert into public.notification_types
  (code, label_ro, description_ro, audience, default_inapp, default_email, default_push,
   is_mandatory, bypasses_quiet_hours, deep_link, is_available, sort_order)
values
  ('memento_expiry', 'Memento expirări auto',
   'Mementourile pe care le-ai pus pentru mașinile tale: RCA, ITP, rovinietă și celelalte.',
   'both', true, true, true, false, false, '/cont/memento', true, 45)
on conflict (code) do update set
  label_ro = excluded.label_ro,
  description_ro = excluded.description_ro,
  audience = excluded.audience,
  deep_link = excluded.deep_link,
  is_available = excluded.is_available;

-- ---------------------------------------------------------------------
-- 12. A firm erased takes its memento with it
--
-- anonymise_company() leaves the firm's row as a shell, so the foreign
-- key never cascades. A trigger on the moment it is anonymised catches
-- every road to it, rather than one more reproduction of that function.
-- A person's memento goes with their profile, by the foreign keys.
-- ---------------------------------------------------------------------
create or replace function public.memento_forget_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  delete from public.memento_vehicles where owner_company_id = new.id;
  delete from public.memento_schedules where owner_company_id = new.id;
  return new;
end;
$fn$;

create trigger companies_forget_memento
  after update of anonymised_at on public.companies
  for each row
  when (old.anonymised_at is null and new.anonymised_at is not null)
  execute function public.memento_forget_company();

-- The photos, for the deletion job. The body is the one from
-- 20260918180000 with the memento bucket added at the end.
create or replace function public.account_deletion_files(p_id uuid)
returns table (bucket text, path text)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_row public.account_deletion_requests;
  v_companies uuid[];
begin
  select * into v_row from public.account_deletion_requests where id = p_id;
  if v_row.id is null then
    return;
  end if;

  if v_row.kind = 'company' then
    v_companies := array[v_row.company_id];
  else
    select coalesce(array_agg(c.company_id), '{}')
      into v_companies
    from public.companies_erased_with_user(v_row.user_id) c;
  end if;

  return query
    select 'documents'::text, d.file_path
    from public.documents d
    where d.company_id = any (v_companies) and d.file_path is not null;

  if v_row.kind = 'user' then
    return query
      select 'listing-photos'::text, o.name
      from storage.objects o
      where o.bucket_id = 'listing-photos'
        and (storage.foldername(o.name))[1] = v_row.user_id::text;
  end if;

  return query
    select 'listing-photos'::text, unnest(l.photo_paths)
    from public.cargo_listings l
    where l.company_id = any (v_companies);

  return query
    select 'exports'::text, o.name
    from storage.objects o
    where o.bucket_id = 'exports'
      and v_row.kind = 'user'
      and (storage.foldername(o.name))[1] = v_row.user_id::text;

  -- NOU: the memento photos, the person's own folder and every erased firm's.
  return query
    select 'memento'::text, o.name
    from storage.objects o
    where o.bucket_id = 'memento'
      and ((v_row.kind = 'user' and (storage.foldername(o.name))[1] = v_row.user_id::text)
           or public.safe_uuid((storage.foldername(o.name))[1]) = any (v_companies));
end;
$fn$;

-- ---------------------------------------------------------------------
-- 13. The data export includes the memento
--
-- The body is the one from 20261007100000 with three keys added at the
-- end: the person's own vehicles, their dates and the dates they renewed,
-- and the firm vehicles they are responsible for.
-- ---------------------------------------------------------------------
create or replace function public.my_data_export()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_uid uuid := auth.uid();
  v_companies uuid[];
begin
  if v_uid is null then
    raise exception 'Intră în cont ca să îți ceri datele' using errcode = '42501';
  end if;

  select coalesce(array_agg(company_id), '{}') into v_companies
  from public.company_members where user_id = v_uid;

  return jsonb_build_object(
    'generat_la', to_char(now() at time zone 'Europe/Bucharest', 'YYYY-MM-DD"T"HH24:MI:SS'),
    'profil', (select to_jsonb(p) - 'id' from public.profiles p where p.id = v_uid),
    'firme', (select coalesce(jsonb_agg(jsonb_build_object(
        'denumire', c.legal_name, 'cui', c.cui, 'rol', m.role,
        'membru_din', m.created_at, 'tip', c.company_type,
        'stare_verificare', c.verification_status)), '[]'::jsonb)
      from public.company_members m join public.companies c on c.id = m.company_id
      where m.user_id = v_uid),
    'cereri', (select coalesce(jsonb_agg(to_jsonb(l) - 'id' - 'company_id' - 'posted_by'), '[]'::jsonb)
      from public.cargo_listings l where l.posted_by = v_uid),
    'trasee', (select coalesce(jsonb_agg(to_jsonb(t) - 'id' - 'company_id' - 'posted_by'), '[]'::jsonb)
      from public.truck_listings t where t.posted_by = v_uid),
    'oferte', (select coalesce(jsonb_agg(to_jsonb(o) - 'id' - 'from_user_id'), '[]'::jsonb)
      from public.offers o where o.from_user_id = v_uid),
    'transporturi', (select coalesce(jsonb_agg(jsonb_build_object(
        'data', t.created_at, 'stare', t.status, 'pret', t.agreed_price,
        'moneda', t.currency, 'livrat_la', t.delivered_at)), '[]'::jsonb)
      from public.transports t
      where t.shipper_user_id = v_uid or t.shipper_company_id = any (v_companies)),
    'mesaje', (select coalesce(jsonb_agg(jsonb_build_object(
        'trimis_la', m.created_at, 'text', m.body)), '[]'::jsonb)
      from public.messages m where m.sender_user_id = v_uid),
    'evaluari_date', (select coalesce(jsonb_agg(jsonb_build_object(
        'data', r.created_at, 'scor', r.score)), '[]'::jsonb)
      from public.ratings r where r.rater_user_id = v_uid),
    'documente', (select coalesce(jsonb_agg(jsonb_build_object(
        'firma', c.legal_name, 'tip', d.kind, 'stare', d.status,
        'valabil_pana', d.valid_until, 'incarcat_la', d.created_at)), '[]'::jsonb)
      from public.documents d join public.companies c on c.id = d.company_id
      where d.uploaded_by = v_uid),
    'preferinte_notificari', (select coalesce(jsonb_agg(to_jsonb(n) - 'user_id'), '[]'::jsonb)
      from public.notification_preferences n where n.user_id = v_uid),
    'notificari_trimise', (select coalesce(jsonb_agg(jsonb_build_object(
        'canal', o.channel, 'sablon', o.template, 'stare', o.status,
        'trimis_la', o.sent_at)), '[]'::jsonb)
      from public.notification_outbox o where o.recipient_user_id = v_uid),
    'contacte_deblocate', (select coalesce(jsonb_agg(jsonb_build_object(
        'data', cr.created_at)), '[]'::jsonb)
      from public.contact_reveals cr where cr.user_id = v_uid),
    'invitatii', (select coalesce(jsonb_agg(jsonb_build_object(
        'firma', c.legal_name, 'rol', i.role, 'data', i.created_at,
        'stare', i.status)), '[]'::jsonb)
      from public.company_invitations i join public.companies c on c.id = i.company_id
      where i.invited_by = v_uid or i.accepted_by = v_uid
         or i.invited_email = lower((select email from public.profiles where id = v_uid))),
    'ciorne', (select coalesce(jsonb_agg(jsonb_build_object(
        'formular', d.form_key, 'pas', d.step, 'continut', d.payload,
        'salvata_la', d.updated_at) order by d.updated_at desc), '[]'::jsonb)
      from public.form_drafts d where d.user_id = v_uid),
    -- NOU: memento.
    'memento_vehicule', (select coalesce(jsonb_agg(jsonb_build_object(
        'numar', v.plate, 'marca', v.make, 'model', v.model, 'tip', v.vehicle_kind,
        'al_firmei', v.owner_company_id is not null, 'adaugat_la', v.created_at)
        order by v.plate), '[]'::jsonb)
      from public.memento_vehicles v
      where v.owner_user_id = v_uid or v.responsible_user_id = v_uid),
    'memento_documente', (select coalesce(jsonb_agg(jsonb_build_object(
        'numar', v.plate, 'document', public.memento_kind_label(e.kind, e.custom_name),
        'valabil_pana', e.valid_until, 'km', e.due_km, 'serie', e.reference,
        'nota', e.note, 'actualizat_la', e.updated_at)
        order by v.plate, e.kind), '[]'::jsonb)
      from public.memento_entries e join public.memento_vehicles v on v.id = e.vehicle_id
      where v.owner_user_id = v_uid or v.responsible_user_id = v_uid),
    'memento_istoric', (select coalesce(jsonb_agg(jsonb_build_object(
        'numar', v.plate, 'document', public.memento_kind_label(e.kind, e.custom_name),
        'valabil_pana', h.valid_until, 'km', h.due_km, 'serie', h.reference,
        'reinnoit_la', h.renewed_at)
        order by v.plate, h.renewed_at), '[]'::jsonb)
      from public.memento_history h
      join public.memento_entries e on e.id = h.entry_id
      join public.memento_vehicles v on v.id = e.vehicle_id
      where v.owner_user_id = v_uid or v.responsible_user_id = v_uid)
  );
end;
$fn$;

-- ---------------------------------------------------------------------
-- 14. The memento form keeps a draft on the account
-- ---------------------------------------------------------------------
alter table public.form_drafts drop constraint form_drafts_form_key;
alter table public.form_drafts add constraint form_drafts_form_key check (
  form_key in ('cerere', 'traseu', 'oferta', 'vehicul', 'firma', 'inscriere-asistata', 'memento')
);

-- ---------------------------------------------------------------------
-- 15. Grants
--
-- Default privileges grant EXECUTE to nobody (20260916130300); each
-- function here is granted to exactly the roles that call it.
-- ---------------------------------------------------------------------
revoke all on function public.memento_today(timestamptz) from public, anon, authenticated;
revoke all on function public.memento_plate(text) from public, anon, authenticated;
revoke all on function public.memento_kind_label(text, text) from public, anon, authenticated;
revoke all on function public.memento_when(integer) from public, anon, authenticated;
revoke all on function public.memento_count_text(integer) from public, anon, authenticated;
revoke all on function public.memento_may_manage(uuid) from public, anon, authenticated;
revoke all on function public.memento_may_renew(uuid) from public, anon, authenticated;
revoke all on function public.memento_days_for(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.memento_note_event(text, integer, interval) from public, anon, authenticated;
revoke all on function public.memento_folder(uuid) from public, anon, authenticated;
revoke all on function public.memento_check_date(date, text) from public, anon, authenticated;
revoke all on function public.memento_save_vehicle(uuid, uuid, text, text, text, text) from public, anon;
revoke all on function public.memento_delete_vehicle(uuid) from public, anon;
revoke all on function public.memento_set_responsible(uuid, uuid) from public, anon;
revoke all on function public.memento_save_entry(uuid, text, date, text, integer, text, text, text, uuid) from public, anon;
revoke all on function public.memento_renew(uuid, date, integer, text, text) from public, anon;
revoke all on function public.memento_delete_entry(uuid) from public, anon;
revoke all on function public.memento_import(uuid, jsonb) from public, anon;
revoke all on function public.memento_set_schedule(uuid, text, integer[]) from public, anon;
revoke all on function public.memento_claim_ai_read() from public, anon;
revoke all on function public.memento_unsubscribe(uuid) from public;
revoke all on function public.memento_set_settings(integer, integer, integer, integer, integer, integer, integer, integer[]) from public, anon;
revoke all on function public.memento_queue_reminders(timestamptz) from public, anon, authenticated;
revoke all on function public.memento_purge(timestamptz) from public, anon, authenticated;
revoke all on function public.memento_forget_company() from public, anon, authenticated;
revoke all on function public.account_deletion_files(uuid) from public, anon, authenticated;
revoke all on function public.my_data_export() from public, anon;
revoke all on function public.queue_expiry_reminders() from public, anon, authenticated;

-- The screens.
grant execute on function public.memento_save_vehicle(uuid, uuid, text, text, text, text) to authenticated;
grant execute on function public.memento_delete_vehicle(uuid) to authenticated;
grant execute on function public.memento_set_responsible(uuid, uuid) to authenticated;
grant execute on function public.memento_save_entry(uuid, text, date, text, integer, text, text, text, uuid) to authenticated;
grant execute on function public.memento_renew(uuid, date, integer, text, text) to authenticated;
grant execute on function public.memento_delete_entry(uuid) to authenticated;
grant execute on function public.memento_import(uuid, jsonb) to authenticated;
grant execute on function public.memento_set_schedule(uuid, text, integer[]) to authenticated;
grant execute on function public.memento_claim_ai_read() to authenticated;
grant execute on function public.memento_set_settings(integer, integer, integer, integer, integer, integer, integer, integer[]) to authenticated;
grant execute on function public.my_data_export() to authenticated;
-- The link in the e-mail, opened without an account.
grant execute on function public.memento_unsubscribe(uuid) to anon, authenticated;
-- The jobs.
grant execute on function public.memento_queue_reminders(timestamptz) to service_role;
grant execute on function public.memento_purge(timestamptz) to service_role;
grant execute on function public.account_deletion_files(uuid) to service_role;
grant execute on function public.queue_expiry_reminders() to service_role;
