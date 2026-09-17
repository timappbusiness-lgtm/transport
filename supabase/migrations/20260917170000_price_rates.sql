-- =====================================================================
-- 0024 - Indicative prices: rates per kilometre, and the knobs on them
--
-- A person with a car to move wants a number before they will fill in a
-- form. This gives them a range, built from rates the team sets, and says
-- plainly that the carrier decides the real price.
--
-- Two tables and one rule:
--
--   price_rates      one row per vehicle class, three rates and two floors
--   price_settings   the surcharges, the road factor and the spread; and
--                    whether any of it is published
--
-- Nothing is visible to the public until `is_published` is true. That is
-- what stops a half-filled table from reading as a price list.
--
-- v_corridor_prices and price_benchmarks are untouched. Those hold medians
-- of real closed transports and are a different claim entirely: this table
-- is what we think, that one is what happened.
-- =====================================================================

create type public.vehicle_class as enum (
  'motocicleta',
  'hatchback',
  'sedan',
  'suv',
  'autoutilitara'
);

-- ---------------------------------------------------------------------
-- The rates
-- ---------------------------------------------------------------------
create table public.price_rates (
  vehicle_class public.vehicle_class primary key,

  -- "~1.200 kg" — shown next to the class so a person can place their car.
  weight_label text not null,

  -- Under 50 km in the same country: a short move costs more per kilometre
  -- because loading and paperwork do not get shorter.
  local_ron_per_km numeric(6,2) not null check (local_ron_per_km > 0),
  national_ron_per_km numeric(6,2) not null check (national_ron_per_km > 0),
  international_eur_per_km numeric(6,3) not null check (international_eur_per_km > 0),

  -- Below these, the job is not worth doing at any distance.
  minimum_ron numeric(10,2) not null check (minimum_ron > 0),
  minimum_eur numeric(10,2) not null check (minimum_eur > 0),

  sort_order integer not null default 0,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

comment on table public.price_rates is
  'Indicative rates per kilometre by vehicle class. Set by the team, never derived from transports — v_corridor_prices is the one that reports what actually happened.';

create trigger price_rates_set_updated_at
  before update on public.price_rates
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- The settings
--
-- One row, enforced by a primary key on a constant. A table rather than
-- constants in the app because the team changes these without a deploy,
-- and because `is_published` has to be readable by a policy.
-- ---------------------------------------------------------------------
create table public.price_settings (
  id boolean primary key default true check (id),

  -- A car that will not roll needs a winch, a second person and more time.
  not_running_surcharge_pct integer not null default 30
    check (not_running_surcharge_pct between 0 and 200),

  -- Expres is a dedicated run rather than a seat on a platform going anyway.
  express_surcharge_pct integer not null default 40
    check (express_surcharge_pct between 0 and 200),

  -- Straight-line distance is not road distance. 1.25 is the usual ratio
  -- for European road networks and is a setting because it is a guess.
  road_distance_factor numeric(4,2) not null default 1.25
    check (road_distance_factor between 1 and 3),

  -- Never one exact number: an estimate that looks precise is a promise.
  range_spread_pct integer not null default 15
    check (range_spread_pct between 0 and 100),

  -- The month these rates were set for, shown as "Actualizat: …".
  valid_month date,

  is_published boolean not null default false,
  approved_by uuid references public.profiles (id) on delete set null,
  approved_at timestamptz,

  updated_at timestamptz not null default now()
);

comment on table public.price_settings is
  'One row. The surcharges, the straight-line-to-road factor, the spread of the shown range, and whether any of it is public yet.';

create trigger price_settings_set_updated_at
  before update on public.price_settings
  for each row execute function public.set_updated_at();

insert into public.price_settings (id) values (true);

-- ---------------------------------------------------------------------
-- Placeholder rates
--
-- ⚠ THESE NUMBERS ARE PLACEHOLDERS. They are shaped like real rates so the
-- page and the calculator can be built and reviewed, and they are NOT a
-- price list. The transport partner validates them before anyone publishes,
-- and `is_published` stays false until then — so nothing here reaches a
-- visitor by accident.
--
-- They are deliberately not copied from any competitor.
-- ---------------------------------------------------------------------
insert into public.price_rates
  (vehicle_class, weight_label, local_ron_per_km, national_ron_per_km,
   international_eur_per_km, minimum_ron, minimum_eur, sort_order)
values
  ('motocicleta',   'aprox. 300 kg',  4.20, 2.60, 0.42, 250, 120, 1),
  ('hatchback',     'aprox. 1.200 kg', 5.10, 3.20, 0.52, 350, 160, 2),
  ('sedan',         'aprox. 1.500 kg', 5.40, 3.40, 0.55, 380, 175, 3),
  ('suv',           'aprox. 2.000 kg', 6.20, 3.90, 0.63, 430, 200, 4),
  ('autoutilitara', 'peste 2.400 kg',  7.10, 4.50, 0.72, 500, 230, 5);

-- ---------------------------------------------------------------------
-- Who may read this
--
-- The policy asks one question, so the answer lives in one place and the
-- page cannot forget to check it.
-- ---------------------------------------------------------------------
create or replace function public.prices_are_published()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce((select is_published from public.price_settings where id), false);
$fn$;

comment on function public.prices_are_published() is
  'True when the team has published the indicative prices. Used by the read policies on price_rates and price_settings.';

alter table public.price_rates enable row level security;
alter table public.price_settings enable row level security;

-- Anyone may read, but only once published. Staff see them while they work.
create policy "price_rates_select_published" on public.price_rates
  for select to anon, authenticated
  using (public.prices_are_published() or public.is_platform_admin());

create policy "price_settings_select_published" on public.price_settings
  for select to anon, authenticated
  using (public.prices_are_published() or public.is_platform_admin());

-- No write policy at all, for anybody. Every change goes through the RPCs
-- below, which check the caller and write to audit_log. A policy that let
-- staff write directly would be a second, unaudited path to the same rows.
revoke insert, update, delete, truncate on public.price_rates from anon, authenticated;
revoke insert, update, delete, truncate on public.price_settings from anon, authenticated;

-- ---------------------------------------------------------------------
-- Changing them
--
-- SECURITY DEFINER, staff-only, audited with before and after. After
-- publication a rate change is a change to something people have read, so
-- the audit row is the only record of what it used to say.
-- ---------------------------------------------------------------------
create or replace function public.set_price_rate(
  p_vehicle_class public.vehicle_class,
  p_weight_label text,
  p_local_ron_per_km numeric,
  p_national_ron_per_km numeric,
  p_international_eur_per_km numeric,
  p_minimum_ron numeric,
  p_minimum_eur numeric
)
returns public.price_rates
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.price_rates;
  v_after public.price_rates;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate modifica tarifele' using errcode = '42501';
  end if;

  if p_local_ron_per_km <= 0 or p_national_ron_per_km <= 0
     or p_international_eur_per_km <= 0 then
    raise exception 'Tarifele trebuie să fie numere pozitive' using errcode = '22023';
  end if;

  if p_minimum_ron <= 0 or p_minimum_eur <= 0 then
    raise exception 'Prețurile minime trebuie să fie numere pozitive' using errcode = '22023';
  end if;

  select * into v_before from public.price_rates where vehicle_class = p_vehicle_class;
  if v_before is null then
    raise exception 'Clasa de vehicul nu există' using errcode = 'P0002';
  end if;

  update public.price_rates
  set weight_label = p_weight_label,
      local_ron_per_km = p_local_ron_per_km,
      national_ron_per_km = p_national_ron_per_km,
      international_eur_per_km = p_international_eur_per_km,
      minimum_ron = p_minimum_ron,
      minimum_eur = p_minimum_eur,
      updated_by = auth.uid()
  where vehicle_class = p_vehicle_class
  returning * into v_after;

  perform public.write_audit(
    'price_rate.updated', 'price_rates', null,
    to_jsonb(v_before), to_jsonb(v_after),
    case when public.prices_are_published()
      then 'Modificare după publicare' else null end
  );

  return v_after;
end;
$fn$;

create or replace function public.set_price_settings(
  p_not_running_surcharge_pct integer,
  p_express_surcharge_pct integer,
  p_road_distance_factor numeric,
  p_range_spread_pct integer,
  p_valid_month date
)
returns public.price_settings
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.price_settings;
  v_after public.price_settings;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate modifica setările de preț' using errcode = '42501';
  end if;

  select * into v_before from public.price_settings where id;

  update public.price_settings
  set not_running_surcharge_pct = p_not_running_surcharge_pct,
      express_surcharge_pct = p_express_surcharge_pct,
      road_distance_factor = p_road_distance_factor,
      range_spread_pct = p_range_spread_pct,
      valid_month = p_valid_month
  where id
  returning * into v_after;

  perform public.write_audit(
    'price_settings.updated', 'price_settings', null,
    to_jsonb(v_before), to_jsonb(v_after), null
  );

  return v_after;
end;
$fn$;

/**
 * Publishing is its own RPC, not a column on the settings update.
 *
 * It is the moment the numbers become a public claim, so it records who
 * made that claim and when, in its own audit row that nothing else writes.
 */
create or replace function public.set_prices_published(p_published boolean)
returns public.price_settings
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.price_settings;
  v_after public.price_settings;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate publica tarifele' using errcode = '42501';
  end if;

  select * into v_before from public.price_settings where id;

  if p_published and not exists (select 1 from public.price_rates) then
    raise exception 'Nu există tarife de publicat' using errcode = 'P0002';
  end if;

  update public.price_settings
  set is_published = p_published,
      approved_by = case when p_published then auth.uid() else null end,
      approved_at = case when p_published then now() else null end
  where id
  returning * into v_after;

  perform public.write_audit(
    case when p_published then 'prices.published' else 'prices.unpublished' end,
    'price_settings', null,
    to_jsonb(v_before), to_jsonb(v_after), null
  );

  return v_after;
end;
$fn$;

-- ---------------------------------------------------------------------
-- Grants
--
-- Default privileges grant EXECUTE to nobody (migration 20260916130300),
-- so each function is granted to exactly who calls it.
-- ---------------------------------------------------------------------

-- A policy helper: the roles the policy applies to must be able to run it.
grant execute on function public.prices_are_published() to anon, authenticated;

-- RPCs: authenticated callers only. Each one checks staff membership
-- itself, so a non-staff caller gets the written Romanian refusal rather
-- than an opaque privilege error.
grant execute on function public.set_price_rate(
  public.vehicle_class, text, numeric, numeric, numeric, numeric, numeric
) to authenticated;
grant execute on function public.set_price_settings(
  integer, integer, numeric, integer, date
) to authenticated;
grant execute on function public.set_prices_published(boolean) to authenticated;
