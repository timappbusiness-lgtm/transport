-- =====================================================================
-- 0004 - The three boards
--   * cargo_listings  - "curse" posted by freight forwarders / shippers,
--                       and return-trip requests posted by individuals
--   * truck_listings  - "masini pe tur" and "masini pe retur"
--   * listing_contacts- phone/e-mail, deliberately split out of the
--                       listing so RLS can gate them independently
-- =====================================================================

create type listing_board as enum ('curse', 'retur');
create type truck_direction as enum ('tur', 'retur');

create type listing_status as enum (
  'draft',
  'active',
  'assigned',   -- an offer was accepted
  'completed',
  'cancelled',
  'expired',
  'suspended'   -- owner lost compliance; set by run_compliance_sweep()
);

create type price_type as enum ('fixed', 'negotiable', 'auction');
create type currency_code as enum ('RON', 'EUR');

-- Distance in km between two WGS84 points. Plain SQL haversine keeps the
-- schema portable; switch to PostGIS if routing/polygons are ever needed.
create or replace function public.distance_km(
  lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric
)
returns numeric
language sql
immutable
parallel safe
as $fn$
  select case
    when lat1 is null or lng1 is null or lat2 is null or lng2 is null then null
    else round((
      6371 * acos(
        least(1, greatest(-1,
          cos(radians(lat1)) * cos(radians(lat2)) * cos(radians(lng2) - radians(lng1))
          + sin(radians(lat1)) * sin(radians(lat2))
        ))
      )
    )::numeric, 1)
  end;
$fn$;

-- ---------------------------------------------------------------------
-- cargo_listings
-- ---------------------------------------------------------------------
create table public.cargo_listings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- NULL company_id == posted by an individual (fast account).
  company_id uuid references public.companies (id) on delete cascade,
  posted_by uuid not null references public.profiles (id) on delete cascade,
  board listing_board not null default 'curse',

  title text not null,
  description text,
  cargo_type text,

  weight_kg integer check (weight_kg > 0),
  volume_m3 numeric(6,2),
  ldm numeric(4,2),                 -- loading metres
  pallets integer,
  length_m numeric(5,2),
  width_m numeric(5,2),
  height_m numeric(5,2),

  loading_country text not null default 'RO',
  loading_county text,
  loading_city text not null,
  loading_postcode text,
  loading_lat numeric(9,6),
  loading_lng numeric(9,6),
  loading_from date not null,
  loading_to date,

  unloading_country text not null default 'RO',
  unloading_county text,
  unloading_city text not null,
  unloading_postcode text,
  unloading_lat numeric(9,6),
  unloading_lng numeric(9,6),
  unloading_from date,
  unloading_to date,

  required_vehicle_types vehicle_type[],
  needs_adr boolean not null default false,
  needs_frigo boolean not null default false,
  needs_tail_lift boolean not null default false,
  temp_min_c numeric(4,1),
  temp_max_c numeric(4,1),

  price_type price_type not null default 'negotiable',
  price_amount numeric(10,2) check (price_amount is null or price_amount >= 0),
  currency currency_code not null default 'RON',
  payment_term_days integer check (payment_term_days is null or payment_term_days >= 0),

  status listing_status not null default 'draft',
  published_at timestamptz,
  expires_at timestamptz,
  views_count integer not null default 0,
  offers_count integer not null default 0,
  is_promoted boolean not null default false,
  promoted_until timestamptz,

  constraint cargo_listings_owner_ck check (
    (company_id is not null and board = 'curse')
    or (company_id is null and board = 'retur')
  ),
  constraint cargo_listings_dates_ck check (loading_to is null or loading_to >= loading_from)
);

comment on table public.cargo_listings is
  'Freight on offer. board = curse -> posted by a company; board = retur -> posted by an individual looking for a returning truck.';
comment on constraint cargo_listings_owner_ck on public.cargo_listings is
  'Individuals (no company) may only post on the return board. Companies post on the main board.';

create index cargo_listings_board_status_idx on public.cargo_listings (board, status, loading_from);
create index cargo_listings_company_idx on public.cargo_listings (company_id);
create index cargo_listings_route_idx on public.cargo_listings (loading_county, unloading_county) where status = 'active';
create index cargo_listings_geo_idx on public.cargo_listings (loading_lat, loading_lng) where status = 'active';
create index cargo_listings_promoted_idx on public.cargo_listings (is_promoted, published_at desc) where status = 'active';

