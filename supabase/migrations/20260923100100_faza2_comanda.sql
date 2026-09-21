-- =====================================================================
-- 0035 - The order, from confirmation to completion
--
-- `transports` has existed since phase 0 and has never moved. Every row
-- created by `accept_offer()` sat at `agreed` for ever, because there was
-- no screen to move it and — deliberately — no policy either: phase 0
-- dropped `transports_insert_parties` and `transports_update_parties`
-- with the note "status changes by the parties arrive with the execution
-- phase, as RPCs". This is that phase, and these are those RPCs.
--
-- The shape of it:
--
--   * One entry point, `transition_order()`. It decides from the row and
--     the caller, never from what the caller says about themselves, and
--     it is the only way a status changes. The parties still have no
--     update policy on `transports`.
--   * Evidence is a table, not a column. `order_evidence` rows cannot be
--     updated or deleted by anybody, including staff and including the
--     person who wrote them — a proof of delivery that can be edited
--     afterwards is not proof. Staff may hide one with a reason; the row
--     stays.
--   * A transition that needs evidence counts it. Four photographs and a
--     condition report are not a checklist on a screen; they are a
--     condition of the update, and a client who later disputes the state
--     of their car is looking at rows nobody could have gone back and
--     tidied.
--   * Everything is timed by the database. `captured_at` is server time,
--     not the phone's, because a phone's clock is whatever its owner set
--     it to.
--
-- What this file deliberately does not do: money, invoices, ratings, and
-- general messaging. `invoiced` stays in the enum, unwritten.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The legacy statuses, and the two functions that knew them
--
-- Only `agreed` can exist in practice — nothing has ever moved an order
-- off it — but the other four are mapped too rather than left to be
-- discovered later by a screen that cannot place them on a timeline.
-- `invoiced` maps to `order_completed`: it is strictly after delivery,
-- and the new lifecycle has no billing step to put it in.
-- ---------------------------------------------------------------------
update public.transports set status = 'order_confirmed'   where status = 'agreed';
update public.transports set status = 'vehicle_picked_up' where status = 'loading';
update public.transports set status = 'vehicle_delivered' where status = 'delivered';
update public.transports set status = 'order_completed'   where status in ('invoiced', 'closed');

alter table public.transports alter column status set default 'order_confirmed';

comment on type public.transport_status is
  'The order lifecycle: order_confirmed, pickup_scheduled, vehicle_picked_up, in_transit, delivery_scheduled, vehicle_delivered, order_completed, beside cancelled and disputed. agreed, loading, delivered, invoiced and closed are the phase 0 spelling, migrated away in 20260923100100 and never written again; Postgres cannot drop an enum value.';

-- `create_order()` hard-codes the opening status. Reproduced from
-- 20260916150000 with that one word changed — it is a merged migration,
-- so it cannot be edited, and the function is short enough to restate.
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
     p_agreed_price, p_currency, p_payment_term_days, 'order_confirmed')
  returning * into v_transport;

  perform public.write_audit('order.created', 'transports', v_transport.id, null, to_jsonb(v_transport));
  return v_transport;
end;
$fn$;

revoke all on function public.create_order(uuid, uuid, uuid, numeric, public.currency_code, integer, uuid, uuid, uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

-- `guard_rating_insert()` gates a rating on the order having got as far
-- as delivery. Reproduced from 20260916130200 with the new spellings
-- added, so the ratings phase inherits a guard that still works. The old
-- values stay in the list: a row that somehow escaped the migration
-- above should not block a rating.
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
  if v_t.status not in ('vehicle_delivered', 'order_completed',
                        'delivered', 'invoiced', 'closed') then
    raise exception 'Evaluarea se face după livrare' using errcode = '42501';
  end if;
  if v_t.shipper_company_id is null and new.rated_company_id is null then
    raise exception 'Evaluarea persoanelor fizice nu este disponibilă' using errcode = '42501';
  end if;
  return new;
end;
$fn$;

-- ---------------------------------------------------------------------
-- 2. Who may act, and the dials
-- ---------------------------------------------------------------------

/**
 * A member who runs the work rather than does it.
 *
 * Owner, admin and dispatcher schedule and assign; a driver captures
 * what happens on the road. The distinction is the whole reason the
 * `driver` role exists, and it is applied here rather than in a
 * component.
 */
create or replace function public.is_company_operator(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.company_members cm
    where cm.company_id = p_company_id
      and cm.user_id = auth.uid()
      and cm.role in ('owner', 'admin', 'dispatcher')
  );
$fn$;

grant execute on function public.is_company_operator(uuid) to authenticated;

/**
 * Whether the caller is the driver assigned to this order.
 *
 * `drivers.profile_id` is nullable — a fleet may hold drivers who have
 * no login at all — so a driver row without a profile matches nobody,
 * which is the correct answer rather than an oversight.
 */
create or replace function public.is_order_driver(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
    from public.transports t
    join public.drivers d on d.id = t.driver_id
    where t.id = p_order_id
      and d.profile_id is not null
      and d.profile_id = auth.uid()
  );
$fn$;

grant execute on function public.is_order_driver(uuid) to authenticated;

create table public.order_settings (
  id boolean primary key default true check (id),
  /** How long a delivered order waits for the client before it closes itself. */
  auto_complete_hours integer not null default 48 check (auto_complete_hours between 1 and 720),
  /** How long the client has to open a dispute after delivery. */
  dispute_window_hours integer not null default 48 check (dispute_window_hours between 1 and 720),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null
);

insert into public.order_settings (id) values (true) on conflict (id) do nothing;

alter table public.order_settings enable row level security;

-- Readable by anybody signed in: the client's page prints the deadline,
-- and a deadline nobody can read is a deadline nobody can plan around.
create policy "order_settings_read" on public.order_settings
  for select to authenticated using (true);

create or replace function public.set_order_settings(
  p_auto_complete_hours integer,
  p_dispute_window_hours integer
)
returns public.order_settings
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.order_settings;
  v_after public.order_settings;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate schimba setările comenzilor' using errcode = '42501';
  end if;

  select * into v_before from public.order_settings where id;
  update public.order_settings
  set auto_complete_hours = coalesce(p_auto_complete_hours, auto_complete_hours),
      dispute_window_hours = coalesce(p_dispute_window_hours, dispute_window_hours),
      updated_at = now(),
      updated_by = auth.uid()
  where id
  returning * into v_after;

  perform public.write_audit('order_settings.updated', 'order_settings', null,
                             to_jsonb(v_before), to_jsonb(v_after));
  return v_after;
end;
$fn$;

grant execute on function public.set_order_settings(integer, integer) to authenticated;

-- ---------------------------------------------------------------------
-- 3. What an order carries once it starts moving
--
-- The windows are two columns each rather than one text field: „marți
-- dimineața" is what people say and nothing can be sorted or reminded
-- on. `confirmation_code` is generated at creation and shown only to the
-- client — it is how a driver proves at the kerb that the person handing
-- the car over is the person who ordered the transport.
-- ---------------------------------------------------------------------
alter table public.transports
  add column pickup_from timestamptz,
  add column pickup_to timestamptz,
  add column delivery_from timestamptz,
  add column delivery_to timestamptz,
  add column picked_up_at timestamptz,
  add column confirmation_code text,
  add column confirmed_by_client_at timestamptz,
  add column auto_completed boolean not null default false,
  add column cancelled_at timestamptz,
  add column cancelled_by uuid references public.profiles (id) on delete set null,
  add column cancel_reason text,
  add column disputed_at timestamptz,
  add column dispute_category text,
  add column dispute_reason text,
  add column dispute_resolved_at timestamptz,
  add column dispute_resolution text,
  add column vehicle_flagged_at timestamptz;

alter table public.transports
  add constraint transports_pickup_window_ck
    check (pickup_to is null or pickup_from is null or pickup_to >= pickup_from),
  add constraint transports_delivery_window_ck
    check (delivery_to is null or delivery_from is null or delivery_to >= delivery_from),
  add constraint transports_cancel_reason_ck
    check (cancel_reason is null or length(cancel_reason) between 3 and 1000),
  add constraint transports_dispute_reason_ck
    check (dispute_reason is null or length(dispute_reason) between 3 and 2000),
  add constraint transports_code_ck
    check (confirmation_code is null or confirmation_code ~ '^[0-9]{6}$');

comment on column public.transports.confirmation_code is
  'Six digits the client reads on their order page and gives the driver at handover. Never shown to the carrier before delivery: it is the client''s half of the proof, and a code both sides can see proves nothing.';

comment on column public.transports.vehicle_flagged_at is
  'Set by the nightly sweep when the assigned vehicle stopped being compliant before pickup. A flag, not a cancellation — the carrier swaps the vehicle, and the order carries on.';

create index transports_driver_idx on public.transports (driver_id, status)
  where driver_id is not null;
create index transports_auto_complete_idx on public.transports (status, delivered_at)
  where status = 'vehicle_delivered';

-- ---------------------------------------------------------------------
-- 4. The timeline
--
-- `audit_log` already records every change to `transports` through
-- `transports_audit_changes`, but that table is staff-only and stores
-- whole row diffs — it answers "what did the platform do" and not "what
-- happened to my car, and who did it". The parties get their own list.
--
-- Append-only for everybody, like the evidence below: a timeline that
-- can be rewritten is a timeline nobody can rely on in an argument.
-- ---------------------------------------------------------------------
create table public.order_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  order_id uuid not null references public.transports (id) on delete cascade,
  from_status public.transport_status,
  to_status public.transport_status not null,
  actor_user_id uuid references public.profiles (id) on delete set null,
  /** Which side acted, resolved from the row rather than claimed. */
  actor_side text not null check (actor_side in ('client', 'carrier', 'driver', 'staff', 'system')),
  actor_name text,
  note text,
  constraint order_events_note_ck check (note is null or length(note) <= 2000)
);

