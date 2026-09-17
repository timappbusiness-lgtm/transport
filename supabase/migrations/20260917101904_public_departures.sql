-- =====================================================================
-- 0023 - Departures become publicly visible, at city level
--
-- A product decision that replaces the phase 0 rule "anon sees nothing on
-- departures". A transport exchange nobody can look at does not get used:
-- a person with a car to move has to see that routes exist before deciding
-- whether to make an account.
--
-- What changes is *what* is public, not whether the guards still hold:
--
--   v_departures         unchanged. Still authenticated-only, still carries
--                        company_id. The carrier-facing view.
--   v_departures_public  new. anon and authenticated. City, county and
--                        country, never an address. No company, no vehicle,
--                        no plate, no contact, no posted_by.
--
-- The company name and its verified badge are deliberately absent here even
-- for signed-in users: the page reads those from v_companies_public with
-- the company id from v_departures, which anon cannot reach. That keeps one
-- rule — "who is driving is not public" — in one place.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Which vehicles a departure will take
--
-- A platform that only carries motorcycles and one that takes a microbus
-- are different offers, and until now the board could not say which was
-- which. Defaulting to the four categories the launch market actually
-- moves keeps every existing row meaningful.
-- ---------------------------------------------------------------------
alter table public.truck_listings
  add column accepted_vehicle_types public.cargo_category[] not null
    default '{autoturism,autoutilitara,motocicleta,microbuz}'::public.cargo_category[];

comment on column public.truck_listings.accepted_vehicle_types is
  'Cargo categories this departure will carry. Shown on the public board so a person with a motorcycle does not write to a carrier who only moves cars.';

-- coalesce, not a bare array_length: on an empty array array_length
-- returns NULL rather than 0, and a CHECK that evaluates to NULL passes.
-- Without this an empty list is accepted and the board shows a departure
-- that carries nothing.
alter table public.truck_listings
  add constraint truck_listings_accepted_types_ck
    check (coalesce(array_length(accepted_vehicle_types, 1), 0) >= 1);

create index truck_listings_accepted_types_idx
  on public.truck_listings using gin (accepted_vehicle_types)
  where status = 'active';

-- ---------------------------------------------------------------------
-- The public board
--
-- security_invoker is off (the default), so this reads truck_listings past
-- RLS on purpose — that is the whole point of a public projection. The
-- protection is the column list plus the WHERE clause, both of which are
-- pinned by tests in rls_test.sql.
-- ---------------------------------------------------------------------
create view public.v_departures_public as
select
  t.id as truck_listing_id,
  t.direction,

  -- Where, to the city. from_lat/from_lng and any address stay behind.
  t.from_country,
  t.from_county,
  t.from_city,
  t.to_country,
  t.to_county,
  t.to_city,
  t.waypoints,

  t.available_from,
  t.available_to,

  t.service_types,
  t.accepted_vehicle_types,
  t.platform_slots_total,
  coalesce(b.taken, 0)::integer as slots_taken,
  greatest(coalesce(t.platform_slots_total, 0) - coalesce(b.taken, 0), 0)::integer as slots_free,

  t.price_indicative,
  t.currency,
  t.published_at
from public.truck_listings t
left join lateral (
  select sum(bb.slots) as taken
  from public.departure_bookings bb
  where bb.truck_listing_id = t.id
    and (bb.status = 'confirmed' or (bb.status = 'reserved' and bb.expires_at > now()))
) b on true
where t.status = 'active'
  -- A departure whose window has passed is not an offer any more, and a
  -- board full of last month's routes reads as an abandoned site.
  and coalesce(t.available_to, t.available_from) >= current_date;

comment on view public.v_departures_public is
  'Active departures at city level for anon and authenticated. No company, vehicle, plate, contact or exact address: those live in v_departures, which is authenticated-only.';

revoke all on public.v_departures_public from public;
grant select on public.v_departures_public to anon, authenticated;

-- ---------------------------------------------------------------------
-- "Tell me when a route appears"
--
-- saved_searches already exists (migration 20260916120300) with the right
-- shape — user_id, target, filters, notify_email, is_active — and its own
-- RLS policies. The board reuses it with target = 'truck'. Only one thing
-- was missing: nothing stopped a client rewriting the job's bookkeeping.
--
-- last_notified_at is how the nightly alert job knows what it has already
-- sent. A client that could reset it could make the job send the same
-- alert over and over; one that could set it far in the future could
-- silence somebody else's alerts.
-- ---------------------------------------------------------------------
create or replace function public.guard_saved_search_write()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- The row belongs to whoever is asking, whatever the payload claims.
    new.user_id := auth.uid();
    new.last_notified_at := null;
    return new;
  end if;

  if new.user_id is distinct from old.user_id then
    raise exception 'Căutarea salvată nu poate fi mutată la alt utilizator'
      using errcode = '42501';
  end if;

  if new.last_notified_at is distinct from old.last_notified_at then
    raise exception 'Data ultimei notificări este gestionată de sistem'
      using errcode = '42501';
  end if;

  return new;
end;
$fn$;

create trigger saved_searches_guard_write
  before insert or update on public.saved_searches
  for each row execute function public.guard_saved_search_write();

-- Trigger function: granted to nobody, it runs as part of the write it
-- guards. Restated here because migration 20260916130300 revoked default
-- execute privileges and a reader should not have to go and check.
revoke all on function public.guard_saved_search_write() from public, anon, authenticated, service_role;
