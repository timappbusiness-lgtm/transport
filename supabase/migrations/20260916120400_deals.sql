-- =====================================================================
-- 0005 - Doing business: offers, messaging, transports, ratings, reports
-- =====================================================================

create type offer_status as enum ('pending', 'accepted', 'rejected', 'withdrawn', 'expired');

create type transport_status as enum (
  'agreed', 'loading', 'in_transit', 'delivered', 'invoiced', 'closed', 'disputed', 'cancelled'
);

-- ---------------------------------------------------------------------
-- offers - a price proposal on a listing
-- ---------------------------------------------------------------------
create table public.offers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  cargo_listing_id uuid references public.cargo_listings (id) on delete cascade,
  truck_listing_id uuid references public.truck_listings (id) on delete cascade,

  from_company_id uuid references public.companies (id) on delete cascade,
  from_user_id uuid not null references public.profiles (id) on delete cascade,

  price_amount numeric(10,2) not null check (price_amount >= 0),
  currency currency_code not null default 'RON',
  payment_term_days integer,
  message text,
  valid_until timestamptz,
  status offer_status not null default 'pending',
  responded_at timestamptz,

  constraint offers_one_listing_ck check (
    (cargo_listing_id is not null)::int + (truck_listing_id is not null)::int = 1
  )
);

create index offers_cargo_idx on public.offers (cargo_listing_id, status);
create index offers_truck_idx on public.offers (truck_listing_id, status);
create index offers_from_company_idx on public.offers (from_company_id, created_at desc);

create trigger offers_set_updated_at
  before update on public.offers
  for each row execute function public.set_updated_at();

-- Only a company in good standing may bid. Individuals bid only on trucks.
create or replace function public.guard_offer_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
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
  return new;
end;
$fn$;

create trigger offers_guard_insert
  before insert on public.offers
  for each row execute function public.guard_offer_insert();

-- Keep offers_count on the listing in sync.
create or replace function public.sync_offers_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_cargo uuid := coalesce(new.cargo_listing_id, old.cargo_listing_id);
  v_truck uuid := coalesce(new.truck_listing_id, old.truck_listing_id);
begin
  if v_cargo is not null then
    update public.cargo_listings l
    set offers_count = (select count(*) from public.offers o where o.cargo_listing_id = v_cargo)
    where l.id = v_cargo;
  end if;
  if v_truck is not null then
    update public.truck_listings l
    set offers_count = (select count(*) from public.offers o where o.truck_listing_id = v_truck)
    where l.id = v_truck;
  end if;
  return coalesce(new, old);
end;
$fn$;

create trigger offers_sync_count
  after insert or delete on public.offers
  for each row execute function public.sync_offers_count();

-- ---------------------------------------------------------------------
-- conversations + messages
-- ---------------------------------------------------------------------
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cargo_listing_id uuid references public.cargo_listings (id) on delete cascade,
  truck_listing_id uuid references public.truck_listings (id) on delete cascade,
  initiator_user_id uuid not null references public.profiles (id) on delete cascade,
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  last_message_at timestamptz,
  constraint conversations_one_listing_ck check (
    (cargo_listing_id is not null)::int + (truck_listing_id is not null)::int = 1
  )
);

create unique index conversations_unique_pair
  on public.conversations (coalesce(cargo_listing_id, truck_listing_id), initiator_user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_user_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  attachment_path text,
  read_at timestamptz
);

create index messages_conversation_idx on public.messages (conversation_id, created_at);

create or replace function public.bump_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update public.conversations
  set last_message_at = new.created_at, updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$fn$;

create trigger messages_bump_conversation
  after insert on public.messages
  for each row execute function public.bump_conversation();

create or replace function public.is_conversation_participant(p_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id
      and (c.initiator_user_id = auth.uid() or c.owner_user_id = auth.uid())
  );
$fn$;