create index order_events_order_idx on public.order_events (order_id, created_at);

alter table public.order_events enable row level security;

create policy "order_events_select_parties" on public.order_events
  for select to authenticated
  using (public.is_transport_party(order_id) or public.is_order_driver(order_id)
         or public.is_platform_admin());

create or replace function public.guard_order_events_append_only()
returns trigger
language plpgsql
as $fn$
begin
  raise exception 'Istoricul comenzii nu se modifică' using errcode = '42501';
end;
$fn$;

create trigger order_events_append_only
  before update or delete on public.order_events
  for each row execute function public.guard_order_events_append_only();

-- ---------------------------------------------------------------------
-- 5. The evidence
--
-- Immutable for everybody. There is no update policy and no delete
-- policy, and the trigger below refuses both even to a superuser path
-- that somehow acquired one — the single exception is the anonymisation
-- job, which runs as `service_role` and is the only thing that may
-- remove a row, because "you may ask for your data to be deleted" has to
-- beat "evidence is immutable" or the platform is not lawful.
--
-- Staff may hide a row with a reason. The row stays and the file stays:
-- a moderation decision somebody has to answer for later is worth
-- nothing if the thing decided about is gone.
--
-- `captured_at` is server time. A phone's clock is whatever its owner
-- set it to, and the one number in this table that an argument turns on
-- is when the photograph was taken.
--
-- `lat`/`lng` are filled only when the person allowed location for that
-- capture. They do not come from the photograph: the image pipeline
-- strips EXIF unconditionally — see `normaliseImage` — and weakening
-- that to carry coordinates through would trade a guarantee for a
-- feature. The browser's geolocation API asks, and the answer lands
-- here, or the columns stay null.
-- ---------------------------------------------------------------------
create type order_evidence_kind as enum (
  'pickup_photo',
  'condition_report',
  'transport_document',
  'delivery_photo',
  'recipient_confirmation',
  'incident_note'
);

create table public.order_evidence (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.transports (id) on delete cascade,
  kind order_evidence_kind not null,
  /** Path in the private `order-evidence` bucket. Null for a note. */
  file_path text,
  note text,
  /** Server time, never the device's. */
  captured_at timestamptz not null default now(),
  uploaded_by uuid references public.profiles (id) on delete set null,
  /** Which firm captured it: the carrier, almost always. */
  company_id uuid references public.companies (id) on delete set null,
  lat numeric(9,6),
  lng numeric(9,6),
  /** The condition checklist, for `condition_report`. */
  payload jsonb not null default '{}'::jsonb,
  hidden_at timestamptz,
  hidden_by uuid references public.profiles (id) on delete set null,
  hidden_reason text,
  constraint order_evidence_note_ck check (note is null or length(note) <= 2000),
  constraint order_evidence_body_ck check (file_path is not null or note is not null or payload <> '{}'::jsonb),
  constraint order_evidence_lat_ck check (lat is null or lat between -90 and 90),
  constraint order_evidence_lng_ck check (lng is null or lng between -180 and 180),
  constraint order_evidence_geo_ck check ((lat is null) = (lng is null)),
  constraint order_evidence_hidden_ck check ((hidden_at is null) = (hidden_reason is null))
);

create index order_evidence_order_idx on public.order_evidence (order_id, kind, captured_at);

alter table public.order_evidence enable row level security;

create policy "order_evidence_select_parties" on public.order_evidence
  for select to authenticated
  using (public.is_transport_party(order_id) or public.is_order_driver(order_id)
         or public.is_platform_admin());

-- Inserted by the carrier's side only. The client's photographs of the
-- vehicle live on their request, where they were taken before anybody
-- was hired; the comparison view puts the two side by side without
-- needing them in one table.
create policy "order_evidence_insert_carrier" on public.order_evidence
  for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.transports t
      where t.id = order_id
        and (public.is_company_member(t.carrier_company_id) or public.is_order_driver(t.id))
    )
  );

/**
 * The body never changes; only the hidden flag does.
 *
 * Users are already stopped by RLS — there is no update policy and no
 * delete policy on this table. This trigger is for the paths RLS does
 * not see: a SECURITY DEFINER function runs as the owner and would
 * otherwise be free to rewrite a photograph's path or a checklist after
 * the fact.
 *
 * So rather than a door somebody has to remember to close, the rule is
 * stated as what may differ: the three `hidden_*` columns and nothing
 * else. `staff_hide_order_evidence()` passes because that is all it
 * touches; anything that tried to change `file_path`, `note`,
 * `payload`, `captured_at` or who captured it does not, whoever it is.
 *
 * Deletion is refused outright except for `service_role`, which is the
 * anonymisation job — "you may ask for your data to be deleted" has to
 * beat "evidence is immutable", or the platform is not lawful.
 */
create or replace function public.guard_order_evidence_immutable()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if current_user = 'service_role' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' then
    raise exception 'Dovezile unei comenzi nu se șterg' using errcode = '42501';
  end if;

  if to_jsonb(new) - 'hidden_at' - 'hidden_by' - 'hidden_reason'
     is distinct from
     to_jsonb(old) - 'hidden_at' - 'hidden_by' - 'hidden_reason' then
    raise exception 'Dovezile unei comenzi nu se modifică' using errcode = '42501';
  end if;

  return new;
end;
$fn$;

create trigger order_evidence_immutable
  before update or delete on public.order_evidence
  for each row execute function public.guard_order_evidence_immutable();

create or replace function public.staff_hide_order_evidence(
  p_evidence_id uuid,
  p_reason text
)
returns public.order_evidence
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.order_evidence;
  v_after public.order_evidence;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate ascunde o dovadă' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Scrie de ce ascunzi dovada. Motivul rămâne în jurnal.' using errcode = '22023';
  end if;

  select * into v_before from public.order_evidence where id = p_evidence_id;
  if v_before.id is null then
    raise exception 'Dovada nu există' using errcode = 'P0002';
  end if;

  -- Only the three hidden_* columns, which is exactly what the
  -- immutability trigger lets through.
  update public.order_evidence
  set hidden_at = now(), hidden_by = auth.uid(), hidden_reason = trim(p_reason)
  where id = p_evidence_id
  returning * into v_after;

  perform public.write_audit('order_evidence.hidden', 'order_evidence', p_evidence_id,
                             to_jsonb(v_before), to_jsonb(v_after), trim(p_reason));
  return v_after;
end;
$fn$;

