-- =====================================================================
-- 0027 - „N transportatori verificați circulă pe această rută"
--
-- A number shown to somebody who has just published a request, and
-- therefore a number that has to be true. Two things make it true.
--
-- **The rule is the one that already decides who gets an e-mail.**
-- `company_matches_request` has been the single definition of "does this
-- firm carry this request" since migration 20260918090000. It takes a
-- listing id, and the preview in step 4 of the form has no listing yet —
-- so its body moves into `company_matches_route`, which takes the route
-- itself, and `company_matches_request` becomes the same function called
-- with a row. One definition, two callers, no second copy of the rules
-- to drift.
--
-- **The period is counted, not claimed.** The sentence says „în perioada
-- aleasă", and the matching rule has never looked at a date in its life:
-- it is about coverage, category and equipment. So the count adds the
-- one thing the sentence promises and the rule does not — a route the
-- firm has actually announced, whose availability window overlaps the
-- loading window asked for.
--
-- That makes the number smaller, and at the start it will often be zero,
-- because a verified carrier who has not posted a route has not told
-- anybody when it travels. Zero has its own sentence and its own link to
-- „Trasee disponibile", which is the honest version of a marketplace
-- that has the carriers but not yet their calendars. The alternative —
-- counting coverage and printing „în perioada aleasă" over it — is a
-- number that is bigger and means nothing.
--
-- Never names, never contacts, never a list. The count is the whole
-- answer, and the preview is rate limited so it cannot be turned into a
-- way of mapping who works where.
-- =====================================================================

