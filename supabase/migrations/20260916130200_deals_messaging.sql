-- =====================================================================
-- 0012 - Phase 0 hardening: contact gate, offers, transports, ratings,
--        messaging, departure bookings
--
--   P9   reveal_contact() needs an eligible caller and an active listing
--   P11  opening a conversation passes the same gate and counts once
--   P4   offers: bidders create and withdraw; acceptance only through
--        accept_offer(), with row locking
--   P6   transports come only from accept_offer(); ratings are derived and
--        one per side
--   P5   messages are immutable for users
--   P10  bookings: users reserve, carriers confirm; reservations expire
--   #13  listing_contacts update policy
-- =====================================================================

-- ---------------------------------------------------------------------
-- The contact gate, shared by reveal_contact() and conversations.
--
-- Eligible: a member of a company that can act, or an individual with a
-- confirmed phone. A user who belongs to a company acts for it, so a
-- suspended or unverified company blocks its members even if they would
-- qualify otherwise. The listing must be active. The first access to a
-- listing is logged in contact_reveals and counts against the plan's
-- monthly quota; later accesses to the same listing are free.
--
-- Internal: called with an explicit user so the conversations trigger can
-- pass the initiator. Not granted to any API role.
-- ---------------------------------------------------------------------
create or replace function public.consume_contact_access(
  p_user uuid,
  p_cargo_listing_id uuid,
  p_truck_listing_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_profile public.profiles;
  v_member boolean;
  v_company uuid;
  v_status listing_status;
  v_plan public.plans;
  v_used integer;
begin
  if p_user is null then
    raise exception 'Autentificare necesară' using errcode = '42501';
  end if;
  if (p_cargo_listing_id is not null)::int + (p_truck_listing_id is not null)::int <> 1 then
    raise exception 'Trimite exact un id de anunț' using errcode = '22023';
  end if;

  select * into v_profile from public.profiles where id = p_user;

  select exists (select 1 from public.company_members where user_id = p_user) into v_member;

  if v_member then
    select cm.company_id into v_company
    from public.company_members cm
    join public.companies c on c.id = cm.company_id
    where cm.user_id = p_user
      and c.verification_status = 'verified'
      and not c.is_suspended
    order by cm.created_at
    limit 1;

    if v_company is null then
      raise exception 'Cont suspendat sau neverificat. Actualizează documentele pentru a debloca contactele.'
        using errcode = '42501';
    end if;
  elsif v_profile.account_type = 'individual' then
    if not v_profile.phone_verified then
      raise exception 'Confirmă numărul de telefon pentru a contacta transportatorii' using errcode = '42501';
    end if;
  else
    raise exception 'Înregistrează și verifică firma pentru a contacta parteneri' using errcode = '42501';
  end if;

  if p_cargo_listing_id is not null then
    select status into v_status from public.cargo_listings where id = p_cargo_listing_id;
  else
    select status into v_status from public.truck_listings where id = p_truck_listing_id;
  end if;
  if v_status is distinct from 'active' then
    raise exception 'Anunțul nu mai este activ' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.contact_reveals r
    where r.user_id = p_user
      and r.cargo_listing_id is not distinct from p_cargo_listing_id
      and r.truck_listing_id is not distinct from p_truck_listing_id
  ) then
    return v_company;
  end if;

  -- current_plan() resolves the personal plan from auth.uid(); the gate may
  -- run for another user (a conversation initiator inserted by a trigger),
  -- so resolve it here from p_user.
  select p.* into v_plan
  from public.plans p
  where p.code = coalesce(
    (select s.plan_code from public.subscriptions s
     where s.status in ('trialing', 'active')
       and s.current_period_end > now()
       and ((v_company is not null and s.company_id = v_company)
            or (v_company is null and s.user_id = p_user))
     order by s.current_period_end desc
     limit 1),
    case when v_profile.account_type = 'individual' then 'individual' else 'free' end
  );

  if v_plan.max_contact_reveals_month is not null then
    select count(*) into v_used
    from public.contact_reveals r
    where r.user_id = p_user
      and r.created_at >= date_trunc('month', now());

    if v_used >= v_plan.max_contact_reveals_month then
      raise exception 'Ai atins limita de % contacte pe luna aceasta (plan %). Treci la un plan superior.',
        v_plan.max_contact_reveals_month, v_plan.name
        using errcode = '42501';
    end if;
  end if;

  insert into public.contact_reveals (user_id, company_id, cargo_listing_id, truck_listing_id)
  values (p_user, v_company, p_cargo_listing_id, p_truck_listing_id);

  return v_company;
