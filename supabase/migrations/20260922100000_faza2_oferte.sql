-- =====================================================================
-- Faza 2 — oferta, de la trimitere la acceptare
--
-- `offers` has existed since 20260916120400 with accept, reject and
-- withdraw written, locked and tested — and no screen has ever opened
-- it. What is added here is the half that makes an offer a decision
-- somebody can actually take: the terms it carries, the rules that keep
-- it honest, the clarification thread that precedes it, and the moment
-- of acceptance opening the contacts.
--
-- What is deliberately NOT here: order execution, proof of delivery,
-- ratings, general messaging. Their tables exist and have existed since
-- phase 0; a table is not a feature, and `src/lib/features.ts` is what
-- decides whether a menu item may appear.
--
-- Two decisions worth writing down, because both are places where the
-- obvious design is worse:
--
--   * **No new listing statuses.** „Așteaptă oferte", „3 oferte primite"
--     and „Transportator ales" are a reading of `status` and
--     `offers_count`, not three values in an enum. A status that has to
--     be kept in step with a count is a status that will one day
--     disagree with it — and the requirement „back to active when no
--     pending offers remain" then needs a job to write it. Derived, it
--     is true by construction.
--
--   * **The mask is applied at insert, not at read.** A telephone number
--     that reaches the table before the order is confirmed is a
--     telephone number in a backup, in a replica and in whatever a
--     future policy mistake exposes. `mask_contacts()` rewrites the body
--     on the way in; the original is never stored.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. What an offer carries
--
-- The columns the form needs and the table never had. Everything is
-- nullable or defaulted, because `offers` already holds rows in the
-- pilot database and a NOT NULL on an existing table without a default
-- is a failed migration.
-- ---------------------------------------------------------------------
alter table public.offers
  add column estimated_pickup_date date,
  add column estimated_delivery_date date,
  add column conditions text,
  add column vehicle_id uuid references public.vehicles (id) on delete set null,
  add column expired_at timestamptz;

comment on column public.offers.estimated_pickup_date is
  'When the carrier expects to load. Checked against the request''s own loading window by guard_offer_terms().';
comment on column public.offers.estimated_delivery_date is
  'When the carrier expects to deliver. Never before the pickup date.';
comment on column public.offers.conditions is
  'What is included: insurance, payment terms, what the price does not cover. At most 1000 characters, because a contract does not belong in a text box.';
comment on column public.offers.vehicle_id is
  'The compliant vehicle that will do the job. Required for a firm that carries (transport, both); a forwarder subcontracts and names none.';
comment on column public.offers.expired_at is
  'When the expiry job moved this offer past its valid_until. Distinct from responded_at, which means a person acted.';

-- Length caps, as constraints rather than as form validation: the form
-- is a convenience, the table is the rule.
alter table public.offers
  add constraint offers_message_length_ck
    check (message is null or length(message) <= 1000),
  add constraint offers_conditions_length_ck
    check (conditions is null or length(conditions) <= 1000),
  add constraint offers_delivery_after_pickup_ck
    check (estimated_delivery_date is null
           or estimated_pickup_date is null
           or estimated_delivery_date >= estimated_pickup_date);

-- A price of zero passed the original `>= 0`. An offer of nothing is not
-- an offer; the upper bound lives in a settings table below.
alter table public.offers drop constraint if exists offers_price_amount_check;
alter table public.offers add constraint offers_price_positive_ck
  check (price_amount > 0);

/**
 * One pending offer per company per request.
 *
 * Changing an offer is withdraw + new offer, which keeps the history:
 * a client who watched a price move from 3200 to 2900 should be able to
 * see that it moved. A partial unique index is the whole rule — no
 * trigger, no race, and the error is a duplicate key the RPC turns into
 * a sentence.
 *
 * Two indexes because a private person bidding on a departure has no
 * company, and a unique index over a nullable column does not constrain
 * the nulls.
 */
create unique index offers_one_pending_per_company_cargo
  on public.offers (cargo_listing_id, from_company_id)
  where status = 'pending' and cargo_listing_id is not null and from_company_id is not null;

create unique index offers_one_pending_per_user_cargo
  on public.offers (cargo_listing_id, from_user_id)
  where status = 'pending' and cargo_listing_id is not null and from_company_id is null;

create index offers_pending_expiry_idx
  on public.offers (valid_until)
  where status = 'pending';

-- ---------------------------------------------------------------------
-- 2. The dials an offer needs
--
-- One row, like every other settings table here. The upper bounds are
-- the „sane maximum" the brief asks for: a number that stops a typo
-- becoming a 3.2 million lei offer, not a judgement about what a
-- transport is worth.
-- ---------------------------------------------------------------------
create table public.offer_settings (
  id boolean primary key default true check (id),

  max_price_ron numeric(10,2) not null default 200000
    check (max_price_ron > 0),
  max_price_eur numeric(10,2) not null default 40000
    check (max_price_eur > 0),

  -- How long an offer stands when nobody says. 48 hours is the brief's
  -- default; the cap is what the form and the guard both enforce.
  default_validity_hours integer not null default 48
    check (default_validity_hours between 1 and 336),
  max_validity_days integer not null default 14
    check (max_validity_days between 1 and 30),

  updated_at timestamptz not null default now()
);

insert into public.offer_settings (id) values (true);

comment on table public.offer_settings is
  'The four numbers the offer rules need. Upper bounds on price stop a typo, they are not a view about what a transport costs.';

create trigger offer_settings_set_updated_at
  before update on public.offer_settings
  for each row execute function public.set_updated_at();

alter table public.offer_settings enable row level security;

-- Readable by anyone signed in: the form prints the cap next to the
-- field, and a rule the interface cannot name is a rule people distrust.
create policy "offer_settings_select_all" on public.offer_settings
  for select to authenticated using (true);

revoke insert, update, delete, truncate on public.offer_settings
  from anon, authenticated;

create or replace function public.set_offer_settings(
  p_max_price_ron numeric,
  p_max_price_eur numeric,
  p_default_validity_hours integer,
  p_max_validity_days integer
)
returns public.offer_settings
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.offer_settings;
  v_after public.offer_settings;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate schimba setările ofertelor'
      using errcode = '42501';
  end if;

  select * into v_before from public.offer_settings where id;

  update public.offer_settings
  set max_price_ron = coalesce(p_max_price_ron, max_price_ron),
      max_price_eur = coalesce(p_max_price_eur, max_price_eur),
      default_validity_hours = coalesce(p_default_validity_hours, default_validity_hours),
      max_validity_days = coalesce(p_max_validity_days, max_validity_days)
  where id
  returning * into v_after;

  perform public.write_audit('settings.offers_changed', 'offer_settings', null,
                             to_jsonb(v_before), to_jsonb(v_after), null);
  return v_after;
