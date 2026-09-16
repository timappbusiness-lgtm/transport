-- =====================================================================
-- 0001 - Core identity: profiles, companies, memberships, helpers
-- Romanian freight exchange (bursa de transport)
-- Run order: this file must be applied first.
-- =====================================================================

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";

-- ---------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------

-- A company can act as a shipper/freight forwarder, as a carrier, or both.
create type company_type as enum ('expeditie', 'transport', 'both');

create type company_verification_status as enum (
  'draft',      -- created, documents not submitted yet
  'pending',    -- documents uploaded, waiting for admin review
  'verified',   -- all blocking documents approved and valid
  'rejected',   -- admin rejected the company
  'suspended'   -- was verified, then a blocking document expired
);

create type company_member_role as enum ('owner', 'admin', 'dispatcher', 'driver');

-- 'individual' accounts are the fast-signup private persons who only need
-- a return trip ("masini pe retur"). They never own a company.
create type account_type as enum ('company', 'individual');

-- ---------------------------------------------------------------------
-- profiles - 1:1 with auth.users
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  full_name text,
  phone text,
  phone_verified boolean not null default false,
  email text,
  account_type account_type not null default 'company',
  is_platform_admin boolean not null default false,
  -- Individuals accept the terms at signup; kept for GDPR evidence.
  terms_accepted_at timestamptz,
  marketing_consent boolean not null default false,
  last_seen_at timestamptz
);

comment on table public.profiles is
  'Application-level user data. One row per auth.users row, created by a trigger.';
comment on column public.profiles.account_type is
  'company = works inside a company (shipper or carrier). individual = fast account, can only post return-trip requests.';

create index profiles_phone_idx on public.profiles (phone);

-- Auto-create a profile whenever a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  insert into public.profiles (id, email, full_name, phone, account_type)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'phone', new.phone),
    coalesce((new.raw_user_meta_data ->> 'account_type')::account_type, 'company')
  )
  on conflict (id) do nothing;
  return new;
end;
$fn$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Generic updated_at trigger reused by every table below.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Legal identity (validated against the ANAF public API, see edge function)
  cui text not null,
  reg_com text,
  legal_name text not null,
  display_name text,
  vat_payer boolean,
  address text,
  county text,
  city text,
  country text not null default 'RO',

  -- Contact - never exposed publicly, see listing_contacts / reveal_contact()
  contact_email text,
  contact_phone text,
  website text,

  company_type company_type not null,
  verification_status company_verification_status not null default 'draft',

  -- Compliance flags maintained by compliance-sweep (migration 0003)
  is_suspended boolean not null default false,
  suspended_at timestamptz,
  suspension_reason text,

  -- ANAF snapshot: inactive / struck-off companies are a fraud red flag
  anaf_payload jsonb,
  anaf_checked_at timestamptz,
  anaf_is_inactive boolean,

  trust_score integer not null default 0 check (trust_score between 0 and 100),
  rating_avg numeric(3,2),
  rating_count integer not null default 0,

  created_by uuid references public.profiles (id) on delete set null,

  constraint companies_cui_unique unique (country, cui)
);

comment on column public.companies.trust_score is
  'Computed score (0-100) from document validity, ANAF status, account age, ratings and reports. See docs/06-gdpr-and-antifraud.md.';
comment on column public.companies.is_suspended is
  'True when a blocking document expired. The company can still log in and re-upload, but cannot post or reveal contacts.';

create index companies_type_idx on public.companies (company_type);
create index companies_status_idx on public.companies (verification_status);
create index companies_name_trgm_idx on public.companies using gin (legal_name gin_trgm_ops);

create trigger companies_set_updated_at
  before update on public.companies
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- company_members
-- ---------------------------------------------------------------------
create table public.company_members (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role company_member_role not null default 'dispatcher',
  invited_by uuid references public.profiles (id) on delete set null,
  constraint company_members_unique unique (company_id, user_id)
);

