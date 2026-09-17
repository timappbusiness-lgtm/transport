-- =====================================================================
-- 0024 - Requests become publicly visible, at city level
--
-- The homepage has to show that the exchange is used. Until now nothing
-- about a cargo listing was readable without a session: a visitor saw a
-- marketing page and had to take our word for it.
--
-- What changes is *what* is public, not whether the guards hold. The same
-- shape as migration 20260917101904 gave departures:
--
--   cargo_listings        unchanged. Still authenticated-only, still the
--                         place notes, photos, price and posted_by live.
--   v_requests_public     new. anon and authenticated. Category, vehicle,
--                         city and country, estimated distance, and when it
--                         was published. Nothing else.
--
-- Deliberately absent, and each for its own reason:
--   description, damage_notes  free text a person wrote about their own car,
--                              which routinely contains a phone number
--   photo_paths                photographs of somebody's property
--   company_id, posted_by      who is moving what is not public
--   loading_postcode, lat/lng  an address is not a locality
--   price_amount               what the owner hoped to pay is not an offer
--
-- Plus the two numbers the homepage needs to decide whether it has enough
-- to show at all, and one row of settings for where those thresholds sit.
-- =====================================================================

-- ---------------------------------------------------------------------
-- The public feed
--
-- security_invoker is off (the default), so this reads cargo_listings past
-- RLS on purpose — that is what a public projection is. The protection is
-- the column list plus the WHERE clause, both pinned by tests in
-- supabase/tests/rls_test.sql.
-- ---------------------------------------------------------------------
create view public.v_requests_public as
select
  c.id,

  d.category,
  d.make,
  d.model,
  d.year,
  d.is_running,
  c.service_type,

  -- Where, to the locality. The postcode, the coordinates and anything
  -- resembling a street stay behind.
  c.loading_city as from_city,
  c.loading_country as from_country,
  c.unloading_city as to_city,
  c.unloading_country as to_country,

  -- Straight-line, rounded to the kilometre, and null when the listing has
  -- no coordinates. The card says "~2.970 km" so nobody reads it as a route.
  round(
    public.distance_km(c.loading_lat, c.loading_lng, c.unloading_lat, c.unloading_lng)
  )::integer as estimated_km,

  c.published_at
from public.cargo_listings c
join public.cargo_vehicle_details d on d.cargo_listing_id = c.id
where c.status = 'active'
  and c.listing_kind = 'vehicul'
  and c.published_at is not null
  -- A request whose loading window has passed is not a request any more,
  -- and a homepage full of last month's routes reads as an abandoned site.
  and coalesce(c.loading_to, c.loading_from) >= current_date;

comment on view public.v_requests_public is
  'Active vehicle transport requests at locality level, for anon and authenticated. No notes, photos, price, contact, address or owner: those stay in cargo_listings, which is authenticated-only.';

revoke all on public.v_requests_public from public;
grant select on public.v_requests_public to anon, authenticated;

-- Serves both the feed's ordering and the counts below.
create index cargo_listings_published_idx
  on public.cargo_listings (published_at desc)
  where published_at is not null;

-- ---------------------------------------------------------------------
-- How much has gone through here
--
-- One function rather than three, because the homepage asks all of it at
-- once and a page that renders four numbers should not make four round
-- trips. STABLE, so it can be cached for a minute by the caller.
--
-- SECURITY DEFINER because it counts rows anon cannot read — but it returns
-- only aggregates, never a row.
-- ---------------------------------------------------------------------
create or replace function public.homepage_activity()
returns table (
  published_total integer,
  published_last_7d integer,
  total_km bigint,
  active_total integer,
  daily_counts integer[],
  daily_from date
)
language sql
stable
security definer
set search_path = public
as $fn$
  with published as (
    -- "Ever published" means exactly that: a listing that went live once
    -- counts even if it has since been delivered or expired. A draft never
    -- shown to anybody does not, and neither does a cancelled request —
    -- counting those would inflate the total with journeys nobody asked for.
    select
      c.published_at,
      round(
        public.distance_km(c.loading_lat, c.loading_lng, c.unloading_lat, c.unloading_lng)
      ) as km
    from public.cargo_listings c
    where c.published_at is not null
      and c.listing_kind = 'vehicul'
      and c.status not in ('draft', 'cancelled')
  ),
  days as (
    select generate_series(current_date - 29, current_date, interval '1 day')::date as d
  ),
  per_day as (
    select
      days.d,
      (select count(*)::integer from published p where p.published_at::date = days.d) as n
    from days
  )
  select
    (select count(*) from published)::integer,
    (select count(*) from published where published_at >= now() - interval '7 days')::integer,
    -- A listing with no coordinates contributes no kilometres rather than a
    -- guess, so the total is never larger than what was actually asked for.
    coalesce((select sum(km) from published), 0)::bigint,
    (select count(*) from public.v_requests_public)::integer,
    (select array_agg(per_day.n order by per_day.d) from per_day),
    (current_date - 29)::date;
$fn$;

comment on function public.homepage_activity() is
  'Aggregates for the homepage activity section: requests ever published, requests in the last seven days, total estimated kilometres, requests live right now, and a thirty-day daily series. Returns no row of anybody''s data.';

-- ---------------------------------------------------------------------
-- The thresholds
--
-- Three published requests are not a statistic, and a grid with two cards
-- in it looks like a site nobody uses. Below these numbers the homepage
-- shows the empty state instead — which is a claim about honesty, so the
-- team can move it without a deploy and the move is audited.
-- ---------------------------------------------------------------------
create table public.homepage_settings (
  id boolean primary key default true check (id),

  -- Below this many published requests, the statistics row is hidden.
  stats_min_requests integer not null default 50
    check (stats_min_requests between 0 and 100000),

  -- Below this many live requests, the feed is hidden.
  feed_min_requests integer not null default 6
    check (feed_min_requests between 0 and 1000),

  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

comment on table public.homepage_settings is
  'One row. How much activity the homepage needs before it shows any of it.';

create trigger homepage_settings_set_updated_at
  before update on public.homepage_settings
  for each row execute function public.set_updated_at();

insert into public.homepage_settings (id) values (true);

alter table public.homepage_settings enable row level security;

-- A threshold is not a secret, and the page reads it without a session.
create policy "homepage_settings_select_all" on public.homepage_settings
  for select to anon, authenticated
  using (true);

-- No write policy for anybody. The RPC below is the only way in, so there
-- is no second, unaudited path to the same row.
revoke insert, update, delete, truncate on public.homepage_settings from anon, authenticated;

create or replace function public.set_homepage_settings(
  p_stats_min_requests integer,
  p_feed_min_requests integer
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

  if p_stats_min_requests is null or p_stats_min_requests < 0 then
    raise exception 'Pragul pentru statistici trebuie să fie un număr pozitiv' using errcode = '22023';
  end if;

  if p_feed_min_requests is null or p_feed_min_requests < 1 then
    raise exception 'Pragul pentru lista de cereri trebuie să fie cel puțin 1' using errcode = '22023';
  end if;

  select * into v_before from public.homepage_settings where id;

  update public.homepage_settings
  set stats_min_requests = p_stats_min_requests,
      feed_min_requests = p_feed_min_requests,
      updated_by = auth.uid()
  where id
  returning * into v_after;

  perform public.write_audit(
    'homepage_settings.updated', 'homepage_settings', null,
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
grant execute on function public.homepage_activity() to anon, authenticated;
grant execute on function public.set_homepage_settings(integer, integer) to authenticated;
