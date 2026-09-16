-- =====================================================================
-- 0006 - Plans, subscriptions and gated access to contact data
--
-- Business rule: browsing is free, contacting is not. A contact is
-- revealed only to a verified, non-suspended company with an active plan
-- and quota left - and every reveal is logged.
-- =====================================================================

create type subscription_status as enum ('trialing', 'active', 'past_due', 'cancelled', 'expired');

create table public.plans (
  code text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  description text,
  price_ron_month numeric(8,2) not null default 0,
  price_ron_year numeric(8,2),
  -- NULL means unlimited.
  max_active_cargo_listings integer,
  max_active_truck_listings integer,
  max_contact_reveals_month integer,
  max_saved_searches integer,
  can_post_cargo boolean not null default false,
  can_post_trucks boolean not null default false,
  whatsapp_alerts boolean not null default false,
  promoted_credits_month integer not null default 0,
  is_public boolean not null default true,
  sort_order integer not null default 0
);

create trigger plans_set_updated_at
  before update on public.plans
  for each row execute function public.set_updated_at();

insert into public.plans
  (code, name, description, price_ron_month, max_active_cargo_listings, max_active_truck_listings,
   max_contact_reveals_month, max_saved_searches, can_post_cargo, can_post_trucks,
   whatsapp_alerts, promoted_credits_month, sort_order)
values
  ('free',      'Gratuit',
   'Vezi toate anunțurile. Contactezi 3 parteneri pe lună.',
   0,    3,    3,    3,   1,  true, true, false, 0, 1),
  ('carrier',   'Transportator',
   'Pentru firme de transport: anunțuri nelimitate pe tur și retur, contacte nelimitate.',
   149,  10,   null, null, 10, true, true, true,  2, 2),
  ('forwarder', 'Casă de expediții',
   'Pentru case de expediții: postezi curse nelimitat, alerte WhatsApp, anunțuri promovate.',
   249,  null, 10,   null, 20, true, true, true,  5, 3),
  ('business',  'Business',
   'Flotă mare sau grup de firme: tot ce e mai sus, fără limite, suport prioritar.',
   449,  null, null, null, null, true, true, true, 15, 4);

-- The 'individual' pseudo-plan is not sold; it is what a fast account gets.
insert into public.plans
  (code, name, description, price_ron_month, max_active_cargo_listings, max_active_truck_listings,
   max_contact_reveals_month, max_saved_searches, can_post_cargo, can_post_trucks,
   whatsapp_alerts, promoted_credits_month, is_public, sort_order)
values
  ('individual', 'Persoană fizică',
   'Cont rapid: postezi o cerere de transport pe retur și contactezi transportatorii.',
   0, 2, 0, 5, 1, true, false, false, 0, false, 0);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid references public.companies (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  plan_code text not null references public.plans (code),
  status subscription_status not null default 'trialing',
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null default now() + interval '30 days',
  cancel_at_period_end boolean not null default false,
  -- Payment provider reference (Netopia / Stripe / manual invoice).
  provider text,
  provider_subscription_id text,
  constraint subscriptions_one_owner_ck check (
    (company_id is not null)::int + (user_id is not null)::int = 1
  )
);

create unique index subscriptions_active_company
  on public.subscriptions (company_id)
  where company_id is not null and status in ('trialing', 'active', 'past_due');
create unique index subscriptions_active_user
  on public.subscriptions (user_id)
  where user_id is not null and status in ('trialing', 'active', 'past_due');

create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- contact_reveals - audit log and quota counter in one table
-- ---------------------------------------------------------------------
create table public.contact_reveals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  cargo_listing_id uuid references public.cargo_listings (id) on delete cascade,
  truck_listing_id uuid references public.truck_listings (id) on delete cascade,
  constraint contact_reveals_one_listing_ck check (
    (cargo_listing_id is not null)::int + (truck_listing_id is not null)::int = 1
  )
);

create index contact_reveals_quota_idx on public.contact_reveals (user_id, created_at desc);
-- Re-opening the same listing must not burn quota twice.
create unique index contact_reveals_unique_cargo
  on public.contact_reveals (user_id, cargo_listing_id) where cargo_listing_id is not null;
create unique index contact_reveals_unique_truck
  on public.contact_reveals (user_id, truck_listing_id) where truck_listing_id is not null;

-- ---------------------------------------------------------------------
-- Effective plan for the current user (company plan wins over personal).
-- ---------------------------------------------------------------------
create or replace function public.current_plan(p_company_id uuid default null)
returns public.plans
language sql
stable
security definer
set search_path = public
as $fn$
  select p.*
  from public.plans p
  where p.code = coalesce(
    (
      select s.plan_code from public.subscriptions s
      where s.status in ('trialing', 'active')
        and s.current_period_end > now()
        and (
          (p_company_id is not null and s.company_id = p_company_id)
          or (p_company_id is null and s.user_id = auth.uid())
        )
      order by s.current_period_end desc
      limit 1
    ),
    case
      when (select pr.account_type from public.profiles pr where pr.id = auth.uid()) = 'individual'
        then 'individual'
      else 'free'
    end
  );
$fn$;

-- ---------------------------------------------------------------------
-- reveal_contact() - the single door to contact data.
-- Returns the contact and records the reveal, or raises with a reason.
-- ---------------------------------------------------------------------
create or replace function public.reveal_contact(
  p_cargo_listing_id uuid default null,
  p_truck_listing_id uuid default null
)
returns table (contact_name text, contact_phone text, contact_email text)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_user uuid := auth.uid();
  v_company uuid;
  v_plan public.plans;
  v_used integer;
  v_already boolean;