create or replace function public.company_matches_route(
  p_company_id uuid,
  p_loading_country text,
  p_loading_county text,
  p_unloading_country text,
  p_unloading_county text,
  p_category public.cargo_category default null,
  p_needs_winch boolean default false,
  p_service_type public.service_type default 'pe_sens',
  p_posted_by_company_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  c public.companies;
  v_domestic boolean;
begin
  select * into c from public.companies where id = p_company_id;
  if c.id is null or p_loading_country is null or p_unloading_country is null then
    return false;
  end if;

  -- Its own request is not a match; it is the thing it just posted.
  if p_posted_by_company_id is not null and p_posted_by_company_id = c.id then
    return false;
  end if;

  v_domestic := upper(p_loading_country) = upper(p_unloading_country);

  -- Coverage. A scope is a ceiling, not a label: national includes every
  -- county, international includes the whole of national.
  if v_domestic and upper(p_loading_country) = 'RO' then
    if c.coverage_scope = 'judetean' then
      -- An unknown county cannot be proved to be inside the coverage, and
      -- a county-only carrier is exactly the firm that should not be sent
      -- a job on the other side of the country on a guess.
      if p_loading_county is null or p_unloading_county is null then
        return false;
      end if;
      if not (upper(p_loading_county) = any (c.coverage_counties)
              and upper(p_unloading_county) = any (c.coverage_counties)) then
        return false;
      end if;
    end if;
  elsif v_domestic then
    -- Domestic, but inside another country: only a firm that named that
    -- country carries it.
    if c.coverage_scope <> 'international'
       or not (upper(p_loading_country) = any (c.coverage_countries)) then
      return false;
    end if;
  else
    if c.coverage_scope <> 'international' then
      return false;
    end if;
    -- Romania is always one of the two ends a Romanian carrier serves, so
    -- it never has to be ticked.
    if not (upper(p_loading_country) in ('RO')
            or upper(p_loading_country) = any (c.coverage_countries)) then
      return false;
    end if;
    if not (upper(p_unloading_country) in ('RO')
            or upper(p_unloading_country) = any (c.coverage_countries)) then
      return false;
    end if;
  end if;

  -- What it carries. An empty list is "has not said", which is read as
  -- "everything": a firm that never opened the tab should not silently
  -- stop receiving work.
  if p_category is not null
     and coalesce(array_length(c.vehicle_types_accepted, 1), 0) > 0
     and not (p_category = any (c.vehicle_types_accepted)) then
    return false;
  end if;

  -- A forwarder subcontracts the kit, so the two rules below are about
  -- the vehicle that turns up, and a forwarder is not it.
  if c.company_type in ('transport', 'both') then
    -- The one hard capability rule in this marketplace: a car that does
    -- not roll needs a winch, and a firm without one cannot load it.
    if coalesce(p_needs_winch, false) and not ('troliu' = any (c.equipment)) then
      return false;
    end if;

    -- Recovery is a different job from carriage. Same "empty means has
    -- not said" reading as above.
    if p_service_type = 'tractare'
       and coalesce(array_length(c.services, 1), 0) > 0
       and not ('tractare' = any (c.services)) then
      return false;
    end if;
  end if;

  return true;
end;
$fn$;

comment on function public.company_matches_route(uuid, text, text, text, text, public.cargo_category, boolean, public.service_type, uuid) is
  'Whether a company carries a route: coverage, category, winch and recovery. A filter, never a score. The body company_matches_request used to hold.';

-- The original signature, unchanged for its callers: the alert trigger,
-- and now the counts below.
create or replace function public.company_matches_request(p_company_id uuid, p_listing_id uuid)
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
  if l.id is null then
    return false;
  end if;
  select * into d from public.cargo_vehicle_details where cargo_listing_id = p_listing_id;

  return public.company_matches_route(
    p_company_id,
    l.loading_country, l.loading_county,
    l.unloading_country, l.unloading_county,
    d.category,
    coalesce(d.needs_winch, false),
    l.service_type,
    l.company_id);
end;
$fn$;

comment on function public.company_matches_request(uuid, uuid) is
  'Whether a company carries a given request. A thin call of company_matches_route with the listing''s own row, so the rule lives in exactly one place.';

-- ---------------------------------------------------------------------
-- Who is on this route in these days
--
-- One place for the count, so the success page, the request detail and
-- the preview in the form can never disagree with one another.
--
-- „Verificat" is `verification_status = 'verified'` and not suspended,
-- which is the same definition the public directory uses. „Circulă în
-- perioada aleasă" is an announced route whose availability window
-- overlaps the loading window — the only evidence we have that a firm
-- travels then, as opposed to travels at all.
-- ---------------------------------------------------------------------
create or replace function public.count_matching_carriers_on_route(
  p_loading_country text,
  p_loading_county text,
  p_unloading_country text,
  p_unloading_county text,
  p_loading_from date,
  p_loading_to date default null,
  p_category public.cargo_category default null,
  p_needs_winch boolean default false,
  p_service_type public.service_type default 'pe_sens',
  p_posted_by_company_id uuid default null
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
    and c.deletion_scheduled_at is null
    and c.company_type in ('transport', 'both')
    and public.company_matches_route(
          c.id, p_loading_country, p_loading_county,
          p_unloading_country, p_unloading_county,
          p_category, p_needs_winch, p_service_type, p_posted_by_company_id)
    and exists (
      select 1
      from public.truck_listings t
      where t.company_id = c.id
        and t.status in ('active', 'offers_received')
        -- Two windows overlap when each starts before the other ends. A
        -- route with no end date is one day long, not open-ended: a
        -- carrier who said "I leave on the 4th" has not said it is
        -- available all month.
        and t.available_from <= coalesce(p_loading_to, p_loading_from)
        and coalesce(t.available_to, t.available_from) >= p_loading_from
    );
$fn$;

comment on function public.count_matching_carriers_on_route(text, text, text, text, date, date, public.cargo_category, boolean, public.service_type, uuid) is
  'How many verified, non-suspended carriers cover this route and have an announced route overlapping these dates. A count, never a list: no names and no contacts leave this function.';

/**
 * The count for a request that exists, for the person who owns it.
 *
 * `can_edit_cargo_listing` is the same check the publish and cancel RPCs
 * use, so „owner only" means exactly what it means everywhere else. A
 * request somebody else posted answers nothing — the number is a
 * reassurance to its author, not a public statistic.
 */
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
    l.loading_from, l.loading_to,
    d.category, coalesce(d.needs_winch, false), l.service_type, l.company_id);
end;
$fn$;

-- ---------------------------------------------------------------------
-- The preview in step 4, and why it is counted
--
-- Step 4 has no request yet — the row is written when the form is
-- submitted — so the preview has to take the route as arguments. That
-- makes it the one function here somebody could call in a loop, and a
-- loop over counties and dates is a map of which firms work where. Which
-- is why it is counted per person per hour, and why nothing but a number
-- ever comes back.
-- ---------------------------------------------------------------------
create table public.carrier_count_probes (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

comment on table public.carrier_count_probes is
  'One row per preview of the carrier count. Exists only to rate limit it: the preview takes a free-form route, and a route somebody can ask about in a loop is a carrier base somebody can map.';

create index carrier_count_probes_user_idx
  on public.carrier_count_probes (user_id, created_at desc);

alter table public.carrier_count_probes enable row level security;
revoke all on public.carrier_count_probes from anon, authenticated;

create or replace function public.preview_matching_carriers(
  p_loading_country text,
  p_loading_county text,
  p_unloading_country text,
  p_unloading_county text,
  p_loading_from date,
  p_loading_to date default null,
  p_category public.cargo_category default null,
  p_needs_winch boolean default false,
  p_service_type public.service_type default 'pe_sens'
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
  if p_loading_from is null then
    raise exception 'Alege data încărcării' using errcode = '22023';
  end if;

  select count(*) into v_used
  from public.carrier_count_probes
  where user_id = auth.uid() and created_at > now() - interval '1 hour';

  if v_used >= v_cap then
    raise exception 'Ai verificat prea multe rute în ultima oră. Încearcă din nou mai târziu.'
      using errcode = '22023';
  end if;

  insert into public.carrier_count_probes (user_id) values (auth.uid());

  -- A dispatcher previewing for their own firm should not be counted a
  -- match for their own request once it exists, so the exclusion is the
  -- same here as it will be then.
  select cm.company_id into v_company
  from public.company_members cm where cm.user_id = auth.uid() limit 1;

  return public.count_matching_carriers_on_route(
    p_loading_country, p_loading_county, p_unloading_country, p_unloading_county,
    p_loading_from, p_loading_to, p_category, coalesce(p_needs_winch, false),
    coalesce(p_service_type, 'pe_sens'), v_company);
end;
$fn$;

comment on function public.preview_matching_carriers(text, text, text, text, date, date, public.cargo_category, boolean, public.service_type) is
  'The same count, before the request exists. Rate limited to 30 an hour per person: it takes a free-form route, and a route askable in a loop is a carrier base mappable in a loop.';

-- ---------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------
grant execute on function public.count_matching_carriers(uuid) to authenticated;
grant execute on function public.preview_matching_carriers(
  text, text, text, text, date, date, public.cargo_category, boolean, public.service_type
) to authenticated;

-- The route-level count and the matching rule stay internal: they take a
-- company id and would answer „does this named firm carry this route",
-- which is the question the whole file exists not to answer.
