-- =====================================================================
-- 0016 - One way to create an order
--
-- An order (a `transports` row) is created in exactly two situations:
--   * a listing owner accepts an offer          -> accept_offer()
--   * a carrier confirms a seat reservation     -> confirm_departure_booking()
-- Until now only the first created one; a confirmed reservation left seats
-- taken with no order behind them. Both now go through create_order(), an
-- internal SECURITY DEFINER function no API role can call. Users still never
-- insert into transports.
-- =====================================================================

alter table public.transports
  add column departure_booking_id uuid references public.departure_bookings (id) on delete set null;

create unique index transports_one_per_booking
  on public.transports (departure_booking_id)
  where departure_booking_id is not null;

comment on column public.transports.departure_booking_id is
  'The seats this order occupies on a car platform, when it came from a seat offer or a confirmed reservation.';

-- ---------------------------------------------------------------------
-- create_order() - internal. Callers have already checked who may do this.
-- ---------------------------------------------------------------------
create or replace function public.create_order(
  p_carrier_company_id uuid,
  p_shipper_company_id uuid,
  p_shipper_user_id uuid,
  p_agreed_price numeric,
  p_currency public.currency_code,
  p_payment_term_days integer default null,
  p_cargo_listing_id uuid default null,
  p_truck_listing_id uuid default null,
  p_vehicle_id uuid default null,
  p_offer_id uuid default null,
  p_departure_booking_id uuid default null
)
returns public.transports
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_transport public.transports;
begin
  if p_carrier_company_id is null then
    raise exception 'Comanda are nevoie de un transportator' using errcode = '23502';
  end if;
  if p_shipper_company_id is null and p_shipper_user_id is null then
    raise exception 'Comanda are nevoie de un client' using errcode = '23502';
  end if;
  if p_agreed_price is null or p_agreed_price < 0 then
    raise exception 'Comanda are nevoie de un preț convenit' using errcode = '23502';
  end if;
  if p_offer_id is null and p_departure_booking_id is null then
    raise exception 'O comandă vine dintr-o ofertă acceptată sau dintr-o rezervare confirmată' using errcode = '23502';
  end if;

  insert into public.transports
    (cargo_listing_id, truck_listing_id, offer_id, departure_booking_id,
     shipper_company_id, shipper_user_id, carrier_company_id, vehicle_id,
     agreed_price, currency, payment_term_days, status)
  values
    (p_cargo_listing_id, p_truck_listing_id, p_offer_id, p_departure_booking_id,
     p_shipper_company_id, p_shipper_user_id, p_carrier_company_id, p_vehicle_id,
     p_agreed_price, p_currency, p_payment_term_days, 'agreed')
  returning * into v_transport;

  perform public.write_audit('order.created', 'transports', v_transport.id, null, to_jsonb(v_transport));
  return v_transport;
end;
$fn$;