end;
$fn$;

grant execute on function public.set_offer_settings(numeric, numeric, integer, integer)
  to authenticated;

-- ---------------------------------------------------------------------
-- 3. The offer quota, if a plan ever sets one
--
-- NULL everywhere for now, which reads as unlimited — the same
-- convention as every other limit in `plans`. A limit set before the
-- pilot would stop exactly the firms we want to watch bidding.
-- ---------------------------------------------------------------------
alter table public.plans add column max_offers_month integer;

comment on column public.plans.max_offers_month is
  'Offers a firm may send per calendar month. NULL is unlimited, like every other limit here. Left NULL on every existing plan on purpose.';

/**
 * How many offers this firm has sent this month, and what it may send.
 *
 * Mirrors `saved_search_quota()`: the used count, the allowance and the
 * plan''s name, so a refusal can say which plan is refusing.
 */
create or replace function public.offer_quota(p_user uuid default auth.uid())
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
  if p_user is null then
    raise exception 'Autentificare necesară' using errcode = '42501';
  end if;
  if p_user <> auth.uid() and not public.is_platform_admin() then
    raise exception 'Poți vedea doar propria limită' using errcode = '42501';
  end if;

  select cm.company_id into v_company
  from public.company_members cm
  where cm.user_id = p_user
  order by cm.created_at
  limit 1;

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
    case when (select pr.account_type from public.profiles pr where pr.id = p_user) = 'individual'
         then 'individual' else 'free' end
  );

  return query
  select
    (select count(*)::integer from public.offers o
     where o.created_at >= date_trunc('month', now())
       and (case when v_company is not null
                 then o.from_company_id = v_company
                 else o.from_user_id = p_user end)),
    v_plan.max_offers_month,
    v_plan.name;
end;
$fn$;

