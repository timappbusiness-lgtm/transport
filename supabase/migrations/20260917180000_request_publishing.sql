-- =====================================================================
-- Phase 2 - Requests: creating, publishing, withdrawing and reopening a
-- transport request.
--
-- `cargo_listings` has existed since phase 0, with policies that would let
-- a signed-in person insert one. Nothing ever did: there was no screen, and
-- an insert from a browser could not be atomic anyway. A request is three
-- rows - the listing, the vehicle details and the contact - and
-- `guard_cargo_details_present` refuses to publish a listing whose details
-- table is empty, so a client doing it in three round trips would leave a
-- half-written request behind on the first failure.
--
-- Hence one RPC that writes all three, and three narrow ones for the
-- transitions. Nothing here lets a caller set `status`, `published_at`,
-- `expires_at`, `views_count` or `is_promoted` by hand; those belong to the
-- database, and the table grants still do not include them.
--
-- It also finishes what 20260917090000 started: that migration added
-- `carrier_selected` and `delivered` to the enum and left a note saying the
-- old `assigned` and `completed` are "replaced in use in phase 2". This is
-- phase 2, and `confirm_departure_booking` is live today, so a booking
-- confirmed this afternoon still writes `assigned`.
-- =====================================================================

-- ---------------------------------------------------------------------
-- `assigned` becomes `carrier_selected`, in the two functions that write it
--
-- Both live in migrations that are merged, so they cannot be edited, and
-- both are long: `accept_offer` is 180 lines and
-- `confirm_departure_booking` 85. Copying them here to change one word in
-- each would leave two transcriptions of somebody else's function to keep
-- in step, and phases 5 and 6 rewrite them both anyway.
--
-- So the definition is read back from the catalogue and re-executed with
-- the one statement changed. `pg_get_functiondef` returns the whole CREATE
-- OR REPLACE, so SECURITY DEFINER, the search_path and the grants come
-- along; CREATE OR REPLACE keeps the owner and the ACL. The match is the
-- full assignment rather than the bare literal, so nothing else that
-- happens to contain the word can be caught by it, and the block asserts
-- afterwards that no function is left writing the old value - a silent
-- no-op here would be a status nobody has a label for.
--
-- `completed` needs none of this: no function writes it.
-- ---------------------------------------------------------------------
do $$
declare
  v_def text;
  v_new text;
  v_left integer;