end;
$fn$;

create or replace function public.reveal_contact(
  p_cargo_listing_id uuid default null,
  p_truck_listing_id uuid default null
)
returns table (contact_name text, contact_phone text, contact_email text)
language plpgsql
security definer
set search_path = public
as $fn$
begin
  perform public.consume_contact_access(auth.uid(), p_cargo_listing_id, p_truck_listing_id);

  return query
  select lc.contact_name, lc.contact_phone, lc.contact_email
  from public.listing_contacts lc
  where (p_cargo_listing_id is not null and lc.cargo_listing_id = p_cargo_listing_id)
     or (p_truck_listing_id is not null and lc.truck_listing_id = p_truck_listing_id);
end;
$fn$;

-- ---------------------------------------------------------------------
-- #13 - listing_contacts: the target listing must be the caller's too
-- ---------------------------------------------------------------------
drop policy if exists "listing_contacts_update_owner" on public.listing_contacts;

create policy "listing_contacts_update_owner" on public.listing_contacts
  for update to authenticated
  using (
    public.is_platform_admin()
    or (cargo_listing_id is not null and public.can_edit_cargo_listing(cargo_listing_id))
    or exists (select 1 from public.truck_listings l
               where l.id = truck_listing_id and public.is_company_member(l.company_id))
  )
  with check (
    public.is_platform_admin()
    or (cargo_listing_id is not null and public.can_edit_cargo_listing(cargo_listing_id))
    or exists (select 1 from public.truck_listings l
               where l.id = truck_listing_id and public.is_company_member(l.company_id))
  );

-- ---------------------------------------------------------------------
-- Departure bookings: columns for reservations and offers
-- ---------------------------------------------------------------------
alter table public.departure_bookings
  add column offer_id uuid references public.offers (id) on delete set null,
  add column reserved_by uuid references public.profiles (id) on delete set null,
  add column expires_at timestamptz;

alter table public.departure_bookings drop constraint departure_bookings_status_check;
alter table public.departure_bookings add constraint departure_bookings_status_check
  check (status in ('reserved', 'confirmed', 'cancelled', 'expired'));

comment on column public.departure_bookings.expires_at is
  'A reservation (status reserved) holds seats until then: 24 hours after it is made, or the end of the departure day, whichever comes first. expire_stale_listings() marks it expired; seat counts ignore it as soon as it passes.';

-- One open reservation per user per departure.
create unique index departure_bookings_one_reservation_per_user
  on public.departure_bookings (truck_listing_id, reserved_by)
  where status = 'reserved' and reserved_by is not null;

create or replace function public.guard_booking_user_write()
returns trigger
language plpgsql
as $fn$
begin
  if tg_op = 'INSERT' then
    if current_user in ('authenticated', 'anon') then
      if new.status is distinct from 'reserved' then
        raise exception 'O rezervare se creează în așteptare; transportatorul o confirmă' using errcode = '42501';
      end if;
      new.agreed_price := null;
      new.offer_id := null;
      new.reserved_by := auth.uid();
    end if;

    -- A departure is a date: a reservation holds at most until the end of
    -- that day in Romania, and never more than 24 hours.
    if new.status = 'reserved' then
      new.expires_at := least(
        now() + interval '24 hours',
        (select ((t.available_from + 1)::timestamp at time zone 'Europe/Bucharest')
         from public.truck_listings t where t.id = new.truck_listing_id));
      if new.expires_at <= now() then
        raise exception 'Plecarea a trecut, nu se mai pot rezerva locuri' using errcode = '55000';
      end if;
    end if;
    return new;
  end if;

  if current_user in ('authenticated', 'anon') then
    -- A user may only cancel an open reservation. Confirming goes through
    -- confirm_departure_booking(); cancelling a confirmed order is not a
    -- self-service action.
    if old.status <> 'reserved'
       or new.status <> 'cancelled'
       or new.truck_listing_id is distinct from old.truck_listing_id
       or new.cargo_listing_id is distinct from old.cargo_listing_id
       or new.slots is distinct from old.slots
       or new.agreed_price is distinct from old.agreed_price
       or new.currency is distinct from old.currency
       or new.offer_id is distinct from old.offer_id
       or new.reserved_by is distinct from old.reserved_by
       or new.expires_at is distinct from old.expires_at then
      raise exception 'O rezervare poate fi doar anulată din cont' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$fn$;

