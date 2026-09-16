-- =====================================================================
-- 0009 - Vehicle transport: the cargo IS a vehicle
--
-- The exchange launches on vehicle relocation (the market the reference
-- competitor owns: 83% cars, plus recovery of vehicles that do not roll)
-- while keeping palletized freight addable later. Both share one listing
-- row - route, dates, price, status, contacts - and differ only in a
-- details table, so a filter or a card never has to know which it is.
--
--   cargo_listings  ──1:1──> cargo_vehicle_details   (listing_kind = 'vehicul')
--                   └─1:1──> cargo_freight_details   (listing_kind = 'marfa')
--
-- See docs/07-competitor-analysis.md for why this shape, and §9 there for
-- the field-by-field reasoning.
-- =====================================================================

create type listing_kind as enum ('vehicul', 'marfa');

-- The competitor's own thirteen categories, in their order of volume.
create type cargo_category as enum (
  'autoturism',
  'autoutilitara',
  'motocicleta',
  'utilaj_agricol',
  'microbuz',
  'utilaj_constructii',
  'rulota',
  'cap_tractor',
  'camion',
  'remorca',
  'utilaj_manipulare',
  'container',
  'ambarcatiune',
  'altele'
);

-- How the job is run. This is the pricing model, not a tag:
--   pe_sens  - the platform waits until it fills. Cheapest, slowest.
--   expres   - dedicated departure. Fastest, dearest.
--   tractare - recovery of a vehicle that cannot roll.
create type service_type as enum ('pe_sens', 'expres', 'tractare');

-- ---------------------------------------------------------------------
-- cargo_listings: what is shared by both kinds
-- ---------------------------------------------------------------------
alter table public.cargo_listings
  add column listing_kind listing_kind not null default 'vehicul',
  add column service_type service_type not null default 'pe_sens',
  add column photo_paths text[] not null default '{}';

comment on column public.cargo_listings.photo_paths is
  'Paths in the listing-photos bucket. Photos are how a carrier prices a damaged vehicle without a site visit, and they are the evidence if the condition is disputed on delivery.';

-- ---------------------------------------------------------------------
-- cargo_vehicle_details
-- ---------------------------------------------------------------------
create table public.cargo_vehicle_details (
  cargo_listing_id uuid primary key references public.cargo_listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  category cargo_category not null default 'autoturism',
  make text,
  model text,
  year integer check (year is null or year between 1900 and 2100),
  vin text,
  plate_number text,
  colour text,

  -- Condition. is_running is the single biggest price driver in this
  -- market: a car that rolls onto a platform in three minutes and one
  -- that needs a winch, a second operator and a skate are different jobs
  -- at different prices, and the carrier must know before quoting.
  is_running boolean not null default true,
  wheels_turn boolean not null default true,
  steering_works boolean not null default true,
  brakes_work boolean not null default true,
  has_keys boolean not null default true,
  needs_winch boolean generated always as (
    not is_running or not wheels_turn or not steering_works
  ) stored,

  is_damaged boolean not null default false,
  damage_notes text,
  -- Declared so the carrier can check axle load and pick the right slot.
  weight_kg integer check (weight_kg is null or weight_kg > 0),
  length_cm integer,
  width_cm integer,
  height_cm integer
);

comment on column public.cargo_vehicle_details.needs_winch is
  'Derived, never entered. If it does not run, the wheels do not turn or it does not steer, it needs a winch - and the card must say so before a carrier commits to a price.';

create index cargo_vehicle_details_category_idx on public.cargo_vehicle_details (category);
create index cargo_vehicle_details_winch_idx on public.cargo_vehicle_details (needs_winch) where needs_winch;