grant execute on function public.staff_hide_order_evidence(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Where the photographs live
--
-- A private bucket, because these are photographs of somebody's car at
-- somebody's address, taken by somebody's driver. Nothing about them is
-- public, and the pages that show them ask for a signed URL that expires.
--
-- The path convention is `<order_id>/<evidence_id>.<ext>`, so the first
-- folder is the key every policy below reads — the same shape as the
-- `documents` bucket, and `safe_uuid()` is reused so a path whose first
-- segment is not a uuid returns null instead of raising inside a policy
-- and taking every read of the table down with it.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('order-evidence', 'order-evidence', false, 10485760,
   array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])
on conflict (id) do nothing;

create policy "order_evidence_read_parties" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'order-evidence'
    and (
      public.is_platform_admin()
      or public.is_transport_party(public.safe_uuid((storage.foldername(name))[1]))
      or public.is_order_driver(public.safe_uuid((storage.foldername(name))[1]))
    )
  );

-- Only the carrier's side puts files here, and only while the order is
-- theirs. The client's photographs of the vehicle live on the request.
create policy "order_evidence_insert_carrier" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'order-evidence'
    and exists (
      select 1 from public.transports t
      where t.id = public.safe_uuid((storage.foldername(name))[1])
        and (public.is_company_member(t.carrier_company_id) or public.is_order_driver(t.id))
    )
  );

-- No update and no delete policy at all: a file behind a piece of
-- evidence is as immutable as the row that points at it. The
-- anonymisation job runs as `service_role`, which RLS does not apply to.

-- ---------------------------------------------------------------------
-- 7. The evidence a transition needs
--
-- Written as a function rather than inline so the rule has one home and
-- the screens can ask the same question before they offer a button.
-- Hidden rows do not count: if staff had to hide a photograph, the
-- transition it was holding up has already happened.
-- ---------------------------------------------------------------------
create or replace function public.order_evidence_count(
  p_order_id uuid,
  p_kind public.order_evidence_kind
)
returns integer
language sql
stable
security definer
set search_path = public
as $fn$
  select count(*)::integer
  from public.order_evidence e
  where e.order_id = p_order_id and e.kind = p_kind and e.hidden_at is null;
$fn$;

grant execute on function public.order_evidence_count(uuid, public.order_evidence_kind) to authenticated;

/** How many photographs each side of the job needs before it may move on. */
create or replace function public.order_required_photos()
returns integer language sql immutable set search_path = public
as $fn$ select 4 $fn$;

grant execute on function public.order_required_photos() to anon, authenticated;

-- ---------------------------------------------------------------------
-- 8. The confirmation code
--
-- A trigger rather than a line in `create_order()`, so both ways an
-- order comes into being — an accepted offer and a confirmed seat
-- reservation — get one without either path having to remember.
--
-- Six digits, from `random()`. It is not a secret: it is scoped to one
-- order, it is worth nothing to anybody who is not standing at the kerb
-- with that car, and it exists so a driver can tell the person handing
-- the car over from a person who happens to be there.
-- ---------------------------------------------------------------------
create or replace function public.set_order_confirmation_code()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  if new.confirmation_code is null then
    new.confirmation_code := lpad((floor(random() * 1000000))::integer::text, 6, '0');
  end if;
  return new;
end;
$fn$;

create trigger transports_set_confirmation_code
  before insert on public.transports
  for each row execute function public.set_order_confirmation_code();

update public.transports
set confirmation_code = lpad((floor(random() * 1000000))::integer::text, 6, '0')
where confirmation_code is null;

-- ---------------------------------------------------------------------
-- 9. Which side is asking
--
-- Resolved from the row, never from what the caller says about
-- themselves. Staff is checked first so a staff member who also happens
-- to be a party is recorded as staff, which is the answer an audit
-- wants.
-- ---------------------------------------------------------------------
create or replace function public.order_actor_side(p_order public.transports)
returns text
language sql
stable
security definer
set search_path = public
as $fn$
  select case
    when auth.uid() is null then 'system'
    when public.is_platform_admin() then 'staff'
    when public.is_order_driver(p_order.id) then 'driver'
    when public.is_company_member(p_order.carrier_company_id) then 'carrier'
    when p_order.shipper_user_id = auth.uid() then 'client'
    when p_order.shipper_company_id is not null
         and public.is_company_member(p_order.shipper_company_id) then 'client'
    else null
  end;
$fn$;

grant execute on function public.order_actor_side(public.transports) to authenticated;

