-- =====================================================================
-- 0028 - „N transportatori verificați circulă pe această rută"
--
-- The period comes out of the sentence, and therefore out of the count.
--
-- Migration 20260918190000 made „în perioada aleasă" true by requiring an
-- announced route overlapping the loading window. That was honest and it
-- was nearly always zero: a verified carrier who has not yet posted a
-- route has not told anybody when it travels, and at this stage of the
-- marketplace most of them have not. A number that is almost always zero
-- teaches a client that the answer is „nobody", which is a worse lie than
-- the one the date requirement was there to prevent.
--
-- So the sentence loses two words and the count loses the calendar. What
-- is left is what we can actually stand behind: a verified, non-suspended
-- carrier whose stated coverage includes this route, which carries this
-- category of vehicle, and which has the equipment the job needs. That is
-- „circulă pe această rută" — a statement about where a firm works, not
-- about its diary.
--
-- The dates go from the signatures rather than being ignored inside them.
-- An argument a function takes and does nothing with is a promise to the
-- next reader that it matters.
-- =====================================================================

drop function if exists public.count_matching_carriers_on_route(
  text, text, text, text, date, date, public.cargo_category, boolean,
  public.service_type, uuid);

create or replace function public.count_matching_carriers_on_route(
  p_loading_country text,
  p_loading_county text,
  p_unloading_country text,
  p_unloading_county text,
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
          p_category, p_needs_winch, p_service_type, p_posted_by_company_id);
$fn$;

comment on function public.count_matching_carriers_on_route(text, text, text, text, public.cargo_category, boolean, public.service_type, uuid) is
  'How many verified, non-suspended carriers cover this route, carry this category and have the equipment it needs. A count, never a list: no names and no contacts leave this function.';

-- ---------------------------------------------------------------------
-- The count for a request that exists, for the person who owns it
-- ---------------------------------------------------------------------
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
    d.category, coalesce(d.needs_winch, false), l.service_type, l.company_id);
end;
$fn$;

-- ---------------------------------------------------------------------
-- The preview in step 4
--
-- Still rate limited, and now for the only reason that was ever the real
-- one: it takes a free-form route, and a route askable in a loop is a
-- carrier base mappable in a loop. Losing the dates makes each answer
-- cheaper to obtain, not less worth protecting.
-- ---------------------------------------------------------------------
drop function if exists public.preview_matching_carriers(
  text, text, text, text, date, date, public.cargo_category, boolean,
  public.service_type, uuid);

create or replace function public.preview_matching_carriers(
  p_loading_country text,
  p_loading_county text,
  p_unloading_country text,
  p_unloading_county text,
  p_category public.cargo_category default null,
  p_needs_winch boolean default false,
  p_service_type public.service_type default 'pe_sens',
  p_company_id uuid default null
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
  -- because it will not be counted once the request exists. Which firm
  -- that is comes from the caller — the active company lives in a cookie
  -- the database has never seen — and is then confirmed against
  -- membership, so the worst a wrong value can do is nothing.
  if p_company_id is not null and exists (
    select 1 from public.company_members cm
    where cm.company_id = p_company_id and cm.user_id = auth.uid()
  ) then
    v_company := p_company_id;
  end if;

  return public.count_matching_carriers_on_route(
    p_loading_country, p_loading_county, p_unloading_country, p_unloading_county,
    p_category, coalesce(p_needs_winch, false),
    coalesce(p_service_type, 'pe_sens'), v_company);
end;
$fn$;

comment on function public.preview_matching_carriers(text, text, text, text, public.cargo_category, boolean, public.service_type, uuid) is
  'The same count, before the request exists. Rate limited to 30 an hour per person: it takes a free-form route, and a route askable in a loop is a carrier base mappable in a loop.';

grant execute on function public.count_matching_carriers(uuid) to authenticated;
grant execute on function public.preview_matching_carriers(
  text, text, text, text, public.cargo_category, boolean, public.service_type, uuid
) to authenticated;