-- Sorts before departure_bookings_guard_capacity.
create trigger departure_bookings_guard_access
  before insert or update on public.departure_bookings
  for each row execute function public.guard_booking_user_write();

-- Capacity, now under a lock on the departure so two reservations cannot
-- both take the last seat, and ignoring reservations that have lapsed.
create or replace function public.guard_departure_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_total integer;
  v_taken integer;
  v_status listing_status;
begin
  if new.status in ('cancelled', 'expired') then
    return new;
  end if;

  select t.platform_slots_total, t.status into v_total, v_status
  from public.truck_listings t where t.id = new.truck_listing_id
  for update;

  if tg_op = 'INSERT' and v_status is distinct from 'active' then
    raise exception 'Plecarea nu este activă' using errcode = '55000';
  end if;

  if v_total is null then
    return new;  -- capacity not declared: nothing to enforce
  end if;

  -- A request holds at most one booking per departure (unique index), so
  -- excluding its own row covers both an update and an upsert.
  select coalesce(sum(b.slots), 0) into v_taken
  from public.departure_bookings b
  where b.truck_listing_id = new.truck_listing_id
    and b.cargo_listing_id <> new.cargo_listing_id
    and (b.status = 'confirmed' or (b.status = 'reserved' and b.expires_at > now()));

  if v_taken + new.slots > v_total then
    raise exception 'Platforma are doar % locuri, din care % ocupate', v_total, v_taken
      using errcode = '23514';
  end if;
  return new;
end;
$fn$;

drop policy if exists "departure_bookings_update" on public.departure_bookings;
drop policy if exists "departure_bookings_delete" on public.departure_bookings;

create policy "departure_bookings_update" on public.departure_bookings
  for update to authenticated
  using (
    public.can_edit_cargo_listing(cargo_listing_id)
    or exists (select 1 from public.truck_listings t
               where t.id = truck_listing_id and public.is_company_member(t.company_id))
  )
  with check (
    public.can_edit_cargo_listing(cargo_listing_id)
    or exists (select 1 from public.truck_listings t
               where t.id = truck_listing_id and public.is_company_member(t.company_id))
  );

create policy "departure_bookings_delete_staff" on public.departure_bookings
  for delete to authenticated
  using (public.is_platform_admin());

-- Seats taken right now: confirmed bookings plus reservations still open.
create or replace function public.departure_seats_taken(p_truck_listing_id uuid, p_except_cargo_listing_id uuid default null)
returns integer
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(sum(b.slots), 0)::integer
  from public.departure_bookings b
  where b.truck_listing_id = p_truck_listing_id
    and b.cargo_listing_id is distinct from p_except_cargo_listing_id
    and (b.status = 'confirmed' or (b.status = 'reserved' and b.expires_at > now()));
$fn$;

create or replace function public.confirm_departure_booking(
  p_booking_id uuid,
  p_agreed_price numeric default null
)
returns public.departure_bookings
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_truck_id uuid;
  v_truck public.truck_listings;
  v_before public.departure_bookings;
  v_booking public.departure_bookings;