-- ---------------------------------------------------------------------
-- transports - an accepted offer becomes a job
-- ---------------------------------------------------------------------
create table public.transports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cargo_listing_id uuid references public.cargo_listings (id) on delete set null,
  truck_listing_id uuid references public.truck_listings (id) on delete set null,
  offer_id uuid references public.offers (id) on delete set null,

  shipper_company_id uuid references public.companies (id) on delete set null,
  shipper_user_id uuid references public.profiles (id) on delete set null,
  carrier_company_id uuid not null references public.companies (id) on delete restrict,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  driver_id uuid references public.drivers (id) on delete set null,

  agreed_price numeric(10,2) not null,
  currency currency_code not null default 'RON',
  payment_term_days integer,
  cmr_number text,
  status transport_status not null default 'agreed',
  loaded_at timestamptz,
  delivered_at timestamptz,
  closed_at timestamptz
);

create index transports_carrier_idx on public.transports (carrier_company_id, status);
create index transports_shipper_idx on public.transports (shipper_company_id, status);

create trigger transports_set_updated_at
  before update on public.transports
  for each row execute function public.set_updated_at();

create or replace function public.is_transport_party(p_transport_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.transports t
    where t.id = p_transport_id
      and (
        t.shipper_user_id = auth.uid()
        or public.is_company_member(t.carrier_company_id)
        or (t.shipper_company_id is not null and public.is_company_member(t.shipper_company_id))
      )
  );
$fn$;

-- ---------------------------------------------------------------------
-- ratings - only after a closed transport, one per side
-- ---------------------------------------------------------------------
create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  transport_id uuid not null references public.transports (id) on delete cascade,
  rater_user_id uuid not null references public.profiles (id) on delete cascade,
  rater_company_id uuid references public.companies (id) on delete cascade,
  rated_company_id uuid not null references public.companies (id) on delete cascade,
  score integer not null check (score between 1 and 5),
  punctuality integer check (punctuality between 1 and 5),
  communication integer check (communication between 1 and 5),
  payment integer check (payment between 1 and 5),
  comment text,
  constraint ratings_one_per_side unique (transport_id, rater_user_id)
);

create index ratings_rated_company_idx on public.ratings (rated_company_id);

create or replace function public.refresh_company_rating()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_company uuid := coalesce(new.rated_company_id, old.rated_company_id);
begin
  update public.companies c
  set rating_avg = sub.avg_score,
      rating_count = sub.cnt
  from (
    select round(avg(score)::numeric, 2) as avg_score, count(*) as cnt
    from public.ratings where rated_company_id = v_company
  ) sub
  where c.id = v_company;
  return coalesce(new, old);
end;
$fn$;

create trigger ratings_refresh_company
  after insert or update or delete on public.ratings
  for each row execute function public.refresh_company_rating();

-- ---------------------------------------------------------------------
-- reports - fraud / bad behaviour signals
-- ---------------------------------------------------------------------
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  reporter_user_id uuid not null references public.profiles (id) on delete cascade,
  reported_company_id uuid references public.companies (id) on delete cascade,
  reported_user_id uuid references public.profiles (id) on delete cascade,
  transport_id uuid references public.transports (id) on delete set null,
  reason text not null,
  details text,
  evidence_path text,
  status text not null default 'open' check (status in ('open', 'investigating', 'resolved', 'dismissed')),
  resolution text,
  handled_by uuid references public.profiles (id) on delete set null
);

create index reports_status_idx on public.reports (status, created_at desc);

create trigger reports_set_updated_at
  before update on public.reports
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.offers enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.transports enable row level security;
alter table public.ratings enable row level security;
alter table public.reports enable row level security;

-- Offers are visible to the bidder and to the listing owner.
create policy "offers_select_parties" on public.offers
  for select to authenticated
  using (
    from_user_id = auth.uid()
    or (from_company_id is not null and public.is_company_member(from_company_id))
    or exists (
      select 1 from public.cargo_listings l
      where l.id = cargo_listing_id
        and (l.posted_by = auth.uid()
             or (l.company_id is not null and public.is_company_member(l.company_id)))
    )
    or exists (
      select 1 from public.truck_listings l
      where l.id = truck_listing_id and public.is_company_member(l.company_id)
    )
    or public.is_platform_admin()
  );