-- ---------------------------------------------------------------------
-- 10. transition_order() - the only way a status changes
--
-- One function rather than seven, because the interesting part is not
-- any single step: it is that from, to, actor and evidence are checked
-- in one place, so a step added later cannot quietly skip one of the
-- four.
--
-- Cancellation, opening a dispute and resolving one are separate RPCs
-- below. They take mandatory arguments this one has no use for — a
-- reason, a category, a decision — and folding them in would give this
-- function a payload whose required keys depend on the target, which is
-- how a validated transition turns back into a free-form update.
--
-- The lock is `for update` on the order. Two dispatchers pressing the
-- same button is ordinary; one of them gets the transition and the other
-- gets a sentence saying where the order actually is.
-- ---------------------------------------------------------------------
create or replace function public.transition_order(
  p_order_id uuid,
  p_to public.transport_status,
  p_payload jsonb default '{}'::jsonb
)
returns public.transports
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_order public.transports;
  v_before jsonb;
  v_side text;
  v_from public.transport_status;
  v_required integer := public.order_required_photos();
  v_photos integer;
  v_reports integer;
  v_confirmations integer;
  v_signed boolean;
  v_code text;
  v_note text := nullif(trim(coalesce(p_payload ->> 'note', '')), '');
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Autentificare necesară' using errcode = '42501';
  end if;

  select * into v_order from public.transports where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'Comandă inexistentă' using errcode = 'P0002';
  end if;

  v_before := to_jsonb(v_order);
  v_from := v_order.status;
  v_side := public.order_actor_side(v_order);

  if v_side is null then
    raise exception 'Comanda nu îți aparține' using errcode = '42501';
  end if;
  if v_from in ('cancelled', 'order_completed') then
    raise exception 'Comanda este închisă și nu mai poate fi schimbată' using errcode = '55000';
  end if;
  if v_from = 'disputed' and v_side <> 'staff' then
    raise exception 'Comanda este în dispută. Echipa platformei o deblochează.' using errcode = '55000';
  end if;

  -- 1. from -> to. Re-scheduling a window is allowed on purpose: a
  --    pickup time moves, and forcing a cancellation to move it would
  --    lose the order's history.
  if not (
    (v_from = 'order_confirmed'    and p_to = 'pickup_scheduled')
    or (v_from = 'pickup_scheduled'   and p_to in ('pickup_scheduled', 'vehicle_picked_up'))
    or (v_from = 'vehicle_picked_up'  and p_to = 'in_transit')
    or (v_from = 'in_transit'         and p_to = 'delivery_scheduled')
    or (v_from = 'delivery_scheduled' and p_to in ('delivery_scheduled', 'vehicle_delivered'))
    or (v_from = 'vehicle_delivered'  and p_to = 'order_completed')
    or (v_side = 'staff' and p_to in ('order_completed', 'cancelled', 'disputed'))
  ) then
    raise exception 'Comanda nu poate trece de la % la %', v_from, p_to using errcode = '55000';
  end if;

  -- 2. Who may do this step.
  if p_to in ('pickup_scheduled', 'vehicle_picked_up', 'in_transit',
              'delivery_scheduled', 'vehicle_delivered') then
    if v_side not in ('carrier', 'driver', 'staff') then
      raise exception 'Pasul acesta îl face transportatorul' using errcode = '42501';
    end if;
    -- A driver drives; scheduling is the dispatcher's.
    if p_to in ('pickup_scheduled', 'delivery_scheduled')
       and v_side = 'driver'
       and not public.is_company_operator(v_order.carrier_company_id) then
      raise exception 'Programarea o face dispecerul firmei' using errcode = '42501';
    end if;
  elsif p_to = 'order_completed' then
    if v_side not in ('client', 'staff') then
      raise exception 'Confirmarea livrării o face clientul' using errcode = '42501';
    end if;
  end if;

  -- 3. What the step needs.
  if p_to = 'pickup_scheduled' then
    if p_payload ? 'pickup_from' and nullif(p_payload ->> 'pickup_from', '') is not null then
      v_order.pickup_from := (p_payload ->> 'pickup_from')::timestamptz;
      v_order.pickup_to := nullif(p_payload ->> 'pickup_to', '')::timestamptz;
    else
      raise exception 'Alege când ridici vehiculul' using errcode = '23502';
    end if;
    if v_order.pickup_to is not null and v_order.pickup_to < v_order.pickup_from then
      raise exception 'Intervalul de ridicare se termină înainte să înceapă' using errcode = '22023';
    end if;
    if v_order.driver_id is null or v_order.vehicle_id is null then
      raise exception 'Alege întâi șoferul și vehiculul pentru comandă' using errcode = '23502';
    end if;

  elsif p_to = 'vehicle_picked_up' then
    v_photos := public.order_evidence_count(p_order_id, 'pickup_photo');
    v_reports := public.order_evidence_count(p_order_id, 'condition_report');
    if v_photos < v_required then
      raise exception 'Mai ai nevoie de % fotografii la ridicare (ai %)',
        v_required - v_photos, v_photos using errcode = '23502';
    end if;
    if v_reports < 1 then
      raise exception 'Completează fișa de stare a vehiculului înainte de ridicare' using errcode = '23502';
    end if;
    v_order.picked_up_at := now();
    v_order.loaded_at := now();

  elsif p_to = 'delivery_scheduled' then
    if p_payload ? 'delivery_from' and nullif(p_payload ->> 'delivery_from', '') is not null then
      v_order.delivery_from := (p_payload ->> 'delivery_from')::timestamptz;
      v_order.delivery_to := nullif(p_payload ->> 'delivery_to', '')::timestamptz;
    else
      raise exception 'Alege când livrezi vehiculul' using errcode = '23502';
    end if;
    if v_order.delivery_to is not null and v_order.delivery_to < v_order.delivery_from then
      raise exception 'Intervalul de livrare se termină înainte să înceapă' using errcode = '22023';
    end if;

  elsif p_to = 'vehicle_delivered' then
    v_photos := public.order_evidence_count(p_order_id, 'delivery_photo');
    if v_photos < v_required then
      raise exception 'Mai ai nevoie de % fotografii la livrare (ai %)',
        v_required - v_photos, v_photos using errcode = '23502';
    end if;

    select count(*) filter (where e.hidden_at is null),
           bool_or(e.file_path is not null and e.hidden_at is null),
           max(e.note) filter (where e.hidden_at is null)
      into v_confirmations, v_signed, v_name
    from public.order_evidence e
    where e.order_id = p_order_id and e.kind = 'recipient_confirmation';

    if coalesce(v_confirmations, 0) < 1 or coalesce(trim(v_name), '') = '' then
      raise exception 'Scrie cine a primit vehiculul' using errcode = '23502';
    end if;

    -- Either the person signed, or they read out the code the client
    -- has been looking at on their own screen. One of the two, never
    -- neither: this is the moment the platform can say the car reached
    -- the right hands.
    v_code := nullif(trim(coalesce(p_payload ->> 'code', '')), '');
    if not coalesce(v_signed, false) then
      if v_code is null then
        raise exception 'Cere codul de confirmare clientului sau semnătura persoanei care primește vehiculul'
          using errcode = '23502';
      end if;
      if v_code is distinct from v_order.confirmation_code then
        raise exception 'Codul nu este corect. Cere-i clientului codul din pagina comenzii.'
          using errcode = '42501';
      end if;
    end if;
    v_order.delivered_at := now();

  elsif p_to = 'order_completed' then
    if v_side = 'client' then
      v_order.confirmed_by_client_at := now();
    end if;
    v_order.closed_at := now();
  end if;

  -- 4. Write it.
  update public.transports
  set status = p_to,
      pickup_from = v_order.pickup_from,
      pickup_to = v_order.pickup_to,
      delivery_from = v_order.delivery_from,
      delivery_to = v_order.delivery_to,
      picked_up_at = v_order.picked_up_at,
      loaded_at = v_order.loaded_at,
      delivered_at = v_order.delivered_at,
      closed_at = v_order.closed_at,
      confirmed_by_client_at = v_order.confirmed_by_client_at
  where id = p_order_id
  returning * into v_order;

  insert into public.order_events (order_id, from_status, to_status, actor_user_id, actor_side, actor_name, note)
  select p_order_id, v_from, p_to, auth.uid(), v_side, p.full_name, v_note
  from public.profiles p where p.id = auth.uid();

  perform public.sync_request_to_order(v_order);
  perform public.queue_order_notification(v_order, v_from, p_to);
  perform public.write_audit('order.transition', 'transports', p_order_id, v_before, to_jsonb(v_order),
                             format('%s -> %s', v_from, p_to));

  return v_order;
end;
$fn$;