create trigger cargo_vehicle_details_set_updated_at
  before update on public.cargo_vehicle_details
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- cargo_freight_details - the palletized freight side, moved off the
-- listing row so neither kind carries the other's empty columns.
-- ---------------------------------------------------------------------
create table public.cargo_freight_details (
  cargo_listing_id uuid primary key references public.cargo_listings (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  cargo_type text,
  weight_kg integer check (weight_kg is null or weight_kg > 0),
  volume_m3 numeric(6,2),
  ldm numeric(4,2),
  pallets integer,
  length_m numeric(5,2),
  width_m numeric(5,2),
  height_m numeric(5,2),

  needs_adr boolean not null default false,
  needs_frigo boolean not null default false,
  needs_tail_lift boolean not null default false,
  temp_min_c numeric(4,1),
  temp_max_c numeric(4,1)
);

create trigger cargo_freight_details_set_updated_at
  before update on public.cargo_freight_details
  for each row execute function public.set_updated_at();

-- Carry over anything already on the listing row, then drop those columns.
insert into public.cargo_freight_details
  (cargo_listing_id, cargo_type, weight_kg, volume_m3, ldm, pallets,
   length_m, width_m, height_m, needs_adr, needs_frigo, needs_tail_lift,
   temp_min_c, temp_max_c)
select id, cargo_type, weight_kg, volume_m3, ldm, pallets,
       length_m, width_m, height_m, needs_adr, needs_frigo, needs_tail_lift,
       temp_min_c, temp_max_c
from public.cargo_listings
where listing_kind = 'marfa';

alter table public.cargo_listings
  drop column cargo_type,
  drop column volume_m3,
  drop column ldm,
  drop column pallets,
  drop column length_m,
  drop column width_m,
  drop column height_m,
  drop column needs_adr,
  drop column needs_frigo,
  drop column needs_tail_lift,
  drop column temp_min_c,
  drop column temp_max_c;

-- weight_kg stays on the listing: both kinds have one, every card shows it,
-- and every filter uses it. Duplicating it into both detail tables would
-- make the commonest query a union.

-- A listing cannot go on the board without the details for its kind.
create or replace function public.guard_cargo_details_present()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.status <> 'active' then
    return new;
  end if;

  if new.listing_kind = 'vehicul' then
    if not exists (select 1 from public.cargo_vehicle_details d where d.cargo_listing_id = new.id) then
      raise exception 'Completează detaliile vehiculului înainte de publicare'
        using errcode = '23502';
    end if;
  else
    if not exists (select 1 from public.cargo_freight_details d where d.cargo_listing_id = new.id) then
      raise exception 'Completează detaliile mărfii înainte de publicare'
        using errcode = '23502';
    end if;
  end if;
  return new;
end;
$fn$;

-- Runs after the publish and quota guards, which is why it is named last:
-- row triggers fire in name order and there is no reason to check details
-- on a listing that is not allowed to publish anyway.
create trigger cargo_listings_zz_guard_details
  before insert or update on public.cargo_listings
  for each row execute function public.guard_cargo_details_present();

-- ---------------------------------------------------------------------
-- Platform slots: the mechanic behind "preț pe sens"
--
-- A car carrier holds 7-9 vehicles and filling it is the carrier's whole
-- economics. Modelling the departure as slots lets an individual see
-- "3 locuri libere, pleacă marți din München" instead of posting into a
-- pool and waiting for the phone to ring.
-- ---------------------------------------------------------------------
alter table public.truck_listings
  add column platform_slots_total integer check (platform_slots_total is null or platform_slots_total > 0),
  add column service_types service_type[] not null default '{pe_sens,expres}';

create table public.departure_bookings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  truck_listing_id uuid not null references public.truck_listings (id) on delete cascade,
  cargo_listing_id uuid not null references public.cargo_listings (id) on delete cascade,
  slots integer not null default 1 check (slots > 0),
  status text not null default 'reserved'
    check (status in ('reserved', 'confirmed', 'cancelled')),
  agreed_price numeric(10,2),
  currency currency_code not null default 'EUR',
  constraint departure_bookings_unique unique (truck_listing_id, cargo_listing_id)
);

create index departure_bookings_truck_idx on public.departure_bookings (truck_listing_id, status);
create index departure_bookings_cargo_idx on public.departure_bookings (cargo_listing_id);

create trigger departure_bookings_set_updated_at
  before update on public.departure_bookings
  for each row execute function public.set_updated_at();

-- Free slots are derived, so they cannot drift out of sync with bookings.
create view public.v_departures as
select
  t.id as truck_listing_id,
  t.company_id,
  t.direction,
  t.from_country, t.from_county, t.from_city,
  t.to_country, t.to_county, t.to_city,
  t.waypoints,
  t.available_from,
  t.available_to,
  t.service_types,
  t.status,
  t.platform_slots_total,
  coalesce(sum(b.slots) filter (where b.status in ('reserved', 'confirmed')), 0)::integer as slots_taken,
  greatest(
    coalesce(t.platform_slots_total, 0)
      - coalesce(sum(b.slots) filter (where b.status in ('reserved', 'confirmed')), 0),
    0
  )::integer as slots_free
from public.truck_listings t
left join public.departure_bookings b on b.truck_listing_id = t.id
group by t.id;