revoke all on function public.create_order(uuid, uuid, uuid, numeric, public.currency_code, integer, uuid, uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- accept_offer() - unchanged rules, order through create_order()
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
  v_booking public.departure_bookings;
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

    v_transport := public.create_order(
      p_carrier_company_id => v_offer.from_company_id,
      p_shipper_company_id => v_cargo.company_id,
      p_shipper_user_id => v_cargo.posted_by,
      p_agreed_price => v_offer.price_amount,
      p_currency => v_offer.currency,
      p_payment_term_days => v_offer.payment_term_days,
      p_cargo_listing_id => v_cargo.id,
      p_offer_id => v_offer.id);

  elsif v_truck.platform_slots_total is null then
    -- A whole truck.
    update public.truck_listings set status = 'assigned' where id = v_truck.id;
    update public.offers set status = 'rejected', responded_at = now()
    where truck_listing_id = v_truck.id and status = 'pending';

    v_transport := public.create_order(
      p_carrier_company_id => v_truck.company_id,
      p_shipper_company_id => v_offer.from_company_id,
      p_shipper_user_id => v_offer.from_user_id,
      p_agreed_price => v_offer.price_amount,
      p_currency => v_offer.currency,
      p_payment_term_days => v_offer.payment_term_days,
      p_cargo_listing_id => v_offer.booking_cargo_listing_id,
      p_truck_listing_id => v_truck.id,
      p_vehicle_id => v_truck.vehicle_id,
      p_offer_id => v_offer.id);

  else
    -- Seats on a departure.
    v_booking_cargo := v_offer.booking_cargo_listing_id;
    if v_booking_cargo is null then
      raise exception 'Oferta nu indică cererea pentru care se rezervă locurile' using errcode = '23502';
    end if;

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
          expires_at = null
    returning * into v_booking;

    v_free := v_free - v_offer.slots;

    update public.offers set status = 'rejected', responded_at = now()
    where truck_listing_id = v_truck.id and status = 'pending' and slots > v_free;

    if v_free = 0 then
      update public.truck_listings set status = 'assigned' where id = v_truck.id;
    end if;

    update public.cargo_listings set status = 'assigned'
    where id = v_booking_cargo and status = 'active';
    update public.offers set status = 'rejected', responded_at = now()
    where cargo_listing_id = v_booking_cargo and status = 'pending';

    v_transport := public.create_order(
      p_carrier_company_id => v_truck.company_id,
      p_shipper_company_id => v_offer.from_company_id,
      p_shipper_user_id => v_offer.from_user_id,
      p_agreed_price => v_offer.price_amount,
      p_currency => v_offer.currency,
      p_payment_term_days => v_offer.payment_term_days,
      p_cargo_listing_id => v_booking_cargo,
      p_truck_listing_id => v_truck.id,
      p_vehicle_id => v_truck.vehicle_id,
      p_offer_id => v_offer.id,
      p_departure_booking_id => v_booking.id);
  end if;

  perform public.write_audit('offer.accepted', 'offers', v_offer.id, v_before,
    jsonb_build_object('offer', to_jsonb(v_offer), 'transport_id', v_transport.id));

  return v_transport;
end;
$fn$;

-- ---------------------------------------------------------------------
-- confirm_departure_booking() - confirming a reservation creates the order
-- ---------------------------------------------------------------------
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
  v_request public.cargo_listings;
  v_transport public.transports;
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
  if coalesce(p_agreed_price, v_before.agreed_price) is null then
    raise exception 'Prețul convenit este obligatoriu pentru confirmare' using errcode = '23502';
  end if;

  -- The client behind the reservation must still be allowed to trade.
  select * into v_request from public.cargo_listings where id = v_before.cargo_listing_id for update;
  if v_request.company_id is not null then
    if not public.company_can_act(v_request.company_id) then
      raise exception 'Clientul nu mai poate încheia transporturi' using errcode = '42501';
    end if;
  elsif not exists (select 1 from public.profiles where id = v_request.posted_by and phone_verified) then
    raise exception 'Clientul nu are telefonul confirmat' using errcode = '42501';
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

  -- The request is served, exactly as when a seat offer is accepted.
  update public.cargo_listings set status = 'assigned'
  where id = v_request.id and status = 'active';
  update public.offers set status = 'rejected', responded_at = now()
  where cargo_listing_id = v_request.id and status = 'pending';

  v_transport := public.create_order(
    p_carrier_company_id => v_truck.company_id,
    p_shipper_company_id => v_request.company_id,
    p_shipper_user_id => v_request.posted_by,
    p_agreed_price => v_booking.agreed_price,
    p_currency => v_booking.currency,
    p_cargo_listing_id => v_request.id,
    p_truck_listing_id => v_truck.id,
    p_vehicle_id => v_truck.vehicle_id,
    p_departure_booking_id => v_booking.id);

  perform public.write_audit('booking.confirmed', 'departure_bookings', v_booking.id,
    to_jsonb(v_before), jsonb_build_object('booking', to_jsonb(v_booking), 'transport_id', v_transport.id));
  return v_booking;
end;
$fn$;