begin
  select truck_listing_id into v_truck_id from public.departure_bookings where id = p_booking_id;
  if v_truck_id is null then
    raise exception 'Rezervare inexistentă' using errcode = 'P0002';
  end if;

  -- Departure first, then the booking: the same order as accept_offer().
  select * into v_truck from public.truck_listings where id = v_truck_id for update;
  select * into v_before from public.departure_bookings where id = p_booking_id for update;

  if not public.is_company_member(v_truck.company_id) then
    raise exception 'Doar transportatorul confirmă rezervările' using errcode = '42501';
  end if;
  if not public.company_can_act(v_truck.company_id) then
    raise exception 'Cont suspendat sau neverificat' using errcode = '42501';
  end if;
  if v_before.status <> 'reserved' or v_before.expires_at <= now() then
    raise exception 'Rezervarea nu mai este în așteptare' using errcode = '55000';
  end if;
  if v_truck.status <> 'active' then
    raise exception 'Plecarea nu mai este activă' using errcode = '55000';
  end if;

  update public.departure_bookings
  set status = 'confirmed',
      agreed_price = coalesce(p_agreed_price, agreed_price)
  where id = p_booking_id
  returning * into v_booking;

  if v_truck.platform_slots_total is not null
     and public.departure_seats_taken(v_truck.id) >= v_truck.platform_slots_total then
    update public.truck_listings set status = 'assigned' where id = v_truck.id;
  end if;

  perform public.write_audit('booking.confirmed', 'departure_bookings', v_booking.id,
    to_jsonb(v_before), to_jsonb(v_booking));
  return v_booking;
end;
$fn$;

-- ---------------------------------------------------------------------
-- Offers
-- ---------------------------------------------------------------------
alter table public.offers
  add column slots integer not null default 1 check (slots > 0),
  add column booking_cargo_listing_id uuid references public.cargo_listings (id) on delete set null;

comment on column public.offers.slots is
  'Seats requested on a seat-based departure (truck_listings.platform_slots_total). Always 1 elsewhere.';
comment on column public.offers.booking_cargo_listing_id is
  'The bidder''s own request whose vehicles take the seats. Required for an offer on a seat-based departure; accept_offer() books the seats against it.';

create or replace function public.guard_offer_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_status listing_status;
  v_owner uuid;
  v_owner_company uuid;
  v_slots_total integer;
  v_request public.cargo_listings;
begin
  if new.cargo_listing_id is not null then
    select status, posted_by, company_id into v_status, v_owner, v_owner_company
    from public.cargo_listings where id = new.cargo_listing_id;
  else
    select status, posted_by, company_id, platform_slots_total
      into v_status, v_owner, v_owner_company, v_slots_total
    from public.truck_listings where id = new.truck_listing_id;
  end if;

  if v_status is distinct from 'active' then
    raise exception 'Anunțul nu mai este activ' using errcode = '42501';
  end if;
  if new.from_user_id = v_owner
     or (v_owner_company is not null and exists (
           select 1 from public.company_members m
           where m.company_id = v_owner_company and m.user_id = new.from_user_id)) then
    raise exception 'Nu poți trimite o ofertă pe propriul anunț' using errcode = '42501';
  end if;

  if new.from_company_id is not null then
    if not public.company_can_act(new.from_company_id) then
      raise exception 'Nu poți trimite oferte: cont neverificat sau suspendat'
        using errcode = '42501';
    end if;
  else
    if new.truck_listing_id is null then
      raise exception 'Persoanele fizice pot trimite oferte doar către anunțuri de mașini'
        using errcode = '42501';
    end if;
    if not exists (select 1 from public.profiles p where p.id = new.from_user_id and p.phone_verified) then
      raise exception 'Numărul de telefon trebuie confirmat' using errcode = '42501';
    end if;
  end if;

  if v_slots_total is not null then
    if new.booking_cargo_listing_id is null then
      raise exception 'Alege cererea pentru care rezervi locurile' using errcode = '23502';
    end if;
    if new.slots > v_slots_total then
      raise exception 'Platforma are doar % locuri', v_slots_total using errcode = '23514';
    end if;
  elsif new.slots <> 1 then
    raise exception 'Locurile se pot cere doar pe o plecare cu locuri' using errcode = '22023';
  end if;

  if new.booking_cargo_listing_id is not null then
    if new.cargo_listing_id is not null then
      raise exception 'O ofertă pe o cerere nu rezervă locuri' using errcode = '22023';
    end if;
    select * into v_request from public.cargo_listings where id = new.booking_cargo_listing_id;
    if v_request.id is null
       or not (v_request.posted_by = new.from_user_id
               or (v_request.company_id is not null and v_request.company_id = new.from_company_id)) then
      raise exception 'Cererea nu îți aparține' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$fn$;