begin
  for v_def in
    select pg_get_functiondef(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('accept_offer', 'confirm_departure_booking')
  loop
    v_new := replace(v_def, 'set status = ''assigned''', 'set status = ''carrier_selected''');
    if v_new <> v_def then
      execute v_new;
    end if;
  end loop;

  select count(*) into v_left
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosrc like '%''assigned''%';

  if v_left > 0 then
    raise exception '% function(s) still write the assigned status', v_left;
  end if;
end $$;

-- The rows that reached those statuses before the rename. Neither trigger
-- on either table looks at anything but `active`, so this moves the status
-- and nothing else.
update public.cargo_listings set status = 'carrier_selected' where status = 'assigned';
update public.truck_listings set status = 'carrier_selected' where status = 'assigned';
update public.cargo_listings set status = 'delivered' where status = 'completed';
update public.truck_listings set status = 'delivered' where status = 'completed';

-- ---------------------------------------------------------------------
-- The public feed becomes the public board.
--
-- Seven columns appended - a view can only grow at the end, which is why
-- the original thirteen are repeated verbatim. What is added is what a
-- carrier filters on and nothing else: when it loads, how heavy it is,
-- whether it needs a winch, whether there are photographs to price from,
-- and whether it stays inside the country. Still no notes, no price, no
-- contact and nobody's name - those need a session, and the contact needs
-- a plan.
-- ---------------------------------------------------------------------
create or replace view public.v_requests_public as
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

  c.published_at,

  -- Appended for the board.
  c.board,
  c.loading_from,
  c.loading_to,
  c.weight_kg,
  d.needs_winch,
  -- A count, not the paths: a public bucket plus a path is the photograph
  -- itself, and the board is not where a stranger's number plate is shown.
  coalesce(array_length(c.photo_paths, 1), 0) as photo_count,
  c.loading_country = c.unloading_country as is_domestic
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

-- The board sorts by date and filters by category; the feed's
-- published_at index does not serve either.
create index if not exists cargo_listings_active_loading_idx
  on public.cargo_listings (loading_from)
  where status = 'active';

-- ---------------------------------------------------------------------
-- The title
--
-- `cargo_listings.title` is NOT NULL and every card shows it, so it is
-- derived rather than typed. A field asking a person to name their own
-- request produces "transport" on half the board and a phone number on
-- some of the rest.
-- ---------------------------------------------------------------------
create or replace function public.cargo_request_title(
  p_make text,
  p_model text,
  p_year integer,
  p_from_city text,
  p_to_city text
)
returns text
language sql
immutable
set search_path = public, pg_temp
as $fn$
  select trim(both ' ' from concat_ws(' ',
           nullif(trim(p_make), ''),
           nullif(trim(p_model), ''),
           p_year::text))
         || ' · ' || trim(p_from_city) || ' → ' || trim(p_to_city);
$fn$;

comment on function public.cargo_request_title(text, text, integer, text, text) is
  'The heading of a request: the vehicle, then the route. Derived so no card can be titled by whatever somebody typed.';

-- ---------------------------------------------------------------------
-- create_cargo_request
--
-- One transaction for the listing, the vehicle and the contact. The caller
-- is auth.uid() and never a parameter; the company, when there is one, is
-- checked against membership rather than believed.
-- ---------------------------------------------------------------------
create or replace function public.create_cargo_request(
  p_from_city text,
  p_to_city text,
  p_loading_from date,
  p_category cargo_category,
  p_make text,
  p_model text,
  p_year integer,
  p_is_running boolean,
  p_service_type service_type default 'pe_sens',
  p_company_id uuid default null,
  p_from_country text default 'RO',
  p_from_county text default null,
  p_to_country text default 'RO',
  p_to_county text default null,
  p_loading_to date default null,
  p_wheels_turn boolean default true,
  p_steering_works boolean default true,
  p_has_keys boolean default true,
  p_is_damaged boolean default false,
  p_damage_notes text default null,
  p_weight_kg integer default null,
  p_description text default null,
  p_contact_name text default null,
  p_contact_phone text default null,
  p_contact_email text default null,
  p_photo_paths text[] default '{}',
  p_publish boolean default true
)
returns table (request_id uuid, request_status public.listing_status, publish_error text)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_user uuid := auth.uid();
  v_profile public.profiles;
  v_company public.companies;
  v_board listing_board;
  v_id uuid;
  v_name text;
  v_phone text;
  v_email text;
  v_row public.cargo_listings;
  v_status public.listing_status;
  v_publish_error text;
begin
  if v_user is null then
    raise exception 'Autentificare necesară' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where id = v_user;

  -- Who it is posted as. A company id that the caller is not a member of is
  -- refused rather than ignored: silently posting it as an individual would
  -- put somebody's work on the wrong board.
  if p_company_id is null then
    v_board := 'retur';
  else
    if not public.is_company_member(p_company_id) then
      raise exception 'Nu faci parte din firma pentru care publici cererea'
        using errcode = '42501';
    end if;
    v_board := 'curse';
  end if;

  if coalesce(trim(p_from_city), '') = '' then
    raise exception 'Scrie orașul de plecare' using errcode = '22023';
  end if;
  if coalesce(trim(p_to_city), '') = '' then
    raise exception 'Scrie orașul de destinație' using errcode = '22023';
  end if;
  if coalesce(trim(p_make), '') = '' or coalesce(trim(p_model), '') = '' then
    raise exception 'Scrie marca și modelul vehiculului' using errcode = '22023';
  end if;
  if p_year is null or p_year < 1900 or p_year > extract(year from current_date)::integer + 1 then
    raise exception 'Anul de fabricație nu pare corect' using errcode = '22023';
  end if;
  if p_loading_from is null or p_loading_from < current_date then
    raise exception 'Alege o dată de încărcare de azi înainte' using errcode = '22023';
  end if;
  if p_loading_to is not null and p_loading_to < p_loading_from then
    raise exception 'Sfârșitul intervalului este înaintea începutului' using errcode = '22023';
  end if;
  if p_weight_kg is not null and p_weight_kg <= 0 then
    raise exception 'Greutatea trebuie să fie un număr pozitiv' using errcode = '22023';
  end if;

  -- The contact is what a carrier spends a reveal on, so a request without
  -- one would cost somebody a contact and give them nothing. What is typed
  -- wins; after that a firm answers on its own number rather than on
  -- whichever dispatcher happened to post, and a private person on theirs.
  if p_company_id is not null then
    select * into v_company from public.companies where id = p_company_id;
  end if;

  v_name := coalesce(nullif(trim(p_contact_name), ''),
                     nullif(v_company.display_name, ''), nullif(v_company.legal_name, ''),
                     v_profile.full_name);
  v_phone := coalesce(nullif(trim(p_contact_phone), ''),
                      nullif(v_company.contact_phone, ''), v_profile.phone);
  v_email := coalesce(nullif(trim(p_contact_email), ''),
                      nullif(v_company.contact_email, ''), v_profile.email);
  if coalesce(v_phone, '') = '' then
    raise exception 'Lasă un număr de telefon la care te poate suna transportatorul'
      using errcode = '22023';
  end if;

  insert into public.cargo_listings (
    company_id, posted_by, board, listing_kind,
    title, description, service_type,
    loading_country, loading_county, loading_city, loading_from, loading_to,
    unloading_country, unloading_county, unloading_city,
    weight_kg, photo_paths, status
  ) values (
    p_company_id, v_user, v_board, 'vehicul',
    public.cargo_request_title(p_make, p_model, p_year, p_from_city, p_to_city),
    nullif(trim(p_description), ''), p_service_type,
    coalesce(nullif(trim(p_from_country), ''), 'RO'), nullif(trim(p_from_county), ''),
    trim(p_from_city), p_loading_from, p_loading_to,
    coalesce(nullif(trim(p_to_country), ''), 'RO'), nullif(trim(p_to_county), ''),
    trim(p_to_city),
    p_weight_kg, coalesce(p_photo_paths, '{}'), 'draft'
  )
  returning id into v_id;

  insert into public.cargo_vehicle_details (
    cargo_listing_id, category, make, model, year,
    is_running, wheels_turn, steering_works, has_keys,
    is_damaged, damage_notes, weight_kg
  ) values (
    v_id, p_category, trim(p_make), trim(p_model), p_year,
    p_is_running, p_wheels_turn, p_steering_works, p_has_keys,
    p_is_damaged, nullif(trim(p_damage_notes), ''), p_weight_kg
  );

  insert into public.listing_contacts (cargo_listing_id, contact_name, contact_phone, contact_email)
  values (v_id, v_name, v_phone, v_email);

  select * into v_row from public.cargo_listings where id = v_id;
  perform public.write_audit('request.created', 'cargo_listings', v_id, null, to_jsonb(v_row));

  -- Publishing can be refused for reasons that have nothing to do with what
  -- was typed: an unconfirmed phone number, a firm still in review. Losing
  -- the whole form to that would be the worst possible answer, so the
  -- publish runs in its own subtransaction and only it is rolled back. The
  -- caller gets the draft and the sentence explaining what is left to do.
  if p_publish then
    begin
      perform public.publish_cargo_request(v_id);
    exception when others then
      v_publish_error := sqlerrm;
    end;
  end if;

  select l.status into v_status from public.cargo_listings l where l.id = v_id;
  return query select v_id, v_status, v_publish_error;
end;
$fn$;

comment on function public.create_cargo_request is
  'Creates a transport request as a draft - listing, vehicle details and contact in one transaction - and publishes it when asked. The poster is auth.uid(); the company is checked against membership.';

-- ---------------------------------------------------------------------
-- publish_cargo_request
--
-- The gate itself is `guard_cargo_listing_publish`, which has been on the
-- table since phase 0: a verified phone for an individual, a company that
-- can act for a firm. This adds who may ask and from which statuses, and
-- writes the audit row.
-- ---------------------------------------------------------------------
create or replace function public.publish_cargo_request(p_id uuid)
returns public.listing_status
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.cargo_listings;
  v_after public.cargo_listings;
begin
  if auth.uid() is null then
    raise exception 'Autentificare necesară' using errcode = '42501';
  end if;

  select * into v_before from public.cargo_listings where id = p_id;
  if v_before.id is null then
    raise exception 'Cererea nu există' using errcode = 'P0002';
  end if;
  if not public.can_edit_cargo_listing(p_id) then
    raise exception 'Cererea nu îți aparține' using errcode = '42501';
  end if;

  if v_before.status = 'active' then
    return v_before.status;
  end if;
  if v_before.status not in ('draft', 'expired') then
    raise exception 'O cerere % nu mai poate fi publicată', v_before.status
      using errcode = '22023';
  end if;
  if coalesce(v_before.loading_to, v_before.loading_from) < current_date then
    raise exception 'Perioada de încărcare a trecut. Alege alte date și republică cererea'
      using errcode = '22023';
  end if;

  update public.cargo_listings
  set status = 'active',
      published_at = now(),
      expires_at = now() + interval '14 days'
  where id = p_id
  returning * into v_after;

  perform public.write_audit('request.published', 'cargo_listings', p_id,
                             to_jsonb(v_before), to_jsonb(v_after));
  return v_after.status;
end;
$fn$;

comment on function public.publish_cargo_request(uuid) is
  'Puts a draft or expired request back on the board. Refuses a loading window that has passed - that is what reopen_cargo_request is for.';

-- ---------------------------------------------------------------------
-- cancel_cargo_request
--
-- A withdrawal, not a deletion. The row stays: it is what an offer, a
-- conversation and an audit trail point at.
-- ---------------------------------------------------------------------
create or replace function public.cancel_cargo_request(p_id uuid, p_reason text default null)
returns public.listing_status
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.cargo_listings;
  v_after public.cargo_listings;
begin
  if auth.uid() is null then
    raise exception 'Autentificare necesară' using errcode = '42501';
  end if;

  select * into v_before from public.cargo_listings where id = p_id;
  if v_before.id is null then
    raise exception 'Cererea nu există' using errcode = 'P0002';
  end if;
  if not public.can_edit_cargo_listing(p_id) then
    raise exception 'Cererea nu îți aparține' using errcode = '42501';
  end if;
  if v_before.status = 'cancelled' then
    return v_before.status;
  end if;
  if v_before.status not in ('draft', 'active', 'expired', 'suspended') then
    raise exception 'O cerere % nu mai poate fi retrasă de aici', v_before.status
      using errcode = '22023';
  end if;

  update public.cargo_listings
  set status = 'cancelled'
  where id = p_id
  returning * into v_after;

  perform public.write_audit('request.cancelled', 'cargo_listings', p_id,
                             to_jsonb(v_before), to_jsonb(v_after),
                             nullif(trim(p_reason), ''));
  return v_after.status;
end;
$fn$;

comment on function public.cancel_cargo_request(uuid, text) is
  'Takes a request off the board. The row stays; only its status changes.';

-- ---------------------------------------------------------------------
-- reopen_cargo_request
--
-- The commonest thing after an expiry: the car is still in Stuttgart, only
-- the dates have moved. New dates are required rather than optional -
-- reopening on the old ones is how a board fills with requests nobody can
-- serve.
-- ---------------------------------------------------------------------
create or replace function public.reopen_cargo_request(
  p_id uuid,
  p_loading_from date,
  p_loading_to date default null
)
returns public.listing_status
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.cargo_listings;
  v_after public.cargo_listings;
begin
  if auth.uid() is null then
    raise exception 'Autentificare necesară' using errcode = '42501';
  end if;

  select * into v_before from public.cargo_listings where id = p_id;
  if v_before.id is null then
    raise exception 'Cererea nu există' using errcode = 'P0002';
  end if;
  if not public.can_edit_cargo_listing(p_id) then
    raise exception 'Cererea nu îți aparține' using errcode = '42501';
  end if;
  if v_before.status not in ('draft', 'expired', 'cancelled') then
    raise exception 'O cerere % este deja pe panou sau are un transportator ales', v_before.status
      using errcode = '22023';
  end if;
  if p_loading_from is null or p_loading_from < current_date then
    raise exception 'Alege o dată de încărcare de azi înainte' using errcode = '22023';
  end if;
  if p_loading_to is not null and p_loading_to < p_loading_from then
    raise exception 'Sfârșitul intervalului este înaintea începutului' using errcode = '22023';
  end if;

  update public.cargo_listings
  set loading_from = p_loading_from,
      loading_to = p_loading_to,
      status = 'active',
      published_at = now(),
      expires_at = now() + interval '14 days'
  where id = p_id
  returning * into v_after;

  perform public.write_audit('request.reopened', 'cargo_listings', p_id,
                             to_jsonb(v_before), to_jsonb(v_after));
  return v_after.status;
end;
$fn$;

comment on function public.reopen_cargo_request(uuid, date, date) is
  'Puts an expired or withdrawn request back on the board with new loading dates.';

-- ---------------------------------------------------------------------
-- Grants. Default privileges grant EXECUTE to nobody (20260916130300), so
-- each function is named here for exactly the role that calls it.
-- ---------------------------------------------------------------------
grant execute on function public.cargo_request_title(text, text, integer, text, text)
  to authenticated;
grant execute on function public.create_cargo_request(
  text, text, date, cargo_category, text, text, integer, boolean, service_type, uuid,
  text, text, text, text, date, boolean, boolean, boolean, boolean, text, integer,
  text, text, text, text, text[], boolean
) to authenticated;
grant execute on function public.publish_cargo_request(uuid) to authenticated;
grant execute on function public.cancel_cargo_request(uuid, text) to authenticated;
grant execute on function public.reopen_cargo_request(uuid, date, date) to authenticated;

-- ---------------------------------------------------------------------
-- A request is written through the four functions above, and nowhere else.
--
-- Supabase grants every new table to anon and authenticated, so
-- `cargo_listings_update_own` has until now let an owner set `status`,
-- `published_at`, `expires_at`, `views_count` or `is_promoted` straight
-- from a browser: the publish trigger still ran, but nothing was audited
-- and a listing could promote itself for free. The policies stay - they are
-- what `can_edit_cargo_listing` reads, and they gate the reads - but the
-- privilege behind them is gone. Nothing in the application wrote these
-- four tables directly; every write went through a SECURITY DEFINER
-- function already.
-- ---------------------------------------------------------------------
revoke insert, update, delete on public.cargo_listings from anon, authenticated;
revoke insert, update, delete on public.cargo_vehicle_details from anon, authenticated;
revoke insert, update, delete on public.cargo_freight_details from anon, authenticated;

-- `listing_contacts` is deliberately left alone. A telephone number is
-- ordinary data, not a state transition, its policies already limit writes
-- to the listing's own side, and the suite pins that a company member may
-- correct the contact on their firm's listing.
