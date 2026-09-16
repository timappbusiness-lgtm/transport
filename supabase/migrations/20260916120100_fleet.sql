-- =====================================================================
-- 0002 - Fleet: vehicles and drivers
-- =====================================================================

-- Body/type taxonomy used both by the fleet and by listing filters.
create type vehicle_type as enum (
  'prelata',            -- tautliner / curtainsider
  'duba',               -- box van
  'frigorific',         -- reefer
  'platforma',          -- flatbed
  'platforma_tractari', -- tow truck / car transporter platform
  'autoutilitara_3_5t', -- light commercial up to 3.5t
  'basculanta',
  'cisterna',
  'container',
  'agabaritic',         -- oversized / special transport
  'autospeciala'
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null references public.companies (id) on delete cascade,

  plate_number text not null,
  vin text,
  make text,
  model text,
  year integer check (year between 1950 and 2100),

  vehicle_type vehicle_type not null,
  max_weight_kg integer check (max_weight_kg > 0),
  length_m numeric(5,2),
  width_m numeric(5,2),
  height_m numeric(5,2),
  volume_m3 numeric(6,2),
  pallet_capacity integer,

  has_adr boolean not null default false,
  has_tail_lift boolean not null default false,
  has_gps boolean not null default false,
  has_frigo boolean not null default false,

  is_active boolean not null default true,
  -- Maintained by compliance-sweep: false when ITP/RCA/copie conforma expired.
  is_compliant boolean not null default false,
  compliance_checked_at timestamptz,

  constraint vehicles_plate_unique unique (company_id, plate_number)
);

comment on column public.vehicles.is_compliant is
  'Derived flag. A vehicle is compliant when every blocking vehicle document (ITP, RCA, copie conforma...) is approved and still valid.';

create index vehicles_company_idx on public.vehicles (company_id);
create index vehicles_type_idx on public.vehicles (vehicle_type);
create index vehicles_plate_idx on public.vehicles (plate_number);

create trigger vehicles_set_updated_at
  before update on public.vehicles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- drivers - a driver may or may not have a platform login
-- ---------------------------------------------------------------------
create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null references public.companies (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,

  full_name text not null,
  phone text,
  default_vehicle_id uuid references public.vehicles (id) on delete set null,
  is_active boolean not null default true,
  is_compliant boolean not null default false,
  compliance_checked_at timestamptz
);

create index drivers_company_idx on public.drivers (company_id);

create trigger drivers_set_updated_at
  before update on public.drivers
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.vehicles enable row level security;
alter table public.drivers enable row level security;

create policy "vehicles_select_own_or_admin" on public.vehicles
  for select to authenticated
  using (public.is_company_member(company_id) or public.is_platform_admin());

create policy "vehicles_insert_own" on public.vehicles
  for insert to authenticated
  with check (public.is_company_member(company_id));

create policy "vehicles_update_own" on public.vehicles
  for update to authenticated
  using (public.is_company_member(company_id) or public.is_platform_admin())
  with check (public.is_company_member(company_id) or public.is_platform_admin());

create policy "vehicles_delete_manager" on public.vehicles
  for delete to authenticated
  using (public.is_company_manager(company_id) or public.is_platform_admin());

create policy "drivers_select_own_or_admin" on public.drivers
  for select to authenticated
  using (
    public.is_company_member(company_id)
    or profile_id = auth.uid()
    or public.is_platform_admin()
  );

create policy "drivers_insert_own" on public.drivers
  for insert to authenticated
  with check (public.is_company_member(company_id));

create policy "drivers_update_own" on public.drivers
  for update to authenticated
  using (public.is_company_member(company_id) or public.is_platform_admin())
  with check (public.is_company_member(company_id) or public.is_platform_admin());

create policy "drivers_delete_manager" on public.drivers
  for delete to authenticated
  using (public.is_company_manager(company_id) or public.is_platform_admin());