-- The caller's role is needed to force the initial state, so this part is
-- an invoker trigger next to the definer guard above.
create or replace function public.guard_offer_user_insert()
returns trigger
language plpgsql
as $fn$
begin
  if current_user in ('authenticated', 'anon') then
    new.status := 'pending';
    new.responded_at := null;
  end if;
  return new;
end;
$fn$;

create trigger offers_guard_user_insert
  before insert on public.offers
  for each row execute function public.guard_offer_user_insert();

drop policy if exists "offers_update_parties" on public.offers;
drop policy if exists "offers_delete_owner" on public.offers;

create policy "offers_delete_staff" on public.offers
  for delete to authenticated
  using (public.is_platform_admin());

create or replace function public.withdraw_offer(p_offer_id uuid)
returns public.offers
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_offer public.offers;
begin
  select * into v_offer from public.offers where id = p_offer_id for update;
  if v_offer.id is null then
    raise exception 'Ofertă inexistentă' using errcode = 'P0002';
  end if;
  if not (v_offer.from_user_id = auth.uid()
          or (v_offer.from_company_id is not null and public.is_company_member(v_offer.from_company_id))) then
    raise exception 'Doar cel care a trimis oferta o poate retrage' using errcode = '42501';
  end if;
  if v_offer.status <> 'pending' then
    raise exception 'Oferta nu mai este în așteptare' using errcode = '55000';
  end if;

  update public.offers set status = 'withdrawn', responded_at = now()
  where id = p_offer_id returning * into v_offer;
  return v_offer;
end;
$fn$;

-- Listing ownership, as seen from the listing row.
create or replace function public.owns_offer_listing(p_offer public.offers)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select case
    when p_offer.cargo_listing_id is not null then exists (
      select 1 from public.cargo_listings l
      where l.id = p_offer.cargo_listing_id
        and (l.posted_by = auth.uid()
             or (l.company_id is not null and public.is_company_member(l.company_id))))
    else exists (
      select 1 from public.truck_listings l
      where l.id = p_offer.truck_listing_id and public.is_company_member(l.company_id))
  end;
$fn$;

create or replace function public.reject_offer(p_offer_id uuid)
returns public.offers
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_offer public.offers;
begin
  select * into v_offer from public.offers where id = p_offer_id for update;
  if v_offer.id is null then
    raise exception 'Ofertă inexistentă' using errcode = 'P0002';
  end if;
  if not public.owns_offer_listing(v_offer) then
    raise exception 'Doar proprietarul anunțului poate respinge oferta' using errcode = '42501';
  end if;
  if v_offer.status <> 'pending' then
    raise exception 'Oferta nu mai este în așteptare' using errcode = '55000';
  end if;

  update public.offers set status = 'rejected', responded_at = now()
  where id = p_offer_id returning * into v_offer;
  return v_offer;
end;
$fn$;

-- ---------------------------------------------------------------------
-- accept_offer()
--
-- Locks the listing first, then the offer. Two owners accepting two offers
-- on the same listing at once serialise on the listing row: the second one
-- wakes up to a listing that is no longer active (or has fewer seats) and
-- fails. Locking the offer first would deadlock instead, because the first
-- transaction rejects the offer the second one holds.
--
-- On a seat-based departure (platform_slots_total set) accepting an offer
-- books the offer's seats as a confirmed booking against the bidder's
-- request. The departure stays active until no seat is left; pending offers
-- are rejected only when they no longer fit.
-- ---------------------------------------------------------------------
create or replace function public.accept_offer(p_offer_id uuid)
returns public.transports
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_user uuid := auth.uid();
  v_ref public.offers;
  v_offer public.offers;
  v_before jsonb;
  v_cargo public.cargo_listings;
  v_truck public.truck_listings;
  v_free integer;
  v_transport public.transports;
  v_booking_cargo uuid;
