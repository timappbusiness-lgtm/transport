-- =====================================================================
-- 0010 - Phase 0 hardening: audit log, platform staff, protected profiles
--
-- Until now any signed-in user could set profiles.is_platform_admin or
-- profiles.phone_verified on their own row (audit P1). Platform staff moves
-- to its own table that only set_platform_staff() writes, and the profile
-- keeps only what a user may edit about themselves.
--
-- How "who is writing" is detected, here and in the migrations after it:
-- requests through PostgREST run as `authenticated` or `anon`; a SECURITY
-- DEFINER function runs as its owner; edge functions run as `service_role`.
-- Protection triggers therefore block API roles and let definer functions
-- and the service role through.
-- =====================================================================

-- ---------------------------------------------------------------------
-- audit_log - append-only
-- ---------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  -- No foreign key: the trail has to outlive the account that acted.
  actor_user_id uuid,
  -- 'staff', 'user', or 'system' (cron, service role, migrations).
  actor_role text not null default 'system',
  action text not null,
  entity text not null,
  entity_id uuid,
  before jsonb,
  after jsonb,
  reason text
);

comment on table public.audit_log is
  'Append-only record of decisions: reviews, suspensions, staff changes, accepted offers. Written only by SECURITY DEFINER functions; rows are removed only by purge_audit_log().';

create index audit_log_entity_idx on public.audit_log (entity, entity_id, created_at desc);
create index audit_log_actor_idx on public.audit_log (actor_user_id, created_at desc) where actor_user_id is not null;

alter table public.audit_log enable row level security;

-- UPDATE and TRUNCATE are refused for everyone, including the table owner.
-- DELETE only inside purge_audit_log(), which sets a transaction-local flag.
-- The API roles additionally have no write privilege at all, so the flag is
-- useless to them.
create or replace function public.audit_log_guard()
returns trigger
language plpgsql
as $fn$
begin
  if tg_op = 'DELETE' and current_setting('app.audit_retention', true) = 'on' then
    return old;
  end if;
  raise exception 'audit_log este append-only' using errcode = '42501';
end;
$fn$;

create trigger audit_log_no_update
  before update on public.audit_log
  for each row execute function public.audit_log_guard();
create trigger audit_log_no_delete
  before delete on public.audit_log
  for each row execute function public.audit_log_guard();
create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function public.audit_log_guard();

revoke insert, update, delete, truncate on public.audit_log from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- platform_staff
-- ---------------------------------------------------------------------
create type public.staff_role as enum ('admin');

create table public.platform_staff (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  role public.staff_role not null default 'admin',
  granted_by uuid references public.profiles (id) on delete set null
);

comment on table public.platform_staff is
  'Who works for the platform. Written only by set_platform_staff(). Replaces profiles.is_platform_admin, which a user could set on their own row.';

alter table public.platform_staff enable row level security;
revoke insert, update, delete, truncate on public.platform_staff from public, anon, authenticated;

insert into public.platform_staff (user_id, role)
select id, 'admin' from public.profiles where is_platform_admin;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.platform_staff s
    where s.user_id = auth.uid() and s.role = 'admin'
  );
$fn$;

alter table public.profiles drop column is_platform_admin;

create policy "platform_staff_select_staff_or_self" on public.platform_staff
  for select to authenticated
  using (user_id = auth.uid() or public.is_platform_admin());

-- Audit rows are for staff; users see their own history through the tables
-- that concern them (account_suspensions, contact_reveals).
create policy "audit_log_select_staff" on public.audit_log
  for select to authenticated
  using (public.is_platform_admin());

