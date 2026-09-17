-- =====================================================================
-- 0022 - Fleet and documents: database part
--
-- Ported from pull request #6 (Edi), renumbered to apply after
-- 20260916150000_create_order.sql. Reviewed against the phase 0 hardening:
-- every protected column stays protected, document status still only moves
-- through review_document() or this nightly job, and the grants below are
-- explicit rather than inherited.
--
--   * Suspended listings keep the status they had and come back to it
--   * Vehicles: assigned driver, operated routes
--   * RPCs the verification screens need: company members with names,
--     invitations received with the company name
-- =====================================================================

-- ---------------------------------------------------------------------
-- Suspension and return
--
-- When an owner is suspended, their active and offers_received listings
-- become suspended and remember the status they had. On reactivation they
-- return to it if their dates are still valid, and become expired
-- otherwise. An availability whose vehicle loses compliance leaves and
-- returns the same way. Listings suspended by hand (previous_status null)
-- never come back on their own.
-- ---------------------------------------------------------------------
alter table public.cargo_listings add column previous_status public.listing_status;
alter table public.truck_listings add column previous_status public.listing_status;

comment on column public.cargo_listings.previous_status is
  'The status a listing had when the compliance sweep suspended it. The sweep restores it on reactivation.';
comment on column public.truck_listings.previous_status is
  'The status a listing had when the compliance sweep suspended it. The sweep restores it on reactivation.';

create or replace function public.run_compliance_sweep()
returns table (expired_documents integer, suspended_companies integer, reactivated_companies integer)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_expired integer := 0;
  v_suspended integer := 0;
  v_reactivated integer := 0;
  r record;
begin
  -- 1. Flip approved documents past their grace period to 'expired'.
  with expired as (
    update public.documents d
    set status = 'expired'
    from public.document_requirements req
    where req.scope = d.scope
      and req.kind = d.kind
      and d.status = 'approved'
      and req.has_expiry
      and d.valid_until is not null
      and d.valid_until < current_date - req.grace_days
    returning d.id
  )
  select count(*) into v_expired from expired;

  -- 2. Refresh per-vehicle compliance.
  update public.vehicles v
  set is_compliant = sub.ok,
      compliance_checked_at = now()
  from (
    select vm.vehicle_id,
           count(*) filter (where vm.is_blocking and vm.state <> 'ok') = 0 as ok
    from public.v_vehicle_missing_documents vm
    group by vm.vehicle_id
  ) sub
  where v.id = sub.vehicle_id
    and v.is_compliant is distinct from sub.ok;

  -- 3. Suspend verified companies that lost a blocking document.
  with to_suspend as (
    update public.companies c
    set is_suspended = true,
        suspended_at = now(),
        suspension_reason = 'Documente obligatorii expirate sau lipsă',
        verification_status = 'suspended'
    from public.v_company_compliance cc
    where cc.company_id = c.id
      and cc.documents_ok = false
      and c.verification_status = 'verified'
      and c.is_suspended = false
    returning c.id, cc.blocking_kinds
  )
  insert into public.account_suspensions (company_id, reason, missing_kinds)
  select id, 'Documente obligatorii expirate sau lipsă', blocking_kinds from to_suspend;
  get diagnostics v_suspended = row_count;

  -- 4. Reactivate companies that fixed their documents.
  update public.companies c
  set is_suspended = false,
      suspended_at = null,
      suspension_reason = null,
      verification_status = 'verified'
  from public.v_company_compliance cc
  where cc.company_id = c.id
    and cc.documents_ok = true
    and c.is_suspended = true
    and c.verification_status = 'suspended';
  get diagnostics v_reactivated = row_count;

  update public.account_suspensions s
  set ended_at = now()
  from public.companies c
  where s.company_id = c.id
    and c.is_suspended = false
    and s.ended_at is null;

  -- 5. Take listings off the board, remembering where they were.
  update public.cargo_listings l
  set previous_status = l.status,
      status = 'suspended'
  from public.companies c
  where l.company_id = c.id
    and c.is_suspended
    and l.status in ('active', 'offers_received');

  update public.truck_listings l
  set previous_status = l.status,
      status = 'suspended'
  from public.companies c, public.vehicles v
  where l.company_id = c.id
    and v.id = l.vehicle_id
    and (c.is_suspended or not v.is_compliant)
    and l.status in ('active', 'offers_received');

  -- 6. Bring back what the sweep took off, once its owner and vehicle are
  --    clean again: to its previous status while still in date, otherwise
  --    expired. Row by row, so one listing that cannot return (a plan limit
  --    lowered in the meantime) stays suspended without failing the sweep.
  for r in
    select l.id,
           case
             when coalesce(l.loading_to, l.loading_from) >= current_date
                  and (l.expires_at is null or l.expires_at > now())
               then l.previous_status
             else 'expired'::public.listing_status
           end as target
    from public.cargo_listings l
    join public.companies c on c.id = l.company_id
    where l.status = 'suspended'
      and l.previous_status is not null
      and c.verification_status = 'verified'
      and not c.is_suspended
  loop
    begin
      update public.cargo_listings
      set status = r.target, previous_status = null
      where id = r.id;
    exception when others then
      null;
    end;
  end loop;

  for r in
    select l.id,
           case
             when coalesce(l.available_to, l.available_from) >= current_date
                  and (l.expires_at is null or l.expires_at > now())
               then l.previous_status
             else 'expired'::public.listing_status
           end as target
    from public.truck_listings l
    join public.companies c on c.id = l.company_id
    join public.vehicles v on v.id = l.vehicle_id
    where l.status = 'suspended'
      and l.previous_status is not null
      and c.verification_status = 'verified'
      and not c.is_suspended
      and v.is_compliant
  loop
    begin
      update public.truck_listings
      set status = r.target, previous_status = null
      where id = r.id;
    exception when others then
      null;
    end;
  end loop;

  return query select v_expired, v_suspended, v_reactivated;