grant select on public.v_departures to authenticated;

create or replace function public.guard_departure_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_total integer;
  v_taken integer;
begin
  if new.status = 'cancelled' then
    return new;
  end if;

  select t.platform_slots_total into v_total
  from public.truck_listings t where t.id = new.truck_listing_id;

  if v_total is null then
    return new;  -- capacity not declared: nothing to enforce
  end if;

  select coalesce(sum(b.slots), 0) into v_taken
  from public.departure_bookings b
  where b.truck_listing_id = new.truck_listing_id
    and b.status in ('reserved', 'confirmed')
    and b.id is distinct from new.id;

  if v_taken + new.slots > v_total then
    raise exception 'Platforma are doar % locuri, din care % ocupate', v_total, v_taken
      using errcode = '23514';
  end if;
  return new;
end;
$fn$;

create trigger departure_bookings_guard_capacity
  before insert or update on public.departure_bookings
  for each row execute function public.guard_departure_capacity();

-- ---------------------------------------------------------------------
-- Price transparency
--
-- The competitor publishes static seasonal tables. Those pages own the
-- search traffic for this market ("cât costă transport mașină din
-- Germania"), so we publish too - but from closed deals rather than from
-- a guess, which is a page they cannot match without capturing prices.
--
-- price_benchmarks holds the editorial fallback used until a corridor has
-- enough real data; v_corridor_prices is the live median.
-- ---------------------------------------------------------------------
create table public.price_benchmarks (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  from_country text not null,
  to_country text not null,
  category cargo_category not null default 'autoturism',
  service_type service_type not null default 'pe_sens',
  price_from numeric(10,2) not null,
  currency currency_code not null default 'EUR',
  typical_days integer,
  season_label text,
  is_published boolean not null default true,
  constraint price_benchmarks_unique unique (from_country, to_country, category, service_type)
);

create trigger price_benchmarks_set_updated_at
  before update on public.price_benchmarks
  for each row execute function public.set_updated_at();

insert into public.price_benchmarks
  (from_country, to_country, category, service_type, price_from, currency, typical_days, season_label)
values
  ('DE','RO','autoturism','pe_sens', 650, 'EUR', 6, 'Toamnă 2026'),
  ('IT','RO','autoturism','pe_sens', 700, 'EUR', 6, 'Toamnă 2026'),
  ('NL','RO','autoturism','pe_sens', 700, 'EUR', 7, 'Toamnă 2026'),
  ('ES','RO','autoturism','pe_sens', 750, 'EUR', 8, 'Toamnă 2026'),
  ('FR','RO','autoturism','pe_sens', 720, 'EUR', 7, 'Toamnă 2026'),
  ('BE','RO','autoturism','pe_sens', 690, 'EUR', 7, 'Toamnă 2026'),
  ('AT','RO','autoturism','pe_sens', 520, 'EUR', 4, 'Toamnă 2026'),
  ('DE','RO','autoturism','expres',  1150,'EUR', 2, 'Toamnă 2026'),
  ('IT','RO','autoturism','expres',  1200,'EUR', 2, 'Toamnă 2026');

-- Live median from deals that actually closed. The having clause is the
-- whole point: a median computed from two transports is a number that
-- misleads a customer, so a corridor stays on the editorial benchmark
-- until it has a real sample.
create view public.v_corridor_prices as
select
  cl.loading_country as from_country,
  cl.unloading_country as to_country,
  cvd.category,
  cl.service_type,
  count(*)::integer as sample_size,
  round(percentile_cont(0.5) within group (order by t.agreed_price)::numeric, 0) as median_price,
  round(percentile_cont(0.1) within group (order by t.agreed_price)::numeric, 0) as p10_price,
  round(percentile_cont(0.9) within group (order by t.agreed_price)::numeric, 0) as p90_price,
  t.currency,
  max(t.created_at) as last_deal_at
from public.transports t
join public.cargo_listings cl on cl.id = t.cargo_listing_id
join public.cargo_vehicle_details cvd on cvd.cargo_listing_id = cl.id
where t.status in ('delivered', 'invoiced', 'closed')
  and t.created_at > now() - interval '90 days'
group by cl.loading_country, cl.unloading_country, cvd.category, cl.service_type, t.currency
having count(*) >= 5;

grant select on public.v_corridor_prices to authenticated, anon;

-- ---------------------------------------------------------------------
-- Platforms and recovery vehicles need the same paperwork as any truck.
-- ---------------------------------------------------------------------
update public.document_requirements
set for_vehicle_types = for_vehicle_types
  || array['platforma_auto','platforma_auto_inchisa','troliu']::vehicle_type[]
where scope = 'vehicle'
  and kind = 'copie_conforma'
  and for_vehicle_types is not null;

-- ---------------------------------------------------------------------
-- RLS
-- Detail rows inherit the visibility of their listing: if you can see the
-- listing you can see what is being moved.
-- ---------------------------------------------------------------------
alter table public.cargo_vehicle_details enable row level security;
alter table public.cargo_freight_details enable row level security;
alter table public.departure_bookings enable row level security;
alter table public.price_benchmarks enable row level security;

create or replace function public.can_see_cargo_listing(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.cargo_listings l
    where l.id = p_listing_id
      and (l.status = 'active'
           or l.posted_by = auth.uid()
           or (l.company_id is not null and public.is_company_member(l.company_id))
           or public.is_platform_admin())
  );
$fn$;

create or replace function public.can_edit_cargo_listing(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.cargo_listings l
    where l.id = p_listing_id
      and (l.posted_by = auth.uid()
           or (l.company_id is not null and public.is_company_member(l.company_id))
           or public.is_platform_admin())
  );
$fn$;

create policy "cargo_vehicle_details_select" on public.cargo_vehicle_details
  for select to authenticated using (public.can_see_cargo_listing(cargo_listing_id));
create policy "cargo_vehicle_details_insert" on public.cargo_vehicle_details
  for insert to authenticated with check (public.can_edit_cargo_listing(cargo_listing_id));
create policy "cargo_vehicle_details_update" on public.cargo_vehicle_details
  for update to authenticated
  using (public.can_edit_cargo_listing(cargo_listing_id))
  with check (public.can_edit_cargo_listing(cargo_listing_id));
create policy "cargo_vehicle_details_delete" on public.cargo_vehicle_details
  for delete to authenticated using (public.can_edit_cargo_listing(cargo_listing_id));

create policy "cargo_freight_details_select" on public.cargo_freight_details
  for select to authenticated using (public.can_see_cargo_listing(cargo_listing_id));
create policy "cargo_freight_details_insert" on public.cargo_freight_details
  for insert to authenticated with check (public.can_edit_cargo_listing(cargo_listing_id));
create policy "cargo_freight_details_update" on public.cargo_freight_details
  for update to authenticated
  using (public.can_edit_cargo_listing(cargo_listing_id))
  with check (public.can_edit_cargo_listing(cargo_listing_id));
create policy "cargo_freight_details_delete" on public.cargo_freight_details
  for delete to authenticated using (public.can_edit_cargo_listing(cargo_listing_id));

-- A booking is visible to both sides of it.
create policy "departure_bookings_select" on public.departure_bookings
  for select to authenticated
  using (
    public.can_see_cargo_listing(cargo_listing_id)
    or exists (select 1 from public.truck_listings t
               where t.id = truck_listing_id and public.is_company_member(t.company_id))
    or public.is_platform_admin()
  );
create policy "departure_bookings_insert" on public.departure_bookings
  for insert to authenticated
  with check (
    public.can_edit_cargo_listing(cargo_listing_id)
    or exists (select 1 from public.truck_listings t
               where t.id = truck_listing_id and public.is_company_member(t.company_id))
  );
create policy "departure_bookings_update" on public.departure_bookings
  for update to authenticated
  using (
    public.can_edit_cargo_listing(cargo_listing_id)
    or exists (select 1 from public.truck_listings t
               where t.id = truck_listing_id and public.is_company_member(t.company_id))
    or public.is_platform_admin()
  )
  with check (true);
create policy "departure_bookings_delete" on public.departure_bookings
  for delete to authenticated
  using (
    public.can_edit_cargo_listing(cargo_listing_id)
    or exists (select 1 from public.truck_listings t
               where t.id = truck_listing_id and public.is_company_manager(t.company_id))
    or public.is_platform_admin()
  );

-- Benchmarks are a public SEO asset.
create policy "price_benchmarks_select" on public.price_benchmarks
  for select to authenticated, anon using (is_published or public.is_platform_admin());
create policy "price_benchmarks_insert" on public.price_benchmarks
  for insert to authenticated with check (public.is_platform_admin());
create policy "price_benchmarks_update" on public.price_benchmarks
  for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "price_benchmarks_delete" on public.price_benchmarks
  for delete to authenticated using (public.is_platform_admin());