begin
  if v_user is null then
    raise exception 'Autentificare necesară' using errcode = '42501';
  end if;
  if (p_cargo_listing_id is not null)::int + (p_truck_listing_id is not null)::int <> 1 then
    raise exception 'Trimite exact un id de anunț' using errcode = '22023';
  end if;

  -- The acting company is the first one the user belongs to.
  select cm.company_id into v_company
  from public.company_members cm
  where cm.user_id = v_user
  order by cm.created_at
  limit 1;

  -- A suspended company may browse but not contact anyone.
  if v_company is not null and not public.company_can_act(v_company) then
    raise exception 'Cont suspendat sau neverificat. Actualizează documentele pentru a debloca contactele.'
      using errcode = '42501';
  end if;

  v_plan := public.current_plan(v_company);

  select exists (
    select 1 from public.contact_reveals r
    where r.user_id = v_user
      and (r.cargo_listing_id is not distinct from p_cargo_listing_id)
      and (r.truck_listing_id is not distinct from p_truck_listing_id)
  ) into v_already;

  if not v_already and v_plan.max_contact_reveals_month is not null then
    select count(*) into v_used
    from public.contact_reveals r
    where r.user_id = v_user
      and r.created_at >= date_trunc('month', now());

    if v_used >= v_plan.max_contact_reveals_month then
      raise exception 'Ai atins limita de % contacte pe luna aceasta (plan %). Treci la un plan superior.',
        v_plan.max_contact_reveals_month, v_plan.name
        using errcode = '42501';
    end if;
  end if;

  if not v_already then
    insert into public.contact_reveals (user_id, company_id, cargo_listing_id, truck_listing_id)
    values (v_user, v_company, p_cargo_listing_id, p_truck_listing_id);
  end if;

  return query
  select lc.contact_name, lc.contact_phone, lc.contact_email
  from public.listing_contacts lc
  where (p_cargo_listing_id is not null and lc.cargo_listing_id = p_cargo_listing_id)
     or (p_truck_listing_id is not null and lc.truck_listing_id = p_truck_listing_id);
end;
$fn$;

revoke all on function public.reveal_contact(uuid, uuid) from public;
grant execute on function public.reveal_contact(uuid, uuid) to authenticated;

comment on function public.reveal_contact(uuid, uuid) is
  'The only way a non-owner reads listing_contacts. Enforces compliance, plan quota and GDPR logging.';

-- Block publishing above the plan's listing quota.
create or replace function public.guard_listing_quota()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_plan public.plans;
  v_count integer;
  v_limit integer;
begin
  if new.status <> 'active' or (tg_op = 'UPDATE' and old.status = 'active') then
    return new;
  end if;

  if tg_table_name = 'cargo_listings' then
    v_plan := public.current_plan(new.company_id);
    v_limit := v_plan.max_active_cargo_listings;
    select count(*) into v_count from public.cargo_listings l
    where l.status = 'active'
      and l.id <> new.id
      and (
        (new.company_id is not null and l.company_id = new.company_id)
        or (new.company_id is null and l.posted_by = new.posted_by)
      );
  else
    v_plan := public.current_plan(new.company_id);
    v_limit := v_plan.max_active_truck_listings;
    select count(*) into v_count from public.truck_listings l
    where l.status = 'active' and l.company_id = new.company_id and l.id <> new.id;
  end if;

  if v_limit is not null and v_count >= v_limit then
    raise exception 'Planul % permite % anunțuri active. Dezactivează unul sau treci la un plan superior.',
      v_plan.name, v_limit using errcode = '42501';
  end if;
  return new;
end;
$fn$;

create trigger cargo_listings_guard_quota
  before insert or update on public.cargo_listings
  for each row execute function public.guard_listing_quota();

create trigger truck_listings_guard_quota
  before insert or update on public.truck_listings
  for each row execute function public.guard_listing_quota();

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.plans enable row level security;
alter table public.subscriptions enable row level security;
alter table public.contact_reveals enable row level security;

create policy "plans_select_public" on public.plans
  for select to authenticated, anon using (is_public or public.is_platform_admin());
create policy "plans_insert_admin" on public.plans
  for insert to authenticated with check (public.is_platform_admin());
create policy "plans_update_admin" on public.plans
  for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "plans_delete_admin" on public.plans
  for delete to authenticated using (public.is_platform_admin());

create policy "subscriptions_select_own" on public.subscriptions
  for select to authenticated
  using (
    user_id = auth.uid()
    or (company_id is not null and public.is_company_member(company_id))
    or public.is_platform_admin()
  );
-- Writes come from the payment webhook (service role) or an admin only.
create policy "subscriptions_insert_admin" on public.subscriptions
  for insert to authenticated with check (public.is_platform_admin());
create policy "subscriptions_update_admin" on public.subscriptions
  for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "subscriptions_delete_admin" on public.subscriptions
  for delete to authenticated using (public.is_platform_admin());

create policy "contact_reveals_select_own" on public.contact_reveals
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());
-- Inserts happen inside reveal_contact() (SECURITY DEFINER), never directly.
create policy "contact_reveals_insert_admin" on public.contact_reveals
  for insert to authenticated with check (public.is_platform_admin());
create policy "contact_reveals_update_admin" on public.contact_reveals
  for update to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());
create policy "contact_reveals_delete_admin" on public.contact_reveals
  for delete to authenticated using (public.is_platform_admin());