create trigger cargo_listings_set_updated_at
  before update on public.cargo_listings
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- truck_listings
-- ---------------------------------------------------------------------
create table public.truck_listings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  company_id uuid not null references public.companies (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  posted_by uuid not null references public.profiles (id) on delete cascade,
  direction truck_direction not null,

  from_country text not null default 'RO',
  from_county text,
  from_city text not null,
  from_lat numeric(9,6),
  from_lng numeric(9,6),

  to_country text not null default 'RO',
  to_county text,
  to_city text not null,
  to_lat numeric(9,6),
  to_lng numeric(9,6),

  -- Cities the truck can deviate through; the main matching lever on returns.
  waypoints jsonb not null default '[]'::jsonb,
  max_detour_km integer not null default 50 check (max_detour_km >= 0),

  available_from date not null,
  available_to date,

  free_capacity_kg integer check (free_capacity_kg > 0),
  free_ldm numeric(4,2),
  free_volume_m3 numeric(6,2),
  accepts_partial_loads boolean not null default true,

  price_indicative numeric(10,2),
  currency currency_code not null default 'RON',

  notes text,
  status listing_status not null default 'draft',
  published_at timestamptz,
  expires_at timestamptz,
  views_count integer not null default 0,
  offers_count integer not null default 0,
  is_promoted boolean not null default false,
  promoted_until timestamptz,

  constraint truck_listings_dates_ck check (available_to is null or available_to >= available_from)
);

comment on table public.truck_listings is
  'Trucks with free capacity. direction = tur (outbound leg) or retur (empty return leg).';

create index truck_listings_direction_status_idx on public.truck_listings (direction, status, available_from);
create index truck_listings_company_idx on public.truck_listings (company_id);
create index truck_listings_route_idx on public.truck_listings (from_county, to_county) where status = 'active';
create index truck_listings_geo_idx on public.truck_listings (from_lat, from_lng) where status = 'active';

create trigger truck_listings_set_updated_at
  before update on public.truck_listings
  for each row execute function public.set_updated_at();

-- A truck may only go on the board if both the company and the vehicle are clean.
create or replace function public.guard_truck_listing_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_vehicle_ok boolean;
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    if not public.company_can_act(new.company_id) then
      raise exception 'Compania nu poate publica anunțuri: cont neverificat sau suspendat'
        using errcode = '42501';
    end if;
    select v.is_compliant into v_vehicle_ok from public.vehicles v where v.id = new.vehicle_id;
    if not coalesce(v_vehicle_ok, false) then
      raise exception 'Vehiculul nu are documentele valide (ITP / RCA / copie conformă)'
        using errcode = '42501';
    end if;
    new.published_at := coalesce(new.published_at, now());
    new.expires_at := coalesce(new.expires_at, now() + interval '14 days');
  end if;
  return new;
end;
$fn$;

create trigger truck_listings_guard_publish
  before insert or update on public.truck_listings
  for each row execute function public.guard_truck_listing_publish();

create or replace function public.guard_cargo_listing_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    -- Individuals on the return board are not asked for company documents,
    -- but they must have a verified phone number.
    if new.company_id is null then
      if not exists (
        select 1 from public.profiles p
        where p.id = new.posted_by and p.phone_verified
      ) then
        raise exception 'Numărul de telefon trebuie confirmat înainte de publicare'
          using errcode = '42501';
      end if;
    elsif not public.company_can_act(new.company_id) then
      raise exception 'Compania nu poate publica anunțuri: cont neverificat sau suspendat'
        using errcode = '42501';
    end if;
    new.published_at := coalesce(new.published_at, now());
    new.expires_at := coalesce(new.expires_at, now() + interval '14 days');
  end if;
  return new;
end;
$fn$;

create trigger cargo_listings_guard_publish
  before insert or update on public.cargo_listings
  for each row execute function public.guard_cargo_listing_publish();

-- ---------------------------------------------------------------------
-- listing_contacts - the paywalled part of a listing
-- ---------------------------------------------------------------------
create table public.listing_contacts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cargo_listing_id uuid references public.cargo_listings (id) on delete cascade,
  truck_listing_id uuid references public.truck_listings (id) on delete cascade,
  contact_name text,
  contact_phone text not null,
  contact_email text,
  constraint listing_contacts_one_parent_ck check (
    (cargo_listing_id is not null)::int + (truck_listing_id is not null)::int = 1
  ),
  constraint listing_contacts_cargo_unique unique (cargo_listing_id),
  constraint listing_contacts_truck_unique unique (truck_listing_id)
);

comment on table public.listing_contacts is
  'Contact data lives here, never on the listing row. Readable only by the owner, by platform admins, or through reveal_contact() (migration 0006).';

create trigger listing_contacts_set_updated_at
  before update on public.listing_contacts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- saved_searches - powers the alerts sent by n8n