begin
  if v_user is null then
    raise exception 'Autentificare necesară' using errcode = '42501';
  end if;

  select * into v_ref from public.offers where id = p_offer_id;
  if v_ref.id is null then
    raise exception 'Ofertă inexistentă' using errcode = 'P0002';
  end if;

  -- 1. Lock the listing.
  if v_ref.cargo_listing_id is not null then
    select * into v_cargo from public.cargo_listings where id = v_ref.cargo_listing_id for update;
  else
    select * into v_truck from public.truck_listings where id = v_ref.truck_listing_id for update;
  end if;

  -- 2. Lock the offer and re-read it under the lock.
  select * into v_offer from public.offers where id = p_offer_id for update;
  v_before := to_jsonb(v_offer);

  if not public.owns_offer_listing(v_offer) then
    raise exception 'Doar proprietarul anunțului poate accepta oferta' using errcode = '42501';
  end if;

  -- The owner must be allowed to trade.
  if v_cargo.id is not null then
    if v_cargo.company_id is not null then
      if not public.company_can_act(v_cargo.company_id) then
        raise exception 'Cont suspendat sau neverificat' using errcode = '42501';
      end if;
    elsif not exists (select 1 from public.profiles where id = v_user and phone_verified) then
      raise exception 'Confirmă numărul de telefon' using errcode = '42501';
    end if;
    if v_cargo.status <> 'active' then
      raise exception 'Anunțul nu mai este activ' using errcode = '55000';
    end if;
  else
    if not public.company_can_act(v_truck.company_id) then
      raise exception 'Cont suspendat sau neverificat' using errcode = '42501';
    end if;
    if v_truck.status <> 'active' then
      raise exception 'Anunțul nu mai este activ' using errcode = '55000';
    end if;
  end if;

  if v_offer.status <> 'pending' then
    raise exception 'Oferta nu mai este în așteptare' using errcode = '55000';
  end if;
  if v_offer.valid_until is not null and v_offer.valid_until < now() then
    raise exception 'Oferta a expirat' using errcode = '55000';
  end if;

  -- The bidder must still be allowed to trade too.
  if v_offer.from_company_id is not null then
    if not public.company_can_act(v_offer.from_company_id) then
      raise exception 'Firma care a trimis oferta nu mai poate încheia transporturi' using errcode = '42501';
    end if;
  elsif not exists (select 1 from public.profiles where id = v_offer.from_user_id and phone_verified) then
    raise exception 'Persoana care a trimis oferta nu are telefonul confirmat' using errcode = '42501';
  end if;

  update public.offers set status = 'accepted', responded_at = now()
  where id = v_offer.id returning * into v_offer;

  if v_cargo.id is not null then
    -- A carrier bid on a request: the request is served.
    update public.cargo_listings set status = 'assigned' where id = v_cargo.id;
    update public.offers set status = 'rejected', responded_at = now()
    where cargo_listing_id = v_cargo.id and status = 'pending';

    insert into public.transports
      (cargo_listing_id, offer_id, shipper_company_id, shipper_user_id, carrier_company_id,
       agreed_price, currency, payment_term_days, status)
    values
      (v_cargo.id, v_offer.id, v_cargo.company_id, v_cargo.posted_by, v_offer.from_company_id,
       v_offer.price_amount, v_offer.currency, v_offer.payment_term_days, 'agreed')
    returning * into v_transport;

  elsif v_truck.platform_slots_total is null then
    -- A whole truck.
    update public.truck_listings set status = 'assigned' where id = v_truck.id;
    update public.offers set status = 'rejected', responded_at = now()
    where truck_listing_id = v_truck.id and status = 'pending';

    v_booking_cargo := v_offer.booking_cargo_listing_id;

    insert into public.transports
      (cargo_listing_id, truck_listing_id, offer_id, shipper_company_id, shipper_user_id,
       carrier_company_id, vehicle_id, agreed_price, currency, payment_term_days, status)
    values
      (v_booking_cargo, v_truck.id, v_offer.id, v_offer.from_company_id, v_offer.from_user_id,
       v_truck.company_id, v_truck.vehicle_id, v_offer.price_amount, v_offer.currency,
       v_offer.payment_term_days, 'agreed')
    returning * into v_transport;

  else
    -- Seats on a departure.
    v_booking_cargo := v_offer.booking_cargo_listing_id;
    if v_booking_cargo is null then
      raise exception 'Oferta nu indică cererea pentru care se rezervă locurile' using errcode = '23502';
    end if;

    -- A reservation the same request already holds is upgraded, so its own
    -- seats do not count against it.
    v_free := v_truck.platform_slots_total - public.departure_seats_taken(v_truck.id, v_booking_cargo);
    if v_offer.slots > v_free then
      raise exception 'Mai sunt doar % locuri libere', v_free using errcode = '23514';
    end if;

    if exists (select 1 from public.departure_bookings
               where truck_listing_id = v_truck.id and cargo_listing_id = v_booking_cargo
                 and status = 'confirmed') then
      raise exception 'Cererea are deja locuri confirmate pe această plecare' using errcode = '23505';
    end if;

    insert into public.departure_bookings
      (truck_listing_id, cargo_listing_id, slots, status, agreed_price, currency, offer_id)
    values
      (v_truck.id, v_booking_cargo, v_offer.slots, 'confirmed', v_offer.price_amount, v_offer.currency, v_offer.id)
    on conflict (truck_listing_id, cargo_listing_id) do update
      set slots = excluded.slots,
          status = 'confirmed',
          agreed_price = excluded.agreed_price,
          currency = excluded.currency,
          offer_id = excluded.offer_id,
          expires_at = null;

    v_free := v_free - v_offer.slots;

    update public.offers set status = 'rejected', responded_at = now()
    where truck_listing_id = v_truck.id and status = 'pending' and slots > v_free;

    if v_free = 0 then
      update public.truck_listings set status = 'assigned' where id = v_truck.id;
    end if;

    -- The request is served: it leaves the board and its other offers close.
    update public.cargo_listings set status = 'assigned'
    where id = v_booking_cargo and status = 'active';
    update public.offers set status = 'rejected', responded_at = now()
    where cargo_listing_id = v_booking_cargo and status = 'pending';

    insert into public.transports
      (cargo_listing_id, truck_listing_id, offer_id, shipper_company_id, shipper_user_id,
       carrier_company_id, vehicle_id, agreed_price, currency, payment_term_days, status)
    values
      (v_booking_cargo, v_truck.id, v_offer.id, v_offer.from_company_id, v_offer.from_user_id,
       v_truck.company_id, v_truck.vehicle_id, v_offer.price_amount, v_offer.currency,
       v_offer.payment_term_days, 'agreed')
    returning * into v_transport;
  end if;

  perform public.write_audit('offer.accepted', 'offers', v_offer.id, v_before,
    jsonb_build_object('offer', to_jsonb(v_offer), 'transport_id', v_transport.id));

  return v_transport;
