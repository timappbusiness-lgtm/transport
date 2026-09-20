-- =====================================================================
-- Faza 1 — ce mai rămăsese, în cod
--
-- Five things, all of them work that was half-done rather than
-- unstarted, which is why they were the last to be noticed.
--
-- 1. Saved searches with their own alerts. `saved_searches` has held
--    rows since phase 0 and nothing read them: the alerts that do exist
--    are company-wide, one switch for everything a firm covers, which is
--    not what a carrier running three corridors wants. Per-search rules,
--    a frequency, and — the part that makes an alert trustworthy —
--    **the reasons the match was made**, stored with it.
--
-- 2. `max_detour_km` finally used. It has existed since 20260916120300
--    with a default of 50 and no reader. A return leg that ignores the
--    detour tolerance is a return leg matched on the wrong thing: an
--    empty truck coming back from Hamburg will happily take a 40 km
--    diversion, and the whole point of the retur board is that it does.
--
-- 3. `reports` gets a screen and a life cycle. The table has been
--    complete since phase 0 — reason, evidence, status, resolution, who
--    handled it — and no screen has ever read it, so a person reporting
--    a problem from /verificare was writing into a drawer.
--
-- 4. `audit_log` gets a reader. Everything the platform decides is in
--    there and it could only be queried from the database.
--
-- 5. Category statistics: what the board actually holds, per kind of
--    vehicle, over a window, with our own accounts out of it.
--
-- Nothing here is Faza 2. No offers, no orders, no proof of delivery, no
-- messaging. The reports screen acts through the suspensions and listing
-- states that already exist; it does not moderate conversations, because
-- there are none.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The dials this migration needs
--
-- One row, like every other settings table here. `default_detour_km` is
-- what a route that has never said gets: the column on `truck_listings`
-- carries `default 50`, but a default in a column applies at insert and
-- says nothing about rows written before it, so the reader needs its own
-- answer and this is it.
--
-- The road factor is deliberately NOT duplicated here. It lives in
-- `price_settings.road_distance_factor` and is read from there, because
-- it is one guess about European road networks and two copies of a guess
-- drift within a month. The coupling is odd — a matching function
-- reading a pricing table — and it is the lesser of the two evils.
-- ---------------------------------------------------------------------
create table public.matching_settings (
  id boolean primary key default true check (id),

  default_detour_km integer not null default 50
    check (default_detour_km between 0 and 500),

  -- How far back the homepage counts requests per category.
  category_window_days integer not null default 90
    check (category_window_days between 7 and 365),

  updated_at timestamptz not null default now()
);

insert into public.matching_settings (id) values (true);

comment on table public.matching_settings is
  'The two dials matching and the homepage counters need. One row, enforced by a primary key on a constant, like every other settings table here.';
comment on column public.matching_settings.default_detour_km is
  'The tolerance a published route gets when it has not named one. Rows written before truck_listings.max_detour_km had a default are exactly the case this exists for.';

create trigger matching_settings_set_updated_at
  before update on public.matching_settings
  for each row execute function public.set_updated_at();

alter table public.matching_settings enable row level security;

-- Readable by anyone: the numbers are shown on the board and in the
-- reason chips, so hiding them would only mean the interface explains a
-- rule it cannot name.
create policy "matching_settings_select_all" on public.matching_settings
  for select to anon, authenticated using (true);

revoke insert, update, delete, truncate on public.matching_settings
  from anon, authenticated;

create or replace function public.set_matching_settings(
  p_default_detour_km integer,
  p_category_window_days integer
)
returns public.matching_settings
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.matching_settings;
  v_after public.matching_settings;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate schimba setările de potrivire'
      using errcode = '42501';
  end if;

  select * into v_before from public.matching_settings where id;

  update public.matching_settings
  set default_detour_km = coalesce(p_default_detour_km, default_detour_km),
      category_window_days = coalesce(p_category_window_days, category_window_days)
  where id
  returning * into v_after;

  perform public.write_audit('settings.matching_changed', 'matching_settings', null,
                             to_jsonb(v_before), to_jsonb(v_after), null);
  return v_after;
end;
$fn$;

grant execute on function public.set_matching_settings(integer, integer) to authenticated;

-- ---------------------------------------------------------------------
-- 2. The detour
--
-- The insertion cost, which is the honest measure: taking a request from
-- P to Q while running A to B costs
--
--     d(A,P) + d(P,Q) + d(Q,B) − d(A,B)
--
-- extra kilometres. That is what a dispatcher means by „ocol", and it is
-- what `max_detour_km` was always about. Straight-line distances come
-- from `distance_km()`; the road factor turns them into something
-- comparable to a tolerance somebody typed while thinking about roads.
--
-- Returns NULL when any coordinate is missing, and every caller reads
-- NULL as „cannot tell" rather than as zero. A request with no
-- coordinates should not be silently declared a perfect fit.
-- ---------------------------------------------------------------------
create or replace function public.detour_km(
  p_route_from_lat numeric, p_route_from_lng numeric,
  p_route_to_lat numeric, p_route_to_lng numeric,
  p_pickup_lat numeric, p_pickup_lng numeric,
  p_dropoff_lat numeric, p_dropoff_lng numeric
)
returns numeric
language sql
stable
security definer
set search_path = public
as $fn$
  select case
    when p_route_from_lat is null or p_route_to_lat is null
      or p_pickup_lat is null or p_dropoff_lat is null then null
    else greatest(0, round((
      (
        public.distance_km(p_route_from_lat, p_route_from_lng, p_pickup_lat, p_pickup_lng)
        + public.distance_km(p_pickup_lat, p_pickup_lng, p_dropoff_lat, p_dropoff_lng)
        + public.distance_km(p_dropoff_lat, p_dropoff_lng, p_route_to_lat, p_route_to_lng)
        - public.distance_km(p_route_from_lat, p_route_from_lng, p_route_to_lat, p_route_to_lng)
      )
      * coalesce((select s.road_distance_factor from public.price_settings s where s.id), 1.25)
    )::numeric, 0))
  end;