grant execute on function public.offer_quota(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. The terms guard
--
-- `guard_offer_insert()` from 20260916130200 already checks the listing,
-- self-bidding, company standing and seats, and it stays exactly as it
-- is. This is a second BEFORE trigger for the terms, added rather than
-- folded in so the older rules keep their own tests and their own
-- failure messages.
-- ---------------------------------------------------------------------
create or replace function public.guard_offer_terms()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  s public.offer_settings;
  v_request public.cargo_listings;
  v_vehicle public.vehicles;
  v_company public.companies;
  v_max numeric;
  v_quota record;
begin
  select * into s from public.offer_settings where id;

  -- Validity: the default when nobody said, the cap always.
  if new.valid_until is null then
    new.valid_until := now() + (s.default_validity_hours || ' hours')::interval;
  end if;
  if new.valid_until <= now() then
    raise exception 'Valabilitatea ofertei trebuie să fie în viitor' using errcode = '22023';
  end if;
  if new.valid_until > now() + (s.max_validity_days || ' days')::interval then
    raise exception 'O ofertă poate fi valabilă cel mult % zile', s.max_validity_days
      using errcode = '22023';
  end if;

  -- Price: positive is a constraint; the ceiling is a setting.
  v_max := case new.currency when 'EUR' then s.max_price_eur else s.max_price_ron end;
  if new.price_amount > v_max then
    raise exception 'Prețul depășește maximul de % %. Dacă chiar atât costă, scrie-ne.',
      trim(to_char(v_max, 'FM999999999')), new.currency
      using errcode = '22023';
  end if;

  if new.cargo_listing_id is not null then
    select * into v_request from public.cargo_listings where id = new.cargo_listing_id;

    -- Loading „within or after" the window: a carrier may offer to come
    -- later than the client hoped, and the client decides whether that
    -- is acceptable. Earlier is refused, because the vehicle is not
    -- there yet.
    if new.estimated_pickup_date is not null
       and new.estimated_pickup_date < v_request.loading_from then
      raise exception 'Ridicarea nu poate fi înainte de % , când poate fi încărcat vehiculul',
        to_char(v_request.loading_from, 'DD.MM.YYYY')
        using errcode = '22023';
    end if;
  end if;

  -- The vehicle that will do the job. A forwarder subcontracts and names
  -- none; a firm that carries has to name one, and it has to be theirs,
  -- active and compliant — which is the same bar the public board uses.
  if new.from_company_id is not null then
    select * into v_company from public.companies where id = new.from_company_id;

    if new.vehicle_id is null then
      if v_company.company_type in ('transport', 'both') then
        raise exception 'Alege vehiculul care face transportul' using errcode = '23502';
      end if;
    else
      select * into v_vehicle from public.vehicles where id = new.vehicle_id;
      if v_vehicle.id is null or v_vehicle.company_id <> new.from_company_id then
        raise exception 'Vehiculul nu aparține firmei tale' using errcode = '42501';
      end if;
      if not v_vehicle.is_active then
        raise exception 'Vehiculul nu mai este în flota activă' using errcode = '42501';
      end if;
      if not v_vehicle.is_compliant then
        raise exception 'Vehiculul are documente expirate. Actualizează-le în Flotă și trimite oferta din nou.'
          using errcode = '42501';
      end if;
    end if;
  elsif new.vehicle_id is not null then
    raise exception 'Doar o firmă poate indica un vehicul din flotă' using errcode = '42501';
  end if;

  -- The plan limit, last, because it is the only check whose answer
  -- depends on rows rather than on this row.
  select * into v_quota from public.offer_quota(new.from_user_id);
  if v_quota.allowed is not null and v_quota.used >= v_quota.allowed then
    raise exception 'Ai atins limita de % oferte pe luna aceasta a planului %. Treci la un plan superior ca să trimiți mai multe.',
      v_quota.allowed, v_quota.plan_name
      using errcode = '42501';
  end if;

  return new;
end;
$fn$;

comment on function public.guard_offer_terms() is
  'The terms an offer carries: validity, price ceiling, pickup against the request window, the vehicle, the plan limit. The older guard_offer_insert() keeps the listing and standing rules.';

create trigger offers_guard_terms
  before insert on public.offers
  for each row execute function public.guard_offer_terms();

-- ---------------------------------------------------------------------
-- 5. After acceptance, the contacts open
--
-- Until now a contact cost a reveal from the monthly allowance, every
-- time, for everybody. That is right for a carrier browsing the board
-- and wrong for two parties who have just agreed a transport: charging
-- somebody to telephone the firm they have already hired is a fee for
-- nothing, and the workaround is that they stop using the platform to
-- find each other.
-- ---------------------------------------------------------------------

alter table public.contact_reveals add column reason text;

comment on column public.contact_reveals.reason is
  'Why this reveal happened. NULL is the ordinary case, paid from the plan. „comandă confirmată" is the pair that already agreed a transport, and is not counted against the allowance.';

/** The sentence, written once so the row and the screen agree. */
create or replace function public.reveal_reason_order()
returns text language sql immutable
set search_path = public
as $fn$ select 'comandă confirmată'::text $fn$;

grant execute on function public.reveal_reason_order() to anon, authenticated;

/**
 * Whether these two already agreed a transport on this listing.
 *
 * True for both ends: the client who accepted and the carrier whose
 * offer was accepted. Read from `transports`, not from `offers`, because
 * the order is the thing that was actually created and it survives a
 * listing being reopened later.
 */
create or replace function public.has_agreed_order(
  p_user uuid,
  p_cargo_listing_id uuid,
  p_truck_listing_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
    from public.transports t
    where ((p_cargo_listing_id is not null and t.cargo_listing_id = p_cargo_listing_id)
           or (p_truck_listing_id is not null and t.truck_listing_id = p_truck_listing_id))
      and t.status <> 'cancelled'
      and (
        t.shipper_user_id = p_user
        or (t.shipper_company_id is not null and exists (
              select 1 from public.company_members m
              where m.company_id = t.shipper_company_id and m.user_id = p_user))
        or exists (
              select 1 from public.company_members m
              where m.company_id = t.carrier_company_id and m.user_id = p_user)
      )
  );
$fn$;

comment on function public.has_agreed_order(uuid, uuid, uuid) is
  'True when this person is one of the two parties to a live order on this listing. Read from transports rather than offers: the order is what was created, and it outlives the listing being reopened.';

grant execute on function public.has_agreed_order(uuid, uuid, uuid) to authenticated;

/**
 * Reproduced from 20260920100000 with one branch added at the top and
 * one clause added to the count.
 *
 * The branch: two parties to an agreed order see each other without
 * paying, and on a listing that is no longer active — which is exactly
 * the state a listing is in once its offer was accepted.
 *
 * The clause: those free reveals are recorded, because the log is what
 * answers „who saw my number and when", but they are not counted
 * against the month.
 */
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

  select cm.company_id into v_company
  from public.company_members cm
  join public.companies c on c.id = cm.company_id
  where cm.user_id = p_user
    and c.verification_status = 'verified'
    and not c.is_suspended
  order by cm.created_at
  limit 1;

  -- The two parties to an agreed order, before anything else: no plan,
  -- no allowance, and no requirement that the listing still be active.
  if public.has_agreed_order(p_user, p_cargo_listing_id, p_truck_listing_id) then
    insert into public.contact_reveals
      (user_id, company_id, cargo_listing_id, truck_listing_id, reason)
    select p_user, v_company, p_cargo_listing_id, p_truck_listing_id,
           public.reveal_reason_order()
    where not exists (
      select 1 from public.contact_reveals r
      where r.user_id = p_user
        and r.cargo_listing_id is not distinct from p_cargo_listing_id
        and r.truck_listing_id is not distinct from p_truck_listing_id
        and r.reason = public.reveal_reason_order()
    );
    return v_company;
  end if;

  select exists (select 1 from public.company_members where user_id = p_user) into v_member;

  if v_member then
    if v_company is null then
      raise exception 'Cont suspendat sau neverificat. Actualizează documentele pentru a debloca contactele.'
        using errcode = '42501';
    end if;
  elsif v_profile.account_type = 'individual' then
    if not v_profile.phone_verified then
      raise exception 'Numărul tău de telefon trebuie confirmat înainte să deschizi datele de contact ale unui transportator. Scrie-ne la % și îl confirmăm noi — durează câteva minute în timpul programului.',
        coalesce((select s.support_email from public.deletion_settings s where s.id), 'contact@coridor.ro')
        using errcode = '42501';
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
    -- A reveal the platform gave away does not spend the allowance.
    select count(*) into v_used
    from public.contact_reveals r
    where r.user_id = p_user
      and r.created_at >= date_trunc('month', now())
      and r.reason is distinct from public.reveal_reason_order();

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

-- ---------------------------------------------------------------------
-- 6. Offers expire on their own
--
-- `valid_until` has been a column with no reader since phase 0, which
-- means an offer nobody answered stayed „în așteptare" for ever and the
-- carrier never learned it had gone cold. The eleventh scheduled job
-- closes them and says so.
--
-- The request needs no status change: „waits for offers" is
-- `status = 'active'`, and an expired offer stops being counted by the
-- screens the moment its status changes. That is the whole of the
-- brief''s „returns to active when no pending offers remain".
-- ---------------------------------------------------------------------
create or replace function public.expire_stale_offers(p_now timestamptz default now())
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  r record;
  v_count integer := 0;
begin
  for r in
    select o.id, o.from_user_id, o.from_company_id,
           l.title, l.loading_city, l.unloading_city,
           coalesce(c.alerts_email, c.contact_email, p.email) as to_email
    from public.offers o
    join public.cargo_listings l on l.id = o.cargo_listing_id
    join public.profiles p on p.id = o.from_user_id
    left join public.companies c on c.id = o.from_company_id
    where o.status = 'pending'
      and o.valid_until is not null
      and o.valid_until < p_now
  loop
    update public.offers
    set status = 'expired', expired_at = p_now
    where id = r.id;

    if r.to_email is not null then
      insert into public.notification_outbox
        (channel, template, recipient_user_id, recipient_company_id, to_email,
         payload, dedupe_key)
      values (
        'email', 'offer_expired', r.from_user_id, r.from_company_id, r.to_email,
        jsonb_build_object(
          'offer_id', r.id,
          'title', r.title,
          'from_city', r.loading_city,
          'to_city', r.unloading_city
        ),
        'offer_expired:' || r.id
      )
      on conflict (dedupe_key) where dedupe_key is not null do nothing;
    end if;

    v_count := v_count + 1;
  end loop;

  perform public.log_job_run('hourly-offer-expiry', v_count, 0, null);
  return v_count;
end;
$fn$;

comment on function public.expire_stale_offers(timestamptz) is
  'Moves pending offers past their valid_until to expired and tells the carrier. The request needs no status change: "waits for offers" is status=active, and an expired offer stops counting the moment its status changes.';

revoke all on function public.expire_stale_offers(timestamptz) from public;
grant execute on function public.expire_stale_offers(timestamptz) to service_role;

-- ---------------------------------------------------------------------
-- 7. „Cere lămuriri" — a thread on one offer, with the contacts masked
--
-- `conversations` and `messages` exist since phase 0 and are scoped to a
-- listing. An offer needs its own thread: a client with four offers is
-- asking four different firms four different questions, and one thread
-- per listing would put them in the same room.
--
-- The mask is the reason this is worth doing at all. The business model
-- is that a contact is revealed once the parties commit; a free-text box
-- between two strangers is the obvious way around that, and everybody
-- knows it. So the rule lives where it cannot be bypassed: a BEFORE
-- INSERT trigger rewrites the body, and the original is never written.
-- Not a view, not a render-time filter — the row itself is masked.
-- ---------------------------------------------------------------------
alter table public.conversations
  add column offer_id uuid references public.offers (id) on delete cascade;

comment on column public.conversations.offer_id is
  'The offer this thread is about. One thread per offer: a client with four offers is asking four firms four questions, and a listing-wide thread would put them in one room.';

create unique index conversations_one_per_offer
  on public.conversations (offer_id)
  where offer_id is not null;

alter table public.messages
  add column was_masked boolean not null default false,
  add column hidden_at timestamptz,
  add column hidden_by uuid references public.profiles (id) on delete set null,
  add column hidden_reason text;

comment on column public.messages.was_masked is
  'True when mask_contacts() rewrote this body on the way in. Shown to the sender so they know why their message reads the way it does, rather than leaving them to think it was not delivered.';
comment on column public.messages.hidden_reason is
  'Why staff hid this message. Mandatory, audited, and never shown to the participants — they see that it was hidden, not the note about them.';

/** The placeholder, written once so the trigger and the screen agree. */
create or replace function public.contact_mask_text()
returns text language sql immutable
set search_path = public
as $fn$
  select '[contact ascuns până la confirmarea comenzii]'::text
$fn$;

grant execute on function public.contact_mask_text() to anon, authenticated;

/**
 * Replacing anything that could be a telephone number or an address.
 *
 * Deliberately eager. A masked word that was not a contact costs the
 * sender one retype; a number that gets through costs the platform the
 * transaction it exists to intermediate. Where the two are in tension,
 * this errs towards masking.
 *
 * What it catches, and why each pattern is here:
 *
 *   * Romanian mobiles and landlines in every spacing people use:
 *     `0722123456`, `0722 123 456`, `07 22 33 44 55`, `0722-123-456`,
 *     `0722.123.456`.
 *   * International: `+40722123456`, `0040722123456`, `+49 171 1234567`.
 *   * Any run of 9 or more digits once separators are ignored, which is
 *     the catch-all for spacings nobody predicted.
 *   * E-mail, including the usual evasions: `ion (at) gmail.com`,
 *     `ion[at]gmail[dot]com`, `ion AT gmail DOT com`.
 *   * Digits spelled out in Romanian — „zero șapte doi doi" — which is
 *     what somebody tries after the first three fail.
 *
 * It does NOT try to catch a number read out in a photograph or an
 * attachment; that is a different problem and pretending otherwise
 * would be worse than saying so.
 */
create or replace function public.mask_contacts(p_body text)
returns text
language plpgsql
immutable
set search_path = public
as $fn$
declare
  v text := p_body;
  v_mask text := public.contact_mask_text();
  v_probe text;
begin
  if v is null then return null; end if;

  -- E-mail first: an address contains no digits necessarily, and doing
  -- it after the digit rules would leave `ion7@x.ro` half-masked.
  v := regexp_replace(v, '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}', v_mask, 'gi');
  -- The evasions: " at " / "[at]" / "(at)" with " dot " / "[dot]".
  v := regexp_replace(
         v,
         '[[:alnum:]._%+-]+\s*(?:\[|\()?\s*(?:at|arond)\s*(?:\]|\))?\s*[[:alnum:].-]+\s*(?:\[|\()?\s*(?:dot|punct)\s*(?:\]|\))?\s*[[:alpha:]]{2,}',
         v_mask, 'gi');

  -- Explicit international prefixes, before the generic runs, so that
  -- `+40 722 123 456` is masked as one thing rather than in pieces.
  v := regexp_replace(v, '(?:\+|00)\s*[0-9][0-9 ().\-]{7,}[0-9]', v_mask, 'g');

  -- Romanian numbers, any spacing: a leading 0 then eight more digits
  -- with separators allowed anywhere between them.
  v := regexp_replace(v, '\m0[0-9 ().\-]{7,}[0-9]', v_mask, 'g');

  -- The catch-all: any group of digits and separators holding nine or
  -- more digits. Checked per match rather than by a pattern, because a
  -- regex that counts digits across separators is unreadable.
  loop
    select m[1] into v_probe
    from regexp_matches(v, '([0-9][0-9 ().\-]{6,}[0-9])', 'g') m
    where length(regexp_replace(m[1], '[^0-9]', '', 'g')) >= 9
    limit 1;
    exit when v_probe is null;
    v := replace(v, v_probe, v_mask);
    v_probe := null;
  end loop;

  -- Spelled out. Four or more Romanian digit words in a row is somebody
  -- dictating a number, not a sentence about numbers.
  v := regexp_replace(
         v,
         '(?:\m(?:zero|unu|una|doi|două|doua|trei|patru|cinci|șase|sase|șapte|sapte|opt|nouă|noua)\M[\s,.-]*){4,}',
         v_mask, 'gi');

  return v;
end;
$fn$;

comment on function public.mask_contacts(text) is
  'Replaces telephone numbers and e-mail addresses with the placeholder. Deliberately eager: a masked word costs a retype, a number that gets through costs the transaction. Does not see into photographs, and does not pretend to.';

grant execute on function public.mask_contacts(text) to authenticated;

/**
 * The trigger: mask unless these two already agreed an order.
 *
 * Runs BEFORE INSERT and rewrites `new.body`, so the unmasked text never
 * reaches the table — not in a backup, not in a replica, not through a
 * future policy mistake.
 */
/**
 * Separate from `guard_message_insert()`, which stays exactly as it is:
 * that one runs with invoker rights on purpose, to force `created_at`
 * and `read_at` for an API role. This one needs definer rights to read
 * the offer and the order behind the conversation. Two triggers, two
 * jobs, and neither has to know about the other.
 */
create or replace function public.guard_message_contacts()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  c public.conversations;
  v_masked text;
  v_cargo uuid;
  v_truck uuid;
begin
  select * into c from public.conversations where id = new.conversation_id;
  if c.id is null then
    raise exception 'Conversația nu există' using errcode = 'P0002';
  end if;

  if coalesce(trim(new.body), '') = '' then
    raise exception 'Scrie un mesaj' using errcode = '22023';
  end if;
  if length(new.body) > 1000 then
    raise exception 'Mesajul poate avea cel mult 1000 de caractere' using errcode = '22023';
  end if;

  v_cargo := c.cargo_listing_id;
  v_truck := c.truck_listing_id;
  if c.offer_id is not null then
    select o.cargo_listing_id, o.truck_listing_id into v_cargo, v_truck
    from public.offers o where o.id = c.offer_id;
  end if;

  -- Once there is an order between these two, the contacts are theirs
  -- to exchange: `consume_contact_access` already gives them away free.
  if not public.has_agreed_order(new.sender_user_id, v_cargo, v_truck) then
    v_masked := public.mask_contacts(new.body);
    if v_masked is distinct from new.body then
      new.body := v_masked;
      new.was_masked := true;
    end if;
  end if;

  return new;
end;
$fn$;

create trigger messages_guard_contacts
  before insert on public.messages
  for each row execute function public.guard_message_contacts();

-- A message is a record of what was said. Nobody edits one — not the
-- sender, not the other party. Staff hide, with a reason, through the
-- RPC below; that is the only write after insert.
drop policy if exists "messages_update_sender" on public.messages;

create policy "messages_update_staff" on public.messages
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

/**
 * The conversation guard, reproduced from 20260916130200 with one
 * branch for offer threads.
 *
 * The original does two things that are right for a cold approach on a
 * listing and wrong for a thread about an offer:
 *
 *   * it refuses the listing owner as initiator — but the client
 *     pressing „Cere lămuriri" on an offer they received IS the listing
 *     owner, and they are answering, not soliciting;
 *   * it spends a contact reveal, because a conversation used to be a
 *     way to reach somebody. An offer thread is not: it is masked
 *     precisely so that it costs nothing and reveals nothing. Charging
 *     for it would undo the whole design — the client would pay to ask
 *     a question and then pay again for the contact they were shown.
 *
 * Everything else is unchanged, including deriving the owner from the
 * listing rather than trusting what the caller sent.
 */
create or replace function public.guard_conversation_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_owner uuid;
  v_company uuid;
  v_listing_owner uuid;
  v_offer public.offers;
begin
  if new.offer_id is not null then
    select * into v_offer from public.offers where id = new.offer_id;
    if v_offer.id is null then
      raise exception 'Ofertă inexistentă' using errcode = 'P0002';
    end if;

    -- The thread belongs to the offer, so it inherits the offer's
    -- listing whatever the caller sent.
    new.cargo_listing_id := v_offer.cargo_listing_id;
    new.truck_listing_id := v_offer.truck_listing_id;

    -- Who posted the listing, and which company it belongs to.
    if new.cargo_listing_id is not null then
      select posted_by, company_id into v_listing_owner, v_company
      from public.cargo_listings where id = new.cargo_listing_id;
    else
      select m.user_id, t.company_id into v_listing_owner, v_company
      from public.truck_listings t
      join public.company_members m on m.company_id = t.company_id
      where t.id = new.truck_listing_id
      order by m.created_at
      limit 1;
    end if;

    -- `owner_user_id` on an offer thread means „the other party", not
    -- „whoever posted the listing". A client starting the thread IS the
    -- listing owner, and writing them into both ends would leave the
    -- thread with one participant and nobody to notify — which is how
    -- this was found.
    --
    -- Decided from the row rather than from `auth.uid()`: a guard that
    -- reads the session answers differently depending on who is doing
    -- the insert, and a job or a fixture has no session at all.
    if new.initiator_user_id = v_listing_owner
       or (v_company is not null and exists (
             select 1 from public.company_members m
             where m.company_id = v_company and m.user_id = new.initiator_user_id)) then
      v_owner := v_offer.from_user_id;
    else
      v_owner := v_listing_owner;
    end if;

    if v_owner is null or v_owner = new.initiator_user_id then
      raise exception 'Discuția are nevoie de două părți' using errcode = '22023';
    end if;

    new.owner_user_id := v_owner;
    new.last_message_at := null;
    return new;
  end if;

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

  new.owner_user_id := v_owner;
  new.last_message_at := null;

  if new.initiator_user_id = v_owner
     or (v_company is not null and exists (
           select 1 from public.company_members m
           where m.company_id = v_company and m.user_id = new.initiator_user_id)) then
    raise exception 'Nu poți deschide o conversație pe propriul anunț' using errcode = '42501';
  end if;

  perform public.consume_contact_access(new.initiator_user_id, new.cargo_listing_id, new.truck_listing_id);
  return new;
end;
$fn$;

/**
 * Opening the thread on an offer.
 *
 * Either party may start it: the client asking a question, or the
 * carrier adding something after the fact. Idempotent, because „Cere
 * lămuriri" pressed twice is one thread.
 */
create or replace function public.open_offer_thread(p_offer_id uuid)
returns public.conversations
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_user uuid := auth.uid();
  v_offer public.offers;
  v_row public.conversations;
begin
  if v_user is null then
    raise exception 'Autentificare necesară' using errcode = '42501';
  end if;

  select * into v_offer from public.offers where id = p_offer_id;
  if v_offer.id is null then
    raise exception 'Ofertă inexistentă' using errcode = 'P0002';
  end if;

  select * into v_row from public.conversations where offer_id = p_offer_id;
  if v_row.id is not null then
    return v_row;
  end if;

  if not (v_user = v_offer.from_user_id
          or (v_offer.from_company_id is not null and public.is_company_member(v_offer.from_company_id))
          or public.owns_offer_listing(v_offer)) then
    raise exception 'Doar părțile ofertei pot deschide discuția' using errcode = '42501';
  end if;

  -- `owner_user_id` is not null on the table, so it is given a value
  -- here and the guard replaces it with the real other party.
  insert into public.conversations
    (offer_id, cargo_listing_id, truck_listing_id, initiator_user_id, owner_user_id)
  values
    (p_offer_id, v_offer.cargo_listing_id, v_offer.truck_listing_id, v_user, v_user)
  returning * into v_row;

  return v_row;
end;
$fn$;

grant execute on function public.open_offer_thread(uuid) to authenticated;

/**
 * Hiding a message, which only staff may do, and only with a reason.
 *
 * The participants see that a message was hidden, never the note about
 * why — that is written for the team and for the audit trail.
 */
create or replace function public.staff_hide_message(
  p_message_id uuid,
  p_reason text
)
returns public.messages
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.messages;
  v_after public.messages;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate ascunde un mesaj' using errcode = '42501';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'Scrie de ce ascunzi mesajul. Motivul rămâne în jurnal.'
      using errcode = '22023';
  end if;

  select * into v_before from public.messages where id = p_message_id;
  if v_before.id is null then
    raise exception 'Mesajul nu există' using errcode = 'P0002';
  end if;

  update public.messages
  set hidden_at = now(), hidden_by = auth.uid(), hidden_reason = trim(p_reason)
  where id = p_message_id
  returning * into v_after;

  perform public.write_audit('message.hidden', 'messages', p_message_id,
                             to_jsonb(v_before), to_jsonb(v_after), trim(p_reason));
  return v_after;
end;
$fn$;

grant execute on function public.staff_hide_message(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 8. Who gets told what
--
-- Six events. The one that needs care is „ofertă nouă": a request that
-- attracts four offers in ten minutes should produce one e-mail, not
-- four. The digest window is the dedupe key — all four land on the same
-- fifteen-minute bucket, so the second, third and fourth collide with
-- the first and are dropped, and the client opens the request to see
-- them all.
-- ---------------------------------------------------------------------
create or replace function public.queue_offer_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  l public.cargo_listings;
  v_to text;
  v_user uuid;
  v_company uuid;
  v_bucket text;
  v_carrier text;
begin
  if new.cargo_listing_id is null then
    return null;
  end if;
  select * into l from public.cargo_listings where id = new.cargo_listing_id;

  -- Who owns the request, and where we write to them.
  select p.id, coalesce(c.contact_email, p.email), l.company_id
    into v_user, v_to, v_company
  from public.profiles p
  left join public.companies c on c.id = l.company_id
  where p.id = l.posted_by
    and p.email_undeliverable_at is null
    and not p.is_test;

  if v_to is null then
    return null;
  end if;

  select coalesce(c.display_name, c.legal_name, p.full_name, 'Un transportator')
    into v_carrier
  from public.profiles p
  left join public.companies c on c.id = new.from_company_id
  where p.id = new.from_user_id;

  if tg_op = 'INSERT' then
    -- Fifteen-minute buckets, in the dedupe key. Four offers inside one
    -- bucket produce one row; the fifth, in the next bucket, produces a
    -- second — which is the right answer, because it is new information.
    v_bucket := to_char(date_trunc('hour', now())
                        + floor(extract(minute from now()) / 15) * interval '15 minutes',
                        'YYYYMMDDHH24MI');

    insert into public.notification_outbox
      (channel, template, recipient_user_id, recipient_company_id, to_email,
       payload, dedupe_key)
    values (
      'email', 'offer_received', v_user, v_company, v_to,
      jsonb_build_object(
        'request_id', l.id,
        'title', l.title,
        'from_city', l.loading_city,
        'to_city', l.unloading_city
      ),
      'offer_received:' || l.id || ':' || v_bucket
    )
    on conflict (dedupe_key) where dedupe_key is not null do nothing;

  elsif tg_op = 'UPDATE' and new.status = 'withdrawn' and old.status = 'pending' then
    insert into public.notification_outbox
      (channel, template, recipient_user_id, recipient_company_id, to_email,
       payload, dedupe_key)
    values (
      'email', 'offer_withdrawn', v_user, v_company, v_to,
      jsonb_build_object(
        'request_id', l.id,
        'title', l.title,
        'carrier_name', v_carrier
      ),
      'offer_withdrawn:' || new.id
    )
    on conflict (dedupe_key) where dedupe_key is not null do nothing;
  end if;

  return null;
end;
$fn$;

create trigger offers_notify_owner_insert
  after insert on public.offers
  for each row execute function public.queue_offer_notifications();

create trigger offers_notify_owner_withdrawn
  after update of status on public.offers
  for each row execute function public.queue_offer_notifications();

/**
 * The carrier's side: accepted and rejected.
 *
 * Separate from the trigger above because the recipient is the other
 * party and the two would otherwise be one function with an `if` down
 * the middle deciding who it is writing to.
 */
create or replace function public.queue_offer_outcome()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  l public.cargo_listings;
  v_to text;
begin
  if old.status <> 'pending' or new.status not in ('accepted', 'rejected') then
    return null;
  end if;
  if new.cargo_listing_id is null then
    return null;
  end if;

  select * into l from public.cargo_listings where id = new.cargo_listing_id;

  select coalesce(c.alerts_email, c.contact_email, p.email) into v_to
  from public.profiles p
  left join public.companies c on c.id = new.from_company_id
  where p.id = new.from_user_id
    and p.email_undeliverable_at is null
    and not p.is_test;

  if v_to is null then
    return null;
  end if;

  insert into public.notification_outbox
    (channel, template, recipient_user_id, recipient_company_id, to_email,
     payload, dedupe_key)
  values (
    'email',
    case when new.status = 'accepted' then 'offer_accepted' else 'offer_rejected' end,
    new.from_user_id, new.from_company_id, v_to,
    jsonb_build_object(
      'offer_id', new.id,
      'request_id', l.id,
      'title', l.title,
      'from_city', l.loading_city,
      'to_city', l.unloading_city
    ),
    'offer_' || new.status || ':' || new.id
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  return null;
end;
$fn$;

create trigger offers_notify_outcome
  after update of status on public.offers
  for each row execute function public.queue_offer_outcome();

/**
 * A question, or an answer to one.
 *
 * Told to whichever party did not write it. The dedupe key carries the
 * message id, so every message is one notification — a thread is a
 * conversation, and swallowing the third reply would be worse than an
 * extra e-mail.
 */
create or replace function public.queue_message_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  c public.conversations;
  o public.offers;
  l public.cargo_listings;
  v_other uuid;
  v_to text;
  v_company uuid;
begin
  select * into c from public.conversations where id = new.conversation_id;
  if c.offer_id is null then
    return null;
  end if;

  select * into o from public.offers where id = c.offer_id;
  select * into l from public.cargo_listings where id = o.cargo_listing_id;

  -- The other end of the thread, whichever one wrote this.
  if new.sender_user_id = c.initiator_user_id then
    v_other := c.owner_user_id;
  else
    v_other := c.initiator_user_id;
  end if;
  if v_other is null or v_other = new.sender_user_id then
    return null;
  end if;

  select cm.company_id into v_company
  from public.company_members cm where cm.user_id = v_other
  order by cm.created_at limit 1;

  select coalesce(c2.contact_email, p.email) into v_to
  from public.profiles p
  left join public.companies c2 on c2.id = v_company
  where p.id = v_other
    and p.email_undeliverable_at is null
    and not p.is_test;

  if v_to is null then
    return null;
  end if;

  insert into public.notification_outbox
    (channel, template, recipient_user_id, recipient_company_id, to_email,
     payload, dedupe_key)
  values (
    'email', 'offer_question', v_other, v_company, v_to,
    jsonb_build_object(
      'offer_id', o.id,
      'request_id', l.id,
      'title', coalesce(l.title, 'cererea ta')
    ),
    'offer_question:' || new.id
  )
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  return null;
end;
$fn$;

create trigger messages_notify_other_party
  after insert on public.messages
  for each row execute function public.queue_message_notification();

-- ---------------------------------------------------------------------
-- 9. What the screens read
--
-- One function per screen, each answering with the names and numbers a
-- person reads rather than the ids a join would need. All of them are
-- SECURITY DEFINER and re-check who is asking, because a read model is
-- still a boundary.
-- ---------------------------------------------------------------------

/**
 * The offers on one request, for its owner.
 *
 * The firm's name, whether it is verified and since when, the vehicle,
 * and everything the card shows — so the list is one round trip rather
 * than one per card.
 */
create or replace function public.offers_for_request(p_listing_id uuid)
returns table (
  id uuid,
  created_at timestamptz,
  status public.offer_status,
  price_amount numeric,
  currency public.currency_code,
  estimated_pickup_date date,
  estimated_delivery_date date,
  conditions text,
  payment_term_days integer,
  message text,
  valid_until timestamptz,
  company_id uuid,
  company_name text,
  company_slug text,
  company_verified boolean,
  company_verified_at timestamptz,
  vehicle_type public.vehicle_type,
  vehicle_plate text,
  conversation_id uuid,
  unread_messages integer
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not public.can_edit_cargo_listing(p_listing_id) and not public.is_platform_admin() then
    raise exception 'Cererea nu îți aparține' using errcode = '42501';
  end if;

  return query
  select
    o.id, o.created_at, o.status, o.price_amount, o.currency,
    o.estimated_pickup_date, o.estimated_delivery_date, o.conditions,
    o.payment_term_days, o.message, o.valid_until,
    c.id,
    coalesce(c.display_name, c.legal_name, p.full_name),
    c.slug,
    c.verification_status = 'verified',
    c.verified_at,
    v.vehicle_type,
    v.plate_number,
    cv.id,
    (select count(*)::integer from public.messages m
     where m.conversation_id = cv.id
       and m.sender_user_id <> auth.uid()
       and m.read_at is null
       and m.hidden_at is null)
  from public.offers o
  join public.profiles p on p.id = o.from_user_id
  left join public.companies c on c.id = o.from_company_id
  left join public.vehicles v on v.id = o.vehicle_id
  left join public.conversations cv on cv.offer_id = o.id
  where o.cargo_listing_id = p_listing_id
  order by
    case o.status when 'pending' then 0 when 'accepted' then 1 else 2 end,
    o.price_amount;
end;
$fn$;

grant execute on function public.offers_for_request(uuid) to authenticated;

/**
 * What this account has sent or received, for /cont/oferte.
 *
 * `p_box` is 'trimise' or 'primite'. Two directions rather than two
 * functions: the row shape is the same and a second copy would drift.
 */
create or replace function public.my_offers(
  p_box text default 'trimise',
  p_status public.offer_status default null
)
returns table (
  id uuid,
  created_at timestamptz,
  status public.offer_status,
  price_amount numeric,
  currency public.currency_code,
  estimated_pickup_date date,
  estimated_delivery_date date,
  valid_until timestamptz,
  request_id uuid,
  request_title text,
  from_city text,
  to_city text,
  loading_from date,
  counterparty text,
  conversation_id uuid,
  unread_messages integer,
  transport_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_user uuid := auth.uid();
  v_company uuid;
begin
  if v_user is null then
    raise exception 'Autentificare necesară' using errcode = '42501';
  end if;
  if p_box not in ('trimise', 'primite') then
    raise exception 'Cutia poate fi „trimise" sau „primite"' using errcode = '22023';
  end if;

  select cm.company_id into v_company
  from public.company_members cm where cm.user_id = v_user
  order by cm.created_at limit 1;

  return query
  select
    o.id, o.created_at, o.status, o.price_amount, o.currency,
    o.estimated_pickup_date, o.estimated_delivery_date, o.valid_until,
    l.id, l.title, l.loading_city, l.unloading_city, l.loading_from,
    case
      when p_box = 'trimise'
        then coalesce(oc.display_name, oc.legal_name, op.full_name)
      else coalesce(bc.display_name, bc.legal_name, bp.full_name)
    end,
    cv.id,
    (select count(*)::integer from public.messages m
     where m.conversation_id = cv.id
       and m.sender_user_id <> v_user
       and m.read_at is null
       and m.hidden_at is null),
    t.id
  from public.offers o
  join public.cargo_listings l on l.id = o.cargo_listing_id
  join public.profiles bp on bp.id = o.from_user_id
  left join public.companies bc on bc.id = o.from_company_id
  join public.profiles op on op.id = l.posted_by
  left join public.companies oc on oc.id = l.company_id
  left join public.conversations cv on cv.offer_id = o.id
  left join public.transports t on t.offer_id = o.id
  where (p_status is null or o.status = p_status)
    and case
      when p_box = 'trimise' then
        (v_company is not null and o.from_company_id = v_company)
        or (v_company is null and o.from_user_id = v_user)
      else
        l.posted_by = v_user
        or (l.company_id is not null and l.company_id = v_company)
    end
  order by o.created_at desc;
end;
$fn$;

grant execute on function public.my_offers(text, public.offer_status) to authenticated;

/**
 * The vehicles this firm may put on an offer.
 *
 * The same bar the guard applies, so the form never offers a vehicle
 * the insert would refuse.
 */
create or replace function public.eligible_vehicles(p_company_id uuid)
returns table (id uuid, plate_number text, vehicle_type public.vehicle_type, make text, model text)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not public.is_company_member(p_company_id) then
    raise exception 'Flota nu îți aparține' using errcode = '42501';
  end if;

  return query
  select v.id, v.plate_number, v.vehicle_type, v.make, v.model
  from public.vehicles v
  where v.company_id = p_company_id
    and v.is_active
    and v.is_compliant
  order by v.plate_number;
end;
$fn$;

grant execute on function public.eligible_vehicles(uuid) to authenticated;

/**
 * The thread on one offer, for a party to it or for staff.
 *
 * Hidden messages come back with their body replaced rather than
 * missing: a gap in a conversation is more alarming than a line saying
 * a message was removed.
 */
create or replace function public.offer_thread(p_offer_id uuid)
returns table (
  id uuid,
  created_at timestamptz,
  sender_user_id uuid,
  sender_name text,
  body text,
  was_masked boolean,
  is_hidden boolean,
  is_mine boolean
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_user uuid := auth.uid();
  v_offer public.offers;
begin
  select * into v_offer from public.offers where id = p_offer_id;
  if v_offer.id is null then
    raise exception 'Ofertă inexistentă' using errcode = 'P0002';
  end if;

  if not (v_user = v_offer.from_user_id
          or (v_offer.from_company_id is not null and public.is_company_member(v_offer.from_company_id))
          or public.owns_offer_listing(v_offer)
          or public.is_platform_admin()) then
    raise exception 'Discuția nu îți aparține' using errcode = '42501';
  end if;

  return query
  select
    m.id, m.created_at, m.sender_user_id,
    coalesce(p.full_name, 'Utilizator'),
    case when m.hidden_at is null then m.body
         else 'Mesaj ascuns de echipa platformei.' end,
    m.was_masked,
    m.hidden_at is not null,
    m.sender_user_id = v_user
  from public.messages m
  join public.conversations cv on cv.id = m.conversation_id
  join public.profiles p on p.id = m.sender_user_id
  where cv.offer_id = p_offer_id
  order by m.created_at;
end;
$fn$;

grant execute on function public.offer_thread(uuid) to authenticated;

/**
 * The staff list. Read-only by construction: there is no counterpart
 * that writes an offer, and staff have no policy that would let them.
 */
create or replace function public.admin_offers(
  p_status public.offer_status default null,
  p_company_id uuid default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  created_at timestamptz,
  status public.offer_status,
  price_amount numeric,
  currency public.currency_code,
  valid_until timestamptz,
  company_id uuid,
  company_name text,
  bidder_name text,
  request_id uuid,
  request_title text,
  from_city text,
  to_city text,
  messages_count integer,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate vedea toate ofertele' using errcode = '42501';
  end if;

  return query
  with filtered as (
    select o.*
    from public.offers o
    where (p_status is null or o.status = p_status)
      and (p_company_id is null or o.from_company_id = p_company_id)
      and (p_from is null or o.created_at >= p_from)
      and (p_to is null or o.created_at < p_to)
  )
  select
    f.id, f.created_at, f.status, f.price_amount, f.currency, f.valid_until,
    c.id, coalesce(c.display_name, c.legal_name), p.full_name,
    l.id, l.title, l.loading_city, l.unloading_city,
    (select count(*)::integer from public.messages m
     join public.conversations cv on cv.id = m.conversation_id
     where cv.offer_id = f.id),
    count(*) over ()
  from filtered f
  join public.profiles p on p.id = f.from_user_id
  left join public.companies c on c.id = f.from_company_id
  left join public.cargo_listings l on l.id = f.cargo_listing_id
  order by f.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200))
  offset greatest(0, coalesce(p_offset, 0));
end;
$fn$;

grant execute on function public.admin_offers(
  public.offer_status, uuid, timestamptz, timestamptz, integer, integer
) to authenticated;

/**
 * The firms the company filter can offer, with how many offers each
 * has sent.
 *
 * A text box asking for a uuid is a filter nobody uses. This is small —
 * one row per firm that has ever bid — and it is the only way the list
 * can be narrowed to a firm whose offers are not on the page in front
 * of you.
 */
create or replace function public.admin_offer_companies()
returns table (company_id uuid, company_name text, offers_count bigint)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate vedea toate ofertele' using errcode = '42501';
  end if;

  return query
  select c.id, coalesce(c.display_name, c.legal_name), count(*)
  from public.offers o
  join public.companies c on c.id = o.from_company_id
  group by c.id, coalesce(c.display_name, c.legal_name)
  order by count(*) desc, coalesce(c.display_name, c.legal_name);
end;
$fn$;

grant execute on function public.admin_offer_companies() to authenticated;

/**
 * One offer, for the staff detail screen.
 *
 * Everything the list has plus the terms and both sides of the deal.
 * Still read-only: nothing here writes, and `offers` has no update
 * policy for staff to write through. The clarification thread comes
 * from `offer_thread()`, which already lets staff read one.
 */
create or replace function public.admin_offer(p_offer_id uuid)
returns table (
  id uuid,
  created_at timestamptz,
  status public.offer_status,
  price_amount numeric,
  currency public.currency_code,
  estimated_pickup_date date,
  estimated_delivery_date date,
  conditions text,
  payment_term_days integer,
  message text,
  valid_until timestamptz,
  expired_at timestamptz,
  company_id uuid,
  company_name text,
  bidder_name text,
  vehicle_plate text,
  request_id uuid,
  request_title text,
  from_city text,
  to_city text,
  loading_from date,
  request_status public.listing_status,
  client_name text,
  client_company text,
  transport_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate vedea toate ofertele' using errcode = '42501';
  end if;

  return query
  select
    o.id, o.created_at, o.status, o.price_amount, o.currency,
    o.estimated_pickup_date, o.estimated_delivery_date, o.conditions,
    o.payment_term_days, o.message, o.valid_until, o.expired_at,
    c.id, coalesce(c.display_name, c.legal_name), bidder.full_name,
    v.plate_number,
    l.id, l.title, l.loading_city, l.unloading_city, l.loading_from, l.status,
    client.full_name, coalesce(lc.display_name, lc.legal_name),
    (select t.id from public.transports t where t.offer_id = o.id limit 1)
  from public.offers o
  join public.profiles bidder on bidder.id = o.from_user_id
  left join public.companies c on c.id = o.from_company_id
  left join public.vehicles v on v.id = o.vehicle_id
  left join public.cargo_listings l on l.id = o.cargo_listing_id
  left join public.profiles client on client.id = l.posted_by
  left join public.companies lc on lc.id = l.company_id
  where o.id = p_offer_id;
end;
$fn$;

grant execute on function public.admin_offer(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 10. The eleventh scheduled job
-- ---------------------------------------------------------------------
do $cron$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise warning 'pg_cron nu este disponibil, deci expirarea ofertelor nu este programată. Vezi docs/configurare-externa.md.';
    return;
  end if;
  perform cron.schedule('hourly-offer-expiry', '20 * * * *',
                        'select public.expire_stale_offers();');
end;
$cron$;

-- ---------------------------------------------------------------------
-- 11. job_health learns about it
--
-- Reproduced from 20260921100000 with one job added to each of the two
-- expected lists. The lists are written out rather than read from
-- cron.job on purpose: a job that vanished from the schedule has to
-- show as missing, and a list derived from the schedule could never say
-- that.
-- ---------------------------------------------------------------------
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
      ('hourly-listing-cleanup', 3.0), ('hourly-offer-expiry', 3.0), ('hourly-push-cleanup', 3.0),
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
  'Per scheduled job: is it scheduled, when did it last run, how did it end, and is it late. Eleven jobs since 20260922100000 — offer expiry joined the list.';