grant execute on function public.transition_order(uuid, public.transport_status, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 11. The request follows the order
--
-- One writer, so the two can never disagree: `transition_order()` calls
-- this and nothing else touches `cargo_listings.status` once an order
-- exists. The values were already in `listing_status` — 20260917090000
-- added them and left them unwritten, waiting for this phase.
--
-- `order_completed` deliberately leaves the request at `delivered`. The
-- client confirming is about the order, not about the request, and a
-- request that changed status twice for one delivery would read as two
-- events on the client's list.
-- ---------------------------------------------------------------------
create or replace function public.sync_request_to_order(p_order public.transports)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if p_order.cargo_listing_id is null then
    return;
  end if;

  if p_order.status = 'vehicle_picked_up' then
    update public.cargo_listings set status = 'in_progress' where id = p_order.cargo_listing_id;
  elsif p_order.status = 'vehicle_delivered' then
    update public.cargo_listings set status = 'delivered' where id = p_order.cargo_listing_id;
  elsif p_order.status = 'disputed' then
    update public.cargo_listings set status = 'disputed' where id = p_order.cargo_listing_id;
  end if;
end;
$fn$;

revoke all on function public.sync_request_to_order(public.transports) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 12. Who gets told what
--
-- Nine events, each with a dedupe key built from the order and the
-- status, so a transition applied twice by two dispatchers sends one
-- e-mail. The client hears about every step; the carrier hears about
-- the things it cannot see coming.
-- ---------------------------------------------------------------------
create or replace function public.queue_order_notification(
  p_order public.transports,
  p_from public.transport_status,
  p_to public.transport_status
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_template text;
  v_to_client boolean := true;
  v_client_user uuid;
  v_client_email text;
  v_carrier_email text;
  v_carrier public.companies;
  v_listing public.cargo_listings;
  v_payload jsonb;
  v_hours integer;
begin
  v_template := case p_to
    when 'pickup_scheduled'   then 'order_pickup_scheduled'
    when 'vehicle_picked_up'  then 'order_picked_up'
    when 'in_transit'         then 'order_in_transit'
    when 'delivery_scheduled' then 'order_delivery_scheduled'
    when 'vehicle_delivered'  then 'order_delivered'
    when 'order_completed'    then 'order_completed'
    else null
  end;
  if v_template is null then
    return;
  end if;

  -- The carrier hears about completion; the client about everything else.
  if p_to = 'order_completed' then
    v_to_client := false;
  end if;

  select * into v_carrier from public.companies where id = p_order.carrier_company_id;
  select * into v_listing from public.cargo_listings where id = p_order.cargo_listing_id;
  select coalesce(p_order.shipper_user_id, v_listing.posted_by) into v_client_user;

  select coalesce(sc.contact_email, p.email) into v_client_email
  from public.profiles p
  left join public.companies sc on sc.id = p_order.shipper_company_id
  where p.id = v_client_user;

  -- The firm's own address first; the owner's only when the firm has
  -- given none. Written in two steps because a subselect that finds no
  -- member would otherwise wipe the address the firm did give.
  v_carrier_email := coalesce(v_carrier.alerts_email, v_carrier.contact_email);
  if v_carrier_email is null then
    select p.email into v_carrier_email
    from public.company_members cm
    join public.profiles p on p.id = cm.user_id
    where cm.company_id = p_order.carrier_company_id
    order by case cm.role when 'owner' then 0 when 'admin' then 1 else 2 end
    limit 1;
  end if;

  select auto_complete_hours into v_hours from public.order_settings where id;

  v_payload := jsonb_build_object(
    'order_id', p_order.id,
    'from_city', v_listing.loading_city,
    'to_city', v_listing.unloading_city,
    'carrier_name', coalesce(v_carrier.display_name, v_carrier.legal_name),
    'deadline_hours', v_hours,
    'pickup_from', p_order.pickup_from,
    'delivery_from', p_order.delivery_from
  );

  if v_to_client and v_client_email is not null then
    insert into public.notification_outbox
      (channel, template, recipient_user_id, recipient_company_id, to_email, payload, dedupe_key)
    values ('email', v_template, v_client_user, p_order.shipper_company_id, v_client_email,
            v_payload, v_template || ':' || p_order.id)
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  elsif not v_to_client and v_carrier_email is not null then
    insert into public.notification_outbox
      (channel, template, recipient_company_id, to_email, payload, dedupe_key)
    values ('email', v_template, p_order.carrier_company_id, v_carrier_email,
            v_payload, v_template || ':' || p_order.id)
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end if;
end;
$fn$;

revoke all on function public.queue_order_notification(public.transports, public.transport_status, public.transport_status)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 13. Who drives it, and in what
--
-- Both must belong to the carrier, the vehicle must be compliant, and
-- changing either after the car has been picked up is allowed but
-- recorded — a swap mid-journey is ordinary (a breakdown, a shift
-- change) and hiding it would make the evidence harder to read later,
-- not easier.
-- ---------------------------------------------------------------------
create or replace function public.assign_order_crew(
  p_order_id uuid,
  p_driver_id uuid,
  p_vehicle_id uuid
)
returns public.transports
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_order public.transports;
  v_before jsonb;
  v_driver public.drivers;
  v_vehicle public.vehicles;
begin
  select * into v_order from public.transports where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'Comandă inexistentă' using errcode = 'P0002';
  end if;
  if not (public.is_company_operator(v_order.carrier_company_id) or public.is_platform_admin()) then
    raise exception 'Doar firma de transport alege șoferul și vehiculul' using errcode = '42501';
  end if;
  if v_order.status in ('order_completed', 'cancelled') then
    raise exception 'Comanda este închisă' using errcode = '55000';
  end if;

  v_before := to_jsonb(v_order);

  select * into v_driver from public.drivers where id = p_driver_id;
  if v_driver.id is null or v_driver.company_id <> v_order.carrier_company_id then
    raise exception 'Șoferul nu face parte din firma ta' using errcode = '42501';
  end if;
  if not v_driver.is_active then
    raise exception 'Șoferul nu este activ' using errcode = '55000';
  end if;

  select * into v_vehicle from public.vehicles where id = p_vehicle_id;
  if v_vehicle.id is null or v_vehicle.company_id <> v_order.carrier_company_id then
    raise exception 'Vehiculul nu face parte din flota ta' using errcode = '42501';
  end if;
  if not v_vehicle.is_active or not v_vehicle.is_compliant then
    raise exception 'Vehiculul nu are actele în termen' using errcode = '55000';
  end if;

  update public.transports
  set driver_id = p_driver_id,
      vehicle_id = p_vehicle_id,
      -- A compliant vehicle clears the flag the sweep may have raised.
      vehicle_flagged_at = null
  where id = p_order_id
  returning * into v_order;

  insert into public.order_events (order_id, from_status, to_status, actor_user_id, actor_side, actor_name, note)
  select p_order_id, v_order.status, v_order.status, auth.uid(),
         public.order_actor_side(v_order), p.full_name,
         format('%s · %s', v_driver.full_name, v_vehicle.plate_number)
  from public.profiles p where p.id = auth.uid();

  perform public.write_audit(
    case when v_order.picked_up_at is null then 'order.crew_assigned' else 'order.crew_changed' end,
    'transports', p_order_id, v_before, to_jsonb(v_order));

  -- The driver hears about it, because the order appears on their phone.
  if v_driver.profile_id is not null then
    insert into public.notification_outbox
      (channel, template, recipient_user_id, recipient_company_id, to_email, payload, dedupe_key)
    select 'email', 'order_driver_assigned', v_driver.profile_id, v_order.carrier_company_id,
           p.email,
           jsonb_build_object('order_id', p_order_id, 'plate', v_vehicle.plate_number),
           'order_driver_assigned:' || p_order_id || ':' || p_driver_id
    from public.profiles p
    where p.id = v_driver.profile_id and p.email is not null
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end if;

  return v_order;
end;
$fn$;

grant execute on function public.assign_order_crew(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 14. Cancelling
--
-- Before the car is picked up, either party may cancel with a reason.
-- Afterwards nobody but staff can: once a vehicle is on a lorry, what
-- happens to it is a conversation, not a button.
--
-- What becomes of the request is the decision this brief asked to be
-- made and written down:
--
--   * the seats, if any, are freed — the booking goes to `cancelled`,
--     and `departure_seats_taken()` stops counting it the moment it does;
--   * the request goes back on the board when its loading window has
--     not passed, because the client still needs the car moved and
--     making them retype the whole request is a punishment for the
--     carrier's change of mind;
--   * it goes to `expired` when the window has passed, because putting
--     a request back on the board for dates that are gone is worse than
--     not putting it back at all;
--   * a client who does not want it re-listed says so, and then it is
--     `cancelled`. A carrier cannot make that choice for them.
-- ---------------------------------------------------------------------
create or replace function public.cancel_order(
  p_order_id uuid,
  p_reason text,
  p_relist boolean default true
)
returns public.transports
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_order public.transports;
  v_before jsonb;
  v_side text;
  v_listing public.cargo_listings;
  v_window date;
  v_new_status public.listing_status;
begin
  select * into v_order from public.transports where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'Comandă inexistentă' using errcode = 'P0002';
  end if;

  v_side := public.order_actor_side(v_order);
  if v_side is null then
    raise exception 'Comanda nu îți aparține' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Scrie de ce anulezi comanda' using errcode = '23502';
  end if;
  if v_order.status in ('order_completed', 'cancelled') then
    raise exception 'Comanda este deja închisă' using errcode = '55000';
  end if;
  if v_order.status not in ('order_confirmed', 'pickup_scheduled') and v_side <> 'staff' then
    raise exception 'Vehiculul este deja ridicat. Scrie-ne și rezolvăm împreună.' using errcode = '42501';
  end if;
  if v_side = 'driver' then
    raise exception 'Anularea o face firma, nu șoferul' using errcode = '42501';
  end if;

  v_before := to_jsonb(v_order);

  update public.transports
  set status = 'cancelled',
      cancelled_at = now(),
      cancelled_by = auth.uid(),
      cancel_reason = trim(p_reason),
      closed_at = now()
  where id = p_order_id
  returning * into v_order;

  -- Seats are counted, not stored, so freeing them is one status change.
  if v_order.departure_booking_id is not null then
    update public.departure_bookings set status = 'cancelled'
    where id = v_order.departure_booking_id;
  end if;

  if v_order.cargo_listing_id is not null then
    select * into v_listing from public.cargo_listings where id = v_order.cargo_listing_id for update;
    v_window := coalesce(v_listing.loading_to, v_listing.loading_from);

    if not coalesce(p_relist, true) and v_side = 'client' then
      v_new_status := 'cancelled';
    elsif v_window >= current_date then
      v_new_status := 'active';
    else
      v_new_status := 'expired';
    end if;

    update public.cargo_listings set status = v_new_status where id = v_listing.id;
  end if;

  insert into public.order_events (order_id, from_status, to_status, actor_user_id, actor_side, actor_name, note)
  select p_order_id, (v_before ->> 'status')::public.transport_status, 'cancelled',
         auth.uid(), v_side, p.full_name, trim(p_reason)
  from public.profiles p where p.id = auth.uid();

  perform public.write_audit('order.cancelled', 'transports', p_order_id, v_before,
                             to_jsonb(v_order), trim(p_reason));
  perform public.queue_order_side_notification(v_order, 'order_cancelled',
    case when v_side = 'client' then 'carrier' else 'client' end, trim(p_reason));

  return v_order;
end;
$fn$;

grant execute on function public.cancel_order(uuid, text, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 15. One notification, to one named side
--
-- `queue_order_notification()` above follows the lifecycle; this one is
-- for the events that are not a step — a cancellation, a dispute, a
-- decision — where the interesting question is which side has to hear
-- about it.
-- ---------------------------------------------------------------------
create or replace function public.queue_order_side_notification(
  p_order public.transports,
  p_template text,
  p_side text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_listing public.cargo_listings;
  v_carrier public.companies;
  v_email text;
  v_user uuid;
  v_company uuid;
  v_payload jsonb;
begin
  select * into v_listing from public.cargo_listings where id = p_order.cargo_listing_id;
  select * into v_carrier from public.companies where id = p_order.carrier_company_id;

  if p_side = 'client' then
    v_user := coalesce(p_order.shipper_user_id, v_listing.posted_by);
    v_company := p_order.shipper_company_id;
    select coalesce(sc.contact_email, p.email) into v_email
    from public.profiles p
    left join public.companies sc on sc.id = p_order.shipper_company_id
    where p.id = v_user;
  else
    v_company := p_order.carrier_company_id;
    v_email := coalesce(v_carrier.alerts_email, v_carrier.contact_email);
    if v_email is null then
      select cm.user_id, p.email into v_user, v_email
      from public.company_members cm
      join public.profiles p on p.id = cm.user_id
      where cm.company_id = p_order.carrier_company_id
      order by case cm.role when 'owner' then 0 when 'admin' then 1 else 2 end
      limit 1;
    end if;
  end if;

  if v_email is null then
    return;
  end if;

  v_payload := jsonb_build_object(
    'order_id', p_order.id,
    'from_city', v_listing.loading_city,
    'to_city', v_listing.unloading_city,
    'carrier_name', coalesce(v_carrier.display_name, v_carrier.legal_name),
    'reason', p_reason
  );

  insert into public.notification_outbox
    (channel, template, recipient_user_id, recipient_company_id, to_email, payload, dedupe_key)
  values ('email', p_template, v_user, v_company, v_email, v_payload,
          p_template || ':' || p_order.id || ':' || p_side)
  on conflict (dedupe_key) where dedupe_key is not null do nothing;
end;
$fn$;

revoke all on function public.queue_order_side_notification(public.transports, text, text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 16. Disputes
--
-- Minimal on purpose: the platform is not a court and holds nobody's
-- money. A dispute stops the clock, tells everybody, and puts the whole
-- evidence trail in front of a person who decides. What it never does is
-- move money, because there is none to move.
-- ---------------------------------------------------------------------
create table public.order_dispute_reasons (
  code text primary key,
  label text not null,
  sort_order integer not null default 0
);

insert into public.order_dispute_reasons (code, label, sort_order) values
  ('avarii',        'Vehiculul a ajuns cu avarii', 10),
  ('intarziere',    'Livrare mult întârziată', 20),
  ('lipsa_obiecte', 'Lipsesc obiecte din vehicul', 30),
  ('alt_vehicul',   'Nu este vehiculul meu sau este alt model', 40),
  ('nelivrat',      'Vehiculul nu a fost livrat', 50),
  ('altceva',       'Altceva', 90)
on conflict (code) do nothing;

alter table public.order_dispute_reasons enable row level security;
create policy "order_dispute_reasons_read" on public.order_dispute_reasons
  for select to authenticated using (true);

create or replace function public.open_order_dispute(
  p_order_id uuid,
  p_category text,
  p_reason text
)
returns public.transports
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_order public.transports;
  v_before jsonb;
  v_side text;
  v_hours integer;
begin
  select * into v_order from public.transports where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'Comandă inexistentă' using errcode = 'P0002';
  end if;

  v_side := public.order_actor_side(v_order);
  if v_side not in ('client', 'staff') then
    raise exception 'Doar clientul deschide o dispută' using errcode = '42501';
  end if;
  if v_order.status <> 'vehicle_delivered' and v_side <> 'staff' then
    raise exception 'Disputa se deschide la livrare, cât timp comanda așteaptă confirmarea ta'
      using errcode = '55000';
  end if;
  if not exists (select 1 from public.order_dispute_reasons where code = p_category) then
    raise exception 'Alege un motiv din listă' using errcode = '23514';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Scrie ce s-a întâmplat' using errcode = '23502';
  end if;

  select dispute_window_hours into v_hours from public.order_settings where id;
  if v_side = 'client' and v_order.delivered_at is not null
     and v_order.delivered_at + make_interval(hours => v_hours) < now() then
    raise exception 'Perioada în care puteai deschide o dispută s-a încheiat. Scrie-ne și ne uităm oricum.'
      using errcode = '55000';
  end if;

  v_before := to_jsonb(v_order);

  update public.transports
  set status = 'disputed',
      disputed_at = now(),
      dispute_category = p_category,
      dispute_reason = trim(p_reason)
  where id = p_order_id
  returning * into v_order;

  insert into public.order_events (order_id, from_status, to_status, actor_user_id, actor_side, actor_name, note)
  select p_order_id, (v_before ->> 'status')::public.transport_status, 'disputed',
         auth.uid(), v_side, p.full_name, trim(p_reason)
  from public.profiles p where p.id = auth.uid();

  perform public.sync_request_to_order(v_order);
  perform public.write_audit('order.disputed', 'transports', p_order_id, v_before,
                             to_jsonb(v_order), trim(p_reason));
  perform public.queue_order_side_notification(v_order, 'order_dispute_opened', 'carrier', trim(p_reason));

  return v_order;
end;
$fn$;

grant execute on function public.open_order_dispute(uuid, text, text) to authenticated;

create or replace function public.resolve_order_dispute(
  p_order_id uuid,
  p_outcome public.transport_status,
  p_note text
)
returns public.transports
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_order public.transports;
  v_before jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei închide o dispută' using errcode = '42501';
  end if;
  if p_outcome not in ('order_completed', 'cancelled') then
    raise exception 'O dispută se închide ca finalizată sau ca anulată' using errcode = '23514';
  end if;
  if coalesce(trim(p_note), '') = '' then
    raise exception 'Scrie decizia. Rămâne în jurnal și o văd ambele părți.' using errcode = '23502';
  end if;

  select * into v_order from public.transports where id = p_order_id for update;
  if v_order.id is null then
    raise exception 'Comandă inexistentă' using errcode = 'P0002';
  end if;
  if v_order.status <> 'disputed' then
    raise exception 'Comanda nu este în dispută' using errcode = '55000';
  end if;

  v_before := to_jsonb(v_order);

  update public.transports
  set status = p_outcome,
      dispute_resolved_at = now(),
      dispute_resolution = trim(p_note),
      closed_at = now(),
      cancelled_at = case when p_outcome = 'cancelled' then now() else cancelled_at end,
      cancel_reason = case when p_outcome = 'cancelled' then trim(p_note) else cancel_reason end
  where id = p_order_id
  returning * into v_order;

  if p_outcome = 'cancelled' and v_order.departure_booking_id is not null then
    update public.departure_bookings set status = 'cancelled'
    where id = v_order.departure_booking_id;
  end if;

  insert into public.order_events (order_id, from_status, to_status, actor_user_id, actor_side, actor_name, note)
  select p_order_id, 'disputed', p_outcome, auth.uid(), 'staff', p.full_name, trim(p_note)
  from public.profiles p where p.id = auth.uid();

  perform public.write_audit('order.dispute_resolved', 'transports', p_order_id, v_before,
                             to_jsonb(v_order), trim(p_note));
  perform public.queue_order_side_notification(v_order, 'order_dispute_resolved', 'client', trim(p_note));
  perform public.queue_order_side_notification(v_order, 'order_dispute_resolved', 'carrier', trim(p_note));

  return v_order;
end;
$fn$;

grant execute on function public.resolve_order_dispute(uuid, public.transport_status, text) to authenticated;

-- ---------------------------------------------------------------------
-- 17. The order that closes itself
--
-- A client who is happy says nothing. Leaving every delivered order open
-- for ever would mean a carrier never knows a job is done, so after the
-- window in `order_settings` the platform closes it and says so to both
-- sides.
--
-- `p_now` is a parameter so a test can move time rather than wait two
-- days for one assertion. `auth.uid()` is null inside the job, which is
-- what makes `write_audit()` record the actor as `system` — that is the
-- whole mechanism, and it needs nothing else.
-- ---------------------------------------------------------------------
create or replace function public.complete_stale_orders(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r record;
  v_count integer := 0;
  v_hours integer;
  v_before jsonb;
  v_order public.transports;
begin
  select auto_complete_hours into v_hours from public.order_settings where id;

  for r in
    select t.id
    from public.transports t
    where t.status = 'vehicle_delivered'
      and t.delivered_at is not null
      and t.delivered_at + make_interval(hours => v_hours) <= p_now
  loop
    select to_jsonb(t) into v_before from public.transports t where t.id = r.id;

    update public.transports
    set status = 'order_completed',
        closed_at = p_now,
        auto_completed = true
    where id = r.id
    returning * into v_order;

    insert into public.order_events (order_id, from_status, to_status, actor_side, note)
    values (r.id, 'vehicle_delivered', 'order_completed', 'system',
            format('Închisă automat după %s de ore fără răspuns.', v_hours));

    perform public.write_audit('order.auto_completed', 'transports', r.id, v_before, to_jsonb(v_order),
                               format('%s ore fără confirmare sau dispută', v_hours));
    perform public.queue_order_side_notification(v_order, 'order_auto_completed', 'client');
    perform public.queue_order_side_notification(v_order, 'order_auto_completed', 'carrier');

    v_count := v_count + 1;
  end loop;

  perform public.log_job_run('hourly-order-autocomplete', v_count, 0, null);
  return v_count;
end;
$fn$;

comment on function public.complete_stale_orders(timestamptz) is
  'Closes orders delivered longer ago than order_settings.auto_complete_hours with no client response and no dispute. Audited as system, because auth.uid() is null in a job.';

revoke all on function public.complete_stale_orders(timestamptz) from public, anon, authenticated;
grant execute on function public.complete_stale_orders(timestamptz) to service_role;

-- ---------------------------------------------------------------------
-- 18. The vehicle that stopped being legal
--
-- The nightly compliance sweep already marks a vehicle non-compliant
-- when its ITP, RCA or conform copy lapses. What it could not do until
-- now is notice that the vehicle is booked onto a job that has not
-- started.
--
-- It flags and tells; it does not cancel. A carrier with a lapsed RCA on
-- one lorry has three others, and a platform that cancelled the client's
-- transport overnight for a document the carrier can renew in an hour
-- would be doing more harm than the lapse.
-- ---------------------------------------------------------------------
create or replace function public.flag_noncompliant_order_vehicles(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r record;
  v_count integer := 0;
  v_order public.transports;
begin
  for r in
    select t.id
    from public.transports t
    join public.vehicles v on v.id = t.vehicle_id
    where t.status in ('order_confirmed', 'pickup_scheduled')
      and t.vehicle_flagged_at is null
      and (not v.is_compliant or not v.is_active)
  loop
    update public.transports set vehicle_flagged_at = p_now where id = r.id
    returning * into v_order;

    perform public.write_audit('order.vehicle_flagged', 'transports', r.id, null, to_jsonb(v_order),
                               'Vehiculul alocat nu mai are actele în termen');
    perform public.queue_order_side_notification(v_order, 'order_vehicle_noncompliant', 'carrier');
    v_count := v_count + 1;
  end loop;

  perform public.log_job_run('nightly-order-vehicle-check', v_count, 0, null);
  return v_count;
end;
$fn$;

revoke all on function public.flag_noncompliant_order_vehicles(timestamptz) from public, anon, authenticated;
grant execute on function public.flag_noncompliant_order_vehicles(timestamptz) to service_role;

-- ---------------------------------------------------------------------
-- 19. What the screens read
--
-- Every one of these re-checks who is asking, so a page that forgot to
-- would get nothing rather than somebody else's order.
-- ---------------------------------------------------------------------
create or replace function public.my_orders(
  p_box text default 'active',
  p_role text default null
)
returns table (
  id uuid,
  created_at timestamptz,
  status public.transport_status,
  agreed_price numeric,
  currency public.currency_code,
  from_city text,
  to_city text,
  pickup_from timestamptz,
  delivery_from timestamptz,
  delivered_at timestamptz,
  request_id uuid,
  carrier_company_id uuid,
  carrier_name text,
  client_name text,
  driver_name text,
  plate_number text,
  my_side text,
  needs_me boolean,
  vehicle_flagged boolean,
  evidence_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Autentificare necesară' using errcode = '42501';
  end if;

  return query
  with mine as (
    select t.*, public.order_actor_side(t) as side
    from public.transports t
    where public.is_transport_party(t.id) or public.is_order_driver(t.id)
  )
  select
    m.id, m.created_at, m.status, m.agreed_price, m.currency,
    l.loading_city, l.unloading_city,
    m.pickup_from, m.delivery_from, m.delivered_at,
    l.id,
    m.carrier_company_id,
    coalesce(cc.display_name, cc.legal_name),
    coalesce(sc.display_name, sc.legal_name, sp.full_name),
    d.full_name,
    v.plate_number,
    m.side,
    -- „Necesită acțiunea ta": the one column a list of thirty orders is
    -- actually read for.
    case
      when m.side = 'client' then m.status = 'vehicle_delivered'
      when m.side in ('carrier', 'driver') then
        m.status in ('order_confirmed', 'pickup_scheduled', 'vehicle_picked_up',
                     'in_transit', 'delivery_scheduled')
      else false
    end,
    m.vehicle_flagged_at is not null,
    (select count(*)::integer from public.order_evidence e
     where e.order_id = m.id and e.hidden_at is null)
  from mine m
  left join public.cargo_listings l on l.id = m.cargo_listing_id
  left join public.companies cc on cc.id = m.carrier_company_id
  left join public.companies sc on sc.id = m.shipper_company_id
  left join public.profiles sp on sp.id = m.shipper_user_id
  left join public.drivers d on d.id = m.driver_id
  left join public.vehicles v on v.id = m.vehicle_id
  where (p_role is null or m.side = p_role)
    and case coalesce(p_box, 'active')
      when 'active' then m.status in ('order_confirmed', 'pickup_scheduled', 'vehicle_picked_up',
                                      'in_transit', 'delivery_scheduled', 'vehicle_delivered')
      when 'finalizate' then m.status = 'order_completed'
      when 'anulate' then m.status in ('cancelled', 'disputed')
      else true
    end
  order by
    case when m.status = 'vehicle_delivered' then 0 else 1 end,
    coalesce(m.pickup_from, m.created_at) desc;
end;
$fn$;

grant execute on function public.my_orders(text, text) to authenticated;

create or replace function public.order_detail(p_order_id uuid)
returns table (
  id uuid,
  created_at timestamptz,
  status public.transport_status,
  agreed_price numeric,
  currency public.currency_code,
  payment_term_days integer,
  pickup_from timestamptz,
  pickup_to timestamptz,
  delivery_from timestamptz,
  delivery_to timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  closed_at timestamptz,
  auto_completed boolean,
  cancelled_at timestamptz,
  cancel_reason text,
  disputed_at timestamptz,
  dispute_category text,
  dispute_reason text,
  dispute_resolved_at timestamptz,
  dispute_resolution text,
  vehicle_flagged boolean,
  /** Only ever filled for the client. The carrier's copy is null. */
  confirmation_code text,
  request_id uuid,
  request_title text,
  from_city text,
  to_city text,
  loading_from date,
  request_photos text[],
  carrier_company_id uuid,
  carrier_name text,
  carrier_slug text,
  client_name text,
  driver_id uuid,
  driver_name text,
  driver_phone text,
  vehicle_id uuid,
  plate_number text,
  vehicle_type public.vehicle_type,
  offer_id uuid,
  my_side text,
  auto_complete_hours integer,
  dispute_window_hours integer
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_order public.transports;
  v_side text;
begin
  select * into v_order from public.transports where id = p_order_id;
  if v_order.id is null then
    raise exception 'Comandă inexistentă' using errcode = 'P0002';
  end if;

  v_side := public.order_actor_side(v_order);
  if v_side is null then
    raise exception 'Comanda nu îți aparține' using errcode = '42501';
  end if;

  return query
  select
    t.id, t.created_at, t.status, t.agreed_price, t.currency, t.payment_term_days,
    t.pickup_from, t.pickup_to, t.delivery_from, t.delivery_to,
    t.picked_up_at, t.delivered_at, t.closed_at, t.auto_completed,
    t.cancelled_at, t.cancel_reason,
    t.disputed_at, t.dispute_category, t.dispute_reason, t.dispute_resolved_at, t.dispute_resolution,
    t.vehicle_flagged_at is not null,
    -- The code is the client's half of the handover proof. A carrier who
    -- could read it would not need the client to be there.
    case when v_side in ('client', 'staff') then t.confirmation_code else null end,
    l.id, l.title, l.loading_city, l.unloading_city, l.loading_from, l.photo_paths,
    t.carrier_company_id, coalesce(cc.display_name, cc.legal_name), cc.slug,
    coalesce(sc.display_name, sc.legal_name, sp.full_name),
    t.driver_id, d.full_name, d.phone,
    t.vehicle_id, v.plate_number, v.vehicle_type,
    t.offer_id,
    v_side,
    s.auto_complete_hours, s.dispute_window_hours
  from public.transports t
  cross join public.order_settings s
  left join public.cargo_listings l on l.id = t.cargo_listing_id
  left join public.companies cc on cc.id = t.carrier_company_id
  left join public.companies sc on sc.id = t.shipper_company_id
  left join public.profiles sp on sp.id = t.shipper_user_id
  left join public.drivers d on d.id = t.driver_id
  left join public.vehicles v on v.id = t.vehicle_id
  where t.id = p_order_id;
end;
$fn$;

grant execute on function public.order_detail(uuid) to authenticated;

create or replace function public.order_timeline(p_order_id uuid)
returns table (
  id uuid,
  created_at timestamptz,
  from_status public.transport_status,
  to_status public.transport_status,
  actor_side text,
  actor_name text,
  note text
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not (public.is_transport_party(p_order_id) or public.is_order_driver(p_order_id)
          or public.is_platform_admin()) then
    raise exception 'Comanda nu îți aparține' using errcode = '42501';
  end if;

  return query
  select e.id, e.created_at, e.from_status, e.to_status, e.actor_side, e.actor_name, e.note
  from public.order_events e
  where e.order_id = p_order_id
  order by e.created_at, e.id;
end;
$fn$;

grant execute on function public.order_timeline(uuid) to authenticated;

create or replace function public.order_evidence_list(p_order_id uuid)
returns table (
  id uuid,
  kind public.order_evidence_kind,
  file_path text,
  note text,
  payload jsonb,
  captured_at timestamptz,
  author_name text,
  lat numeric,
  lng numeric,
  is_hidden boolean
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not (public.is_transport_party(p_order_id) or public.is_order_driver(p_order_id)
          or public.is_platform_admin()) then
    raise exception 'Comanda nu îți aparține' using errcode = '42501';
  end if;

  return query
  select
    e.id, e.kind,
    case when e.hidden_at is null then e.file_path else null end,
    case when e.hidden_at is null then e.note else 'Ascunsă de echipa platformei.' end,
    case when e.hidden_at is null then e.payload else '{}'::jsonb end,
    e.captured_at,
    coalesce(p.full_name, 'Transportator'),
    e.lat, e.lng,
    e.hidden_at is not null
  from public.order_evidence e
  left join public.profiles p on p.id = e.uploaded_by
  where e.order_id = p_order_id
  order by e.captured_at, e.id;
end;
$fn$;

grant execute on function public.order_evidence_list(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 20. The two new jobs get scheduled, and job_health learns about them
--
-- Reproduced from 20260922100000 with one job added to each of the two
-- hardcoded lists. They stay written out rather than read from cron.job:
-- a job that vanished from the schedule has to show as missing, and a
-- list derived from the schedule could never say that.
-- ---------------------------------------------------------------------
do $cron$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise warning 'pg_cron nu este disponibil, deci închiderea automată a comenzilor nu este programată. Vezi docs/configurare-externa.md.';
    return;
  end if;
  perform cron.schedule('hourly-order-autocomplete', '40 * * * *',
                        'select public.complete_stale_orders();');
  perform cron.schedule('nightly-order-vehicle-check', '30 2 * * *',
                        'select public.flag_noncompliant_order_vehicles();');
end;
$cron$;

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
      ('hourly-listing-cleanup', 3.0), ('hourly-offer-expiry', 3.0),
      ('hourly-order-autocomplete', 3.0),
      ('hourly-push-cleanup', 3.0),
      ('nightly-compliance-sweep', 36.0),
      ('nightly-order-vehicle-check', 36.0),
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
      ('hourly-listing-cleanup', 3.0), ('hourly-offer-expiry', 3.0),
      ('hourly-order-autocomplete', 3.0), ('hourly-push-cleanup', 3.0),
      ('nightly-compliance-sweep', 36.0), ('nightly-expiry-reminders', 36.0),
      ('nightly-order-vehicle-check', 36.0),
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

-- ---------------------------------------------------------------------
-- 21. The staff list
--
-- Read-only, like the offers screen. The only things staff write near an
-- order are `resolve_order_dispute()`, `cancel_order()` and
-- `staff_hide_order_evidence()`, and all three are audited with a reason
-- they cannot leave blank.
-- ---------------------------------------------------------------------
create or replace function public.admin_orders(
  p_status public.transport_status default null,
  p_company_id uuid default null,
  p_disputed_only boolean default false,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  created_at timestamptz,
  status public.transport_status,
  agreed_price numeric,
  currency public.currency_code,
  from_city text,
  to_city text,
  carrier_company_id uuid,
  carrier_name text,
  client_name text,
  disputed_at timestamptz,
  dispute_category text,
  evidence_count integer,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate vedea toate comenzile' using errcode = '42501';
  end if;

  return query
  with filtered as (
    select t.* from public.transports t
    where (p_status is null or t.status = p_status)
      and (p_company_id is null or t.carrier_company_id = p_company_id)
      and (not coalesce(p_disputed_only, false) or t.status = 'disputed')
      and (p_from is null or t.created_at >= p_from)
      and (p_to is null or t.created_at < p_to)
  )
  select
    f.id, f.created_at, f.status, f.agreed_price, f.currency,
    l.loading_city, l.unloading_city,
    f.carrier_company_id, coalesce(cc.display_name, cc.legal_name),
    coalesce(sc.display_name, sc.legal_name, sp.full_name),
    f.disputed_at, f.dispute_category,
    (select count(*)::integer from public.order_evidence e where e.order_id = f.id),
    count(*) over ()
  from filtered f
  left join public.cargo_listings l on l.id = f.cargo_listing_id
  left join public.companies cc on cc.id = f.carrier_company_id
  left join public.companies sc on sc.id = f.shipper_company_id
  left join public.profiles sp on sp.id = f.shipper_user_id
  order by case when f.status = 'disputed' then 0 else 1 end, f.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0));
end;
$fn$;

grant execute on function public.admin_orders(
  public.transport_status, uuid, boolean, timestamptz, timestamptz, integer, integer
) to authenticated;

/** The carriers that have ever had an order, for the staff filter. */
create or replace function public.admin_order_companies()
returns table (company_id uuid, company_name text, orders_count bigint)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate vedea toate comenzile' using errcode = '42501';
  end if;

  return query
  select c.id, coalesce(c.display_name, c.legal_name), count(*)
  from public.transports t
  join public.companies c on c.id = t.carrier_company_id
  group by c.id, coalesce(c.display_name, c.legal_name)
  order by count(*) desc, coalesce(c.display_name, c.legal_name);
end;
$fn$;

grant execute on function public.admin_order_companies() to authenticated;

/** The fleet a dispatcher may put on an order: active drivers, compliant vehicles. */
create or replace function public.order_crew_options(p_order_id uuid)
returns table (
  kind text,
  id uuid,
  label text,
  detail text
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_order public.transports;
begin
  select * into v_order from public.transports where id = p_order_id;
  if v_order.id is null then
    raise exception 'Comandă inexistentă' using errcode = 'P0002';
  end if;
  if not (public.is_company_operator(v_order.carrier_company_id) or public.is_platform_admin()) then
    raise exception 'Comanda nu îți aparține' using errcode = '42501';
  end if;

  return query
  select 'driver'::text, d.id, d.full_name, coalesce(d.phone, '')
  from public.drivers d
  where d.company_id = v_order.carrier_company_id and d.is_active
  union all
  select 'vehicle'::text, v.id, v.plate_number,
         coalesce(trim(concat_ws(' ', v.make, v.model)), '')
  from public.vehicles v
  where v.company_id = v_order.carrier_company_id and v.is_active and v.is_compliant
  order by 1, 3;
end;
$fn$;

grant execute on function public.order_crew_options(uuid) to authenticated;