$fn$;

comment on function public.detour_km is
  'Extra kilometres to take a request while running a route: d(A,P)+d(P,Q)+d(Q,B)−d(A,B), scaled by the road factor. NULL when a coordinate is missing, and every caller reads NULL as "cannot tell".';

grant execute on function public.detour_km(
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric
) to anon, authenticated;

/**
 * The best a company's published routes can do for one request.
 *
 * Returns the smallest detour across the firm's active routes, together
 * with the route that achieved it and the tolerance that route allows.
 * No rows when the firm has published nothing with coordinates — which
 * is a real answer and not a zero: a firm with no routes is matched on
 * coverage alone, exactly as it was before this migration.
 */
create or replace function public.best_route_detour(
  p_company_id uuid,
  p_pickup_lat numeric, p_pickup_lng numeric,
  p_dropoff_lat numeric, p_dropoff_lng numeric
)
returns table (
  truck_listing_id uuid,
  detour_km numeric,
  tolerance_km integer,
  within boolean,
  from_city text,
  to_city text
)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    t.id,
    d.km,
    tol.km,
    d.km <= tol.km,
    t.from_city,
    t.to_city
  from public.truck_listings t
  cross join lateral (
    select public.detour_km(
      t.from_lat, t.from_lng, t.to_lat, t.to_lng,
      p_pickup_lat, p_pickup_lng, p_dropoff_lat, p_dropoff_lng
    ) as km
  ) d
  cross join lateral (
    select coalesce(
      nullif(t.max_detour_km, 0),
      (select m.default_detour_km from public.matching_settings m where m.id)
    ) as km
  ) tol
  where t.company_id = p_company_id
    and t.status = 'active'
    and coalesce(t.available_to, t.available_from) >= current_date
    and d.km is not null
  order by d.km
  limit 1;
$fn$;

comment on function public.best_route_detour is
  'The smallest detour any of a firm''s active routes needs for a request, with the route and the tolerance it allows. No rows means the firm has published no route we can measure against — which is not the same as a bad fit.';

grant execute on function public.best_route_detour(uuid, numeric, numeric, numeric, numeric)
  to authenticated;

/**
 * Whether the detour rules out this firm.
 *
 * Three answers, and the middle one is the one that matters:
 *
 *   * the firm has published no route we can measure → **true**, because
 *     coverage is all we know and coverage already said yes. A firm
 *     without routes on the board is not a bad fit; it is an unmeasured
 *     one, and refusing it would quietly empty the board for every
 *     carrier who has not published yet.
 *   * a route is within its tolerance → **true**.
 *   * every route it has is further off than its own tolerance allows →
 *     **false**. This is the case `max_detour_km` was written for in
 *     20260916120300 and that nothing read until now.
 */
create or replace function public.company_detour_ok(
  p_company_id uuid,
  p_pickup_lat numeric, p_pickup_lng numeric,
  p_dropoff_lat numeric, p_dropoff_lng numeric
)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(
    (select b.within
     from public.best_route_detour(
       p_company_id, p_pickup_lat, p_pickup_lng, p_dropoff_lat, p_dropoff_lng
     ) b),
    true
  );
$fn$;

comment on function public.company_detour_ok is
  'False only when the firm has routes we can measure and all of them are further off than their own tolerance. No routes, or no coordinates, is true: unmeasured is not the same as unsuitable.';

grant execute on function public.company_detour_ok(uuid, numeric, numeric, numeric, numeric)
  to authenticated;

-- ---------------------------------------------------------------------
-- The three functions that count carriers, now with the detour
--
-- Reproduced from 20260918200000 rather than edited, because a merged
-- migration is never edited. Each gains four coordinate parameters at
-- the end, defaulted to null: a caller with no coordinates gets exactly
-- the behaviour it had before, which is what keeps the form's step-4
-- preview working before a city has been resolved.
--
-- The old signatures are dropped rather than left beside the new ones:
-- overloads differing only by defaulted parameters are an ambiguity
-- PostgREST resolves by guessing.
-- ---------------------------------------------------------------------
drop function if exists public.count_matching_carriers_on_route(
  text, text, text, text, public.cargo_category, boolean, public.service_type, uuid
);

create or replace function public.count_matching_carriers_on_route(
  p_loading_country text,
  p_loading_county text,
  p_unloading_country text,
  p_unloading_county text,
  p_category public.cargo_category default null,
  p_needs_winch boolean default false,
  p_service_type public.service_type default 'pe_sens',
  p_posted_by_company_id uuid default null,
  p_pickup_lat numeric default null,
  p_pickup_lng numeric default null,
  p_dropoff_lat numeric default null,
  p_dropoff_lng numeric default null
)
returns integer
language sql
stable
security definer
set search_path = public
as $fn$
  select count(*)::integer
  from public.companies c
  where c.verification_status = 'verified'
    and not c.is_suspended
    and not c.is_test
    and c.deletion_scheduled_at is null
    and c.company_type in ('transport', 'both')
    and public.company_matches_route(
          c.id, p_loading_country, p_loading_county,
          p_unloading_country, p_unloading_county,
          p_category, p_needs_winch, p_service_type, p_posted_by_company_id)
    and (
      p_pickup_lat is null
      or public.company_detour_ok(c.id, p_pickup_lat, p_pickup_lng,
                                  p_dropoff_lat, p_dropoff_lng)
    );
$fn$;

comment on function public.count_matching_carriers_on_route(
  text, text, text, text, public.cargo_category, boolean, public.service_type, uuid,
  numeric, numeric, numeric, numeric
) is
  'How many verified, non-suspended carriers cover this route, carry this category, have the equipment, and — when coordinates are given — can reach it inside their own detour tolerance. A count, never a list.';

