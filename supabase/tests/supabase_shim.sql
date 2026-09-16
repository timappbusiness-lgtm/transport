-- =====================================================================
-- Local-only shim.
--
-- Supabase provides auth, storage and pg_cron. A plain Postgres instance
-- does not, so this file stubs just enough of them to run the migrations
-- and supabase/tests/smoke_test.sql on a throwaway database.
--
-- NEVER apply this to a Supabase project - it would shadow the real
-- auth and storage schemas.
-- =====================================================================

create role anon nologin;
create role authenticated nologin;
create role service_role nologin;

-- Minimal Supabase shim so the migrations can be validated locally.

create schema if not exists auth;
create schema if not exists storage;
create schema if not exists extensions;
create schema if not exists cron;

create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  phone text,
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

grant usage on schema public, auth, storage to anon, authenticated, service_role;