end;
$fn$;

-- ---------------------------------------------------------------------
-- P6 - transports and ratings
-- ---------------------------------------------------------------------
drop policy if exists "transports_insert_parties" on public.transports;
drop policy if exists "transports_update_parties" on public.transports;

-- Status changes by the parties arrive with the execution phase, as RPCs.
create policy "transports_update_staff" on public.transports
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

create or replace function public.audit_transport_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if tg_op = 'DELETE' then
    perform public.write_audit('transport.deleted', 'transports', old.id, to_jsonb(old), null);
    return old;
  end if;
  perform public.write_audit('transport.updated', 'transports', new.id, to_jsonb(old), to_jsonb(new));
  return new;
end;
$fn$;

create trigger transports_audit_changes
  after update or delete on public.transports
  for each row execute function public.audit_transport_changes();

-- Who rates whom is read from the transport, never from the request.
create or replace function public.guard_rating_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_t public.transports;
begin
  select * into v_t from public.transports where id = new.transport_id;
  if v_t.id is null then
    raise exception 'Transport inexistent' using errcode = 'P0002';
  end if;
  if v_t.status not in ('delivered', 'invoiced', 'closed') then
    raise exception 'Evaluarea se face după livrare' using errcode = '42501';
  end if;

  if exists (select 1 from public.company_members m
             where m.company_id = v_t.carrier_company_id and m.user_id = new.rater_user_id) then
    if v_t.shipper_company_id is null then
      raise exception 'Evaluarea persoanelor fizice nu este disponibilă' using errcode = '42501';
    end if;
    new.rater_company_id := v_t.carrier_company_id;
    new.rated_company_id := v_t.shipper_company_id;
  elsif v_t.shipper_user_id = new.rater_user_id
        or (v_t.shipper_company_id is not null and exists (
              select 1 from public.company_members m
              where m.company_id = v_t.shipper_company_id and m.user_id = new.rater_user_id)) then
    new.rater_company_id := v_t.shipper_company_id;
    new.rated_company_id := v_t.carrier_company_id;
  else
    raise exception 'Doar părțile transportului pot evalua' using errcode = '42501';
  end if;

  return new;