-- Granted to nobody, exactly as 20260918200000 left it: the browser
-- reaches this through preview_matching_carriers, which is rate limited.
revoke all on function public.count_matching_carriers_on_route(
  text, text, text, text, public.cargo_category, boolean, public.service_type, uuid,
  numeric, numeric, numeric, numeric
) from public, anon, authenticated;

create or replace function public.count_matching_carriers(p_listing_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  l public.cargo_listings;
  d public.cargo_vehicle_details;
begin
  if auth.uid() is null then
    raise exception 'Autentificare necesară' using errcode = '42501';
  end if;
  select * into l from public.cargo_listings where id = p_listing_id;
  if l.id is null then
    raise exception 'Cererea nu există' using errcode = 'P0002';
  end if;
  if not public.can_edit_cargo_listing(p_listing_id) then
    raise exception 'Cererea nu îți aparține' using errcode = '42501';
  end if;
  select * into d from public.cargo_vehicle_details where cargo_listing_id = p_listing_id;

  return public.count_matching_carriers_on_route(
    l.loading_country, l.loading_county,
    l.unloading_country, l.unloading_county,
    d.category, coalesce(d.needs_winch, false), l.service_type, l.company_id,
    l.loading_lat, l.loading_lng, l.unloading_lat, l.unloading_lng);
end;
$fn$;

grant execute on function public.count_matching_carriers(uuid) to authenticated;

drop function if exists public.preview_matching_carriers(
  text, text, text, text, public.cargo_category, boolean, public.service_type, uuid
);

create or replace function public.preview_matching_carriers(
  p_loading_country text,
  p_loading_county text,
  p_unloading_country text,
  p_unloading_county text,
  p_category public.cargo_category default null,
  p_needs_winch boolean default false,
  p_service_type public.service_type default 'pe_sens',
  p_company_id uuid default null,
  p_pickup_lat numeric default null,
  p_pickup_lng numeric default null,
  p_dropoff_lat numeric default null,
  p_dropoff_lng numeric default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  -- Thirty an hour is far more than a person filling in a form needs and
  -- far less than a map of the country costs.
  v_cap constant integer := 30;
  v_used integer;
  v_company uuid;
begin
  if auth.uid() is null then
    raise exception 'Autentificare necesară' using errcode = '42501';
  end if;
  if p_loading_country is null or p_unloading_country is null then
    raise exception 'Alege traseul' using errcode = '22023';
  end if;

  select count(*) into v_used
  from public.carrier_count_probes
  where user_id = auth.uid() and created_at > now() - interval '1 hour';

  if v_used >= v_cap then
    raise exception 'Ai verificat prea multe rute în ultima oră. Încearcă din nou mai târziu.'
      using errcode = '22023';
  end if;

  insert into public.carrier_count_probes (user_id) values (auth.uid());

  -- A dispatcher previewing for their own firm should not see it counted,
  -- because it will not be counted once the request exists.
  if p_company_id is not null and exists (
    select 1 from public.company_members cm
    where cm.company_id = p_company_id and cm.user_id = auth.uid()
  ) then
    v_company := p_company_id;
  end if;

  return public.count_matching_carriers_on_route(
    p_loading_country, p_loading_county, p_unloading_country, p_unloading_county,
    p_category, coalesce(p_needs_winch, false),
    coalesce(p_service_type, 'pe_sens'), v_company,
    p_pickup_lat, p_pickup_lng, p_dropoff_lat, p_dropoff_lng);
end;
$fn$;

grant execute on function public.preview_matching_carriers(
  text, text, text, text, public.cargo_category, boolean, public.service_type, uuid,
  numeric, numeric, numeric, numeric
) to authenticated;

/**
 * Whether a company carries a given request.
 *
 * Reproduced from 20260918090000 with the detour added, and rewritten as
 * a wrapper over the two rules rather than a second copy of the coverage
 * logic — which is what it was, and what made it possible for the two to
 * disagree.
 */
create or replace function public.company_matches_request(
  p_company_id uuid,
  p_listing_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  l public.cargo_listings;
  d public.cargo_vehicle_details;
begin
  select * into l from public.cargo_listings where id = p_listing_id;
  if l.id is null then return false; end if;
  select * into d from public.cargo_vehicle_details where cargo_listing_id = p_listing_id;

  if not public.company_matches_route(
       p_company_id, l.loading_country, l.loading_county,
       l.unloading_country, l.unloading_county,
       d.category, coalesce(d.needs_winch, false), l.service_type, l.company_id) then
    return false;
  end if;

  return public.company_detour_ok(
    p_company_id, l.loading_lat, l.loading_lng, l.unloading_lat, l.unloading_lng);
end;
$fn$;

comment on function public.company_matches_request(uuid, uuid) is
  'Whether a company carries a request: coverage, category, winch, recovery, and the detour its own published routes allow. A filter, never a score.';

/**
 * The board view gains the two pairs of coordinates.
 *
 * Reproduced from 20260920100000 with four columns appended — a view is
 * only ever added to, never re-cut, because Postgres refuses to drop a
 * column from one and every column below is somebody else's query.
 *
 * Nothing private is exposed. These are the city centroids from
 * `src/lib/cities.ts`, resolved on the server when the request was
 * published; the city itself is already on every card. What they buy is
 * the detour, computed in one process for the dashboard
 * and the board filter instead of a round trip per row.
 */
create or replace view public.v_requests_public as
select
  c.id,
  d.category,
  d.make,
  d.model,
  d.year,
  d.is_running,
  c.service_type,
  c.loading_city as from_city,
  c.loading_country as from_country,
  c.unloading_city as to_city,
  c.unloading_country as to_country,
  round(
    public.distance_km(c.loading_lat, c.loading_lng, c.unloading_lat, c.unloading_lng)
  )::integer as estimated_km,
  c.published_at,
  c.board,
  c.loading_from,
  c.loading_to,
  c.weight_kg,
  d.needs_winch,
  coalesce(array_length(c.photo_paths, 1), 0) as photo_count,
  c.loading_country = c.unloading_country as is_domestic,
  c.loading_county as from_county,
  c.unloading_county as to_county,
  c.expires_at,

  -- Appended by 20260921100000.
  c.loading_lat as from_lat,
  c.loading_lng as from_lng,
  c.unloading_lat as to_lat,
  c.unloading_lng as to_lng
from public.cargo_listings c
join public.cargo_vehicle_details d on d.cargo_listing_id = c.id
join public.profiles p on p.id = c.posted_by
left join public.companies co on co.id = c.company_id
where c.status = 'active'
  and c.listing_kind = 'vehicul'
  and c.published_at is not null
  and coalesce(c.loading_to, c.loading_from) >= current_date
  and not p.is_test
  and not coalesce(co.is_test, false);

comment on view public.v_requests_public is
  'Active vehicle transport requests at locality level, for anon and authenticated. No notes, photos, price, contact, address or owner. Coordinates are the city centroids the card already names. Test accounts are excluded.';

revoke all on public.v_requests_public from public;
grant select on public.v_requests_public to anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Saved searches that actually alert
--
-- The table has existed since 20260916120300 and nothing ever read it.
-- What alerts today is one switch per firm over everything it covers,
-- which for a carrier running three corridors means either noise or
-- silence and nothing in between.
--
-- What is added: a name people choose, a frequency, the criteria in a
-- shape the matcher can read, and — the part that makes an alert worth
-- opening — **the reasons**, stored per match rather than recomputed
-- for display. A reason computed later is a reason that can disagree
-- with the decision it explains.
-- ---------------------------------------------------------------------
create type public.alert_frequency as enum ('immediate', 'daily');

alter table public.saved_searches
  add column frequency public.alert_frequency not null default 'immediate',
  -- Set when a digest last went out, so the nightly job knows what it
  -- has already told them about.
  add column last_digest_at timestamptz;

comment on column public.saved_searches.frequency is
  'immediate sends one e-mail per match; daily groups the day''s matches into one. Both respect the dedupe below: a listing is never announced twice to the same search.';

/**
 * What a saved search matched, and why.
 *
 * A row here is a decision that has already been made. The reasons are
 * written with it because a reason recomputed at display time can
 * disagree with the decision — the route changed, the tolerance moved —
 * and an alert that explains itself wrongly is worse than one that does
 * not explain itself at all.
 */
create table public.saved_search_matches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  saved_search_id uuid not null references public.saved_searches (id) on delete cascade,
  cargo_listing_id uuid not null references public.cargo_listings (id) on delete cascade,

  -- ['Ruta: Germania → România', 'Tip: autoturism', 'Ocol: 18 km din 40']
  reasons text[] not null default '{}',
  -- Null when the firm has no route to measure against.
  detour_km numeric(6,1),

  /** Set when this match has been included in an e-mail. */
  notified_at timestamptz,

  constraint saved_search_matches_unique unique (saved_search_id, cargo_listing_id)
);

comment on table public.saved_search_matches is
  'One row per listing a saved search matched, with the reasons stored as they were decided. The unique constraint is the dedupe: a listing is announced to a search exactly once, whatever happens to it afterwards.';

create index saved_search_matches_pending_idx
  on public.saved_search_matches (saved_search_id, created_at)
  where notified_at is null;
create index saved_search_matches_recent_idx
  on public.saved_search_matches (saved_search_id, created_at desc);

alter table public.saved_search_matches enable row level security;

-- A person reads the matches of their own searches, and nothing else.
create policy "saved_search_matches_select_own" on public.saved_search_matches
  for select to authenticated
  using (
    exists (
      select 1 from public.saved_searches s
      where s.id = saved_search_id and s.user_id = auth.uid()
    )
    or public.is_platform_admin()
  );

-- Written only by the trigger and the digest job, both SECURITY DEFINER.
revoke insert, update, delete, truncate on public.saved_search_matches
  from anon, authenticated;

/**
 * How many saved searches this plan allows.
 *
 * `plans.max_saved_searches` has been on every plan since 20260916120500
 * and nothing enforced it. Null is unlimited, as everywhere else in that
 * table.
 */
create or replace function public.saved_search_quota(p_user uuid)
returns table (used integer, allowed integer, plan_name text)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_company uuid;
  v_plan public.plans;
begin
  select cm.company_id into v_company
  from public.company_members cm
  where cm.user_id = p_user
  order by cm.created_at
  limit 1;

  v_plan := public.current_plan(v_company);

  return query
  select
    (select count(*)::integer from public.saved_searches s where s.user_id = p_user),
    v_plan.max_saved_searches,
    v_plan.name;
end;
$fn$;

grant execute on function public.saved_search_quota(uuid) to authenticated;

/**
 * Creating one, with the quota applied where it belongs.
 *
 * The plan limit is checked here rather than in the browser because the
 * browser is not a boundary, and rather than in a policy because a
 * policy cannot say „ai atins limita planului Gratuit" — and a refusal
 * that does not name the plan is a refusal somebody has to write to
 * support about.
 */
create or replace function public.save_search(
  p_name text,
  p_target text,
  p_filters jsonb,
  p_frequency public.alert_frequency default 'immediate',
  p_notify_email boolean default true
)
returns public.saved_searches
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_user uuid := auth.uid();
  v_quota record;
  v_row public.saved_searches;
begin
  if v_user is null then
    raise exception 'Autentificare necesară' using errcode = '42501';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'Dă-i căutării un nume, ca să o recunoști în listă' using errcode = '22023';
  end if;
  if p_target not in ('cargo', 'truck') then
    raise exception 'Căutarea poate fi pe cereri sau pe trasee' using errcode = '22023';
  end if;

  select * into v_quota from public.saved_search_quota(v_user);
  if v_quota.allowed is not null and v_quota.used >= v_quota.allowed then
    raise exception 'Ai atins limita de % căutări salvate a planului %. Treci la un plan superior ca să salvezi mai multe.',
      v_quota.allowed, v_quota.plan_name
      using errcode = '42501';
  end if;

  insert into public.saved_searches
    (user_id, company_id, name, target, filters, frequency, notify_email)
  values (
    v_user,
    (select cm.company_id from public.company_members cm
     where cm.user_id = v_user order by cm.created_at limit 1),
    trim(p_name),
    p_target,
    coalesce(p_filters, '{}'::jsonb),
    coalesce(p_frequency, 'immediate'),
    coalesce(p_notify_email, true)
  )
  returning * into v_row;

  return v_row;
end;
$fn$;

grant execute on function public.save_search(text, text, jsonb, public.alert_frequency, boolean)
  to authenticated;

/**
 * A category, in the words a person reads.
 *
 * A second copy of `CARGO_CATEGORY_LABELS` from `src/lib/departures.ts`,
 * and the duplication is deliberate: the reasons stored on a match are
 * rendered into an e-mail by the edge function, which cannot import the
 * application. `tests/unit/cargo-labels.test.ts` reads this file and
 * fails when the two lists stop agreeing.
 */
create or replace function public.cargo_category_label(p_category public.cargo_category)
returns text
language sql
immutable
set search_path = public
as $fn$
  select case p_category
    when 'autoturism' then 'Autoturism'
    when 'autoutilitara' then 'Autoutilitară'
    when 'motocicleta' then 'Motocicletă'
    when 'utilaj_agricol' then 'Utilaj agricol'
    when 'microbuz' then 'Microbuz'
    when 'utilaj_constructii' then 'Utilaj de construcții'
    when 'rulota' then 'Rulotă'
    when 'cap_tractor' then 'Cap tractor'
    when 'camion' then 'Camion'
    when 'remorca' then 'Remorcă'
    when 'utilaj_manipulare' then 'Utilaj de manipulare'
    when 'container' then 'Container'
    when 'ambarcatiune' then 'Ambarcațiune'
    when 'altele' then 'Altele'
  end;
$fn$;

grant execute on function public.cargo_category_label(public.cargo_category)
  to anon, authenticated;

/**
 * Whether a saved search matches a request, and why.
 *
 * The filters are the ones the board writes into the URL, stored as
 * jsonb: `from_country`, `to_country`, `from_county`, `to_county`,
 * `category`, `condition`, `service`, `scope`. Everything absent is
 * „did not say", which matches everything — the same reading the rest
 * of this schema uses for an empty list.
 *
 * Returns no row when it does not match. Returns one row with the
 * reasons when it does, and the reasons are the sentences a person will
 * read, built here so the e-mail and the screen cannot disagree.
 */
create or replace function public.saved_search_match(
  p_search_id uuid,
  p_listing_id uuid
)
returns table (reasons text[], detour_km numeric)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  s public.saved_searches;
  l public.cargo_listings;
  d public.cargo_vehicle_details;
  f jsonb;
  v_reasons text[] := '{}';
  v_detour record;
  -- Held separately because `v_detour` is only assigned when the search
  -- belongs to a firm with routes. Reading a field off an unassigned
  -- record raises, which is how this was found.
  v_detour_km numeric := null;
  v_label text;
begin
  select * into s from public.saved_searches where id = p_search_id;
  if s.id is null or not s.is_active or s.target <> 'cargo' then return; end if;

  select * into l from public.cargo_listings where id = p_listing_id;
  if l.id is null then return; end if;
  select * into d from public.cargo_vehicle_details where cargo_listing_id = p_listing_id;

  -- Never your own request.
  if s.company_id is not null and l.company_id = s.company_id then return; end if;

  f := coalesce(s.filters, '{}'::jsonb);

  if f ? 'from_country' and upper(f ->> 'from_country') <> upper(l.loading_country) then
    return;
  end if;
  if f ? 'to_country' and upper(f ->> 'to_country') <> upper(l.unloading_country) then
    return;
  end if;
  if f ? 'from_county'
     and upper(coalesce(f ->> 'from_county', '')) <> upper(coalesce(l.loading_county, '')) then
    return;
  end if;
  if f ? 'to_county'
     and upper(coalesce(f ->> 'to_county', '')) <> upper(coalesce(l.unloading_county, '')) then
    return;
  end if;
  if f ? 'category' and (f ->> 'category') <> d.category::text then return; end if;
  if f ? 'service' and (f ->> 'service') <> l.service_type::text then return; end if;
  if f ? 'condition' then
    if (f ->> 'condition') = 'ruleaza' and not coalesce(d.is_running, true) then return; end if;
    if (f ->> 'condition') = 'nu-ruleaza' and coalesce(d.is_running, true) then return; end if;
  end if;
  if f ? 'scope' then
    if (f ->> 'scope') = 'intern'
       and upper(l.loading_country) <> upper(l.unloading_country) then return; end if;
    if (f ->> 'scope') = 'international'
       and upper(l.loading_country) = upper(l.unloading_country) then return; end if;
  end if;

  -- Matched. Now say why, in the order a person reads it.
  v_reasons := array_append(v_reasons,
    format('Ruta: %s (%s) — %s (%s)',
           l.loading_city, l.loading_country, l.unloading_city, l.unloading_country));

  if d.category is not null then
    v_label := public.cargo_category_label(d.category);
    v_reasons := array_append(v_reasons, format('Tip vehicul: %s', v_label));
  end if;

  if coalesce(d.needs_winch, false) then
    v_reasons := array_append(v_reasons, 'Nu rulează: are nevoie de troliu');
  end if;

  if l.service_type = 'expres' then
    v_reasons := array_append(v_reasons, 'Serviciu: expres');
  end if;

  -- The detour, when the firm has a route to measure against. This is
  -- the reason that was impossible to give before max_detour_km had a
  -- reader.
  if s.company_id is not null then
    select * into v_detour
    from public.best_route_detour(
      s.company_id, l.loading_lat, l.loading_lng, l.unloading_lat, l.unloading_lng);

    if v_detour.truck_listing_id is not null then
      if not v_detour.within then return; end if;
      v_detour_km := v_detour.detour_km;
      v_reasons := array_append(v_reasons,
        format('Ocol de %s km față de traseul %s — %s (toleranță %s km)',
               trim(to_char(v_detour.detour_km, 'FM999999')),
               v_detour.from_city, v_detour.to_city, v_detour.tolerance_km));
    end if;
  end if;

  return query select v_reasons, v_detour_km;
end;
$fn$;

comment on function public.saved_search_match(uuid, uuid) is
  'No row when the search does not match; one row with the reasons when it does. The reasons are the sentences the e-mail and the screen both show, built once so they cannot disagree.';

grant execute on function public.saved_search_match(uuid, uuid) to authenticated;

/**
 * Fanning a new request out to every saved search that wants it.
 *
 * Runs beside the company-wide alert that already exists rather than
 * replacing it: one is „everything my firm covers", the other is „this
 * corridor specifically", and a carrier may reasonably want both. The
 * dedupe keys differ, so a firm subscribed both ways gets one of each
 * and never two of the same.
 */
create or replace function public.queue_saved_search_alerts()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  s record;
  m record;
begin
  for s in
    select ss.*, p.email as user_email, p.email_undeliverable_at, p.is_test
    from public.saved_searches ss
    join public.profiles p on p.id = ss.user_id
    where ss.is_active
      and ss.target = 'cargo'
      and ss.notify_email
      and p.email_undeliverable_at is null
      and not p.is_test
  loop
    select * into m from public.saved_search_match(s.id, new.id);
    if m.reasons is null then continue; end if;

    insert into public.saved_search_matches
      (saved_search_id, cargo_listing_id, reasons, detour_km)
    values (s.id, new.id, m.reasons, m.detour_km)
    on conflict (saved_search_id, cargo_listing_id) do nothing;

    -- A digest leaves the row unnotified; the nightly job picks it up.
    if s.frequency = 'immediate' then
      insert into public.notification_outbox
        (channel, template, recipient_user_id, recipient_company_id, to_email,
         payload, dedupe_key)
      values (
        'email', 'saved_search_alert', s.user_id, s.company_id, s.user_email,
        jsonb_build_object(
          'search_name', s.name,
          'request_id', new.id,
          'title', new.title,
          'from_city', new.loading_city,
          'to_city', new.unloading_city,
          'reasons', array_to_string(m.reasons, E'\n· ')
        ),
        'saved_search:' || s.id || ':' || new.id
      )
      on conflict (dedupe_key) where dedupe_key is not null do nothing;

      update public.saved_search_matches
      set notified_at = now()
      where saved_search_id = s.id and cargo_listing_id = new.id;
    end if;
  end loop;

  return null;
end;
$fn$;

create trigger cargo_listings_queue_saved_search_alerts
  after update of status on public.cargo_listings
  for each row
  when (new.status = 'active' and old.status is distinct from 'active'
        and new.listing_kind = 'vehicul')
  execute function public.queue_saved_search_alerts();

create trigger cargo_listings_queue_saved_search_alerts_insert
  after insert on public.cargo_listings
  for each row
  when (new.status = 'active' and new.listing_kind = 'vehicul')
  execute function public.queue_saved_search_alerts();

/**
 * The daily digest.
 *
 * One e-mail per search per day, listing what turned up. Sending five
 * separate e-mails to somebody who asked for a digest is the failure
 * this exists to avoid, so the grouping happens here and the template
 * receives a list rather than a row.
 */
create or replace function public.queue_saved_search_digests(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  s record;
  v_lines text;
  v_count integer;
  v_sent integer := 0;
begin
  for s in
    select ss.*, p.email as user_email
    from public.saved_searches ss
    join public.profiles p on p.id = ss.user_id
    where ss.is_active
      and ss.frequency = 'daily'
      and ss.notify_email
      and p.email_undeliverable_at is null
      and not p.is_test
      and exists (
        select 1 from public.saved_search_matches m
        where m.saved_search_id = ss.id and m.notified_at is null
      )
  loop
    select
      string_agg(
        format('· %s (%s — %s)', l.title, l.loading_city, l.unloading_city),
        E'\n' order by m.created_at
      ),
      count(*)
    into v_lines, v_count
    from public.saved_search_matches m
    join public.cargo_listings l on l.id = m.cargo_listing_id
    where m.saved_search_id = s.id and m.notified_at is null;

    insert into public.notification_outbox
      (channel, template, recipient_user_id, recipient_company_id, to_email,
       payload, dedupe_key)
    values (
      'email', 'saved_search_digest', s.user_id, s.company_id, s.user_email,
      jsonb_build_object(
        'search_name', s.name,
        'count', v_count,
        'listings', v_lines
      ),
      'saved_search_digest:' || s.id || ':' || p_now::date
    )
    on conflict (dedupe_key) where dedupe_key is not null do nothing;

    update public.saved_search_matches
    set notified_at = p_now
    where saved_search_id = s.id and notified_at is null;

    update public.saved_searches set last_digest_at = p_now where id = s.id;
    v_sent := v_sent + 1;
  end loop;

  perform public.log_job_run('nightly-saved-search-digest', v_sent, 0, null);
  return v_sent;
end;
$fn$;

comment on function public.queue_saved_search_digests(timestamptz) is
  'One e-mail per daily search per day, listing everything that turned up. The dedupe key carries the date, so a second run on the same day sends nothing.';

revoke all on function public.queue_saved_search_digests(timestamptz) from public;
grant execute on function public.queue_saved_search_digests(timestamptz) to service_role;

/**
 * What a search has found lately, for the screen.
 */
create or replace function public.saved_search_activity(p_days integer default 7)
returns table (
  saved_search_id uuid,
  matches integer,
  last_match_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    m.saved_search_id,
    count(*)::integer,
    max(m.created_at)
  from public.saved_search_matches m
  join public.saved_searches s on s.id = m.saved_search_id
  where s.user_id = auth.uid()
    and m.created_at > now() - (greatest(1, least(p_days, 90)) || ' days')::interval
  group by m.saved_search_id;
$fn$;

grant execute on function public.saved_search_activity(integer) to authenticated;

-- ---------------------------------------------------------------------
-- 4. Reports get a life cycle
--
-- The table has been complete since phase 0 and no screen ever read it,
-- so a person reporting a problem from /verificare was writing into a
-- drawer. What is added is the shape a queue needs — who is looking at
-- it, what they wrote down, what they decided — and the one rule that
-- makes the decision reviewable: **a resolution needs a reason**.
-- ---------------------------------------------------------------------
alter table public.reports
  add column kind text not null default 'altul'
    check (kind in ('firma', 'anunt', 'mesaj', 'altul')),
  add column cargo_listing_id uuid references public.cargo_listings (id) on delete set null,
  add column assigned_to uuid references public.profiles (id) on delete set null,
  add column internal_notes text,
  add column resolved_at timestamptz,
  add column reporter_notified_at timestamptz;

-- 'open' and 'investigating' were the phase-0 names and stay in the
-- check constraint; the screen shows them as „nou" and „în lucru".
alter table public.reports drop constraint if exists reports_status_check;
alter table public.reports add constraint reports_status_check
  check (status in ('open', 'investigating', 'resolved', 'dismissed'));

comment on column public.reports.kind is
  'What is being reported. „mesaj" is in the list because the schema has conversations; nothing writes it yet, and the screen says so rather than pretending.';
comment on column public.reports.internal_notes is
  'What the team wrote down while looking. Never shown to the reporter — the resolution is.';

create index reports_assigned_idx on public.reports (assigned_to, status)
  where assigned_to is not null;

/**
 * Taking a report, and putting it down.
 *
 * One function for the whole life cycle, because the alternative is four
 * that each forget a different half of it. Every transition is audited;
 * closing one needs a written resolution, and that resolution is what
 * the reporter is told — so it is written for them, not for us.
 */
create or replace function public.handle_report(
  p_report_id uuid,
  p_status text,
  p_resolution text default null,
  p_internal_notes text default null,
  p_assign_to_me boolean default false
)
returns public.reports
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.reports;
  v_after public.reports;
  v_email text;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate gestiona sesizările' using errcode = '42501';
  end if;
  if p_status not in ('open', 'investigating', 'resolved', 'dismissed') then
    raise exception 'Stare necunoscută pentru o sesizare: %', p_status using errcode = '22023';
  end if;

  select * into v_before from public.reports where id = p_report_id;
  if v_before.id is null then
    raise exception 'Sesizarea nu există' using errcode = 'P0002';
  end if;

  -- Closing one is a decision somebody will be told about, so it needs a
  -- sentence. „Rezolvat" with no explanation is the answer that makes
  -- people stop reporting things.
  if p_status in ('resolved', 'dismissed')
     and coalesce(trim(p_resolution), '') = '' then
    raise exception 'Scrie ce ai decis și de ce. Textul ăsta ajunge la cel care a sesizat.'
      using errcode = '22023';
  end if;

  update public.reports
  set status = p_status,
      resolution = coalesce(nullif(trim(p_resolution), ''), resolution),
      internal_notes = coalesce(nullif(trim(p_internal_notes), ''), internal_notes),
      assigned_to = case when p_assign_to_me then auth.uid() else assigned_to end,
      handled_by = case when p_status in ('resolved', 'dismissed') then auth.uid() else handled_by end,
      resolved_at = case when p_status in ('resolved', 'dismissed') then now() else null end
  where id = p_report_id
  returning * into v_after;

  perform public.write_audit('report.' || p_status, 'reports', p_report_id,
                             to_jsonb(v_before), to_jsonb(v_after),
                             nullif(trim(p_resolution), ''));

  -- Tell the person who reported it, once, and only about a decision.
  if p_status in ('resolved', 'dismissed') and v_before.reporter_notified_at is null then
    select p.email into v_email
    from public.profiles p
    where p.id = v_after.reporter_user_id
      and p.email_undeliverable_at is null
      and not p.is_test;

    if v_email is not null then
      insert into public.notification_outbox
        (channel, template, recipient_user_id, to_email, payload, dedupe_key)
      values (
        'email', 'report_closed', v_after.reporter_user_id, v_email,
        jsonb_build_object(
          'outcome', case when p_status = 'resolved' then 'rezolvată' else 'închisă' end,
          'resolution', v_after.resolution
        ),
        'report_closed:' || p_report_id
      )
      on conflict (dedupe_key) where dedupe_key is not null do nothing;

      update public.reports set reporter_notified_at = now() where id = p_report_id
      returning * into v_after;
    end if;
  end if;

  return v_after;
end;
$fn$;

grant execute on function public.handle_report(uuid, text, text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Reading the audit log, and finding a person to make staff
-- ---------------------------------------------------------------------

/**
 * The audit log, filtered, for the screen.
 *
 * Read-only by construction: there is no counterpart that writes, and
 * the table's own policies have allowed nobody to write since phase 0.
 * The actor's name is joined in because an id is not an answer to „cine".
 */
create or replace function public.audit_entries(
  p_actor uuid default null,
  p_action text default null,
  p_entity text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id bigint,
  created_at timestamptz,
  actor_user_id uuid,
  actor_name text,
  actor_role text,
  action text,
  entity text,
  entity_id uuid,
  before jsonb,
  after jsonb,
  reason text,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate citi jurnalul' using errcode = '42501';
  end if;

  return query
  with filtered as (
    select a.*
    from public.audit_log a
    where (p_actor is null or a.actor_user_id = p_actor)
      and (p_action is null or a.action like p_action || '%')
      and (p_entity is null or a.entity = p_entity)
      and (p_from is null or a.created_at >= p_from)
      and (p_to is null or a.created_at < p_to)
  )
  select
    f.id, f.created_at, f.actor_user_id,
    p.full_name, f.actor_role, f.action, f.entity, f.entity_id,
    f.before, f.after, f.reason,
    count(*) over ()
  from filtered f
  left join public.profiles p on p.id = f.actor_user_id
  order by f.created_at desc, f.id desc
  limit greatest(1, least(coalesce(p_limit, 50), 500))
  offset greatest(0, coalesce(p_offset, 0));
end;
$fn$;

grant execute on function public.audit_entries(uuid, text, text, timestamptz, timestamptz, integer, integer)
  to authenticated;

/** The distinct actions and entities present, so the filters are not free text. */
create or replace function public.audit_facets()
returns table (kind text, value text, occurrences bigint)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate citi jurnalul' using errcode = '42501';
  end if;

  return query
  select 'action'::text, split_part(a.action, '.', 1), count(*)
  from public.audit_log a group by 2
  union all
  select 'entity'::text, a.entity, count(*)
  from public.audit_log a group by 2
  order by 1, 3 desc;
end;
$fn$;

grant execute on function public.audit_facets() to authenticated;

/**
 * Who works here, with names.
 *
 * `platform_staff` is readable by staff already; this adds the names and
 * who granted it, which is the part that makes the screen answer „since
 * when, and on whose say-so".
 */
create or replace function public.staff_members()
returns table (
  user_id uuid,
  full_name text,
  email text,
  role public.staff_role,
  granted_at timestamptz,
  granted_by uuid,
  granted_by_name text
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate vedea echipa' using errcode = '42501';
  end if;

  return query
  select s.user_id, p.full_name, p.email, s.role, s.created_at, s.granted_by, g.full_name
  from public.platform_staff s
  join public.profiles p on p.id = s.user_id
  left join public.profiles g on g.id = s.granted_by
  order by s.created_at;
end;
$fn$;

grant execute on function public.staff_members() to authenticated;

/**
 * Finding the account behind an address, so staff can be added by e-mail.
 *
 * Staff-only, and it answers about one address at a time: a function
 * that took a pattern would be a way to read the user table.
 */
create or replace function public.find_account_by_email(p_email text)
returns table (user_id uuid, full_name text, email text, email_confirmed boolean)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate căuta un cont' using errcode = '42501';
  end if;
  if coalesce(trim(p_email), '') = '' then
    raise exception 'Scrie adresa de e-mail' using errcode = '22023';
  end if;

  return query
  select p.id, p.full_name, p.email, p.email_confirmed_at is not null
  from public.profiles p
  where lower(p.email) = lower(trim(p_email));
end;
$fn$;

grant execute on function public.find_account_by_email(text) to authenticated;

-- ---------------------------------------------------------------------
-- 6. What the board holds, per category
--
-- The competitor's category counters are the most-copied thing on their
-- site, and the reason they work is that they are real. So is this one:
-- published requests, over a window the team sets, with our own accounts
-- out of it. No estimates, no rounding up, no „+".
-- ---------------------------------------------------------------------
create or replace function public.category_counts(p_days integer default null)
returns table (category public.cargo_category, label text, requests integer)
language sql
stable
security definer
set search_path = public
as $fn$
  with window_days as (
    select coalesce(
      p_days,
      (select m.category_window_days from public.matching_settings m where m.id),
      90
    ) as days
  )
  select
    d.category,
    public.cargo_category_label(d.category),
    count(*)::integer
  from public.cargo_listings l
  join public.cargo_vehicle_details d on d.cargo_listing_id = l.id
  join public.profiles p on p.id = l.posted_by
  left join public.companies co on co.id = l.company_id
  cross join window_days w
  where l.published_at is not null
    and l.published_at > now() - (w.days || ' days')::interval
    and l.listing_kind = 'vehicul'
    and l.status not in ('draft', 'cancelled')
    and not p.is_test
    and not coalesce(co.is_test, false)
  group by d.category
  having count(*) > 0
  order by count(*) desc, d.category;
$fn$;

comment on function public.category_counts(integer) is
  'Published requests per vehicle category over the configured window, our own accounts excluded. Categories with nothing in them are absent rather than zero: a row of zeroes is a claim that the board covers something it does not.';

grant execute on function public.category_counts(integer) to anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. The tenth scheduled job, and the screen that watches it
-- ---------------------------------------------------------------------
do $cron$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise warning 'pg_cron nu este disponibil, deci digestul zilnic al alertelor nu este programat. Vezi docs/configurare-externa.md.';
    return;
  end if;
  perform cron.schedule('nightly-saved-search-digest', '45 6 * * *',
                        'select public.queue_saved_search_digests();');
exception
  when duplicate_object or unique_violation then
    raise notice 'Jobul există deja; îl las cum este.';
end;
$cron$;

-- `job_health` reproduced from 20260920100000 with the tenth job added to
-- both of its lists — the main query and the fallback that runs where
-- pg_cron is absent. The JOB block in rls_test.sql asserts the two lists
-- match what is scheduled, so a job added to one and not the other fails
-- the suite rather than going quietly unwatched.
create or replace function public.job_health(p_now timestamptz default now())
returns table (
  job text,
  scheduled boolean,
  last_run timestamptz,
  last_status text,
  hours_since numeric,
  is_late boolean
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
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
      ('hourly-listing-cleanup', 3.0),
      ('hourly-push-cleanup', 3.0),
      ('nightly-compliance-sweep', 36.0),
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
      ('hourly-listing-cleanup', 3.0), ('hourly-push-cleanup', 3.0),
      ('nightly-compliance-sweep', 36.0), ('nightly-expiry-reminders', 36.0),
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
$fn$;

comment on function public.job_health is
  'Per scheduled job: is it scheduled, when did it last run, how did it end, and is it late. Ten jobs since 20260921100000 — the saved-search digest joined the list.';