create policy "offers_insert_self" on public.offers
  for insert to authenticated
  with check (
    from_user_id = auth.uid()
    and (from_company_id is null or public.is_company_member(from_company_id))
  );

-- The bidder may withdraw; the listing owner may accept or reject.
create policy "offers_update_parties" on public.offers
  for update to authenticated
  using (
    from_user_id = auth.uid()
    or (from_company_id is not null and public.is_company_member(from_company_id))
    or exists (
      select 1 from public.cargo_listings l
      where l.id = cargo_listing_id
        and (l.posted_by = auth.uid()
             or (l.company_id is not null and public.is_company_member(l.company_id)))
    )
    or exists (
      select 1 from public.truck_listings l
      where l.id = truck_listing_id and public.is_company_member(l.company_id)
    )
    or public.is_platform_admin()
  )
  with check (true);

create policy "offers_delete_owner" on public.offers
  for delete to authenticated
  using (from_user_id = auth.uid() or public.is_platform_admin());

create policy "conversations_select_participant" on public.conversations
  for select to authenticated
  using (initiator_user_id = auth.uid() or owner_user_id = auth.uid() or public.is_platform_admin());
create policy "conversations_insert_initiator" on public.conversations
  for insert to authenticated with check (initiator_user_id = auth.uid());
create policy "conversations_update_participant" on public.conversations
  for update to authenticated
  using (initiator_user_id = auth.uid() or owner_user_id = auth.uid())
  with check (initiator_user_id = auth.uid() or owner_user_id = auth.uid());
create policy "conversations_delete_admin" on public.conversations
  for delete to authenticated using (public.is_platform_admin());

create policy "messages_select_participant" on public.messages
  for select to authenticated
  using (public.is_conversation_participant(conversation_id) or public.is_platform_admin());
create policy "messages_insert_participant" on public.messages
  for insert to authenticated
  with check (sender_user_id = auth.uid() and public.is_conversation_participant(conversation_id));
create policy "messages_update_sender" on public.messages
  for update to authenticated
  using (public.is_conversation_participant(conversation_id))
  with check (public.is_conversation_participant(conversation_id));
create policy "messages_delete_admin" on public.messages
  for delete to authenticated using (public.is_platform_admin());

create policy "transports_select_parties" on public.transports
  for select to authenticated
  using (public.is_transport_party(id) or public.is_platform_admin());
create policy "transports_insert_parties" on public.transports
  for insert to authenticated
  with check (
    public.is_company_member(carrier_company_id)
    or (shipper_company_id is not null and public.is_company_member(shipper_company_id))
    or shipper_user_id = auth.uid()
  );
create policy "transports_update_parties" on public.transports
  for update to authenticated
  using (public.is_transport_party(id) or public.is_platform_admin())
  with check (public.is_transport_party(id) or public.is_platform_admin());
create policy "transports_delete_admin" on public.transports
  for delete to authenticated using (public.is_platform_admin());

-- Ratings are public (that is the point), but only a party may write one.
create policy "ratings_select_all" on public.ratings
  for select to authenticated using (true);
create policy "ratings_insert_party" on public.ratings
  for insert to authenticated
  with check (
    rater_user_id = auth.uid()
    and public.is_transport_party(transport_id)
    and exists (
      select 1 from public.transports t
      where t.id = transport_id and t.status in ('delivered', 'invoiced', 'closed', 'disputed')
    )
  );
create policy "ratings_update_own" on public.ratings
  for update to authenticated
  using (rater_user_id = auth.uid() or public.is_platform_admin())
  with check (rater_user_id = auth.uid() or public.is_platform_admin());
create policy "ratings_delete_admin" on public.ratings
  for delete to authenticated using (public.is_platform_admin());

create policy "reports_select_own_or_admin" on public.reports
  for select to authenticated
  using (reporter_user_id = auth.uid() or public.is_platform_admin());
create policy "reports_insert_self" on public.reports
  for insert to authenticated with check (reporter_user_id = auth.uid());
create policy "reports_update_admin" on public.reports
  for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "reports_delete_admin" on public.reports
  for delete to authenticated using (public.is_platform_admin());