end;
$fn$;

-- ---------------------------------------------------------------------
-- Vehicles: assigned driver and operated routes
-- ---------------------------------------------------------------------
alter table public.vehicles
  add column assigned_driver_id uuid references public.drivers (id) on delete set null;

comment on column public.vehicles.assigned_driver_id is 'The driver who usually drives this vehicle. Same company only.';
comment on column public.vehicles.length_m is 'Dimensions and max_weight_kg describe what the vehicle is; for a car platform, the platform itself.';

create or replace function public.guard_vehicle_write()
returns trigger
language plpgsql
set search_path = public
as $fn$
begin
  -- For every caller: the assigned driver works for the same company.
  if new.assigned_driver_id is not null
     and not exists (select 1 from public.drivers d
                     where d.id = new.assigned_driver_id and d.company_id = new.company_id) then
    raise exception 'Șoferul nu aparține firmei' using errcode = '42501';
  end if;

  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.is_compliant := false;
    new.compliance_checked_at := null;
    return new;
  end if;

  if new.is_compliant is distinct from old.is_compliant
     or new.compliance_checked_at is distinct from old.compliance_checked_at
     or new.company_id is distinct from old.company_id
     or new.id is distinct from old.id then
    raise exception 'Conformitatea vehiculului este calculată din documente și nu poate fi modificată'
      using errcode = '42501';
  end if;

  -- The papers were approved for this plate, VIN and type. Changing them
  -- would move a valid ITP onto a different truck.
  if (new.plate_number is distinct from old.plate_number
      or new.vin is distinct from old.vin
      or new.vehicle_type is distinct from old.vehicle_type)
     and exists (select 1 from public.documents d
                 where d.vehicle_id = old.id and d.status = 'approved') then
    raise exception 'Vehiculul are documente aprobate: numărul, seria de șasiu și tipul nu se mai pot schimba. Înregistrează un vehicul nou.'
      using errcode = '42501';
  end if;

  return new;
