-- =====================================================================
-- Local-only shim.
--
-- Supabase provides auth, storage and pg_cron. A plain Postgres instance
-- does not, so this file stubs just enough of them to run the migrations,
-- supabase/tests/smoke_test.sql and supabase/tests/rls_test.sql on a
-- throwaway database.
--
-- NEVER apply this to a Supabase project - it would shadow the real
-- auth and storage schemas.
-- =====================================================================

-- Roles are cluster-wide, so a second throwaway database on the same server
-- finds them already there.
do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit;
  end if;
end
$roles$;

-- Supabase's service_role bypasses RLS; the edge functions rely on it.
alter role service_role bypassrls;

-- Supabase grants every new table, sequence and function in public to the
-- API roles through default privileges. Reproduce that before the
-- migrations run, so a migration that revokes access is tested against the
-- same starting point it will meet in production.
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;
create schema if not exists cron;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  phone text,
  email_confirmed_at timestamptz,
  phone_confirmed_at timestamptz,
  raw_user_meta_data jsonb default '{}'::jsonb
);

create or replace function auth.uid() returns uuid
language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create or replace function auth.role() returns text
language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;

create table storage.buckets (
  id text primary key, name text, public boolean default false,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text, owner uuid
);
alter table storage.objects enable row level security;

create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$ select string_to_array(name, '/') $$;

-- pg_cron stub: the real thing is enabled from the Supabase dashboard.
create table cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text, active boolean default true);
create or replace function cron.schedule(p_name text, p_schedule text, p_command text) returns bigint
language plpgsql as $$
declare v bigint;
begin
  insert into cron.job (jobname, schedule, command) values (p_name, p_schedule, p_command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
  returning jobid into v;
  return v;
end $$;
create or replace function cron.unschedule(p_jobid bigint) returns boolean
language sql as $$ delete from cron.job where jobid = p_jobid; select true $$;

grant usage on schema auth, storage to anon, authenticated, service_role;
grant all on storage.objects, storage.buckets to anon, authenticated, service_role;
-- In Supabase, GoTrue writes auth.users as supabase_auth_admin. Locally,
-- service_role stands in for it so tests can exercise triggers on auth.users
-- without running as superuser.
grant select, update on auth.users to service_role;