-- ---------------------------------------------------------------------
create table public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  name text not null,
  target text not null check (target in ('cargo', 'truck')),
  filters jsonb not null default '{}'::jsonb,
  notify_email boolean not null default true,
  notify_whatsapp boolean not null default false,
  notify_push boolean not null default false,
  is_active boolean not null default true,
  last_notified_at timestamptz
);

create index saved_searches_user_idx on public.saved_searches (user_id) where is_active;

create trigger saved_searches_set_updated_at
  before update on public.saved_searches
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.cargo_listings enable row level security;
alter table public.truck_listings enable row level security;
alter table public.listing_contacts enable row level security;
alter table public.saved_searches enable row level security;

-- Any signed-in user browses active listings. Contact data is elsewhere.
create policy "cargo_listings_select_active_or_own" on public.cargo_listings
  for select to authenticated
  using (
    status = 'active'
    or posted_by = auth.uid()
    or (company_id is not null and public.is_company_member(company_id))
    or public.is_platform_admin()
  );

create policy "cargo_listings_insert_own" on public.cargo_listings
  for insert to authenticated
  with check (
    posted_by = auth.uid()
    and (
      (company_id is null and board = 'retur')
      or public.is_company_member(company_id)
    )
  );

create policy "cargo_listings_update_own" on public.cargo_listings
  for update to authenticated
  using (
    posted_by = auth.uid()
    or (company_id is not null and public.is_company_member(company_id))
    or public.is_platform_admin()
  )
  with check (
    posted_by = auth.uid()
    or (company_id is not null and public.is_company_member(company_id))
    or public.is_platform_admin()
  );

create policy "cargo_listings_delete_own" on public.cargo_listings
  for delete to authenticated
  using (
    posted_by = auth.uid()
    or (company_id is not null and public.is_company_manager(company_id))
    or public.is_platform_admin()
  );

create policy "truck_listings_select_active_or_own" on public.truck_listings
  for select to authenticated
  using (status = 'active' or public.is_company_member(company_id) or public.is_platform_admin());

create policy "truck_listings_insert_own" on public.truck_listings
  for insert to authenticated
  with check (public.is_company_member(company_id) and posted_by = auth.uid());

create policy "truck_listings_update_own" on public.truck_listings
  for update to authenticated
  using (public.is_company_member(company_id) or public.is_platform_admin())
  with check (public.is_company_member(company_id) or public.is_platform_admin());

create policy "truck_listings_delete_own" on public.truck_listings
  for delete to authenticated
  using (public.is_company_manager(company_id) or public.is_platform_admin());

-- Contacts: owner and admin only. Everyone else goes through reveal_contact().
create policy "listing_contacts_select_owner_or_admin" on public.listing_contacts
  for select to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.cargo_listings l
      where l.id = cargo_listing_id
        and (l.posted_by = auth.uid()
             or (l.company_id is not null and public.is_company_member(l.company_id)))
    )
    or exists (
      select 1 from public.truck_listings l
      where l.id = truck_listing_id and public.is_company_member(l.company_id)
    )
  );

create policy "listing_contacts_insert_owner" on public.listing_contacts
  for insert to authenticated
  with check (
    exists (
      select 1 from public.cargo_listings l
      where l.id = cargo_listing_id
        and (l.posted_by = auth.uid()
             or (l.company_id is not null and public.is_company_member(l.company_id)))
    )
    or exists (
      select 1 from public.truck_listings l
      where l.id = truck_listing_id and public.is_company_member(l.company_id)
    )
  );

create policy "listing_contacts_update_owner" on public.listing_contacts
  for update to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.cargo_listings l
      where l.id = cargo_listing_id and l.posted_by = auth.uid()
    )
    or exists (
      select 1 from public.truck_listings l
      where l.id = truck_listing_id and public.is_company_member(l.company_id)
    )
  )
  with check (true);

create policy "listing_contacts_delete_owner" on public.listing_contacts
  for delete to authenticated
  using (
    public.is_platform_admin()
    or exists (
      select 1 from public.cargo_listings l
      where l.id = cargo_listing_id and l.posted_by = auth.uid()
    )
    or exists (
      select 1 from public.truck_listings l
      where l.id = truck_listing_id and public.is_company_manager(l.company_id)
    )
  );

create policy "saved_searches_select_own" on public.saved_searches
  for select to authenticated using (user_id = auth.uid() or public.is_platform_admin());
create policy "saved_searches_insert_own" on public.saved_searches
  for insert to authenticated with check (user_id = auth.uid());
create policy "saved_searches_update_own" on public.saved_searches
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "saved_searches_delete_own" on public.saved_searches
  for delete to authenticated using (user_id = auth.uid() or public.is_platform_admin());