end;
$fn$;

create table public.vehicle_routes (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  from_country text not null default 'RO' check (from_country ~ '^[A-Z]{2}$'),
  from_city text,
  to_country text not null default 'RO' check (to_country ~ '^[A-Z]{2}$'),
  to_city text,
  constraint vehicle_routes_unique unique nulls not distinct (vehicle_id, from_country, from_city, to_country, to_city)
);

comment on table public.vehicle_routes is
  'Corridors a vehicle usually runs, e.g. DE -> RO or München -> Cluj-Napoca. Used by matching (phase 4).';

create index vehicle_routes_vehicle_idx on public.vehicle_routes (vehicle_id);
create index vehicle_routes_corridor_idx on public.vehicle_routes (from_country, to_country);

alter table public.vehicle_routes enable row level security;

create policy "vehicle_routes_select" on public.vehicle_routes
  for select to authenticated
  using (exists (select 1 from public.vehicles v
                 where v.id = vehicle_id
                   and (public.is_company_member(v.company_id) or public.is_platform_admin())));
create policy "vehicle_routes_insert" on public.vehicle_routes
  for insert to authenticated
  with check (exists (select 1 from public.vehicles v
                      where v.id = vehicle_id and public.is_company_member(v.company_id)));
create policy "vehicle_routes_update" on public.vehicle_routes
  for update to authenticated
  using (exists (select 1 from public.vehicles v
                 where v.id = vehicle_id and public.is_company_member(v.company_id)))
  with check (exists (select 1 from public.vehicles v
                      where v.id = vehicle_id and public.is_company_member(v.company_id)));
create policy "vehicle_routes_delete" on public.vehicle_routes
  for delete to authenticated
  using (exists (select 1 from public.vehicles v
                 where v.id = vehicle_id and public.is_company_member(v.company_id)));

revoke all on public.vehicle_routes from anon;

-- ---------------------------------------------------------------------
-- RPCs for the verification screens
-- ---------------------------------------------------------------------

-- profiles are readable only by their owner, so a company page cannot join
-- them itself. Members of the company (and staff) get names and e-mails of
-- the other members; everyone else gets nothing.
create or replace function public.list_company_members(p_company_id uuid)
returns table (user_id uuid, full_name text, email text, role public.company_member_role, joined_at timestamptz)
language sql
stable
security definer
set search_path = public
as $fn$
  select m.user_id, p.full_name, p.email, m.role, m.created_at
  from public.company_members m
  join public.profiles p on p.id = m.user_id
  where m.company_id = p_company_id
    and (public.is_company_member(p_company_id) or public.is_platform_admin())
  order by case m.role when 'owner' then 0 when 'admin' then 1 when 'dispatcher' then 2 else 3 end,
           m.created_at;
$fn$;

-- An invited person is not a member yet and cannot read a draft company.
-- This returns their pending invitations with what they need to decide.
create or replace function public.my_invitations()
returns table (
  id uuid,
  company_id uuid,
  company_name text,
  role public.company_member_role,
  invited_by_name text,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $fn$
  select i.id, i.company_id, coalesce(c.display_name, c.legal_name), i.role, p.full_name, i.expires_at
  from public.company_invitations i
  join public.companies c on c.id = i.company_id
  left join public.profiles p on p.id = i.invited_by
  where i.invited_email = public.my_confirmed_email()
    and i.status = 'pending'
    and i.expires_at > now()
  order by i.created_at desc;
$fn$;

grant execute on function public.list_company_members(uuid) to authenticated;
grant execute on function public.my_invitations() to authenticated;

-- CREATE OR REPLACE keeps a function's existing privileges, so the grant
-- from migration 20260916130300 survives untouched. It is restated here
-- because a migration that redefines a function should say who may call it
-- rather than leave the reader to go and look.
grant execute on function public.run_compliance_sweep() to service_role;

-- guard_vehicle_write() is a trigger function: it is granted to nobody and
-- runs as part of the write it guards.