create index company_members_user_idx on public.company_members (user_id);

create trigger company_members_set_updated_at
  before update on public.company_members
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Helper functions
-- SECURITY DEFINER on purpose: they are called from RLS policies on the
-- very tables they read, so they must bypass RLS to avoid infinite recursion.
-- ---------------------------------------------------------------------

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(
    (select p.is_platform_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$fn$;

create or replace function public.is_company_member(p_company_id uuid)
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
  );
$fn$;

create or replace function public.is_company_manager(p_company_id uuid)
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
      and cm.role in ('owner', 'admin')
  );
$fn$;

create or replace function public.my_company_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $fn$
  select cm.company_id from public.company_members cm where cm.user_id = auth.uid();
$fn$;

-- A company may act (post, bid, reveal contacts) only when verified and not suspended.
create or replace function public.company_can_act(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.companies c
    where c.id = p_company_id
      and c.verification_status = 'verified'
      and c.is_suspended = false
  );
$fn$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.company_members enable row level security;

-- profiles
create policy "profiles_select_self_or_admin" on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.is_platform_admin());

create policy "profiles_insert_self" on public.profiles
  for insert to authenticated
  with check (id = auth.uid());

create policy "profiles_update_self_or_admin" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.is_platform_admin())
  with check (id = auth.uid() or public.is_platform_admin());

-- Deleting a profile must go through account deletion (GDPR flow), never directly.
create policy "profiles_delete_admin_only" on public.profiles
  for delete to authenticated
  using (public.is_platform_admin());

-- companies: members and platform admins see the full row (contact data included).
-- Everyone else reads the public subset through v_companies_public below.
create policy "companies_select_members_or_admin" on public.companies
  for select to authenticated
  using (public.is_company_member(id) or public.is_platform_admin());

create policy "companies_insert_authenticated" on public.companies
  for insert to authenticated
  with check (created_by = auth.uid());

create policy "companies_update_managers_or_admin" on public.companies
  for update to authenticated
  using (public.is_company_manager(id) or public.is_platform_admin())
  with check (public.is_company_manager(id) or public.is_platform_admin());

create policy "companies_delete_admin_only" on public.companies
  for delete to authenticated
  using (public.is_platform_admin());

-- company_members
create policy "company_members_select_same_company" on public.company_members
  for select to authenticated
  using (
    user_id = auth.uid()
    or public.is_company_member(company_id)
    or public.is_platform_admin()
  );

create policy "company_members_insert_manager_or_founder" on public.company_members
  for insert to authenticated
  with check (
    public.is_company_manager(company_id)
    or public.is_platform_admin()
    -- founder case: the creator of a brand new company adds themselves as owner
    or exists (
      select 1 from public.companies c
      where c.id = company_id and c.created_by = auth.uid()
    )
  );

create policy "company_members_update_manager" on public.company_members
  for update to authenticated
  using (public.is_company_manager(company_id) or public.is_platform_admin())
  with check (public.is_company_manager(company_id) or public.is_platform_admin());

create policy "company_members_delete_manager_or_self" on public.company_members
  for delete to authenticated
  using (
    user_id = auth.uid()
    or public.is_company_manager(company_id)
    or public.is_platform_admin()
  );

-- ---------------------------------------------------------------------
-- Public company view - what any logged-in user may see about a company.
-- security_invoker = off (the default) is deliberate: the view runs as its
-- owner so it can read past the RLS policy above, and it exposes only
-- non-personal, non-contact columns.
-- ---------------------------------------------------------------------
create view public.v_companies_public as
select
  c.id,
  coalesce(c.display_name, c.legal_name) as name,
  c.cui,
  c.county,
  c.city,
  c.country,
  c.company_type,
  c.verification_status,
  c.is_suspended,
  c.trust_score,
  c.rating_avg,
  c.rating_count,
  c.created_at as member_since
from public.companies c
where c.verification_status in ('verified', 'suspended');

grant select on public.v_companies_public to authenticated, anon;