-- ---------------------------------------------------------------------
-- write_audit - the single writer. Internal: not granted to any API role.
-- ---------------------------------------------------------------------
create or replace function public.write_audit(
  p_action text,
  p_entity text,
  p_entity_id uuid,
  p_before jsonb,
  p_after jsonb,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into public.audit_log (actor_user_id, actor_role, action, entity, entity_id, before, after, reason)
  values (
    auth.uid(),
    case
      when auth.uid() is null then 'system'
      when public.is_platform_admin() then 'staff'
      else 'user'
    end,
    p_action, p_entity, p_entity_id, p_before, p_after, p_reason
  );
end;
$fn$;

-- ---------------------------------------------------------------------
-- purge_audit_log - retention job, service_role only
-- ---------------------------------------------------------------------
create or replace function public.purge_audit_log(p_older_than interval)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_deleted integer;
begin
  if p_older_than is null or p_older_than <= interval '0' then
    raise exception 'Intervalul de retenție trebuie să fie pozitiv' using errcode = '22023';
  end if;

  perform set_config('app.audit_retention', 'on', true);
  delete from public.audit_log where created_at < now() - p_older_than;
  get diagnostics v_deleted = row_count;
  perform set_config('app.audit_retention', 'off', true);
  return v_deleted;
end;
$fn$;

-- ---------------------------------------------------------------------
-- set_platform_staff - grant (p_role) or revoke (null) staff access
--
-- Callable by staff, or with no user at all (service role, SQL editor),
-- which is how the first admin is created. Anon never gets EXECUTE.
-- ---------------------------------------------------------------------
create or replace function public.set_platform_staff(
  p_user_id uuid,
  p_role public.staff_role,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before jsonb;
begin
  if auth.uid() is not null and not public.is_platform_admin() then
    raise exception 'Doar personalul platformei poate acorda acces de administrare' using errcode = '42501';
  end if;
  if nullif(trim(p_reason), '') is null then
    raise exception 'Motivul este obligatoriu' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'Utilizator inexistent' using errcode = 'P0002';
  end if;

  select to_jsonb(s) into v_before from public.platform_staff s where s.user_id = p_user_id;

  if p_role is null then
    if v_before is null then
      return;
    end if;
    if (select count(*) from public.platform_staff where role = 'admin') = 1
       and (v_before ->> 'role') = 'admin' then
      raise exception 'Nu poți elimina ultimul administrator' using errcode = '42501';
    end if;
    delete from public.platform_staff where user_id = p_user_id;
    perform public.write_audit('staff.revoked', 'platform_staff', p_user_id, v_before, null, p_reason);
  else
    insert into public.platform_staff (user_id, role, granted_by)
    values (p_user_id, p_role, auth.uid())
    on conflict (user_id) do update set role = excluded.role, granted_by = excluded.granted_by;
    perform public.write_audit('staff.granted', 'platform_staff', p_user_id, v_before,
      (select to_jsonb(s) from public.platform_staff s where s.user_id = p_user_id), p_reason);
  end if;
end;
$fn$;

-- ---------------------------------------------------------------------
-- profiles - what a user may not change about themselves
--
-- phone_verified and email come from auth.users (below); account_type is
-- chosen at signup. Changing the phone number drops its verification.
-- The profile row is created by handle_new_user(), so users need no INSERT.
-- ---------------------------------------------------------------------
create or replace function public.guard_profile_write()
returns trigger
language plpgsql
as $fn$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if new.id is distinct from old.id
     or new.phone_verified is distinct from old.phone_verified
     or new.account_type is distinct from old.account_type
     or new.email is distinct from old.email
     or new.created_at is distinct from old.created_at then
    raise exception 'Câmpul nu poate fi modificat din cont (telefon confirmat, e-mail, tip de cont)'
      using errcode = '42501';
  end if;

  if new.phone is distinct from old.phone then
    new.phone_verified := false;
  end if;
  return new;
end;
$fn$;

create trigger profiles_guard_write
  before update on public.profiles
  for each row execute function public.guard_profile_write();

drop policy if exists "profiles_insert_self" on public.profiles;

-- Phone and e-mail verification live in auth.users (GoTrue). Mirror them.
create or replace function public.sync_profile_from_auth()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update public.profiles p
  set email = new.email,
      phone = coalesce(new.phone, p.phone),
      phone_verified = (new.phone is not null and new.phone_confirmed_at is not null)
  where p.id = new.id;
  return new;
end;
$fn$;

-- Named to sort after on_auth_user_created, so the profile exists.
drop trigger if exists on_auth_user_synced on auth.users;
create trigger on_auth_user_synced
  after insert or update of email, phone, phone_confirmed_at on auth.users
  for each row execute function public.sync_profile_from_auth();