end;
$fn$;

create trigger ratings_guard_insert
  before insert on public.ratings
  for each row execute function public.guard_rating_insert();

-- One rating per side: each side rates the other company exactly once.
create unique index ratings_one_per_rated_company on public.ratings (transport_id, rated_company_id);

drop policy if exists "ratings_update_own" on public.ratings;

-- ---------------------------------------------------------------------
-- P5, P11 - messaging
-- ---------------------------------------------------------------------
drop policy if exists "conversations_update_participant" on public.conversations;
drop policy if exists "messages_update_sender" on public.messages;
drop policy if exists "messages_delete_admin" on public.messages;

create or replace function public.guard_conversation_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_owner uuid;
  v_company uuid;
begin
  if new.cargo_listing_id is not null then
    select posted_by, company_id into v_owner, v_company
    from public.cargo_listings where id = new.cargo_listing_id;
  else
    select posted_by, company_id into v_owner, v_company
    from public.truck_listings where id = new.truck_listing_id;
  end if;
  if v_owner is null then
    raise exception 'Anunț inexistent' using errcode = 'P0002';
  end if;

  -- The owner is whoever posted the listing, not what the client sends.
  new.owner_user_id := v_owner;
  new.last_message_at := null;

  if new.initiator_user_id = v_owner
     or (v_company is not null and exists (
           select 1 from public.company_members m
           where m.company_id = v_company and m.user_id = new.initiator_user_id)) then
    raise exception 'Nu poți deschide o conversație pe propriul anunț' using errcode = '42501';
  end if;

  -- Same gate and quota as reveal_contact(): a conversation is a contact.
  perform public.consume_contact_access(new.initiator_user_id, new.cargo_listing_id, new.truck_listing_id);
  return new;
end;
$fn$;

create trigger conversations_guard_insert
  before insert on public.conversations
  for each row execute function public.guard_conversation_insert();

create or replace function public.guard_message_insert()
returns trigger
language plpgsql
as $fn$
begin
  if current_user in ('authenticated', 'anon') then
    new.created_at := now();
    new.read_at := null;
  end if;
  return new;
end;
$fn$;

create trigger messages_guard_insert
  before insert on public.messages
  for each row execute function public.guard_message_insert();

create or replace function public.mark_conversation_read(p_conversation_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_count integer;
begin
  if not public.is_conversation_participant(p_conversation_id) then
    raise exception 'Nu participi la această conversație' using errcode = '42501';
  end if;

  update public.messages
  set read_at = now()
  where conversation_id = p_conversation_id
    and sender_user_id <> auth.uid()
    and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$fn$;

-- ---------------------------------------------------------------------
-- Housekeeping: lapsed reservations
-- ---------------------------------------------------------------------
create or replace function public.expire_stale_listings()
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_total integer := 0;
  v_n integer;
begin
  update public.cargo_listings
  set status = 'expired'
  where status = 'active' and expires_at is not null and expires_at < now();
  get diagnostics v_n = row_count;
  v_total := v_total + v_n;

  update public.truck_listings
  set status = 'expired'
  where status = 'active' and expires_at is not null and expires_at < now();
  get diagnostics v_n = row_count;
  v_total := v_total + v_n;

  update public.cargo_listings set is_promoted = false
  where is_promoted and promoted_until is not null and promoted_until < now();
  update public.truck_listings set is_promoted = false
  where is_promoted and promoted_until is not null and promoted_until < now();

  -- Seat counts already ignore a lapsed reservation; this makes it visible.
  update public.departure_bookings
  set status = 'expired'
  where status = 'reserved' and expires_at <= now();

  return v_total;
end;
$fn$;
