-- =====================================================================
-- RLS and privilege tests.
--
-- smoke_test.sql runs as superuser, which skips row-level security and
-- function privileges entirely. This file tests exactly those: every
-- action below runs as `authenticated`, `anon` or `service_role`, the way
-- PostgREST and the edge functions call the database.
--
-- Fixtures are created as superuser (auth.users cannot be written any other
-- way). Only the action under test runs as an API role. Each check runs in
-- its own subtransaction and is rolled back, so checks do not leak into one
-- another - except the concurrency test at the end, which needs real
-- commits.
--
-- Kinds:
--   fix    a hole found in the September 2026 audit (P1-P14 and the phase 0
--          list), or a rule added since (INV, ORD). Fails on the schema before
--          the migration that fixes it, passes after.
--   guard  something that must keep working after the hardening (a
--          legitimate write, a policy helper still executable). May pass on
--          both schemas.
--
-- Run with `pnpm db:test`, or against a throwaway database that already has
-- the shim and the migrations applied. It writes data - never point it at a
-- real project.
-- =====================================================================

\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned
set client_min_messages = warning;

create extension if not exists dblink;

create temp table rls_results (
  n serial primary key,
  label text not null,
  kind text not null,
  pass boolean not null,
  detail text
);

-- ---------------------------------------------------------------------
-- The harness.
--
--   p_expect = 'blocked'  the action raises, or touches zero rows
--              'allowed'  the action succeeds and touches at least one row
--              'true'     the action is a query returning true
--
--   p_setup   superuser statement run first, inside the rolled-back block
--   p_after   superuser statement run after the action
--   p_verify  boolean query checked after the action (as superuser unless
--             p_verify_as_role); a blocked action must also leave state intact
--
-- A missing table, column or function never counts as "blocked" unless
-- p_missing_ok, so a check cannot pass just because the fix does not exist.
-- ---------------------------------------------------------------------
create or replace function pg_temp.check(
  p_label text,
  p_kind text,
  p_uid uuid,
  p_role text,
  p_action text,
  p_expect text,
  p_verify text default null,
  p_verify_as_role boolean default false,
  p_setup text default null,
  p_after text default null,
  p_missing_ok boolean default false
) returns void
language plpgsql as $$
declare
  v_err text;
  v_state text;
  v_rows bigint := 0;
  v_bool boolean;
  v_ok boolean := true;
  v_harness text;
  v_pass boolean;
  v_detail text;
begin
  begin
    if p_setup is not null then
      execute p_setup;
    end if;

    perform set_config('request.jwt.claim.sub', coalesce(p_uid::text, ''), true);
    execute format('set local role %I', p_role);

    begin
      if p_expect = 'true' then
        execute p_action into v_bool;
      else
        execute p_action;
        get diagnostics v_rows = row_count;
      end if;
    exception when others then
      v_err := sqlerrm;
      v_state := sqlstate;
    end;

    reset role;

    if p_after is not null then
      execute p_after;
    end if;

    if p_verify is not null then
      if p_verify_as_role then
        execute format('set local role %I', p_role);
      end if;
      execute p_verify into v_ok;
      reset role;
    end if;

    raise exception using errcode = 'ZZ999', message = 'rollback';
  exception
    when sqlstate 'ZZ999' then
      null;
    when others then
      v_harness := sqlerrm;
  end;

  if v_harness is not null then
    v_pass := false;
    v_detail := 'harness: ' || v_harness;
  elsif p_expect = 'blocked' then
    if v_state in ('42P01', '42883', '42703') and not p_missing_ok then
      v_pass := false;
      v_detail := 'object missing: ' || v_err;
    elsif v_err is null and v_rows > 0 then
      v_pass := false;
      v_detail := format('allowed (%s rows)', v_rows);
    elsif not coalesce(v_ok, false) then
      v_pass := false;
      v_detail := 'state changed' || coalesce(': ' || v_err, '');
    else
      v_pass := true;
      v_detail := coalesce(v_err, '0 rows');
    end if;
  elsif p_expect = 'allowed' then
    if v_err is not null then
      v_pass := false;
      v_detail := 'blocked: ' || v_err;
    elsif v_rows = 0 then
      v_pass := false;
      v_detail := '0 rows';
    elsif not coalesce(v_ok, false) then
      v_pass := false;
      v_detail := 'state check failed';
    else
      v_pass := true;
    end if;
  else
    if v_err is not null then
      v_pass := false;
      v_detail := 'error: ' || v_err;
    elsif not coalesce(v_bool, false) then
      v_pass := false;
      v_detail := 'returned false';
    elsif not coalesce(v_ok, false) then
      v_pass := false;
      v_detail := 'state check failed';
    else
      v_pass := true;
    end if;
  end if;

  insert into rls_results (label, kind, pass, detail)
  values (p_label, p_kind, v_pass, v_detail);
end;
$$;

-- =====================================================================
-- Fixtures
--
--   f0..01 staff            f0..06 individual, phone verified
--   f0..02 owner of A       f0..07 individual, phone not verified
--   f0..03 dispatcher of A  f0..08 company account without a company
--   f0..04 owner of B       f0..09 company account, creates one in a test
--   f0..05 dispatcher of B  f0..0a owner of C
--
--   A  carrier, verified, carrier plan      VA  compliant platform
--   B  forwarder, verified, forwarder plan  VA2 platform without documents
--   C  carrier, draft                       VX  C's platform, approved ITP
-- =====================================================================

-- Every fixture's address is confirmed, because that is the ordinary
-- state of an account: GoTrue stamps it the moment somebody follows the
-- link. Since 20260920100000 it is also what the publish guard asks an
-- individual for, and the REQ block below tests the unconfirmed case
-- explicitly rather than relying on a fixture being half-made.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('f0000000-0000-0000-0000-000000000001', 'rls-staff@test.ro',   now(), '{"full_name":"Staff","account_type":"company"}'),
  ('f0000000-0000-0000-0000-000000000002', 'rls-owner-a@test.ro', now(), '{"full_name":"Owner A","account_type":"company"}'),
  ('f0000000-0000-0000-0000-000000000003', 'rls-disp-a@test.ro',  now(), '{"full_name":"Dispatcher A","account_type":"company"}'),
  ('f0000000-0000-0000-0000-000000000004', 'rls-owner-b@test.ro', now(), '{"full_name":"Owner B","account_type":"company"}'),
  ('f0000000-0000-0000-0000-000000000005', 'rls-disp-b@test.ro',  now(), '{"full_name":"Dispatcher B","account_type":"company"}'),
  ('f0000000-0000-0000-0000-000000000006', 'rls-pf@test.ro',      now(), '{"full_name":"Persoană Fizică","account_type":"individual"}'),
  ('f0000000-0000-0000-0000-000000000007', 'rls-pf2@test.ro',     now(), '{"full_name":"Fără Telefon","account_type":"individual"}'),
  ('f0000000-0000-0000-0000-000000000008', 'rls-noco@test.ro',    now(), '{"full_name":"Fără Firmă","account_type":"company"}'),
  ('f0000000-0000-0000-0000-000000000009', 'rls-newco@test.ro',   now(), '{"full_name":"Firmă Nouă","account_type":"company"}'),
  ('f0000000-0000-0000-0000-00000000000a', 'rls-owner-c@test.ro', now(), '{"full_name":"Owner C","account_type":"company"}');

-- Confirmed e-mail addresses, for the invitation checks.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('f0000000-0000-0000-0000-00000000000b', 'rls-invitee@test.ro', now(), '{"full_name":"Invitat","account_type":"company"}'),
  ('f0000000-0000-0000-0000-00000000000c', 'rls-pf-invited@test.ro', now(), '{"full_name":"PF Invitat","account_type":"individual"}'),
  ('f0000000-0000-0000-0000-00000000000d', 'rls-admin-a@test.ro', now(), '{"full_name":"Admin A","account_type":"company"}');

update public.profiles set phone_verified = true, phone = '+40711000006'
where id = 'f0000000-0000-0000-0000-000000000006';

-- Staff lives in platform_staff after the hardening, on the profile before it.
do $$
begin
  if to_regclass('public.platform_staff') is not null then
    execute $q$insert into public.platform_staff (user_id) values ('f0000000-0000-0000-0000-000000000001')$q$;
  else
    execute $q$update public.profiles set is_platform_admin = true where id = 'f0000000-0000-0000-0000-000000000001'$q$;
  end if;
end $$;

insert into public.companies (id, cui, legal_name, company_type, contact_email, contact_phone, created_by) values
  ('fc000000-0000-0000-0000-000000000001', '90000001', 'RLS Carrier A SRL',   'transport', 'a@test.ro', '+40711000002', 'f0000000-0000-0000-0000-000000000002'),
  ('fc000000-0000-0000-0000-000000000002', '90000002', 'RLS Forwarder B SRL', 'expeditie', 'b@test.ro', '+40711000004', 'f0000000-0000-0000-0000-000000000004'),
  ('fc000000-0000-0000-0000-000000000003', '90000003', 'RLS Draft C SRL',     'transport', 'c@test.ro', '+40711000010', 'f0000000-0000-0000-0000-00000000000a');

insert into public.company_members (company_id, user_id, role) values
  ('fc000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', 'owner'),
  ('fc000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000003', 'dispatcher'),
  ('fc000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000004', 'owner'),
  ('fc000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000005', 'dispatcher'),
  ('fc000000-0000-0000-0000-000000000003', 'f0000000-0000-0000-0000-00000000000a', 'owner'),
  ('fc000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-00000000000d', 'admin');

insert into public.subscriptions (company_id, plan_code, status, current_period_end) values
  ('fc000000-0000-0000-0000-000000000001', 'carrier',   'active', now() + interval '30 days'),
  ('fc000000-0000-0000-0000-000000000002', 'forwarder', 'active', now() + interval '30 days');

insert into public.vehicles (id, company_id, plate_number, vehicle_type, max_weight_kg) values
  ('fe000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000001', 'TM01RLS', 'platforma_auto', 3500),
  ('fe000000-0000-0000-0000-000000000002', 'fc000000-0000-0000-0000-000000000001', 'TM02RLS', 'platforma_auto', 3500),
  ('fe000000-0000-0000-0000-000000000003', 'fc000000-0000-0000-0000-000000000003', 'TM03RLS', 'platforma_auto', 3500);

insert into public.drivers (id, company_id, full_name) values
  ('fd000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000001', 'Șofer A');

insert into public.documents (id, company_id, vehicle_id, scope, kind, file_path, valid_until, status, uploaded_by) values
  ('fa000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000001', null, 'company', 'licenta_comunitara',           'fc000000-0000-0000-0000-000000000001/licenta.pdf', current_date + 400, 'approved', 'f0000000-0000-0000-0000-000000000002'),
  ('fa000000-0000-0000-0000-000000000002', 'fc000000-0000-0000-0000-000000000001', null, 'company', 'certificat_inregistrare_onrc', 'fc000000-0000-0000-0000-000000000001/onrc.pdf',    null,               'approved', 'f0000000-0000-0000-0000-000000000002'),
  ('fa000000-0000-0000-0000-000000000003', 'fc000000-0000-0000-0000-000000000001', null, 'company', 'asigurare_cmr',                'fc000000-0000-0000-0000-000000000001/cmr.pdf',     current_date + 300, 'approved', 'f0000000-0000-0000-0000-000000000002'),
  ('fa000000-0000-0000-0000-000000000004', 'fc000000-0000-0000-0000-000000000001', 'fe000000-0000-0000-0000-000000000001', 'vehicle', 'copie_conforma', 'fc000000-0000-0000-0000-000000000001/cc.pdf',  current_date + 300, 'approved', 'f0000000-0000-0000-0000-000000000002'),
  ('fa000000-0000-0000-0000-000000000005', 'fc000000-0000-0000-0000-000000000001', 'fe000000-0000-0000-0000-000000000001', 'vehicle', 'itp',            'fc000000-0000-0000-0000-000000000001/itp.pdf', current_date + 300, 'approved', 'f0000000-0000-0000-0000-000000000002'),
  ('fa000000-0000-0000-0000-000000000006', 'fc000000-0000-0000-0000-000000000001', 'fe000000-0000-0000-0000-000000000001', 'vehicle', 'rca',            'fc000000-0000-0000-0000-000000000001/rca.pdf', current_date + 200, 'approved', 'f0000000-0000-0000-0000-000000000002'),
  ('fa000000-0000-0000-0000-000000000007', 'fc000000-0000-0000-0000-000000000002', null, 'company', 'certificat_casa_expeditii',    'fc000000-0000-0000-0000-000000000002/cert.pdf',    current_date + 300, 'approved', 'f0000000-0000-0000-0000-000000000004'),
  ('fa000000-0000-0000-0000-000000000008', 'fc000000-0000-0000-0000-000000000002', null, 'company', 'certificat_inregistrare_onrc', 'fc000000-0000-0000-0000-000000000002/onrc.pdf',    null,               'approved', 'f0000000-0000-0000-0000-000000000004'),
  ('fa000000-0000-0000-0000-000000000009', 'fc000000-0000-0000-0000-000000000003', 'fe000000-0000-0000-0000-000000000003', 'vehicle', 'itp',            'fc000000-0000-0000-0000-000000000003/itp.pdf', current_date + 300, 'approved', 'f0000000-0000-0000-0000-00000000000a');

update public.companies set verification_status = 'verified'
where id in ('fc000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000002');

-- Computes vehicle compliance for VA before its listings are published.
do $$ begin perform public.run_compliance_sweep(); end $$;

insert into public.truck_listings (id, company_id, vehicle_id, posted_by, direction, from_city, to_city, available_from, status, platform_slots_total) values
  ('fb000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000001', 'fe000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', 'retur', 'München',   'Cluj-Napoca', current_date + 2, 'active', null),
  ('fb000000-0000-0000-0000-000000000002', 'fc000000-0000-0000-0000-000000000001', 'fe000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', 'retur', 'Milano',    'Timișoara',   current_date + 3, 'active', 3),
  ('fb000000-0000-0000-0000-000000000003', 'fc000000-0000-0000-0000-000000000001', 'fe000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', 'retur', 'Stuttgart', 'Arad',        current_date + 4, 'active', 4),
  ('fb000000-0000-0000-0000-000000000004', 'fc000000-0000-0000-0000-000000000001', 'fe000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', 'retur', 'Viena',     'Oradea',      current_date + 3, 'active', 4),
  ('fb000000-0000-0000-0000-000000000005', 'fc000000-0000-0000-0000-000000000001', 'fe000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', 'tur',   'Cluj-Napoca', 'Hamburg',   current_date + 5, 'active', null),
  ('fb000000-0000-0000-0000-000000000006', 'fc000000-0000-0000-0000-000000000001', 'fe000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', 'tur',   'Iași',      'Berlin',      current_date + 6, 'draft',  2),
  ('fb000000-0000-0000-0000-000000000007', 'fc000000-0000-0000-0000-000000000001', 'fe000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', 'tur',   'Arad',      'Madrid',      current_date + 6, 'draft',  null),
  -- Its departure day has to end between now and now + 24 hours, whatever
  -- the hour the suite runs, because the P10 check below asserts that the
  -- end of the day is what the expiry clamps to.
  --
  -- `current_date` is the server's date, and the rule is written in
  -- Europe/Bucharest. Between 21:00 and 24:00 UTC those are different
  -- days: the departure day had already ended, the insert was refused
  -- with „Plecarea a trecut", and the suite could not pass for three
  -- hours every night. Nobody had run it at that hour.
  ('fb000000-0000-0000-0000-000000000008', 'fc000000-0000-0000-0000-000000000001', 'fe000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', 'retur', 'Linz',      'Sibiu',       (now() at time zone 'Europe/Bucharest')::date, 'active', 2);

update public.truck_listings set status = 'expired' where id = 'fb000000-0000-0000-0000-000000000007';

insert into public.listing_contacts (truck_listing_id, contact_name, contact_phone) values
  ('fb000000-0000-0000-0000-000000000001', 'Owner A', '+40711000002'),
  ('fb000000-0000-0000-0000-000000000002', 'Owner A', '+40711000002'),
  ('fb000000-0000-0000-0000-000000000005', 'Owner A', '+40711000002'),
  ('fb000000-0000-0000-0000-000000000007', 'Owner A', '+40711000002');

insert into public.cargo_listings (id, company_id, posted_by, board, listing_kind, title, loading_city, unloading_city, loading_from, weight_kg, status) values
  ('f1000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000004', 'curse', 'vehicul', 'BMW din Germania',     'Stuttgart', 'București', current_date + 3, 1500, 'draft'),
  ('f1000000-0000-0000-0000-000000000002', null,                                   'f0000000-0000-0000-0000-000000000006', 'retur', 'vehicul', 'Golf pentru Timișoara', 'Milano',    'Timișoara', current_date + 3, 1200, 'draft'),
  ('f1000000-0000-0000-0000-000000000003', null,                                   'f0000000-0000-0000-0000-000000000006', 'retur', 'vehicul', 'Passat pentru Oradea',  'Viena',     'Oradea',    current_date + 3, 1400, 'draft'),
  ('f1000000-0000-0000-0000-000000000004', 'fc000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000004', 'curse', 'vehicul', 'Fără contact',          'Arad',      'Cluj',      current_date + 5, 1300, 'draft');

insert into public.cargo_vehicle_details (cargo_listing_id, make, model, year)
select id, 'Volkswagen', 'Golf', 2018 from public.cargo_listings
where id in ('f1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000002',
             'f1000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000004');

update public.cargo_listings set status = 'active'
where id in ('f1000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000002',
             'f1000000-0000-0000-0000-000000000003');

insert into public.listing_contacts (cargo_listing_id, contact_name, contact_phone) values
  ('f1000000-0000-0000-0000-000000000001', 'Owner B',  '+40711000004'),
  ('f1000000-0000-0000-0000-000000000002', 'Pf',       '+40711000006');

insert into public.offers (id, truck_listing_id, from_company_id, from_user_id, price_amount, currency) values
  ('f2000000-0000-0000-0000-000000000001', 'fb000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000004', 650, 'EUR'),
  ('f2000000-0000-0000-0000-000000000002', 'fb000000-0000-0000-0000-000000000001', null,                                   'f0000000-0000-0000-0000-000000000006', 600, 'EUR'),
  ('f2000000-0000-0000-0000-000000000006', 'fb000000-0000-0000-0000-000000000005', 'fc000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000004', 700, 'EUR'),
  ('f2000000-0000-0000-0000-000000000007', 'fb000000-0000-0000-0000-000000000005', null,                                   'f0000000-0000-0000-0000-000000000006', 710, 'EUR');

insert into public.transports (id, truck_listing_id, shipper_company_id, shipper_user_id, carrier_company_id, vehicle_id, agreed_price, currency, status) values
  ('f3000000-0000-0000-0000-000000000001', 'fb000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000004', 'fc000000-0000-0000-0000-000000000001', 'fe000000-0000-0000-0000-000000000001', 650, 'EUR', 'delivered'),
  ('f3000000-0000-0000-0000-000000000002', 'fb000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000004', 'fc000000-0000-0000-0000-000000000001', 'fe000000-0000-0000-0000-000000000001', 650, 'EUR', 'agreed'),
  ('f3000000-0000-0000-0000-000000000003', 'fb000000-0000-0000-0000-000000000001', null,                                   'f0000000-0000-0000-0000-000000000006', 'fc000000-0000-0000-0000-000000000001', 'fe000000-0000-0000-0000-000000000001', 600, 'EUR', 'delivered');

insert into public.ratings (id, transport_id, rater_user_id, rater_company_id, rated_company_id, score) values
  ('f7000000-0000-0000-0000-000000000001', 'f3000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000004',
   'fc000000-0000-0000-0000-000000000002', 'fc000000-0000-0000-0000-000000000001', 5);

insert into public.conversations (id, truck_listing_id, initiator_user_id, owner_user_id) values
  ('f4000000-0000-0000-0000-000000000001', 'fb000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000006', 'f0000000-0000-0000-0000-000000000002');
insert into public.messages (id, conversation_id, sender_user_id, body) values
  ('f5000000-0000-0000-0000-000000000001', 'f4000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000006', 'Bună ziua, mai aveți loc?');

insert into public.departure_bookings (id, truck_listing_id, cargo_listing_id, slots) values
  ('f6000000-0000-0000-0000-000000000001', 'fb000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000002', 1);

insert into storage.objects (bucket_id, name) values
  ('documents', 'fc000000-0000-0000-0000-000000000001/licenta.pdf');

-- Documents that change A and C after their listings exist: a CMR renewal
-- waiting for review, and C's paperwork in review / rejected.
insert into public.documents (id, company_id, scope, kind, file_path, valid_until, status, uploaded_by) values
  ('fa000000-0000-0000-0000-00000000000a', 'fc000000-0000-0000-0000-000000000001', 'company', 'asigurare_cmr',                'fc000000-0000-0000-0000-000000000001/cmr-2028.pdf', current_date + 665, 'pending',  'f0000000-0000-0000-0000-000000000002'),
  ('fa000000-0000-0000-0000-00000000000b', 'fc000000-0000-0000-0000-000000000003', 'company', 'licenta_comunitara',           'fc000000-0000-0000-0000-000000000003/licenta.pdf',  current_date + 400, 'pending',  'f0000000-0000-0000-0000-00000000000a'),
  ('fa000000-0000-0000-0000-00000000000c', 'fc000000-0000-0000-0000-000000000003', 'company', 'certificat_inregistrare_onrc', 'fc000000-0000-0000-0000-000000000003/onrc.pdf',     null,              'rejected', 'f0000000-0000-0000-0000-00000000000a');

-- A function created after the migrations, to test default privileges.
create function public.zz_rls_default_privilege_probe() returns integer
language sql as 'select 1';

-- =====================================================================
-- P1 - profiles and platform staff
-- =====================================================================

select pg_temp.check('P1   a user cannot flag themselves as platform staff on their profile', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$update public.profiles set is_platform_admin = true where id = auth.uid()$a$, 'blocked',
  p_verify => $v$select not public.is_platform_admin()$v$, p_missing_ok => true);

select pg_temp.check('P1   a user cannot insert themselves into platform_staff', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$insert into public.platform_staff (user_id) values (auth.uid())$a$, 'blocked',
  p_verify => $v$select not public.is_platform_admin()$v$);

select pg_temp.check('P1   a non-staff user cannot call set_platform_staff', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.set_platform_staff(auth.uid(), 'admin', 'self-grant')$a$, 'blocked',
  p_verify => $v$select not public.is_platform_admin()$v$);

select pg_temp.check('P1   staff grant through set_platform_staff works and is audited', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.set_platform_staff('f0000000-0000-0000-0000-000000000008', 'admin', 'test grant')$a$, 'allowed',
  p_verify => $v$select exists (select 1 from public.platform_staff where user_id = 'f0000000-0000-0000-0000-000000000008')
                   and exists (select 1 from public.audit_log where action = 'staff.granted'
                               and entity_id = 'f0000000-0000-0000-0000-000000000008')$v$);

select pg_temp.check('P1   a user cannot mark their own phone as verified', 'fix',
  'f0000000-0000-0000-0000-000000000007', 'authenticated',
  $a$update public.profiles set phone_verified = true where id = auth.uid()$a$, 'blocked',
  p_verify => $v$select not phone_verified from public.profiles where id = 'f0000000-0000-0000-0000-000000000007'$v$);

select pg_temp.check('P1   a user cannot switch their account type', 'fix',
  'f0000000-0000-0000-0000-000000000008', 'authenticated',
  $a$update public.profiles set account_type = 'individual' where id = auth.uid()$a$, 'blocked',
  p_verify => $v$select account_type = 'company' from public.profiles where id = 'f0000000-0000-0000-0000-000000000008'$v$);

select pg_temp.check('P1   changing the phone number drops its verification', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$update public.profiles set phone = '+40799999999' where id = auth.uid()$a$, 'allowed',
  p_verify => $v$select phone = '+40799999999' and not phone_verified
                 from public.profiles where id = 'f0000000-0000-0000-0000-000000000006'$v$);

select pg_temp.check('P1   phone verification follows auth.users.phone_confirmed_at', 'fix',
  null, 'service_role',
  $a$update auth.users set phone = '+40722111222', phone_confirmed_at = now()
     where id = 'f0000000-0000-0000-0000-000000000007'$a$, 'allowed',
  p_verify => $v$select phone_verified and phone = '+40722111222'
                 from public.profiles where id = 'f0000000-0000-0000-0000-000000000007'$v$,
  p_missing_ok => false);

select pg_temp.check('P1   a user can still edit their own name', 'guard',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$update public.profiles set full_name = 'Nume Nou' where id = auth.uid()$a$, 'allowed');

-- =====================================================================
-- P2 - companies
-- =====================================================================

select pg_temp.check('P2b  a user cannot insert a company directly', 'fix',
  'f0000000-0000-0000-0000-000000000009', 'authenticated',
  $a$insert into public.companies (cui, legal_name, company_type, created_by)
     values ('90000009', 'Direct SRL', 'transport', auth.uid())$a$, 'blocked',
  p_verify => $v$select not exists (select 1 from public.companies where cui = '90000009')$v$);

select pg_temp.check('P2b  create_company creates a draft company and its owner in one call', 'fix',
  'f0000000-0000-0000-0000-000000000009', 'authenticated',
  $a$select public.create_company('RO 90000010', 'Firmă Nouă Transport SRL', 'transport')$a$, 'allowed',
  p_verify => $v$select exists (
                   select 1 from public.companies c
                   join public.company_members m on m.company_id = c.id
                   where c.cui = '90000010' and c.verification_status = 'draft'
                     and m.user_id = auth.uid() and m.role = 'owner')$v$,
  p_verify_as_role => true);

select pg_temp.check('P2b  company creation is audited', 'fix',
  'f0000000-0000-0000-0000-000000000009', 'authenticated',
  $a$select public.create_company('90000012', 'Auditată SRL', 'expeditie')$a$, 'allowed',
  p_verify => $v$select exists (select 1 from public.audit_log a join public.companies c on c.id = a.entity_id
                                where a.action = 'company.created' and c.cui = '90000012')$v$);

select pg_temp.check('P2b  an individual account cannot create a company', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.create_company('90000011', 'PF SRL', 'transport')$a$, 'blocked',
  p_verify => $v$select not exists (select 1 from public.companies where cui = '90000011')$v$);

select pg_temp.check('P2c  an owner cannot verify their own company', 'fix',
  'f0000000-0000-0000-0000-00000000000a', 'authenticated',
  $a$update public.companies set verification_status = 'verified' where id = 'fc000000-0000-0000-0000-000000000003'$a$, 'blocked',
  p_verify => $v$select verification_status = 'draft' from public.companies where id = 'fc000000-0000-0000-0000-000000000003'$v$);

select pg_temp.check('P2c  an owner cannot write trust score or ratings', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.companies set trust_score = 100, rating_avg = 5, rating_count = 99
     where id = 'fc000000-0000-0000-0000-000000000001'$a$, 'blocked',
  p_verify => $v$select trust_score = 0 from public.companies where id = 'fc000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('P2c  an owner cannot lift a suspension', 'fix',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  $a$update public.companies set is_suspended = false, verification_status = 'verified', suspension_reason = null
     where id = 'fc000000-0000-0000-0000-000000000002'$a$, 'blocked',
  p_setup => $s$update public.companies set is_suspended = true, verification_status = 'suspended',
                suspension_reason = 'test' where id = 'fc000000-0000-0000-0000-000000000002'$s$,
  p_verify => $v$select is_suspended from public.companies where id = 'fc000000-0000-0000-0000-000000000002'$v$);

select pg_temp.check('P2c  an owner cannot write the ANAF snapshot', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.companies set anaf_is_inactive = false, anaf_checked_at = now()
     where id = 'fc000000-0000-0000-0000-000000000001'$a$, 'blocked',
  p_verify => $v$select anaf_checked_at is null from public.companies where id = 'fc000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('P2c  a verified company cannot change its legal identity', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.companies set legal_name = 'Altă Firmă SRL', cui = '12345'
     where id = 'fc000000-0000-0000-0000-000000000001'$a$, 'blocked',
  p_verify => $v$select legal_name = 'RLS Carrier A SRL' from public.companies where id = 'fc000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('P2c  staff changes to verification are audited', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$update public.companies set verification_status = 'rejected' where id = 'fc000000-0000-0000-0000-000000000003'$a$, 'allowed',
  p_verify => $v$select exists (select 1 from public.audit_log where entity = 'companies'
                                and entity_id = 'fc000000-0000-0000-0000-000000000003')$v$);

select pg_temp.check('P2c  an owner can still edit contact details', 'guard',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.companies set contact_phone = '+40711999999' where id = 'fc000000-0000-0000-0000-000000000001'$a$, 'allowed');

-- =====================================================================
-- P3 - documents, R1 - early renewal, view states
-- =====================================================================

select pg_temp.check('P3   a member cannot approve a document', 'fix',
  'f0000000-0000-0000-0000-000000000003', 'authenticated',
  $a$update public.documents set status = 'approved' where id = 'fa000000-0000-0000-0000-00000000000a'$a$, 'blocked',
  p_verify => $v$select status = 'pending' from public.documents where id = 'fa000000-0000-0000-0000-00000000000a'$v$);

select pg_temp.check('P3   a member cannot extend an approved document', 'fix',
  'f0000000-0000-0000-0000-000000000003', 'authenticated',
  $a$update public.documents set valid_until = current_date + 3650 where id = 'fa000000-0000-0000-0000-000000000001'$a$, 'blocked',
  p_verify => $v$select valid_until = current_date + 400 from public.documents where id = 'fa000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('P3   an upload lands as uploaded, whatever status and date it claims', 'fix',
  'f0000000-0000-0000-0000-000000000003', 'authenticated',
  $a$insert into public.documents (company_id, scope, kind, file_path, status, valid_until, uploaded_by)
     values ('fc000000-0000-0000-0000-000000000001', 'company', 'certificat_fiscal',
             'fc000000-0000-0000-0000-000000000001/fiscal.pdf', 'approved', current_date + 3650, auth.uid())$a$, 'allowed',
  p_verify => $v$select status = 'uploaded' and valid_until is null
                 from public.documents where file_path = 'fc000000-0000-0000-0000-000000000001/fiscal.pdf'$v$);

select pg_temp.check('P3   a member cannot file a document against another company''s vehicle', 'fix',
  'f0000000-0000-0000-0000-000000000003', 'authenticated',
  $a$insert into public.documents (company_id, vehicle_id, scope, kind, file_path, uploaded_by)
     values ('fc000000-0000-0000-0000-000000000001', 'fe000000-0000-0000-0000-000000000003', 'vehicle', 'itp',
             'fc000000-0000-0000-0000-000000000001/itp-vx.pdf', auth.uid())$a$, 'blocked',
  p_verify => $v$select status = 'approved' from public.documents where id = 'fa000000-0000-0000-0000-000000000009'$v$);

select pg_temp.check('P3   a document cannot point at another company''s file', 'fix',
  'f0000000-0000-0000-0000-000000000003', 'authenticated',
  $a$insert into public.documents (company_id, scope, kind, file_path, uploaded_by)
     values ('fc000000-0000-0000-0000-000000000001', 'company', 'certificat_fiscal',
             'fc000000-0000-0000-0000-000000000003/licenta.pdf', auth.uid())$a$, 'blocked',
  p_verify => $v$select not exists (select 1 from public.documents
                 where company_id = 'fc000000-0000-0000-0000-000000000001'
                   and file_path = 'fc000000-0000-0000-0000-000000000003/licenta.pdf')$v$);

select pg_temp.check('P3   a manager cannot delete a submitted document', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$delete from public.documents where id = 'fa000000-0000-0000-0000-000000000001'$a$, 'blocked',
  p_verify => $v$select exists (select 1 from public.documents where id = 'fa000000-0000-0000-0000-000000000001')$v$);

select pg_temp.check('P3   review_document approves, retires the old document and is audited', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.review_document('fa000000-0000-0000-0000-00000000000a', true)$a$, 'allowed',
  p_verify => $v$select (select status from public.documents where id = 'fa000000-0000-0000-0000-000000000003') = 'replaced'
                    and (select status from public.documents where id = 'fa000000-0000-0000-0000-00000000000a') = 'approved'
                    and exists (select 1 from public.audit_log where action = 'document.approved'
                                and entity_id = 'fa000000-0000-0000-0000-00000000000a')$v$);

select pg_temp.check('R1   uploading an early renewal keeps the approved document valid', 'fix',
  'f0000000-0000-0000-0000-000000000003', 'authenticated',
  $a$insert into public.documents (company_id, vehicle_id, scope, kind, file_path, uploaded_by)
     values ('fc000000-0000-0000-0000-000000000001', 'fe000000-0000-0000-0000-000000000001', 'vehicle', 'rca',
             'fc000000-0000-0000-0000-000000000001/rca-2027.pdf', auth.uid())$a$, 'allowed',
  p_after => $s$select 1 from public.run_compliance_sweep()$s$,
  p_verify => $v$select (select status from public.documents where id = 'fa000000-0000-0000-0000-000000000006') = 'approved'
                    and (select state from public.v_vehicle_missing_documents
                         where vehicle_id = 'fe000000-0000-0000-0000-000000000001' and kind = 'rca') = 'ok'
                    and (select is_compliant from public.vehicles where id = 'fe000000-0000-0000-0000-000000000001')
                    and (select not is_suspended from public.companies where id = 'fc000000-0000-0000-0000-000000000001')$v$);

select pg_temp.check('R1   rejecting a renewal leaves the approved document in place', 'guard',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.review_document('fa000000-0000-0000-0000-00000000000a', false, null, 'Poliță ilizibilă')$a$, 'allowed',
  p_verify => $v$select (select count(*) from public.documents
                         where company_id = 'fc000000-0000-0000-0000-000000000001'
                           and kind = 'asigurare_cmr' and status = 'approved') = 1$v$);

select pg_temp.check('#14  a document in review shows as in_review and a rejected one as rejected', 'fix',
  'f0000000-0000-0000-0000-00000000000a', 'authenticated',
  $a$select (select state from public.v_company_missing_documents
             where company_id = 'fc000000-0000-0000-0000-000000000003' and kind = 'licenta_comunitara') = 'in_review'
        and (select state from public.v_company_missing_documents
             where company_id = 'fc000000-0000-0000-0000-000000000003' and kind = 'certificat_inregistrare_onrc') = 'rejected'$a$,
  'true');

-- =====================================================================
-- P12 - vehicles and drivers
-- =====================================================================

select pg_temp.check('P12  a member cannot mark a vehicle compliant', 'fix',
  'f0000000-0000-0000-0000-000000000003', 'authenticated',
  $a$update public.vehicles set is_compliant = true where id = 'fe000000-0000-0000-0000-000000000002'$a$, 'blocked',
  p_verify => $v$select not is_compliant from public.vehicles where id = 'fe000000-0000-0000-0000-000000000002'$v$);

select pg_temp.check('P12  a new vehicle starts non-compliant whatever it claims', 'fix',
  'f0000000-0000-0000-0000-000000000003', 'authenticated',
  $a$insert into public.vehicles (company_id, plate_number, vehicle_type, is_compliant)
     values ('fc000000-0000-0000-0000-000000000001', 'TM04RLS', 'platforma_auto', true)$a$, 'allowed',
  p_verify => $v$select not is_compliant from public.vehicles where plate_number = 'TM04RLS'$v$);

select pg_temp.check('P12  the plate of a vehicle with approved papers cannot change', 'fix',
  'f0000000-0000-0000-0000-000000000003', 'authenticated',
  $a$update public.vehicles set plate_number = 'TM99XXX' where id = 'fe000000-0000-0000-0000-000000000001'$a$, 'blocked',
  p_verify => $v$select plate_number = 'TM01RLS' from public.vehicles where id = 'fe000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('P12  a member cannot mark a driver compliant', 'fix',
  'f0000000-0000-0000-0000-000000000003', 'authenticated',
  $a$update public.drivers set is_compliant = true where id = 'fd000000-0000-0000-0000-000000000001'$a$, 'blocked',
  p_verify => $v$select not is_compliant from public.drivers where id = 'fd000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('P12  a member can still edit vehicle specs', 'guard',
  'f0000000-0000-0000-0000-000000000003', 'authenticated',
  $a$update public.vehicles set max_weight_kg = 3600 where id = 'fe000000-0000-0000-0000-000000000002'$a$, 'allowed');

-- =====================================================================
-- P4 - offers
-- =====================================================================

select pg_temp.check('P4   a bidder cannot accept their own offer', 'fix',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  $a$update public.offers set status = 'accepted' where id = 'f2000000-0000-0000-0000-000000000001'$a$, 'blocked',
  p_verify => $v$select status = 'pending' from public.offers where id = 'f2000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('P4   a bidder cannot rewrite the price of an offer', 'fix',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  $a$update public.offers set price_amount = 1 where id = 'f2000000-0000-0000-0000-000000000001'$a$, 'blocked',
  p_verify => $v$select price_amount = 650 from public.offers where id = 'f2000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('P4   a bidder cannot delete an offer', 'fix',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  $a$delete from public.offers where id = 'f2000000-0000-0000-0000-000000000001'$a$, 'blocked',
  p_verify => $v$select exists (select 1 from public.offers where id = 'f2000000-0000-0000-0000-000000000001')$v$);

select pg_temp.check('P4   a bidder withdraws through withdraw_offer', 'fix',
  'f0000000-0000-0000-0000-000000000005', 'authenticated',
  $a$select public.withdraw_offer('f2000000-0000-0000-0000-000000000001')$a$, 'allowed',
  p_verify => $v$select status = 'withdrawn' from public.offers where id = 'f2000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('P4   nobody else can withdraw an offer', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.withdraw_offer('f2000000-0000-0000-0000-000000000001')$a$, 'blocked',
  p_verify => $v$select status = 'pending' from public.offers where id = 'f2000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('P4   no offers on your own listing', 'fix',
  'f0000000-0000-0000-0000-000000000003', 'authenticated',
  $a$insert into public.offers (truck_listing_id, from_company_id, from_user_id, price_amount)
     values ('fb000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000001', auth.uid(), 1)$a$, 'blocked',
  p_verify => $v$select not exists (select 1 from public.offers where price_amount = 1)$v$);

select pg_temp.check('P4   no offers on a listing that is not active', 'fix',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  $a$insert into public.offers (truck_listing_id, from_company_id, from_user_id, price_amount)
     values ('fb000000-0000-0000-0000-000000000007', 'fc000000-0000-0000-0000-000000000002', auth.uid(), 2)$a$, 'blocked',
  p_verify => $v$select not exists (select 1 from public.offers where price_amount = 2)$v$);

select pg_temp.check('P4   the bidder cannot call accept_offer', 'fix',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  $a$select public.accept_offer('f2000000-0000-0000-0000-000000000001')$a$, 'blocked',
  p_verify => $v$select status = 'pending' from public.offers where id = 'f2000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('P4   the listing owner rejects through reject_offer', 'fix',
  'f0000000-0000-0000-0000-000000000003', 'authenticated',
  $a$select public.reject_offer('f2000000-0000-0000-0000-000000000002')$a$, 'allowed',
  p_verify => $v$select status = 'rejected' from public.offers where id = 'f2000000-0000-0000-0000-000000000002'$v$);

select pg_temp.check('P4   accept_offer accepts, rejects the rest, assigns the listing, creates the transport, audits', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select public.accept_offer('f2000000-0000-0000-0000-000000000001')$a$, 'allowed',
  p_verify => $v$select (select status from public.offers where id = 'f2000000-0000-0000-0000-000000000001') = 'accepted'
                    and (select status from public.offers where id = 'f2000000-0000-0000-0000-000000000002') = 'rejected'
                    and (select status from public.truck_listings where id = 'fb000000-0000-0000-0000-000000000001') = 'carrier_selected'
                    and exists (select 1 from public.transports
                                where offer_id = 'f2000000-0000-0000-0000-000000000001'
                                  and carrier_company_id = 'fc000000-0000-0000-0000-000000000001'
                                  and shipper_company_id = 'fc000000-0000-0000-0000-000000000002'
                                  and vehicle_id = 'fe000000-0000-0000-0000-000000000001'
                                  and agreed_price = 650 and status = 'agreed')
                    and exists (select 1 from public.audit_log where action = 'offer.accepted'
                                and entity_id = 'f2000000-0000-0000-0000-000000000001')$v$);

select pg_temp.check('P4   an offer on a seat listing must name the request it books seats for', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$insert into public.offers (truck_listing_id, from_user_id, price_amount, slots)
     values ('fb000000-0000-0000-0000-000000000002', auth.uid(), 3, 1)$a$, 'blocked',
  p_verify => $v$select not exists (select 1 from public.offers where price_amount = 3)$v$);

-- Seat listing TL_SEAT: 3 seats. OS1 wants 2, OS2 wants 2, OS3 wants 1.
select pg_temp.check('P4   accepting a seat offer books its seats, keeps the listing open, rejects what no longer fits', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select public.accept_offer('f2000000-0000-0000-0000-000000000003')$a$, 'allowed',
  p_setup => $s$do $d$ begin
      insert into public.offers (id, truck_listing_id, from_user_id, price_amount, currency, slots, booking_cargo_listing_id) values
        ('f2000000-0000-0000-0000-000000000003', 'fb000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000006', 1300, 'EUR', 2, 'f1000000-0000-0000-0000-000000000002'),
        ('f2000000-0000-0000-0000-000000000005', 'fb000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000006', 650, 'EUR', 1, 'f1000000-0000-0000-0000-000000000003');
      insert into public.offers (id, truck_listing_id, from_company_id, from_user_id, price_amount, currency, slots, booking_cargo_listing_id) values
        ('f2000000-0000-0000-0000-000000000004', 'fb000000-0000-0000-0000-000000000002', 'fc000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000004', 1250, 'EUR', 2, 'f1000000-0000-0000-0000-000000000001');
    end $d$$s$,
  p_verify => $v$select exists (select 1 from public.departure_bookings
                                where truck_listing_id = 'fb000000-0000-0000-0000-000000000002'
                                  and cargo_listing_id = 'f1000000-0000-0000-0000-000000000002'
                                  and status = 'confirmed' and slots = 2
                                  and offer_id = 'f2000000-0000-0000-0000-000000000003')
                    and (select status from public.truck_listings where id = 'fb000000-0000-0000-0000-000000000002') = 'active'
                    and (select status from public.offers where id = 'f2000000-0000-0000-0000-000000000004') = 'rejected'
                    and (select status from public.offers where id = 'f2000000-0000-0000-0000-000000000005') = 'pending'
                    and (select status from public.cargo_listings where id = 'f1000000-0000-0000-0000-000000000002') = 'carrier_selected'
                    and exists (select 1 from public.transports
                                where offer_id = 'f2000000-0000-0000-0000-000000000003'
                                  and cargo_listing_id = 'f1000000-0000-0000-0000-000000000002'
                                  and truck_listing_id = 'fb000000-0000-0000-0000-000000000002')$v$);

select pg_temp.check('P4   the offer that takes the last seat assigns the seat listing', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$with first as materialized (select public.accept_offer('f2000000-0000-0000-0000-000000000003') as t)
     select public.accept_offer('f2000000-0000-0000-0000-000000000005') from first$a$, 'allowed',
  p_setup => $s$do $d$ begin
      insert into public.offers (id, truck_listing_id, from_user_id, price_amount, currency, slots, booking_cargo_listing_id) values
        ('f2000000-0000-0000-0000-000000000003', 'fb000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000006', 1300, 'EUR', 2, 'f1000000-0000-0000-0000-000000000002'),
        ('f2000000-0000-0000-0000-000000000005', 'fb000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000006', 650, 'EUR', 1, 'f1000000-0000-0000-0000-000000000003');
    end $d$$s$,
  p_verify => $v$select (select status from public.truck_listings where id = 'fb000000-0000-0000-0000-000000000002') = 'carrier_selected'
                    and (select sum(slots) from public.departure_bookings
                         where truck_listing_id = 'fb000000-0000-0000-0000-000000000002' and status = 'confirmed') = 3
                    and not exists (select 1 from public.offers
                                    where truck_listing_id = 'fb000000-0000-0000-0000-000000000002' and status = 'pending')
                    and (select count(*) from public.transports
                         where truck_listing_id = 'fb000000-0000-0000-0000-000000000002') = 2$v$);

-- =====================================================================
-- P6 - transports and ratings
-- =====================================================================

select pg_temp.check('P6   a user cannot create a transport directly', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$insert into public.transports (carrier_company_id, shipper_user_id, agreed_price, status)
     values ('fc000000-0000-0000-0000-000000000001', auth.uid(), 1, 'delivered')$a$, 'blocked',
  p_verify => $v$select not exists (select 1 from public.transports where agreed_price = 1)$v$);

select pg_temp.check('P6   a party cannot rewrite a transport', 'fix',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  $a$update public.transports set agreed_price = 1 where id = 'f3000000-0000-0000-0000-000000000001'$a$, 'blocked',
  p_verify => $v$select agreed_price = 650 from public.transports where id = 'f3000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('P6   a rating always lands on the counterparty, not on the company the client names', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$insert into public.ratings (transport_id, rater_user_id, rated_company_id, score)
     values ('f3000000-0000-0000-0000-000000000001', auth.uid(), 'fc000000-0000-0000-0000-000000000003', 1)$a$, 'allowed',
  p_verify => $v$select not exists (select 1 from public.ratings where rated_company_id = 'fc000000-0000-0000-0000-000000000003')
                    and exists (select 1 from public.ratings
                                where transport_id = 'f3000000-0000-0000-0000-000000000001'
                                  and rated_company_id = 'fc000000-0000-0000-0000-000000000002'
                                  and rater_company_id = 'fc000000-0000-0000-0000-000000000001')$v$);

select pg_temp.check('P6   one rating per side per transport', 'fix',
  'f0000000-0000-0000-0000-000000000005', 'authenticated',
  $a$insert into public.ratings (transport_id, rater_user_id, rated_company_id, score)
     values ('f3000000-0000-0000-0000-000000000001', auth.uid(), 'fc000000-0000-0000-0000-000000000001', 1)$a$, 'blocked',
  p_verify => $v$select count(*) = 1 from public.ratings
                 where transport_id = 'f3000000-0000-0000-0000-000000000001'
                   and rated_company_id = 'fc000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('P6   individuals are not rated (out of MVP)', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$insert into public.ratings (transport_id, rater_user_id, rated_company_id, score)
     values ('f3000000-0000-0000-0000-000000000003', auth.uid(), 'fc000000-0000-0000-0000-000000000001', 1)$a$, 'blocked',
  p_verify => $v$select not exists (select 1 from public.ratings where transport_id = 'f3000000-0000-0000-0000-000000000003')$v$);

select pg_temp.check('P6   a rating cannot be edited afterwards', 'fix',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  $a$update public.ratings set score = 1 where id = 'f7000000-0000-0000-0000-000000000001'$a$, 'blocked',
  p_verify => $v$select score = 5 from public.ratings where id = 'f7000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('P6   no rating before delivery', 'guard',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  $a$insert into public.ratings (transport_id, rater_user_id, rated_company_id, score)
     values ('f3000000-0000-0000-0000-000000000002', auth.uid(), 'fc000000-0000-0000-0000-000000000001', 1)$a$, 'blocked');

select pg_temp.check('P6   a non-party cannot rate', 'guard',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$insert into public.ratings (transport_id, rater_user_id, rated_company_id, score)
     values ('f3000000-0000-0000-0000-000000000001', auth.uid(), 'fc000000-0000-0000-0000-000000000001', 1)$a$, 'blocked');

-- =====================================================================
-- P5, P11 - messaging
-- =====================================================================

select pg_temp.check('P5   a participant cannot rewrite the other side''s message', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.messages set body = 'modificat' where id = 'f5000000-0000-0000-0000-000000000001'$a$, 'blocked',
  p_verify => $v$select body = 'Bună ziua, mai aveți loc?' from public.messages where id = 'f5000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('P5   a sender cannot edit their own message', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$update public.messages set body = 'modificat' where id = 'f5000000-0000-0000-0000-000000000001'$a$, 'blocked',
  p_verify => $v$select body = 'Bună ziua, mai aveți loc?' from public.messages where id = 'f5000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('P5   read receipts go through mark_conversation_read', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select public.mark_conversation_read('f4000000-0000-0000-0000-000000000001')$a$, 'allowed',
  p_verify => $v$select read_at is not null from public.messages where id = 'f5000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('P11  the conversation owner comes from the listing, and opening one uses the contact gate once', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$insert into public.conversations (cargo_listing_id, initiator_user_id, owner_user_id)
     values ('f1000000-0000-0000-0000-000000000001', auth.uid(), 'f0000000-0000-0000-0000-000000000001')$a$, 'allowed',
  p_verify => $v$select (select owner_user_id from public.conversations
                         where cargo_listing_id = 'f1000000-0000-0000-0000-000000000001'
                           and initiator_user_id = 'f0000000-0000-0000-0000-000000000006') = 'f0000000-0000-0000-0000-000000000004'
                    and (select count(*) from public.contact_reveals
                         where user_id = 'f0000000-0000-0000-0000-000000000006'
                           and cargo_listing_id = 'f1000000-0000-0000-0000-000000000001') = 1$v$);

select pg_temp.check('P11  a user who could not reveal the contact cannot open a conversation', 'fix',
  'f0000000-0000-0000-0000-000000000008', 'authenticated',
  $a$insert into public.conversations (truck_listing_id, initiator_user_id, owner_user_id)
     values ('fb000000-0000-0000-0000-000000000001', auth.uid(), 'f0000000-0000-0000-0000-000000000002')$a$, 'blocked',
  p_verify => $v$select not exists (select 1 from public.conversations where initiator_user_id = 'f0000000-0000-0000-0000-000000000008')$v$);

select pg_temp.check('P11  no conversation on your own listing', 'fix',
  'f0000000-0000-0000-0000-000000000003', 'authenticated',
  $a$insert into public.conversations (truck_listing_id, initiator_user_id, owner_user_id)
     values ('fb000000-0000-0000-0000-000000000001', auth.uid(), 'f0000000-0000-0000-0000-000000000002')$a$, 'blocked',
  p_verify => $v$select not exists (select 1 from public.conversations where initiator_user_id = 'f0000000-0000-0000-0000-000000000003')$v$);

select pg_temp.check('P11  no conversation on a listing that is not active', 'fix',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  $a$insert into public.conversations (truck_listing_id, initiator_user_id, owner_user_id)
     values ('fb000000-0000-0000-0000-000000000007', auth.uid(), 'f0000000-0000-0000-0000-000000000002')$a$, 'blocked',
  p_verify => $v$select not exists (select 1 from public.conversations where truck_listing_id = 'fb000000-0000-0000-0000-000000000007')$v$);

select pg_temp.check('P11  participants cannot edit a conversation', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$update public.conversations set owner_user_id = auth.uid() where id = 'f4000000-0000-0000-0000-000000000001'$a$, 'blocked',
  p_verify => $v$select owner_user_id = 'f0000000-0000-0000-0000-000000000002' from public.conversations
                 where id = 'f4000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('P5   a participant can still send a message', 'guard',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$insert into public.messages (conversation_id, sender_user_id, body)
     values ('f4000000-0000-0000-0000-000000000001', auth.uid(), 'Da, marți.')$a$, 'allowed');

-- =====================================================================
-- P7 - function privileges
-- =====================================================================

select pg_temp.check('P7   anon cannot run the compliance sweep', 'fix',
  null, 'anon', $a$select public.run_compliance_sweep()$a$, 'blocked');

select pg_temp.check('P7   authenticated cannot run the compliance sweep', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated', $a$select public.run_compliance_sweep()$a$, 'blocked');

select pg_temp.check('P7   authenticated cannot queue expiry reminders', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated', $a$select public.queue_expiry_reminders()$a$, 'blocked');

select pg_temp.check('P7   anon cannot expire listings', 'fix',
  null, 'anon', $a$select public.expire_stale_listings()$a$, 'blocked');

select pg_temp.check('P7   company_can_act is internal', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.company_can_act('fc000000-0000-0000-0000-000000000001')$a$, 'blocked');

select pg_temp.check('P7   write_audit is internal', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.write_audit('forged', 'companies', null, null, null, null)$a$, 'blocked');

select pg_temp.check('P7   purge_audit_log is service_role only', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.purge_audit_log(interval '0 seconds')$a$, 'blocked');

select pg_temp.check('P7   a function added later is not executable by default', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.zz_rls_default_privilege_probe()$a$, 'blocked');

select pg_temp.check('P7   service_role still runs the sweep (edge function compliance-sweep)', 'guard',
  null, 'service_role', $a$select public.run_compliance_sweep()$a$, 'allowed');

select pg_temp.check('P7   anon still reads plans (policy helper stays executable)', 'guard',
  null, 'anon', $a$select * from public.plans$a$, 'allowed');

select pg_temp.check('P7   a member still reads their company (policy helpers stay executable)', 'guard',
  'f0000000-0000-0000-0000-000000000003', 'authenticated',
  $a$select exists (select 1 from public.companies where id = 'fc000000-0000-0000-0000-000000000001')$a$, 'true');

select pg_temp.check('P7   current_plan stays callable', 'guard',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select (public.current_plan('fc000000-0000-0000-0000-000000000001')).code = 'carrier'$a$, 'true');

select pg_temp.check('P7   every project function pins its search_path', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select not exists (
       select 1 from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname <> 'zz_rls_default_privilege_probe'
         and not exists (select 1 from pg_depend d
                         where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e')
         and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%'))$a$,
  'true');

-- =====================================================================
-- P8, P14 - views
-- =====================================================================

select pg_temp.check('P8   compliance of other companies is not visible', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select count(*) = 0 from public.v_company_compliance$a$, 'true');

select pg_temp.check('P8   missing documents of other companies are not visible', 'fix',
  'f0000000-0000-0000-0000-000000000003', 'authenticated',
  $a$select count(*) = 0 from public.v_company_missing_documents where company_id <> 'fc000000-0000-0000-0000-000000000001'$a$, 'true');

select pg_temp.check('P8   vehicle documents of other companies are not visible', 'fix',
  'f0000000-0000-0000-0000-000000000003', 'authenticated',
  $a$select count(*) = 0 from public.v_vehicle_missing_documents where company_id <> 'fc000000-0000-0000-0000-000000000001'$a$, 'true');

select pg_temp.check('P8   anon cannot read compliance views', 'fix',
  null, 'anon', $a$select * from public.v_company_compliance$a$, 'blocked');

select pg_temp.check('P8   a member sees their own company''s compliance', 'guard',
  'f0000000-0000-0000-0000-000000000003', 'authenticated',
  $a$select exists (select 1 from public.v_company_compliance where company_id = 'fc000000-0000-0000-0000-000000000001')$a$, 'true');

select pg_temp.check('P8   staff see every company''s compliance', 'guard',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select exists (select 1 from public.v_company_compliance where company_id = 'fc000000-0000-0000-0000-000000000003')$a$, 'true');

select pg_temp.check('P14  anon cannot read v_departures', 'fix',
  null, 'anon', $a$select * from public.v_departures$a$, 'blocked');

select pg_temp.check('P14  draft departures are not visible through v_departures', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select count(*) = 0 from public.v_departures where truck_listing_id = 'fb000000-0000-0000-0000-000000000006'$a$, 'true');

select pg_temp.check('P14  v_departures counts seats for active departures', 'guard',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select slots_free = 3 from public.v_departures where truck_listing_id = 'fb000000-0000-0000-0000-000000000003'$a$, 'true');

-- =====================================================================
-- P9 - reveal_contact
-- =====================================================================

select pg_temp.check('P9   a company account without a company cannot reveal contacts', 'fix',
  'f0000000-0000-0000-0000-000000000008', 'authenticated',
  $a$select * from public.reveal_contact(null, 'fb000000-0000-0000-0000-000000000001')$a$, 'blocked',
  p_verify => $v$select not exists (select 1 from public.contact_reveals where user_id = 'f0000000-0000-0000-0000-000000000008')$v$);

select pg_temp.check('P9   an individual without a verified phone cannot reveal contacts', 'fix',
  'f0000000-0000-0000-0000-000000000007', 'authenticated',
  $a$select * from public.reveal_contact(null, 'fb000000-0000-0000-0000-000000000001')$a$, 'blocked',
  p_verify => $v$select not exists (select 1 from public.contact_reveals where user_id = 'f0000000-0000-0000-0000-000000000007')$v$);

select pg_temp.check('P9   no contact reveal on a listing that is not active', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select * from public.reveal_contact(null, 'fb000000-0000-0000-0000-000000000007')$a$, 'blocked',
  p_verify => $v$select not exists (select 1 from public.contact_reveals where truck_listing_id = 'fb000000-0000-0000-0000-000000000007')$v$);

select pg_temp.check('P9   a draft company cannot reveal contacts', 'guard',
  'f0000000-0000-0000-0000-00000000000a', 'authenticated',
  $a$select * from public.reveal_contact(null, 'fb000000-0000-0000-0000-000000000001')$a$, 'blocked');

select pg_temp.check('P9   a verified company reveals a contact', 'guard',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  $a$select * from public.reveal_contact(null, 'fb000000-0000-0000-0000-000000000001')$a$, 'allowed');

-- =====================================================================
-- P10 - departure bookings
-- =====================================================================

select pg_temp.check('P10  a client cannot insert a confirmed booking', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$insert into public.departure_bookings (truck_listing_id, cargo_listing_id, slots, status)
     values ('fb000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0000-000000000003', 1, 'confirmed')$a$, 'blocked',
  p_verify => $v$select not exists (select 1 from public.departure_bookings
                 where truck_listing_id = 'fb000000-0000-0000-0000-000000000004' and status = 'confirmed')$v$);

select pg_temp.check('P10  a client cannot confirm their own reservation', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$update public.departure_bookings set status = 'confirmed' where id = 'f6000000-0000-0000-0000-000000000001'$a$, 'blocked',
  p_verify => $v$select status = 'reserved' from public.departure_bookings where id = 'f6000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('P10  a client cannot resize a reservation', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$update public.departure_bookings set slots = 4 where id = 'f6000000-0000-0000-0000-000000000001'$a$, 'blocked',
  p_verify => $v$select slots = 1 from public.departure_bookings where id = 'f6000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('P10  the carrier confirms through confirm_departure_booking, audited', 'fix',
  'f0000000-0000-0000-0000-000000000003', 'authenticated',
  $a$select public.confirm_departure_booking('f6000000-0000-0000-0000-000000000001', 640)$a$, 'allowed',
  p_verify => $v$select (select status = 'confirmed' and agreed_price = 640 from public.departure_bookings
                         where id = 'f6000000-0000-0000-0000-000000000001')
                    and exists (select 1 from public.audit_log where action = 'booking.confirmed'
                                and entity_id = 'f6000000-0000-0000-0000-000000000001')$v$);

select pg_temp.check('ORD  confirming a reservation creates the order and serves the request', 'fix',
  'f0000000-0000-0000-0000-000000000003', 'authenticated',
  $a$select public.confirm_departure_booking('f6000000-0000-0000-0000-000000000001', 640)$a$, 'allowed',
  p_verify => $v$select exists (select 1 from public.transports t
                                where t.departure_booking_id = 'f6000000-0000-0000-0000-000000000001'
                                  and t.carrier_company_id = 'fc000000-0000-0000-0000-000000000001'
                                  and t.shipper_user_id = 'f0000000-0000-0000-0000-000000000006'
                                  and t.shipper_company_id is null
                                  and t.vehicle_id = 'fe000000-0000-0000-0000-000000000001'
                                  and t.cargo_listing_id = 'f1000000-0000-0000-0000-000000000002'
                                  and t.agreed_price = 640 and t.status = 'agreed'
                                  and exists (select 1 from public.audit_log a
                                              where a.action = 'order.created' and a.entity_id = t.id))
                    and (select status from public.cargo_listings where id = 'f1000000-0000-0000-0000-000000000002') = 'carrier_selected'$v$);

select pg_temp.check('ORD  a reservation cannot be confirmed without an agreed price', 'fix',
  'f0000000-0000-0000-0000-000000000003', 'authenticated',
  $a$select public.confirm_departure_booking('f6000000-0000-0000-0000-000000000001')$a$, 'blocked',
  p_verify => $v$select status = 'reserved' from public.departure_bookings where id = 'f6000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('ORD  accept_offer creates its order through the same function', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select public.accept_offer('f2000000-0000-0000-0000-000000000001')$a$, 'allowed',
  p_verify => $v$select exists (select 1 from public.transports t
                                join public.audit_log a on a.entity_id = t.id and a.action = 'order.created'
                                where t.offer_id = 'f2000000-0000-0000-0000-000000000001')$v$);

select pg_temp.check('ORD  an order from a seat offer points at its booking', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select public.accept_offer('f2000000-0000-0000-0000-000000000005')$a$, 'allowed',
  p_setup => $s$insert into public.offers (id, truck_listing_id, from_user_id, price_amount, currency, slots, booking_cargo_listing_id)
                values ('f2000000-0000-0000-0000-000000000005', 'fb000000-0000-0000-0000-000000000002',
                        'f0000000-0000-0000-0000-000000000006', 650, 'EUR', 1, 'f1000000-0000-0000-0000-000000000003')$s$,
  p_verify => $v$select exists (select 1 from public.transports t
                                join public.departure_bookings b on b.id = t.departure_booking_id
                                where t.offer_id = 'f2000000-0000-0000-0000-000000000005'
                                  and b.offer_id = 'f2000000-0000-0000-0000-000000000005'
                                  and b.status = 'confirmed')$v$);

select pg_temp.check('ORD  nobody calls create_order directly, not even service_role', 'fix',
  null, 'service_role',
  $a$select public.create_order('fc000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000002', null,
                                1, 'EUR', p_offer_id => 'f2000000-0000-0000-0000-000000000001')$a$, 'blocked',
  p_verify => $v$select not exists (select 1 from public.transports where agreed_price = 1)$v$);

select pg_temp.check('P10  the client cannot call confirm_departure_booking', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.confirm_departure_booking('f6000000-0000-0000-0000-000000000001', 1)$a$, 'blocked',
  p_verify => $v$select status = 'reserved' from public.departure_bookings where id = 'f6000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('P10  one reservation per user per departure', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$with first as (
       insert into public.departure_bookings (truck_listing_id, cargo_listing_id, slots)
       values ('fb000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0000-000000000002', 1)
       returning 1)
     insert into public.departure_bookings (truck_listing_id, cargo_listing_id, slots)
     select 'fb000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0000-000000000003', 1 from first$a$, 'blocked',
  p_verify => $v$select not exists (select 1 from public.departure_bookings
                 where truck_listing_id = 'fb000000-0000-0000-0000-000000000004')$v$);

select pg_temp.check('P10  a reservation expires after 24 hours', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$insert into public.departure_bookings (truck_listing_id, cargo_listing_id, slots)
     values ('fb000000-0000-0000-0000-000000000004', 'f1000000-0000-0000-0000-000000000002', 1)$a$, 'allowed',
  p_verify => $v$select expires_at between now() + interval '23 hours 59 minutes' and now() + interval '24 hours 1 minute'
                    and reserved_by = 'f0000000-0000-0000-0000-000000000006'
                 from public.departure_bookings
                 where truck_listing_id = 'fb000000-0000-0000-0000-000000000004'
                   and cargo_listing_id = 'f1000000-0000-0000-0000-000000000002'$v$);

select pg_temp.check('P10  a reservation expires at departure when that comes first', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$insert into public.departure_bookings (truck_listing_id, cargo_listing_id, slots)
     values ('fb000000-0000-0000-0000-000000000008', 'f1000000-0000-0000-0000-000000000002', 1)$a$, 'allowed',
  p_verify => $v$select b.expires_at = ((t.available_from + 1)::timestamp at time zone 'Europe/Bucharest')
                 from public.departure_bookings b
                 join public.truck_listings t on t.id = b.truck_listing_id
                 where b.truck_listing_id = 'fb000000-0000-0000-0000-000000000008'$v$);

select pg_temp.check('P10  an expired reservation stops holding seats before the cleanup job runs', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select slots_free = 4 from public.v_departures where truck_listing_id = 'fb000000-0000-0000-0000-000000000003'$a$, 'true',
  p_setup => $s$update public.departure_bookings set expires_at = now() - interval '1 minute'
                where id = 'f6000000-0000-0000-0000-000000000001'$s$);

select pg_temp.check('P10  the cleanup job marks expired reservations', 'fix',
  null, 'service_role',
  $a$select public.expire_stale_listings()$a$, 'allowed',
  p_setup => $s$update public.departure_bookings set expires_at = now() - interval '1 minute'
                where id = 'f6000000-0000-0000-0000-000000000001'$s$,
  p_verify => $v$select status = 'expired' from public.departure_bookings where id = 'f6000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('P10  a client can cancel their reservation', 'guard',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$update public.departure_bookings set status = 'cancelled' where id = 'f6000000-0000-0000-0000-000000000001'$a$, 'allowed');

-- =====================================================================
-- #13 listing_contacts, #15 storage
-- =====================================================================

-- Already blocked before the hardening: the SELECT policy also applies to the
-- new row, so `with check (true)` was not exploitable on its own. Kept as a
-- guard now that the policy states the rule explicitly.
select pg_temp.check('#13  a contact cannot be moved onto someone else''s listing', 'guard',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  $a$update public.listing_contacts set cargo_listing_id = null, truck_listing_id = 'fb000000-0000-0000-0000-000000000003'
     where cargo_listing_id = 'f1000000-0000-0000-0000-000000000001'$a$, 'blocked',
  p_verify => $v$select exists (select 1 from public.listing_contacts where cargo_listing_id = 'f1000000-0000-0000-0000-000000000001')$v$);

select pg_temp.check('#13  a company member can edit the contact of a company listing', 'fix',
  'f0000000-0000-0000-0000-000000000005', 'authenticated',
  $a$update public.listing_contacts set contact_phone = '+40711555555'
     where cargo_listing_id = 'f1000000-0000-0000-0000-000000000001'$a$, 'allowed');

select pg_temp.check('#15  a member cannot overwrite a stored document file', 'fix',
  'f0000000-0000-0000-0000-000000000003', 'authenticated',
  $a$update storage.objects set owner = auth.uid()
     where bucket_id = 'documents' and name = 'fc000000-0000-0000-0000-000000000001/licenta.pdf'$a$, 'blocked',
  p_verify => $v$select owner is null from storage.objects where name = 'fc000000-0000-0000-0000-000000000001/licenta.pdf'$v$);

select pg_temp.check('#15  a manager cannot delete a stored document file', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$delete from storage.objects
     where bucket_id = 'documents' and name = 'fc000000-0000-0000-0000-000000000001/licenta.pdf'$a$, 'blocked',
  p_verify => $v$select exists (select 1 from storage.objects where name = 'fc000000-0000-0000-0000-000000000001/licenta.pdf')$v$);

select pg_temp.check('#15  a member can still upload a new file', 'guard',
  'f0000000-0000-0000-0000-000000000003', 'authenticated',
  $a$insert into storage.objects (bucket_id, name) values ('documents', 'fc000000-0000-0000-0000-000000000001/nou.pdf')$a$, 'allowed');

-- =====================================================================
-- #17 audit_log, #18 job_run_log (was n8n_run_log)
-- =====================================================================

select pg_temp.check('#17  staff cannot edit the audit log', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$update public.audit_log set reason = 'rescris' where action = 'rls.fixture'$a$, 'blocked',
  p_setup => $s$insert into public.audit_log (action, entity, reason) values ('rls.fixture', 'test', 'original')$s$,
  p_verify => $v$select reason = 'original' from public.audit_log where action = 'rls.fixture'$v$);

select pg_temp.check('#17  not even service_role can delete audit rows', 'fix',
  null, 'service_role',
  $a$delete from public.audit_log where action = 'rls.fixture'$a$, 'blocked',
  p_setup => $s$insert into public.audit_log (action, entity) values ('rls.fixture', 'test')$s$,
  p_verify => $v$select exists (select 1 from public.audit_log where action = 'rls.fixture')$v$);

select pg_temp.check('#17  the retention job purges old rows', 'fix',
  null, 'service_role',
  $a$select public.purge_audit_log(interval '1 hour')$a$, 'allowed',
  p_setup => $s$insert into public.audit_log (created_at, action, entity) values (now() - interval '2 days', 'rls.fixture', 'test')$s$,
  p_verify => $v$select not exists (select 1 from public.audit_log where action = 'rls.fixture')$v$);

select pg_temp.check('#17  an automatic suspension is audited', 'fix',
  null, 'service_role',
  $a$select public.run_compliance_sweep()$a$, 'allowed',
  p_setup => $s$update public.documents set valid_until = current_date - 10 where id = 'fa000000-0000-0000-0000-000000000007'$s$,
  p_verify => $v$select exists (select 1 from public.audit_log where action = 'company.suspended'
                                and entity_id = 'fc000000-0000-0000-0000-000000000002')$v$);

select pg_temp.check('#17  an automatic reactivation is audited', 'fix',
  null, 'service_role',
  $a$select public.run_compliance_sweep()$a$, 'allowed',
  p_setup => $s$do $d$ begin
      update public.documents set valid_until = current_date - 10 where id = 'fa000000-0000-0000-0000-000000000007';
      perform public.run_compliance_sweep();
      update public.documents set status = 'approved', valid_until = current_date + 100
      where id = 'fa000000-0000-0000-0000-000000000007';
    end $d$$s$,
  p_verify => $v$select exists (select 1 from public.audit_log where action = 'company.reactivated'
                                and entity_id = 'fc000000-0000-0000-0000-000000000002')$v$);

select pg_temp.check('#18  job_run_log exists and a user cannot write to it', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$insert into public.job_run_log (workflow) values ('forged')$a$, 'blocked');

select pg_temp.check('#18  a job (service_role) writes its run log', 'fix',
  null, 'service_role',
  $a$insert into public.job_run_log (workflow, processed) values ('outbox-dispatcher', 3)$a$, 'allowed');

-- =====================================================================
-- Phase 1 - membership by invitation
--
-- f0..0b has a confirmed e-mail and a company account, f0..0c a confirmed
-- e-mail and an individual account, f0..0d is admin (manager) of A.
-- =====================================================================

select pg_temp.check('INV  a manager cannot add a user to the company directly', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$insert into public.company_members (company_id, user_id, role)
     values ('fc000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-00000000000b', 'dispatcher')$a$, 'blocked',
  p_verify => $v$select not exists (select 1 from public.company_members
                 where user_id = 'f0000000-0000-0000-0000-00000000000b')$v$);

select pg_temp.check('INV  a manager invites by e-mail: pending invitation, e-mail queued, audited', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select public.invite_company_member('fc000000-0000-0000-0000-000000000001', ' RLS-Invitee@test.ro ', 'dispatcher')$a$, 'allowed',
  p_verify => $v$select exists (select 1 from public.company_invitations i
                                where i.company_id = 'fc000000-0000-0000-0000-000000000001'
                                  and i.invited_email = 'rls-invitee@test.ro' and i.status = 'pending'
                                  and exists (select 1 from public.notification_outbox o
                                              where o.template = 'company_invitation' and o.dedupe_key = 'invitation:' || i.id)
                                  and exists (select 1 from public.audit_log a
                                              where a.action = 'member.invited' and a.entity_id = i.id))$v$);

select pg_temp.check('INV  the owner role cannot be invited', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select public.invite_company_member('fc000000-0000-0000-0000-000000000001', 'rls-invitee@test.ro', 'owner')$a$, 'blocked',
  p_verify => $v$select not exists (select 1 from public.company_invitations where invited_email = 'rls-invitee@test.ro')$v$);

select pg_temp.check('INV  a dispatcher cannot invite', 'fix',
  'f0000000-0000-0000-0000-000000000003', 'authenticated',
  $a$select public.invite_company_member('fc000000-0000-0000-0000-000000000001', 'rls-invitee@test.ro', 'dispatcher')$a$, 'blocked',
  p_verify => $v$select not exists (select 1 from public.company_invitations where invited_email = 'rls-invitee@test.ro')$v$);

select pg_temp.check('INV  the invited person accepts and joins with the invited role', 'fix',
  'f0000000-0000-0000-0000-00000000000b', 'authenticated',
  $a$select public.accept_company_invitation('f8000000-0000-0000-0000-000000000001')$a$, 'allowed',
  p_setup => $s$insert into public.company_invitations (id, company_id, invited_email, role, invited_by)
                values ('f8000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000001',
                        'rls-invitee@test.ro', 'dispatcher', 'f0000000-0000-0000-0000-000000000002')$s$,
  p_verify => $v$select exists (select 1 from public.company_members
                                where company_id = 'fc000000-0000-0000-0000-000000000001'
                                  and user_id = 'f0000000-0000-0000-0000-00000000000b' and role = 'dispatcher')
                    and (select status from public.company_invitations where id = 'f8000000-0000-0000-0000-000000000001') = 'accepted'
                    and exists (select 1 from public.audit_log where action = 'member.joined'
                                and entity_id = 'fc000000-0000-0000-0000-000000000001')$v$);

select pg_temp.check('INV  someone else cannot accept an invitation', 'fix',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  $a$select public.accept_company_invitation('f8000000-0000-0000-0000-000000000001')$a$, 'blocked',
  p_setup => $s$insert into public.company_invitations (id, company_id, invited_email, role)
                values ('f8000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000001', 'rls-invitee@test.ro', 'dispatcher')$s$,
  p_verify => $v$select not exists (select 1 from public.company_members
                 where company_id = 'fc000000-0000-0000-0000-000000000001' and user_id = 'f0000000-0000-0000-0000-000000000004')$v$);

select pg_temp.check('INV  an unconfirmed e-mail address cannot accept', 'fix',
  'f0000000-0000-0000-0000-000000000008', 'authenticated',
  $a$select public.accept_company_invitation('f8000000-0000-0000-0000-000000000002')$a$, 'blocked',
  p_setup => $s$update auth.users set email_confirmed_at = null
                  where id = 'f0000000-0000-0000-0000-000000000008';
                insert into public.company_invitations (id, company_id, invited_email, role)
                values ('f8000000-0000-0000-0000-000000000002', 'fc000000-0000-0000-0000-000000000001', 'rls-noco@test.ro', 'dispatcher')$s$,
  p_verify => $v$select not exists (select 1 from public.company_members where user_id = 'f0000000-0000-0000-0000-000000000008')$v$);

select pg_temp.check('INV  an expired invitation cannot be accepted', 'fix',
  'f0000000-0000-0000-0000-00000000000b', 'authenticated',
  $a$select public.accept_company_invitation('f8000000-0000-0000-0000-000000000001')$a$, 'blocked',
  p_setup => $s$insert into public.company_invitations (id, company_id, invited_email, role, created_at, expires_at)
                values ('f8000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000001', 'rls-invitee@test.ro',
                        'dispatcher', now() - interval '8 days', now() - interval '1 day')$s$,
  p_verify => $v$select not exists (select 1 from public.company_members where user_id = 'f0000000-0000-0000-0000-00000000000b')$v$);

select pg_temp.check('INV  an individual account cannot join a company', 'fix',
  'f0000000-0000-0000-0000-00000000000c', 'authenticated',
  $a$select public.accept_company_invitation('f8000000-0000-0000-0000-000000000003')$a$, 'blocked',
  p_setup => $s$insert into public.company_invitations (id, company_id, invited_email, role)
                values ('f8000000-0000-0000-0000-000000000003', 'fc000000-0000-0000-0000-000000000001', 'rls-pf-invited@test.ro', 'dispatcher')$s$,
  p_verify => $v$select not exists (select 1 from public.company_members where user_id = 'f0000000-0000-0000-0000-00000000000c')$v$);

select pg_temp.check('INV  the invited person can decline', 'fix',
  'f0000000-0000-0000-0000-00000000000b', 'authenticated',
  $a$select public.decline_company_invitation('f8000000-0000-0000-0000-000000000001')$a$, 'allowed',
  p_setup => $s$insert into public.company_invitations (id, company_id, invited_email, role)
                values ('f8000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000001', 'rls-invitee@test.ro', 'dispatcher')$s$,
  p_verify => $v$select status = 'declined' from public.company_invitations where id = 'f8000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('INV  a manager can revoke a pending invitation, audited', 'fix',
  'f0000000-0000-0000-0000-00000000000d', 'authenticated',
  $a$select public.revoke_company_invitation('f8000000-0000-0000-0000-000000000001')$a$, 'allowed',
  p_setup => $s$insert into public.company_invitations (id, company_id, invited_email, role)
                values ('f8000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000001', 'rls-invitee@test.ro', 'dispatcher')$s$,
  p_verify => $v$select (select status from public.company_invitations where id = 'f8000000-0000-0000-0000-000000000001') = 'revoked'
                    and exists (select 1 from public.audit_log where action = 'member.invitation_revoked'
                                and entity_id = 'f8000000-0000-0000-0000-000000000001')$v$);

select pg_temp.check('INV  invitations are visible only to the company''s managers and the invited person', 'fix',
  'f0000000-0000-0000-0000-000000000003', 'authenticated',
  $a$select not exists (select 1 from public.company_invitations)$a$, 'true',
  p_setup => $s$insert into public.company_invitations (id, company_id, invited_email, role)
                values ('f8000000-0000-0000-0000-000000000001', 'fc000000-0000-0000-0000-000000000001', 'rls-invitee@test.ro', 'dispatcher')$s$);

select pg_temp.check('INV  a manager cannot make someone owner by editing their membership', 'fix',
  'f0000000-0000-0000-0000-00000000000d', 'authenticated',
  $a$update public.company_members set role = 'owner'
     where company_id = 'fc000000-0000-0000-0000-000000000001' and user_id = 'f0000000-0000-0000-0000-000000000003'$a$, 'blocked',
  p_verify => $v$select role = 'dispatcher' from public.company_members
                 where company_id = 'fc000000-0000-0000-0000-000000000001' and user_id = 'f0000000-0000-0000-0000-000000000003'$v$);

select pg_temp.check('INV  a manager cannot remove the owner', 'fix',
  'f0000000-0000-0000-0000-00000000000d', 'authenticated',
  $a$delete from public.company_members
     where company_id = 'fc000000-0000-0000-0000-000000000001' and user_id = 'f0000000-0000-0000-0000-000000000002'$a$, 'blocked',
  p_verify => $v$select exists (select 1 from public.company_members
                 where company_id = 'fc000000-0000-0000-0000-000000000001' and user_id = 'f0000000-0000-0000-0000-000000000002'
                   and role = 'owner')$v$);

select pg_temp.check('INV  the owner transfers ownership to a member and stays on as admin, audited', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select public.transfer_company_ownership('fc000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-00000000000d', 'Vânzarea firmei')$a$, 'allowed',
  p_verify => $v$select (select role from public.company_members where company_id = 'fc000000-0000-0000-0000-000000000001'
                         and user_id = 'f0000000-0000-0000-0000-00000000000d') = 'owner'
                    and (select role from public.company_members where company_id = 'fc000000-0000-0000-0000-000000000001'
                         and user_id = 'f0000000-0000-0000-0000-000000000002') = 'admin'
                    and exists (select 1 from public.audit_log where action = 'company.ownership_transferred'
                                and entity_id = 'fc000000-0000-0000-0000-000000000001')$v$);

select pg_temp.check('INV  only the owner can transfer ownership', 'fix',
  'f0000000-0000-0000-0000-00000000000d', 'authenticated',
  $a$select public.transfer_company_ownership('fc000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-00000000000d')$a$, 'blocked',
  p_verify => $v$select role = 'admin' from public.company_members
                 where company_id = 'fc000000-0000-0000-0000-000000000001' and user_id = 'f0000000-0000-0000-0000-00000000000d'$v$);

select pg_temp.check('INV  ownership cannot go to someone outside the company', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select public.transfer_company_ownership('fc000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000006')$a$, 'blocked',
  p_verify => $v$select role = 'owner' from public.company_members
                 where company_id = 'fc000000-0000-0000-0000-000000000001' and user_id = 'f0000000-0000-0000-0000-000000000002'$v$);

select pg_temp.check('INV  a member can leave the company', 'guard',
  'f0000000-0000-0000-0000-000000000003', 'authenticated',
  $a$delete from public.company_members
     where company_id = 'fc000000-0000-0000-0000-000000000001' and user_id = auth.uid()$a$, 'allowed');

select pg_temp.check('INV  the owner can still change a member''s role', 'guard',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.company_members set role = 'admin'
     where company_id = 'fc000000-0000-0000-0000-000000000001' and user_id = 'f0000000-0000-0000-0000-000000000003'$a$, 'allowed');

-- =====================================================================
-- P13 - anon and the boards (already closed; kept as a guard)
-- =====================================================================

select pg_temp.check('P13  anon cannot read listings', 'guard',
  null, 'anon', $a$select * from public.cargo_listings$a$, 'blocked');

-- =====================================================================
-- FLT - fleet: assigned driver, vehicle routes, and the suspension round
--       trip. Ported from pull request #6.
-- =====================================================================

select pg_temp.check('FLT  a vehicle cannot be given a driver from another company', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.vehicles set assigned_driver_id = 'fd000000-0000-0000-0000-0000000000b1'
     where id = 'fe000000-0000-0000-0000-000000000001'$a$, 'blocked',
  p_setup => $s$insert into public.drivers (id, company_id, full_name)
               values ('fd000000-0000-0000-0000-0000000000b1',
                       'fc000000-0000-0000-0000-000000000002', 'Șofer B')$s$,
  p_verify => $v$select assigned_driver_id is null from public.vehicles
                 where id = 'fe000000-0000-0000-0000-000000000001'$v$);

-- The check sits before the `current_user not in (authenticated, anon)`
-- early return, so it holds for the jobs and the edge functions too.
select pg_temp.check('FLT  not even service_role can cross companies with a driver', 'fix',
  null, 'service_role',
  $a$update public.vehicles set assigned_driver_id = 'fd000000-0000-0000-0000-0000000000b1'
     where id = 'fe000000-0000-0000-0000-000000000001'$a$, 'blocked',
  p_setup => $s$insert into public.drivers (id, company_id, full_name)
               values ('fd000000-0000-0000-0000-0000000000b1',
                       'fc000000-0000-0000-0000-000000000002', 'Șofer B')$s$,
  p_verify => $v$select assigned_driver_id is null from public.vehicles
                 where id = 'fe000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('FLT  a member assigns a driver from their own company', 'guard',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.vehicles set assigned_driver_id = 'fd000000-0000-0000-0000-000000000001'
     where id = 'fe000000-0000-0000-0000-000000000001'$a$, 'allowed');

select pg_temp.check('FLT  a member records a route for their own vehicle', 'guard',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$insert into public.vehicle_routes (vehicle_id, from_country, from_city, to_country, to_city)
     values ('fe000000-0000-0000-0000-000000000001', 'DE', 'München', 'RO', 'Cluj-Napoca')$a$, 'allowed');

select pg_temp.check('FLT  a member cannot record a route on another company''s vehicle', 'fix',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  $a$insert into public.vehicle_routes (vehicle_id, from_country, to_country)
     values ('fe000000-0000-0000-0000-000000000001', 'DE', 'RO')$a$, 'blocked');

select pg_temp.check('FLT  another company''s routes are not readable', 'fix',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  $a$select * from public.vehicle_routes
     where vehicle_id = 'fe000000-0000-0000-0000-000000000001'$a$, 'blocked',
  p_setup => $s$insert into public.vehicle_routes (vehicle_id, from_country, to_country)
                values ('fe000000-0000-0000-0000-000000000001', 'DE', 'RO')$s$);

select pg_temp.check('FLT  anon cannot read vehicle routes', 'fix',
  null, 'anon', $a$select * from public.vehicle_routes$a$, 'blocked');

-- The point of previous_status: a listing pulled off the board by the sweep
-- goes back where it was, instead of staying suspended until someone notices.
select pg_temp.check('FLT  a swept listing remembers its status and returns to it', 'fix',
  null, 'service_role',
  $a$select public.run_compliance_sweep() is not null$a$, 'true',
  p_setup => $s$do $d$
    begin
      update public.companies set verification_status = 'verified'
      where id = 'fc000000-0000-0000-0000-000000000001';
      insert into public.cargo_listings (id, company_id, posted_by, board, listing_kind,
             title, loading_city, unloading_city, loading_from, loading_to, weight_kg, status)
      values ('f1000000-0000-0000-0000-0000000000f1',
              'fc000000-0000-0000-0000-000000000001',
              'f0000000-0000-0000-0000-000000000002', 'curse', 'vehicul',
              'Audi de dus acasă', 'München', 'Cluj-Napoca',
              current_date + 5, current_date + 10, 1500, 'draft');
      -- A listing cannot go active without its vehicle details row.
      insert into public.cargo_vehicle_details (cargo_listing_id, make, model, year)
      values ('f1000000-0000-0000-0000-0000000000f1', 'Audi', 'A4', 2019);
      update public.cargo_listings set status = 'active'
      where id = 'f1000000-0000-0000-0000-0000000000f1';
      -- Lose a blocking document, sweep (suspends), fix it, sweep again.
      update public.documents set status = 'expired'
      where id = 'fa000000-0000-0000-0000-000000000001';
      perform public.run_compliance_sweep();
      update public.documents set status = 'approved', valid_until = current_date + 400
      where id = 'fa000000-0000-0000-0000-000000000001';
    end $d$$s$,
  p_verify => $v$select status = 'active' and previous_status is null
                 from public.cargo_listings
                 where id = 'f1000000-0000-0000-0000-0000000000f1'$v$);

-- A listing suspended by hand has no previous_status, so the sweep has
-- nowhere to put it back and must leave it alone.
select pg_temp.check('FLT  a listing suspended by hand is not resurrected by the sweep', 'guard',
  null, 'service_role',
  $a$select public.run_compliance_sweep() is not null$a$, 'true',
  p_setup => $s$do $d$
    begin
      update public.companies set verification_status = 'verified', is_suspended = false
      where id = 'fc000000-0000-0000-0000-000000000001';
      insert into public.cargo_listings (id, company_id, posted_by, board, listing_kind,
             title, loading_city, unloading_city, loading_from, loading_to, weight_kg, status)
      values ('f1000000-0000-0000-0000-0000000000f2',
              'fc000000-0000-0000-0000-000000000001',
              'f0000000-0000-0000-0000-000000000002', 'curse', 'vehicul',
              'Suspendat manual', 'Viena', 'Arad',
              current_date + 5, current_date + 10, 1300, 'suspended');
    end $d$$s$,
  p_verify => $v$select status = 'suspended' from public.cargo_listings
                 where id = 'f1000000-0000-0000-0000-0000000000f2'$v$);

-- =====================================================================
-- MBR - reading colleagues without opening up the profiles table
--
-- profiles_select is `id = auth.uid() or is_platform_admin()`, so a member
-- page cannot join profiles itself: every colleague comes back blank.
-- list_company_members is the way round it, and it re-checks membership.
-- =====================================================================

select pg_temp.check('MBR  a colleague''s profile row stays unreadable directly', 'guard',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select * from public.profiles where id = 'f0000000-0000-0000-0000-000000000003'$a$, 'blocked');

select pg_temp.check('MBR  list_company_members gives a member their colleagues'' names', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select exists (
       select 1 from public.list_company_members('fc000000-0000-0000-0000-000000000001')
       where user_id = 'f0000000-0000-0000-0000-000000000003'
         and full_name = 'Dispatcher A')$a$, 'true');

select pg_temp.check('MBR  the owner comes first', 'guard',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select (select role from public.list_company_members('fc000000-0000-0000-0000-000000000001')
             limit 1) = 'owner'$a$, 'true');

select pg_temp.check('MBR  a non-member gets nothing from list_company_members', 'fix',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  $a$select * from public.list_company_members('fc000000-0000-0000-0000-000000000001')$a$, 'blocked');

select pg_temp.check('MBR  staff can list any company''s members', 'guard',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select count(*) > 0 from public.list_company_members('fc000000-0000-0000-0000-000000000001')$a$, 'true');

select pg_temp.check('MBR  anon cannot call list_company_members', 'fix',
  null, 'anon',
  $a$select * from public.list_company_members('fc000000-0000-0000-0000-000000000001')$a$, 'blocked');

-- =====================================================================
-- INV2 - an invitation that says which company it is for
--
-- companies_select is members-only, and an invited person is not a member
-- yet, so the invitation screen could not name the company inviting them.
-- =====================================================================

select pg_temp.check('INV2 the inviting company stays unreadable directly', 'guard',
  'f0000000-0000-0000-0000-00000000000b', 'authenticated',
  $a$select * from public.companies where id = 'fc000000-0000-0000-0000-000000000001'$a$, 'blocked');

select pg_temp.check('INV2 my_invitations names the company doing the inviting', 'fix',
  'f0000000-0000-0000-0000-00000000000b', 'authenticated',
  $a$select exists (select 1 from public.my_invitations()
                    where company_name = 'RLS Carrier A SRL' and role = 'dispatcher')$a$, 'true',
  p_setup => $s$insert into public.company_invitations
                 (company_id, invited_email, role, invited_by, status, expires_at)
               values ('fc000000-0000-0000-0000-000000000001', 'rls-invitee@test.ro',
                       'dispatcher', 'f0000000-0000-0000-0000-000000000002',
                       'pending', now() + interval '7 days')$s$);

select pg_temp.check('INV2 my_invitations shows nobody else''s invitations', 'fix',
  'f0000000-0000-0000-0000-00000000000c', 'authenticated',
  $a$select * from public.my_invitations()$a$, 'blocked',
  p_setup => $s$insert into public.company_invitations
                 (company_id, invited_email, role, invited_by, status, expires_at)
               values ('fc000000-0000-0000-0000-000000000001', 'rls-invitee@test.ro',
                       'dispatcher', 'f0000000-0000-0000-0000-000000000002',
                       'pending', now() + interval '7 days')$s$);

select pg_temp.check('INV2 an expired invitation is not listed', 'fix',
  'f0000000-0000-0000-0000-00000000000b', 'authenticated',
  $a$select * from public.my_invitations()$a$, 'blocked',
  p_setup => $s$insert into public.company_invitations
                 (company_id, invited_email, role, invited_by, status, expires_at)
               values ('fc000000-0000-0000-0000-000000000001', 'rls-invitee@test.ro',
                       'dispatcher', 'f0000000-0000-0000-0000-000000000002',
                       'pending', now() - interval '1 day')$s$);

select pg_temp.check('INV2 anon cannot call my_invitations', 'fix',
  null, 'anon', $a$select * from public.my_invitations()$a$, 'blocked');

-- =====================================================================
-- PUB - departures are public at city level, and only at city level
--
-- The phase 0 rule was "anon sees nothing on departures". That is now a
-- narrower rule: anon sees the route, never who is driving it. These
-- checks are what keeps the second sentence true while the first changes.
-- =====================================================================

select pg_temp.check('PUB  anon can read the public departures board', 'fix',
  null, 'anon',
  $a$select count(*) > 0 from public.v_departures_public$a$, 'true',
  p_setup => $s$update public.truck_listings set status = 'active'
               where id = 'fb000000-0000-0000-0000-000000000002'$s$);

select pg_temp.check('PUB  the carrier view stays closed to anon', 'guard',
  null, 'anon', $a$select * from public.v_departures$a$, 'blocked');

-- The column list is the protection, so it is what gets pinned. A future
-- "just add company_id, it is convenient" has to fail here.
select pg_temp.check('PUB  the public board carries no company column', 'fix',
  null, 'anon',
  $a$select not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'v_departures_public'
         and column_name in ('company_id', 'posted_by', 'vehicle_id',
                             'from_lat', 'from_lng', 'to_lat', 'to_lng',
                             'notes', 'contact_name', 'contact_phone'))$a$, 'true');

select pg_temp.check('PUB  anon still cannot reach truck_listings itself', 'guard',
  null, 'anon', $a$select * from public.truck_listings$a$, 'blocked');

select pg_temp.check('PUB  anon still cannot reach the vehicles behind a departure', 'guard',
  null, 'anon', $a$select * from public.vehicles$a$, 'blocked');

select pg_temp.check('PUB  a draft departure is not on the public board', 'fix',
  null, 'anon',
  $a$select * from public.v_departures_public
     where truck_listing_id = 'fb000000-0000-0000-0000-000000000002'$a$, 'blocked',
  p_setup => $s$update public.truck_listings set status = 'draft'
               where id = 'fb000000-0000-0000-0000-000000000002'$s$);

select pg_temp.check('PUB  a departure whose window has passed drops off the board', 'fix',
  null, 'anon',
  $a$select * from public.v_departures_public
     where truck_listing_id = 'fb000000-0000-0000-0000-000000000002'$a$, 'blocked',
  p_setup => $s$update public.truck_listings
               set status = 'active',
                   available_from = current_date - 20,
                   available_to = current_date - 10
               where id = 'fb000000-0000-0000-0000-000000000002'$s$);

select pg_temp.check('PUB  free seats are derived, not stored', 'guard',
  null, 'anon',
  $a$select slots_free = platform_slots_total - slots_taken
     from public.v_departures_public
     where truck_listing_id = 'fb000000-0000-0000-0000-000000000002'$a$, 'true',
  p_setup => $s$update public.truck_listings set status = 'active'
               where id = 'fb000000-0000-0000-0000-000000000002'$s$);

-- =====================================================================
-- VTY - which vehicles a departure accepts
-- =====================================================================

select pg_temp.check('VTY  a departure must accept at least one vehicle type', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.truck_listings set accepted_vehicle_types = '{}'
     where id = 'fb000000-0000-0000-0000-000000000002'$a$, 'blocked');

select pg_temp.check('VTY  a member sets the types their platform carries', 'guard',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.truck_listings set accepted_vehicle_types = '{motocicleta}'
     where id = 'fb000000-0000-0000-0000-000000000002'$a$, 'allowed');

-- =====================================================================
-- ALR - "tell me when a route appears"
--
-- saved_searches already existed with its own policies; what was missing
-- was a guard on the alert job's own bookkeeping.
-- =====================================================================

select pg_temp.check('ALR  a saved search lands on the caller, whatever it claims', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$insert into public.saved_searches (user_id, name, target, filters)
     values ('f0000000-0000-0000-0000-000000000002', 'Furat', 'truck', '{}')$a$, 'allowed',
  p_verify => $v$select user_id = 'f0000000-0000-0000-0000-000000000006'
                 from public.saved_searches where name = 'Furat'$v$);

select pg_temp.check('ALR  a user cannot rewrite the alert job''s bookkeeping', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$update public.saved_searches set last_notified_at = now() - interval '10 years'
     where id = 'f5000000-0000-0000-0000-000000000001'$a$, 'blocked',
  p_setup => $s$insert into public.saved_searches (id, user_id, name, target, filters, last_notified_at)
                values ('f5000000-0000-0000-0000-000000000001',
                        'f0000000-0000-0000-0000-000000000006',
                        'Germania spre România', 'truck', '{}', now())$s$);

select pg_temp.check('ALR  a saved search cannot be handed to somebody else', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$update public.saved_searches set user_id = 'f0000000-0000-0000-0000-000000000002'
     where id = 'f5000000-0000-0000-0000-000000000001'$a$, 'blocked',
  p_setup => $s$insert into public.saved_searches (id, user_id, name, target, filters)
                values ('f5000000-0000-0000-0000-000000000001',
                        'f0000000-0000-0000-0000-000000000006',
                        'Germania spre România', 'truck', '{}')$s$);

select pg_temp.check('ALR  the alert job still sets last_notified_at', 'guard',
  null, 'service_role',
  $a$update public.saved_searches set last_notified_at = now()
     where id = 'f5000000-0000-0000-0000-000000000001'$a$, 'allowed',
  p_setup => $s$insert into public.saved_searches (id, user_id, name, target, filters)
                values ('f5000000-0000-0000-0000-000000000001',
                        'f0000000-0000-0000-0000-000000000006',
                        'Germania spre România', 'truck', '{}')$s$);

select pg_temp.check('ALR  somebody else''s saved search is invisible', 'guard',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  $a$select * from public.saved_searches
     where id = 'f5000000-0000-0000-0000-000000000001'$a$, 'blocked',
  p_setup => $s$insert into public.saved_searches (id, user_id, name, target, filters)
                values ('f5000000-0000-0000-0000-000000000001',
                        'f0000000-0000-0000-0000-000000000006',
                        'Germania spre România', 'truck', '{}')$s$);

select pg_temp.check('ALR  anon cannot save a search', 'guard',
  null, 'anon',
  $a$insert into public.saved_searches (user_id, name, target, filters)
     values ('f0000000-0000-0000-0000-000000000006', 'Anon', 'truck', '{}')$a$, 'blocked');

-- =====================================================================
-- PRC - indicative prices
--
-- Two rules carry the whole feature: nothing is visible before the team
-- publishes it, and nothing changes except through an audited RPC. Both
-- are checked from the roles that would break them.
-- =====================================================================

select pg_temp.check('PRC  anon sees no rates while they are unpublished', 'fix',
  null, 'anon', $a$select * from public.price_rates$a$, 'blocked');

select pg_temp.check('PRC  a signed-in user sees no rates while unpublished', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select * from public.price_rates$a$, 'blocked');

select pg_temp.check('PRC  the settings are hidden too, so is_published cannot be read off', 'fix',
  null, 'anon', $a$select * from public.price_settings$a$, 'blocked');

select pg_temp.check('PRC  staff see the rates while they are still working on them', 'guard',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select count(*) = 5 from public.price_rates$a$, 'true');

select pg_temp.check('PRC  anon reads the rates once published', 'fix',
  null, 'anon',
  $a$select count(*) = 5 from public.price_rates$a$, 'true',
  p_setup => $s$update public.price_settings set is_published = true where id$s$);

select pg_temp.check('PRC  anon reads the settings once published', 'fix',
  null, 'anon',
  $a$select express_surcharge_pct = 40 from public.price_settings where id$a$, 'true',
  p_setup => $s$update public.price_settings set is_published = true where id$s$);

select pg_temp.check('PRC  unpublishing hides them again', 'fix',
  null, 'anon', $a$select * from public.price_rates$a$, 'blocked',
  p_setup => $s$update public.price_settings set is_published = false where id$s$);

-- =====================================================================
-- PRW - only staff write, and only through the RPC
-- =====================================================================

select pg_temp.check('PRW  a user cannot write a rate directly', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$update public.price_rates set national_ron_per_km = 0.01
     where vehicle_class = 'sedan'$a$, 'blocked',
  p_verify => $v$select national_ron_per_km = 3.40 from public.price_rates
                 where vehicle_class = 'sedan'$v$);

select pg_temp.check('PRW  not even staff may write a rate directly', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$update public.price_rates set national_ron_per_km = 0.01
     where vehicle_class = 'sedan'$a$, 'blocked',
  p_verify => $v$select national_ron_per_km = 3.40 from public.price_rates
                 where vehicle_class = 'sedan'$v$);

select pg_temp.check('PRW  a non-staff user cannot call the rate RPC', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.set_price_rate('sedan', 'furat', 1, 1, 1, 1, 1)$a$, 'blocked',
  p_verify => $v$select weight_label <> 'furat' from public.price_rates
                 where vehicle_class = 'sedan'$v$);

select pg_temp.check('PRW  anon cannot call the rate RPC', 'fix',
  null, 'anon',
  $a$select public.set_price_rate('sedan', 'furat', 1, 1, 1, 1, 1)$a$, 'blocked');

select pg_temp.check('PRW  staff change a rate through the RPC', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select (public.set_price_rate('sedan', 'aprox. 1.500 kg',
             5.60, 3.55, 0.58, 400, 180)).national_ron_per_km = 3.55$a$, 'true');

select pg_temp.check('PRW  a rate change is audited with before and after', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.set_price_rate('sedan', 'aprox. 1.500 kg',
            5.60, 3.55, 0.58, 400, 180) is not null$a$, 'true',
  p_verify => $v$select exists (
                 select 1 from public.audit_log
                 where action = 'price_rate.updated'
                   and (before ->> 'national_ron_per_km')::numeric = 3.40
                   and (after ->> 'national_ron_per_km')::numeric = 3.55)$v$);

select pg_temp.check('PRW  a change after publication says so in the audit row', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.set_price_rate('sedan', 'aprox. 1.500 kg',
            5.60, 3.55, 0.58, 400, 180) is not null$a$, 'true',
  p_setup => $s$update public.price_settings set is_published = true where id$s$,
  p_verify => $v$select reason = 'Modificare după publicare' from public.audit_log
                 where action = 'price_rate.updated'
                 order by created_at desc limit 1$v$);

select pg_temp.check('PRW  the RPC refuses a rate that is not a positive number', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.set_price_rate('sedan', 'aprox. 1.500 kg', 0, 3.40, 0.55, 380, 175)$a$, 'blocked');

select pg_temp.check('PRW  the RPC refuses a minimum that is not positive', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.set_price_rate('sedan', 'aprox. 1.500 kg', 5.40, 3.40, 0.55, 0, 175)$a$, 'blocked');

-- =====================================================================
-- PRP - publishing
-- =====================================================================

select pg_temp.check('PRP  a non-staff user cannot publish the prices', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.set_prices_published(true)$a$, 'blocked',
  p_verify => $v$select not is_published from public.price_settings where id$v$);

select pg_temp.check('PRP  staff publish, and it is recorded who and when', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select (public.set_prices_published(true)).is_published$a$, 'true',
  p_verify => $v$select approved_by = 'f0000000-0000-0000-0000-000000000001'
                        and approved_at is not null
                 from public.price_settings where id$v$);

select pg_temp.check('PRP  publishing is audited', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select (public.set_prices_published(true)).is_published$a$, 'true',
  p_verify => $v$select exists (select 1 from public.audit_log
                                where action = 'prices.published')$v$);

select pg_temp.check('PRP  withdrawing clears the approval and is audited', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select not (public.set_prices_published(false)).is_published$a$, 'true',
  p_setup => $s$update public.price_settings
                set is_published = true,
                    approved_by = 'f0000000-0000-0000-0000-000000000001',
                    approved_at = now()
                where id$s$,
  p_verify => $v$select s.approved_by is null and exists (
                   select 1 from public.audit_log where action = 'prices.unpublished')
                 from public.price_settings s where s.id$v$);

select pg_temp.check('PRP  a non-staff user cannot change the surcharges', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.set_price_settings(99, 99, 2, 50, current_date)$a$, 'blocked',
  p_verify => $v$select express_surcharge_pct = 40 from public.price_settings where id$v$);

select pg_temp.check('PRP  staff change the surcharges through the RPC, audited', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select (public.set_price_settings(35, 45, 1.3, 20, current_date)).express_surcharge_pct = 45$a$, 'true',
  p_verify => $v$select exists (select 1 from public.audit_log
                                where action = 'price_settings.updated')$v$);

-- The medians of real transports are a different claim from our own rates;
-- this feature must not have touched them.
select pg_temp.check('PRP  the corridor medians are still their own thing', 'guard',
  null, 'anon',
  $a$select count(*) >= 0 from public.v_corridor_prices$a$, 'true');
-- CRQ - requests on the homepage
--
-- The feature rests on one projection being narrow enough, so these check
-- the column list itself and not only who may read it: a column added to
-- the view by accident is a leak no policy catches.
--
-- The aggregate checks compare against a baseline captured in p_setup
-- rather than against a fixed number. smoke_test.sql runs first on the same
-- database and leaves rows behind, so any check written against a constant
-- count passes or fails depending on what ran before it.
-- =====================================================================

select pg_temp.check('CRQ  the public view carries only the safe columns', 'fix',
  null, 'anon',
  $a$select array_agg(column_name::text order by column_name) = array[
       'board','category','estimated_km','expires_at','from_city','from_country',
       'from_county','id','is_domestic','is_running','loading_from','loading_to',
       'make','model','needs_winch','photo_count','published_at','service_type',
       'to_city','to_country','to_county','weight_kg','year'
     ]
     from information_schema.columns
     where table_schema = 'public' and table_name = 'v_requests_public'$a$, 'true');

select pg_temp.check('CRQ  the free text a person wrote about their car is not in the view', 'fix',
  null, 'anon', $a$select description from public.v_requests_public$a$, 'blocked',
  p_missing_ok => true,
  p_setup => $s$update public.cargo_listings
                set description = 'Sunați la 0722 000 000, mașina e în curte la Ion'
                where id = 'f1000000-0000-0000-0000-000000000001'$s$);

select pg_temp.check('CRQ  who posted it is not in the view', 'fix',
  null, 'anon', $a$select posted_by from public.v_requests_public$a$, 'blocked',
  p_missing_ok => true);

select pg_temp.check('CRQ  the company is not in the view', 'fix',
  null, 'anon', $a$select company_id from public.v_requests_public$a$, 'blocked',
  p_missing_ok => true);

select pg_temp.check('CRQ  the photographs are not in the view', 'fix',
  null, 'anon', $a$select photo_paths from public.v_requests_public$a$, 'blocked',
  p_missing_ok => true);

select pg_temp.check('CRQ  the exact position is not in the view', 'fix',
  null, 'anon', $a$select loading_lat from public.v_requests_public$a$, 'blocked',
  p_missing_ok => true);

select pg_temp.check('CRQ  what the owner hoped to pay is not in the view', 'fix',
  null, 'anon', $a$select price_amount from public.v_requests_public$a$, 'blocked',
  p_missing_ok => true);

select pg_temp.check('CRQ  anon still cannot reach the listing itself', 'guard',
  null, 'anon', $a$select * from public.cargo_listings$a$, 'blocked');

select pg_temp.check('CRQ  anon still cannot reach a contact', 'guard',
  null, 'anon', $a$select * from public.listing_contacts$a$, 'blocked');

-- ---------------------------------------------------------------------
-- What reaches the feed, and what does not
-- ---------------------------------------------------------------------

select pg_temp.check('CRQ  anon reads a live request', 'fix',
  null, 'anon',
  $a$select exists (select 1 from public.v_requests_public
                    where id = 'f1000000-0000-0000-0000-000000000002')$a$, 'true');

select pg_temp.check('CRQ  the route and the vehicle come through intact', 'fix',
  null, 'anon',
  $a$select from_city = 'Milano' and to_city = 'Timișoara'
        and make = 'Volkswagen' and model = 'Golf' and year = 2018
        and is_running
     from public.v_requests_public
     where id = 'f1000000-0000-0000-0000-000000000002'$a$, 'true');

select pg_temp.check('CRQ  a draft never appears', 'fix',
  null, 'anon',
  $a$select not exists (select 1 from public.v_requests_public
                        where id = 'f1000000-0000-0000-0000-000000000004')$a$, 'true');

select pg_temp.check('CRQ  a cancelled request drops out of the feed', 'fix',
  null, 'anon',
  $a$select not exists (select 1 from public.v_requests_public
                        where id = 'f1000000-0000-0000-0000-000000000001')$a$, 'true',
  p_setup => $s$update public.cargo_listings set status = 'cancelled'
                where id = 'f1000000-0000-0000-0000-000000000001'$s$);

select pg_temp.check('CRQ  a request whose loading window has passed drops out', 'fix',
  null, 'anon',
  $a$select not exists (select 1 from public.v_requests_public
                        where id = 'f1000000-0000-0000-0000-000000000001')$a$, 'true',
  p_setup => $s$update public.cargo_listings
                set loading_from = current_date - 5, loading_to = current_date - 1
                where id = 'f1000000-0000-0000-0000-000000000001'$s$);

select pg_temp.check('CRQ  palletized freight is not shown on a vehicle feed', 'fix',
  null, 'anon',
  $a$select not exists (select 1 from public.v_requests_public
                        where id = 'f1000000-0000-0000-0000-000000000001')$a$, 'true',
  p_setup => $s$do $d$
    begin
      insert into public.cargo_freight_details (cargo_listing_id, cargo_type)
      values ('f1000000-0000-0000-0000-000000000001', 'paleți');
      update public.cargo_listings set listing_kind = 'marfa'
      where id = 'f1000000-0000-0000-0000-000000000001';
    end $d$$s$);

-- ---------------------------------------------------------------------
-- The aggregates
--
-- Each one captures homepage_activity() into a temp table before the
-- change it is about, so the assertion is about the delta the change
-- caused and not about whatever else happens to be in the database.
-- ---------------------------------------------------------------------

select pg_temp.check('CRQ  anon may ask how busy the platform is', 'fix',
  null, 'anon', $a$select count(*) = 1 from public.homepage_activity()$a$, 'true');

select pg_temp.check('CRQ  a draft counts for nothing', 'fix',
  null, 'anon',
  $a$select a.published_total = b.published_total
     from public.homepage_activity() a, zz_base b$a$, 'true',
  p_setup => $s$do $d$
    begin
      create temp table zz_base as select * from public.homepage_activity();
      grant select on zz_base to anon;
      insert into public.cargo_listings (company_id, posted_by, board, listing_kind,
             title, loading_city, unloading_city, loading_from, status)
      values ('fc000000-0000-0000-0000-000000000002',
              'f0000000-0000-0000-0000-000000000004', 'curse', 'vehicul',
              'Ciornă', 'Sibiu', 'Brașov', current_date + 4, 'draft');
    end $d$$s$);

select pg_temp.check('CRQ  a cancelled request stops counting', 'fix',
  null, 'anon',
  $a$select a.published_total = b.published_total - 1
     from public.homepage_activity() a, zz_base b$a$, 'true',
  p_setup => $s$do $d$
    begin
      create temp table zz_base as select * from public.homepage_activity();
      grant select on zz_base to anon;
      update public.cargo_listings set status = 'cancelled'
      where id = 'f1000000-0000-0000-0000-000000000001';
    end $d$$s$);

select pg_temp.check('CRQ  a delivered request still counts: it happened', 'fix',
  null, 'anon',
  $a$select a.published_total = b.published_total
     from public.homepage_activity() a, zz_base b$a$, 'true',
  p_setup => $s$do $d$
    begin
      create temp table zz_base as select * from public.homepage_activity();
      grant select on zz_base to anon;
      update public.cargo_listings set status = 'delivered'
      where id = 'f1000000-0000-0000-0000-000000000001';
    end $d$$s$);

select pg_temp.check('CRQ  kilometres are counted where there are coordinates', 'fix',
  null, 'anon',
  -- Milano -> Timișoara is 935 km in a straight line, which is what the
  -- total must grow by: not the road distance, and not a guess.
  $a$select a.total_km between b.total_km + 930 and b.total_km + 940
     from public.homepage_activity() a, zz_base b$a$, 'true',
  p_setup => $s$do $d$
    begin
      create temp table zz_base as select * from public.homepage_activity();
      grant select on zz_base to anon;
      update public.cargo_listings
      set loading_lat = 45.4642, loading_lng = 9.1900,
          unloading_lat = 45.7489, unloading_lng = 21.2087
      where id = 'f1000000-0000-0000-0000-000000000002';
    end $d$$s$);

select pg_temp.check('CRQ  a request without coordinates adds no kilometres, rather than a guess', 'fix',
  null, 'anon',
  $a$select a.total_km = b.total_km and a.published_total = b.published_total + 1
     from public.homepage_activity() a, zz_base b$a$, 'true',
  p_setup => $s$do $d$
    begin
      create temp table zz_base as select * from public.homepage_activity();
      grant select on zz_base to anon;
      -- 'delivered' rather than 'active': it was published once, which is
      -- what the total counts, and it needs no details row to get there.
      insert into public.cargo_listings (company_id, posted_by, board, listing_kind,
             title, loading_city, unloading_city, loading_from, status, published_at)
      values ('fc000000-0000-0000-0000-000000000002',
              'f0000000-0000-0000-0000-000000000004', 'curse', 'vehicul',
              'Fără coordonate', 'Sibiu', 'Brașov', current_date + 4, 'delivered', now());
    end $d$$s$);

select pg_temp.check('CRQ  the daily series is thirty days long and ends today', 'fix',
  null, 'anon',
  $a$select array_length(daily_counts, 1) = 30 and daily_from = current_date - 29
     from public.homepage_activity()$a$, 'true');

select pg_temp.check('CRQ  a request published today lands on the last day of the series', 'fix',
  null, 'anon',
  $a$select a.daily_counts[30] = b.daily_counts[30] + 1
     from public.homepage_activity() a, zz_base b$a$, 'true',
  p_setup => $s$do $d$
    begin
      create temp table zz_base as select * from public.homepage_activity();
      grant select on zz_base to anon;
      insert into public.cargo_listings (company_id, posted_by, board, listing_kind,
             title, loading_city, unloading_city, loading_from, status, published_at)
      values ('fc000000-0000-0000-0000-000000000002',
              'f0000000-0000-0000-0000-000000000004', 'curse', 'vehicul',
              'Publicată azi', 'Sibiu', 'Brașov', current_date + 4, 'delivered', now());
    end $d$$s$);

select pg_temp.check('CRQ  the live count is the one the feed shows', 'fix',
  null, 'anon',
  $a$select active_total = (select count(*) from public.v_requests_public)
     from public.homepage_activity()$a$, 'true');

-- ---------------------------------------------------------------------
-- The thresholds
-- ---------------------------------------------------------------------

select pg_temp.check('CRQ  anon reads the thresholds: they are not a secret', 'fix',
  null, 'anon',
  $a$select stats_min_requests = 50 and feed_min_requests = 6
     from public.homepage_settings where id$a$, 'true');

select pg_temp.check('CRQ  a user cannot move a threshold directly', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$update public.homepage_settings set stats_min_requests = 0 where id$a$, 'blocked',
  p_verify => $v$select stats_min_requests = 50 from public.homepage_settings where id$v$);

select pg_temp.check('CRQ  not even staff may move one directly', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$update public.homepage_settings set stats_min_requests = 0 where id$a$, 'blocked',
  p_verify => $v$select stats_min_requests = 50 from public.homepage_settings where id$v$);

select pg_temp.check('CRQ  a non-staff user cannot call the settings RPC', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.set_homepage_settings(0, 1, 20, null)$a$, 'blocked',
  p_verify => $v$select stats_min_requests = 50 from public.homepage_settings where id$v$);

select pg_temp.check('CRQ  anon cannot call the settings RPC', 'fix',
  null, 'anon', $a$select public.set_homepage_settings(0, 1, 20, null)$a$, 'blocked');

select pg_temp.check('CRQ  staff move a threshold through the RPC', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select (public.set_homepage_settings(10, 3, 20, null)).stats_min_requests = 10$a$, 'true');

select pg_temp.check('CRQ  a threshold change is audited with before and after', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select (public.set_homepage_settings(10, 3, 20, null)).feed_min_requests = 3$a$, 'true',
  p_verify => $v$select exists (
                 select 1 from public.audit_log
                 where action = 'homepage_settings.updated'
                   and (before ->> 'stats_min_requests')::integer = 50
                   and (after ->> 'stats_min_requests')::integer = 10)$v$);

select pg_temp.check('CRQ  the RPC refuses a feed threshold of zero', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.set_homepage_settings(10, 0, 20, null)$a$, 'blocked',
  p_verify => $v$select feed_min_requests = 6 from public.homepage_settings where id$v$);

-- =====================================================================
-- CTR - what the homepage and /verificare are allowed to say
--
-- Both pages make claims about safety. These check that the two things
-- they read are readable by somebody with no account, that neither leaks a
-- row, and that the count means what the sentence next to it says: verified,
-- not suspended, carrying a transport licence.
--
-- Counts are compared against a baseline captured in p_setup, because
-- smoke_test.sql runs first on the same database and leaves rows behind.
-- =====================================================================

select pg_temp.check('CTR  the requirements view carries only what the page prints', 'fix',
  null, 'anon',
  $a$select array_agg(column_name::text order by column_name) = array[
       'excluded_vehicle_types','for_company_types','for_vehicle_types','grace_days',
       'has_expiry','is_blocking','kind','label_ro','reminder_days','scope'
     ]
     from information_schema.columns
     where table_schema = 'public' and table_name = 'v_document_requirements_public'$a$, 'true');

select pg_temp.check('CTR  anon reads the document rules without an account', 'fix',
  null, 'anon',
  $a$select count(*) >= 10 from public.v_document_requirements_public$a$, 'true');

select pg_temp.check('CTR  a retired rule drops out of the public list', 'fix',
  null, 'anon',
  $a$select not exists (select 1 from public.v_document_requirements_public
                        where kind = 'carte_verde')$a$, 'true',
  p_setup => $s$update public.document_requirements set is_active = false
                where kind = 'carte_verde'$s$);

select pg_temp.check('CTR  anon still cannot read the requirements table itself', 'guard',
  null, 'anon', $a$select * from public.document_requirements$a$, 'blocked');

select pg_temp.check('CTR  the blocking flag and the reminder days come through', 'fix',
  null, 'anon',
  $a$select is_blocking and has_expiry and reminder_days = '{30,14,7,1}'
     from public.v_document_requirements_public
     where scope = 'vehicle' and kind = 'rca'$a$, 'true');

-- ---------------------------------------------------------------------
-- The count
-- ---------------------------------------------------------------------

select pg_temp.check('CTR  anon may ask how many carriers can act', 'fix',
  null, 'anon', $a$select public.verified_carriers_count() >= 0$a$, 'true');

select pg_temp.check('CTR  anon still cannot read the companies behind the count', 'guard',
  null, 'anon', $a$select * from public.companies$a$, 'blocked');

select pg_temp.check('CTR  a verified carrier is counted', 'fix',
  null, 'anon',
  $a$select public.verified_carriers_count() = (select n from zz_base)$a$, 'true',
  p_setup => $s$do $d$
    begin
      create temp table zz_base as select public.verified_carriers_count() + 1 as n;
      grant select on zz_base to anon;
      update public.companies
      set verification_status = 'verified', is_suspended = false, company_type = 'transport'
      where id = 'fc000000-0000-0000-0000-000000000003';
    end $d$$s$);

select pg_temp.check('CTR  a company that is not verified is not counted', 'fix',
  null, 'anon',
  $a$select public.verified_carriers_count() = (select n from zz_base)$a$, 'true',
  p_setup => $s$do $d$
    begin
      create temp table zz_base as select public.verified_carriers_count() as n;
      grant select on zz_base to anon;
      update public.companies
      set verification_status = 'pending', is_suspended = false, company_type = 'transport'
      where id = 'fc000000-0000-0000-0000-000000000003';
    end $d$$s$);

select pg_temp.check('CTR  a suspended carrier stops being counted', 'fix',
  null, 'anon',
  $a$select public.verified_carriers_count() = (select n from zz_base)$a$, 'true',
  p_setup => $s$do $d$
    begin
      update public.companies
      set verification_status = 'verified', is_suspended = false, company_type = 'transport'
      where id = 'fc000000-0000-0000-0000-000000000003';
      create temp table zz_base as select public.verified_carriers_count() - 1 as n;
      grant select on zz_base to anon;
      update public.companies set is_suspended = true
      where id = 'fc000000-0000-0000-0000-000000000003';
    end $d$$s$);

select pg_temp.check('CTR  a forwarder is not a carrier', 'fix',
  null, 'anon',
  $a$select public.verified_carriers_count() = (select n from zz_base)$a$, 'true',
  p_setup => $s$do $d$
    begin
      create temp table zz_base as select public.verified_carriers_count() as n;
      grant select on zz_base to anon;
      update public.companies
      set verification_status = 'verified', is_suspended = false, company_type = 'expeditie'
      where id = 'fc000000-0000-0000-0000-000000000003';
    end $d$$s$);

select pg_temp.check('CTR  a company that does both is counted once', 'fix',
  null, 'anon',
  $a$select public.verified_carriers_count() = (select n from zz_base)$a$, 'true',
  p_setup => $s$do $d$
    begin
      create temp table zz_base as select public.verified_carriers_count() + 1 as n;
      grant select on zz_base to anon;
      update public.companies
      set verification_status = 'verified', is_suspended = false, company_type = 'both'
      where id = 'fc000000-0000-0000-0000-000000000003';
    end $d$$s$);

-- ---------------------------------------------------------------------
-- The two new settings
-- ---------------------------------------------------------------------

select pg_temp.check('CTR  anon reads the threshold and the review-time text', 'fix',
  null, 'anon',
  $a$select verified_companies_min = 20
        and review_time_label = 'în cel mult o zi lucrătoare'
     from public.homepage_settings where id$a$, 'true');

select pg_temp.check('CTR  the two-argument settings RPC is gone', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.set_homepage_settings(10, 3)$a$, 'blocked',
  p_missing_ok => true);

select pg_temp.check('CTR  a non-staff user cannot change the company threshold', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.set_homepage_settings(50, 6, 1, 'imediat')$a$, 'blocked',
  p_verify => $v$select verified_companies_min = 20 from public.homepage_settings where id$v$);

select pg_temp.check('CTR  staff change both new settings through the RPC, audited', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select (public.set_homepage_settings(50, 6, 5, 'în două zile lucrătoare')).verified_companies_min = 5$a$, 'true',
  p_verify => $v$select exists (
                 select 1 from public.audit_log
                 where action = 'homepage_settings.updated'
                   and (before ->> 'verified_companies_min')::integer = 20
                   and (after ->> 'verified_companies_min')::integer = 5)$v$);

select pg_temp.check('CTR  an empty review-time text becomes null, and hides the question', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select (public.set_homepage_settings(50, 6, 20, '   ')).review_time_label is null$a$, 'true');

select pg_temp.check('CTR  the RPC refuses a company threshold of zero', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.set_homepage_settings(50, 6, 0, null)$a$, 'blocked',
  p_verify => $v$select verified_companies_min = 20 from public.homepage_settings where id$v$);
-- REV - submitting a company, and a person deciding
--
-- The path from "I uploaded my documents" to "I can send offers". Two
-- rules carry it: only a manager may submit, and only staff may approve —
-- and neither may write the verification column directly, whatever the
-- form in front of them says.
-- =====================================================================

select pg_temp.check('REV  a light commercial is not asked for a copie conformă', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select not exists (
       select 1 from public.v_vehicle_missing_documents
       where vehicle_id = 'fe000000-0000-0000-0000-0000000000e1' and kind = 'copie_conforma')$a$,
  'true',
  p_setup => $s$insert into public.vehicles (id, company_id, plate_number, vehicle_type, max_weight_kg)
                values ('fe000000-0000-0000-0000-0000000000e1',
                        'fc000000-0000-0000-0000-000000000001', 'TM99RLS',
                        'autoutilitara_3_5t', 3400)$s$);

select pg_temp.check('REV  a car carrier still is', 'guard',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select exists (
       select 1 from public.v_vehicle_missing_documents
       where vehicle_id = 'fe000000-0000-0000-0000-000000000001' and kind = 'copie_conforma')$a$,
  'true');

select pg_temp.check('REV  ITP and RCA are asked of the light commercial all the same', 'guard',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select count(*) = 2 from public.v_vehicle_missing_documents
     where vehicle_id = 'fe000000-0000-0000-0000-0000000000e1'
       and kind in ('itp', 'rca')$a$, 'true',
  p_setup => $s$insert into public.vehicles (id, company_id, plate_number, vehicle_type, max_weight_kg)
                values ('fe000000-0000-0000-0000-0000000000e1',
                        'fc000000-0000-0000-0000-000000000001', 'TM99RLS',
                        'autoutilitara_3_5t', 3400)$s$);

-- ---------------------------------------------------------------------
-- Readiness
-- ---------------------------------------------------------------------

select pg_temp.check('REV  a forwarder with its papers in is ready, with no fleet', 'fix',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  $a$select is_ready and not needs_vehicles and vehicles_total = 0
     from public.company_review_readiness('fc000000-0000-0000-0000-000000000002')$a$, 'true');

select pg_temp.check('REV  a carrier with a vehicle missing papers is not ready', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select not is_ready and vehicles_incomplete = 1
     from public.company_review_readiness('fc000000-0000-0000-0000-000000000001')$a$, 'true',
  -- fe...0002 has no documents at all; fe...0001 has all three.
  p_setup => $s$delete from public.vehicles where id = 'fe000000-0000-0000-0000-000000000003'$s$);

select pg_temp.check('REV  a carrier is ready once every vehicle is covered', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select is_ready and needs_vehicles and vehicles_total = 1
     from public.company_review_readiness('fc000000-0000-0000-0000-000000000001')$a$, 'true',
  p_setup => $s$delete from public.vehicles where id = 'fe000000-0000-0000-0000-000000000002'$s$);

select pg_temp.check('REV  a carrier with no vehicle at all is not ready', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select not is_ready and vehicles_total = 0
     from public.company_review_readiness('fc000000-0000-0000-0000-000000000001')$a$, 'true',
  p_setup => $s$delete from public.vehicles where company_id = 'fc000000-0000-0000-0000-000000000001'$s$);

select pg_temp.check('REV  an uploaded document counts: approving it is the point of submitting', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select is_ready from public.company_review_readiness('fc000000-0000-0000-0000-000000000001')$a$,
  'true',
  p_setup => $s$do $d$
    begin
      delete from public.vehicles where id = 'fe000000-0000-0000-0000-000000000002';
      -- Only one document per company and kind may be in review at a time.
      delete from public.documents where id = 'fa000000-0000-0000-0000-00000000000a';
      update public.documents set status = 'pending'
      where id = 'fa000000-0000-0000-0000-000000000003';
    end $d$$s$);

select pg_temp.check('REV  a rejected document does not count', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select not is_ready from public.company_review_readiness('fc000000-0000-0000-0000-000000000001')$a$,
  'true',
  p_setup => $s$do $d$
    begin
      delete from public.vehicles where id = 'fe000000-0000-0000-0000-000000000002';
      delete from public.documents where id = 'fa000000-0000-0000-0000-00000000000a';
      update public.documents set status = 'rejected'
      where id = 'fa000000-0000-0000-0000-000000000003';
    end $d$$s$);

-- ---------------------------------------------------------------------
-- Submitting
-- ---------------------------------------------------------------------

select pg_temp.check('REV  a stranger cannot submit somebody else''s company', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.submit_company_for_review('fc000000-0000-0000-0000-000000000002')$a$, 'blocked',
  p_setup => $s$update public.companies set verification_status = 'draft', anaf_is_inactive = false, verification_note = null where id = 'fc000000-0000-0000-0000-000000000002'$s$,
  p_verify => $v$select verification_status = 'draft' from public.companies
                 where id = 'fc000000-0000-0000-0000-000000000002'$v$);

select pg_temp.check('REV  a dispatcher cannot: it is a statement about the paperwork', 'fix',
  'f0000000-0000-0000-0000-000000000003', 'authenticated',
  $a$select public.submit_company_for_review('fc000000-0000-0000-0000-000000000001')$a$, 'blocked',
  p_setup => $s$update public.companies set verification_status = 'draft' where id = 'fc000000-0000-0000-0000-000000000001'$s$,
  p_verify => $v$select verification_status = 'draft' from public.companies
                 where id = 'fc000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('REV  anon cannot submit anything', 'fix',
  null, 'anon',
  $a$select public.submit_company_for_review('fc000000-0000-0000-0000-000000000002')$a$, 'blocked');

select pg_temp.check('REV  a manager cannot submit with documents still missing', 'fix',
  'f0000000-0000-0000-0000-00000000000a', 'authenticated',
  $a$select public.submit_company_for_review('fc000000-0000-0000-0000-000000000003')$a$, 'blocked',
  p_verify => $v$select verification_status = 'draft' from public.companies
                 where id = 'fc000000-0000-0000-0000-000000000003'$v$);

select pg_temp.check('REV  a manager submits a complete company', 'fix',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  $a$select (public.submit_company_for_review('fc000000-0000-0000-0000-000000000002')).verification_status = 'pending'$a$,
  'true',
  p_setup => $s$update public.companies set verification_status = 'draft', anaf_is_inactive = false, verification_note = null where id = 'fc000000-0000-0000-0000-000000000002'$s$);

select pg_temp.check('REV  a company admin may submit too', 'fix',
  'f0000000-0000-0000-0000-00000000000d', 'authenticated',
  $a$select (public.submit_company_for_review('fc000000-0000-0000-0000-000000000001')).verification_status = 'pending'$a$,
  'true',
  p_setup => $s$do $d$
    begin
      update public.companies set verification_status = 'draft' where id = 'fc000000-0000-0000-0000-000000000001';
      delete from public.vehicles where id = 'fe000000-0000-0000-0000-000000000002';
    end $d$$s$);

select pg_temp.check('REV  submitting is audited', 'fix',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  -- A field, not the row: ROW(a, NULL) IS NOT NULL is false in Postgres.
  $a$select (public.submit_company_for_review('fc000000-0000-0000-0000-000000000002')).verification_status = 'pending'$a$,
  'true',
  p_setup => $s$update public.companies set verification_status = 'draft', anaf_is_inactive = false, verification_note = null where id = 'fc000000-0000-0000-0000-000000000002'$s$,
  p_verify => $v$select exists (select 1 from public.audit_log
                                where action = 'company.submitted_for_review'
                                  and entity_id = 'fc000000-0000-0000-0000-000000000002')$v$);

select pg_temp.check('REV  a company already waiting cannot be submitted again', 'fix',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  $a$select public.submit_company_for_review('fc000000-0000-0000-0000-000000000002')$a$, 'blocked',
  p_setup => $s$update public.companies set verification_status = 'pending'
                where id = 'fc000000-0000-0000-0000-000000000002'$s$);

select pg_temp.check('REV  a company ANAF calls inactive cannot be submitted', 'fix',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  $a$select public.submit_company_for_review('fc000000-0000-0000-0000-000000000002')$a$, 'blocked',
  p_setup => $s$update public.companies
                set anaf_is_inactive = true, verification_status = 'draft'
                where id = 'fc000000-0000-0000-0000-000000000002'$s$,
  p_verify => $v$select verification_status = 'draft' from public.companies
                 where id = 'fc000000-0000-0000-0000-000000000002'$v$);

select pg_temp.check('REV  a rejected company may try again', 'fix',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  $a$select (public.submit_company_for_review('fc000000-0000-0000-0000-000000000002')).verification_note is null$a$,
  'true',
  p_setup => $s$update public.companies
                set verification_status = 'rejected', verification_note = 'Licență ilizibilă'
                where id = 'fc000000-0000-0000-0000-000000000002'$s$);

-- ---------------------------------------------------------------------
-- Deciding
-- ---------------------------------------------------------------------

select pg_temp.check('REV  the applicant cannot approve their own company', 'fix',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  $a$select public.review_company('fc000000-0000-0000-0000-000000000002', true)$a$, 'blocked',
  p_setup => $s$update public.companies set verification_status = 'pending'
                where id = 'fc000000-0000-0000-0000-000000000002'$s$,
  p_verify => $v$select verification_status = 'pending' from public.companies
                 where id = 'fc000000-0000-0000-0000-000000000002'$v$);

select pg_temp.check('REV  staff approve a company that is waiting', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select (public.review_company('fc000000-0000-0000-0000-000000000002', true)).verification_status = 'verified'$a$,
  'true',
  p_setup => $s$update public.companies set verification_status = 'pending'
                where id = 'fc000000-0000-0000-0000-000000000002'$s$,
  p_verify => $v$select verified_at is not null and verification_note is null
                 from public.companies where id = 'fc000000-0000-0000-0000-000000000002'$v$);

select pg_temp.check('REV  approval is audited and the applicant is written to', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select (public.review_company('fc000000-0000-0000-0000-000000000002', true)).verification_status = 'verified'$a$, 'true',
  p_setup => $s$update public.companies set verification_status = 'pending'
                where id = 'fc000000-0000-0000-0000-000000000002'$s$,
  p_verify => $v$select exists (select 1 from public.audit_log where action = 'company.verified')
                    and exists (select 1 from public.notification_outbox
                                where template = 'company_verified'
                                  and recipient_company_id = 'fc000000-0000-0000-0000-000000000002')$v$);

select pg_temp.check('REV  a rejection without a reason is refused', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.review_company('fc000000-0000-0000-0000-000000000002', false)$a$, 'blocked',
  p_setup => $s$update public.companies set verification_status = 'pending'
                where id = 'fc000000-0000-0000-0000-000000000002'$s$,
  p_verify => $v$select verification_status = 'pending' from public.companies
                 where id = 'fc000000-0000-0000-0000-000000000002'$v$);

select pg_temp.check('REV  a rejection with a reason reaches the applicant', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select (public.review_company('fc000000-0000-0000-0000-000000000002', false,
            'Licența încărcată este ilizibilă')).verification_note = 'Licența încărcată este ilizibilă'$a$,
  'true',
  p_setup => $s$update public.companies set verification_status = 'pending'
                where id = 'fc000000-0000-0000-0000-000000000002'$s$,
  p_verify => $v$select exists (select 1 from public.notification_outbox
                                where template = 'company_rejected')$v$);

select pg_temp.check('REV  a company that is not waiting cannot be decided on', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.review_company('fc000000-0000-0000-0000-000000000002', true)$a$, 'blocked');

-- ---------------------------------------------------------------------
-- The column itself stays out of reach
-- ---------------------------------------------------------------------

select pg_temp.check('REV  a manager cannot verify their own company by hand', 'guard',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  $a$update public.companies set verification_status = 'verified'
     where id = 'fc000000-0000-0000-0000-000000000002'$a$, 'blocked',
  p_setup => $s$update public.companies set verification_status = 'draft', anaf_is_inactive = false, verification_note = null where id = 'fc000000-0000-0000-0000-000000000002'$s$,
  p_verify => $v$select verification_status = 'draft' from public.companies
                 where id = 'fc000000-0000-0000-0000-000000000002'$v$);

select pg_temp.check('REV  nor write the approval date', 'fix',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  $a$update public.companies set verified_at = now()
     where id = 'fc000000-0000-0000-0000-000000000002'$a$, 'blocked',
  p_setup => $s$update public.companies set verified_at = null
                where id = 'fc000000-0000-0000-0000-000000000002'$s$,
  p_verify => $v$select verified_at is null from public.companies
                 where id = 'fc000000-0000-0000-0000-000000000002'$v$);

select pg_temp.check('REV  nor clear a rejection note they did not like', 'fix',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  $a$update public.companies set verification_note = null
     where id = 'fc000000-0000-0000-0000-000000000002'$a$, 'blocked',
  p_setup => $s$update public.companies set verification_note = 'Licență ilizibilă'
                where id = 'fc000000-0000-0000-0000-000000000002'$s$,
  p_verify => $v$select verification_note = 'Licență ilizibilă' from public.companies
                 where id = 'fc000000-0000-0000-0000-000000000002'$v$);

-- =====================================================================
-- DIR - the public directory of verified companies
--
-- Three conditions decide whether a company is listed: it asked to be, it
-- is verified, and it is not suspended. They live in the view, so no page
-- can widen them by forgetting a filter — and these check all three from
-- the role that would notice.
-- =====================================================================

select pg_temp.check('DIR  the directory carries only what a profile shows', 'fix',
  null, 'anon',
  $a$select array_agg(column_name::text order by column_name) = array[
       'city','company_type','compliant_vehicles','county','coverage_counties',
       'coverage_countries','coverage_scope','cui','equipment','indicative_rate_note',
       'indicative_rate_ron_per_km','last_checked_at','legal_name','logo_path','name',
       'public_description','rating_avg','rating_count','serves_international',
       'serves_national','services','slug','vehicle_types_accepted','vehicles_total',
       'verified_since','website'
     ]
     from information_schema.columns
     where table_schema = 'public' and table_name = 'v_public_companies'$a$, 'true');

select pg_temp.check('DIR  the telephone number is not in the directory', 'fix',
  null, 'anon', $a$select contact_phone from public.v_public_companies$a$, 'blocked',
  p_missing_ok => true);

select pg_temp.check('DIR  neither is the e-mail address', 'fix',
  null, 'anon', $a$select contact_email from public.v_public_companies$a$, 'blocked',
  p_missing_ok => true);

select pg_temp.check('DIR  nor the street address', 'fix',
  null, 'anon', $a$select address from public.v_public_companies$a$, 'blocked',
  p_missing_ok => true);

select pg_temp.check('DIR  nor what ANAF returned about the company', 'fix',
  null, 'anon', $a$select anaf_payload from public.v_public_companies$a$, 'blocked',
  p_missing_ok => true);

select pg_temp.check('DIR  anon still cannot read the companies table', 'guard',
  null, 'anon', $a$select * from public.companies$a$, 'blocked');

-- ---------------------------------------------------------------------
-- Who is listed
-- ---------------------------------------------------------------------

select pg_temp.check('DIR  a company that opted in and is verified is listed', 'fix',
  null, 'anon',
  $a$select exists (select 1 from public.v_public_companies where cui = '90000001')$a$,
  'true', p_setup => $s$update public.companies
                   set public_profile_enabled = true, verification_status = 'verified',
                       is_suspended = false, verified_at = now()
                   where id = 'fc000000-0000-0000-0000-000000000001'$s$);

select pg_temp.check('DIR  a company that did not opt in is not listed', 'fix',
  null, 'anon',
  $a$select not exists (select 1 from public.v_public_companies where cui = '90000001')$a$,
  'true',
  p_setup => $s$update public.companies
                set public_profile_enabled = false, verification_status = 'verified',
                    is_suspended = false
                where id = 'fc000000-0000-0000-0000-000000000001'$s$);

select pg_temp.check('DIR  a company that is not verified is not listed', 'fix',
  null, 'anon',
  $a$select not exists (select 1 from public.v_public_companies where cui = '90000001')$a$,
  'true',
  p_setup => $s$update public.companies
                set public_profile_enabled = true, verification_status = 'pending',
                    is_suspended = false
                where id = 'fc000000-0000-0000-0000-000000000001'$s$);

select pg_temp.check('DIR  a suspended company disappears from the list', 'fix',
  null, 'anon',
  $a$select not exists (select 1 from public.v_public_companies where cui = '90000001')$a$,
  'true',
  p_setup => $s$update public.companies
                set public_profile_enabled = true, verification_status = 'verified',
                    is_suspended = true
                where id = 'fc000000-0000-0000-0000-000000000001'$s$);

select pg_temp.check('DIR  the count of vehicles with their papers in date is the one shown', 'fix',
  null, 'anon',
  $a$select a.compliant_vehicles = b.n
     from public.v_public_companies a, zz_base b
     where a.cui = '90000001'$a$, 'true',
  p_setup => $s$do $d$
    begin
      update public.companies
      set public_profile_enabled = true, verification_status = 'verified',
          is_suspended = false, verified_at = now()
      where id = 'fc000000-0000-0000-0000-000000000001';
      create temp table zz_base as
        select count(*)::integer as n from public.vehicles v
        where v.company_id = 'fc000000-0000-0000-0000-000000000001'
          and v.is_active and v.is_compliant;
      grant select on zz_base to anon;
    end $d$$s$);

-- ---------------------------------------------------------------------
-- The slug
-- ---------------------------------------------------------------------

select pg_temp.check('DIR  Romanian letters are transliterated, not dropped', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select public.slugify('Transport Brașov Țânțăreni SRL') = 'transport-brasov-tantareni-srl'$a$,
  'true');

select pg_temp.check('DIR  a new company gets a slug without asking', 'fix',
  null, 'service_role',
  $a$select slug = 'trans-nou-srl-cluj-napoca' from public.companies
     where id = 'fc000000-0000-0000-0000-0000000000d1'$a$, 'true',
  p_setup => $s$insert into public.companies (id, cui, legal_name, company_type, city, created_by)
                values ('fc000000-0000-0000-0000-0000000000d1', '99000101', 'Trans Nou SRL',
                        'transport', 'Cluj-Napoca', 'f0000000-0000-0000-0000-000000000002')$s$);

select pg_temp.check('DIR  two firms with the same name in the same city do not collide', 'fix',
  null, 'service_role',
  $a$select count(distinct slug) = 2 from public.companies
     where id in ('fc000000-0000-0000-0000-0000000000d1', 'fc000000-0000-0000-0000-0000000000d2')$a$,
  'true',
  p_setup => $s$insert into public.companies (id, cui, legal_name, company_type, city, created_by)
                values
                  ('fc000000-0000-0000-0000-0000000000d1', '99000101', 'Trans Nou SRL', 'transport', 'Cluj-Napoca', 'f0000000-0000-0000-0000-000000000002'),
                  ('fc000000-0000-0000-0000-0000000000d2', '99000102', 'Trans Nou SRL', 'transport', 'Cluj-Napoca', 'f0000000-0000-0000-0000-000000000002')$s$);

select pg_temp.check('DIR  a manager cannot move the slug: shared links would break', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.companies set slug = 'altceva'
     where id = 'fc000000-0000-0000-0000-000000000001'$a$, 'blocked',
  p_verify => $v$select slug <> 'altceva' from public.companies
                 where id = 'fc000000-0000-0000-0000-000000000001'$v$);

-- ---------------------------------------------------------------------
-- What a company may say about itself
-- ---------------------------------------------------------------------

select pg_temp.check('DIR  a manager opts the firm into the list', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.companies set public_profile_enabled = true,
       public_description = 'Transportăm autoturisme între România și Germania.'
     where id = 'fc000000-0000-0000-0000-000000000001'$a$, 'allowed');

select pg_temp.check('DIR  a stranger cannot write somebody else''s description', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$update public.companies set public_description = 'Text străin'
     where id = 'fc000000-0000-0000-0000-000000000001'$a$, 'blocked');

select pg_temp.check('DIR  a description longer than 300 characters is refused', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.companies set public_description = repeat('a', 301)
     where id = 'fc000000-0000-0000-0000-000000000001'$a$, 'blocked');

-- ---------------------------------------------------------------------
-- Moderation
-- ---------------------------------------------------------------------

select pg_temp.check('DIR  a company cannot hide a rival from the list', 'fix',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  $a$select public.set_company_public_profile('fc000000-0000-0000-0000-000000000001', false, 'motiv')$a$,
  'blocked');

select pg_temp.check('DIR  staff hide a profile, with a reason, audited', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select not (public.set_company_public_profile(
       'fc000000-0000-0000-0000-000000000001', false,
       'Descriere care nu corespunde activității')).public_profile_enabled$a$, 'true',
  p_setup => $s$update public.companies
                   set public_profile_enabled = true, verification_status = 'verified',
                       is_suspended = false, verified_at = now()
                   where id = 'fc000000-0000-0000-0000-000000000001'$s$,
  p_verify => $v$select exists (select 1 from public.audit_log
                                where action = 'company.profile_hidden')$v$);

select pg_temp.check('DIR  hiding a profile without a reason is refused', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.set_company_public_profile('fc000000-0000-0000-0000-000000000001', false)$a$,
  'blocked', p_setup => $s$update public.companies
                   set public_profile_enabled = true, verification_status = 'verified',
                       is_suspended = false, verified_at = now()
                   where id = 'fc000000-0000-0000-0000-000000000001'$s$,
  p_verify => $v$select public_profile_enabled from public.companies
                 where id = 'fc000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('DIR  hiding the profile does not touch the verification', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select (public.set_company_public_profile(
       'fc000000-0000-0000-0000-000000000001', false, 'motiv')).verification_status = 'verified'$a$,
  'true', p_setup => $s$update public.companies
                   set public_profile_enabled = true, verification_status = 'verified',
                       is_suspended = false, verified_at = now()
                   where id = 'fc000000-0000-0000-0000-000000000001'$s$);

-- ---------------------------------------------------------------------
-- The numbers
-- ---------------------------------------------------------------------

select pg_temp.check('DIR  anon may ask how many verified carriers there are', 'fix',
  null, 'anon', $a$select count(*) = 1 from public.directory_stats()$a$, 'true');

select pg_temp.check('DIR  a suspended carrier is not counted', 'fix',
  null, 'anon',
  $a$select a.verified_companies = b.n - 1 from public.directory_stats() a, zz_base b$a$, 'true',
  p_setup => $s$do $d$
    begin
      update public.companies
      set verification_status = 'verified', is_suspended = false, company_type = 'transport'
      where id = 'fc000000-0000-0000-0000-000000000001';
      create temp table zz_base as select verified_companies as n from public.directory_stats();
      grant select on zz_base to anon;
      update public.companies set is_suspended = true
      where id = 'fc000000-0000-0000-0000-000000000001';
    end $d$$s$);

select pg_temp.check('DIR  the listed count is the directory itself', 'fix',
  null, 'anon',
  $a$select listed_companies = (select count(*) from public.v_public_companies)
     from public.directory_stats()$a$, 'true');

-- ---------------------------------------------------------------------
-- Prices
-- ---------------------------------------------------------------------

select pg_temp.check('DIR  anon reads the carrier price', 'guard',
  null, 'anon',
  $a$select price_ron_month = 149 from public.plans where code = 'carrier'$a$, 'true');

select pg_temp.check('DIR  not even staff change a price without an audit row', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$update public.plans set price_ron_month = 1 where code = 'carrier'$a$, 'blocked',
  p_verify => $v$select price_ron_month = 149 from public.plans where code = 'carrier'$v$);

select pg_temp.check('DIR  a carrier cannot change the price they pay', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select public.set_plan('carrier', 'Transportator', null, 'carrier', 1, true, true, '[]')$a$,
  'blocked',
  p_verify => $v$select price_ron_month = 149 from public.plans where code = 'carrier'$v$);

select pg_temp.check('DIR  staff change the price through the RPC, audited', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select (public.set_plan('carrier', 'Transportator', null, 'carrier', 169, true, true,
            '[{"key":"a","label":"Publicare nelimitată","status":"included"}]')).price_ron_month = 169$a$,
  'true',
  p_verify => $v$select exists (select 1 from public.audit_log where action = 'plan.updated')$v$);

select pg_temp.check('DIR  a negative price is refused', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.set_plan('carrier', 'Transportator', null, 'carrier', -1, true, true, '[]')$a$,
  'blocked');

-- ---------------------------------------------------------------------
-- Thresholds
-- ---------------------------------------------------------------------

select pg_temp.check('DIR  anon reads the thresholds', 'fix',
  null, 'anon',
  $a$select stats_min_companies = 20 and directory_min_companies = 12
     from public.homepage_settings where id$a$, 'true');

-- The trial length has one home, and it is not this table: migration
-- 20260917160000 moved it to pricing_settings, where the trial that starts
-- at approval reads it.
select pg_temp.check('DIR  the trial length is not kept here as well', 'fix',
  null, 'anon',
  $a$select trial_days from public.homepage_settings$a$, 'blocked',
  p_missing_ok => true);

select pg_temp.check('DIR  a non-staff user cannot move them', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.set_directory_settings(1, 1)$a$, 'blocked',
  p_verify => $v$select directory_min_companies = 12 from public.homepage_settings where id$v$);

select pg_temp.check('DIR  staff move them through the RPC, audited', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select (public.set_directory_settings(5, 3)).directory_min_companies = 3$a$, 'true',
  p_verify => $v$select exists (select 1 from public.audit_log
                                where action = 'homepage_settings.updated'
                                  and reason = 'Praguri pentru lista de firme')$v$);

select pg_temp.check('DIR  a threshold of zero is refused', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.set_directory_settings(0, 12)$a$, 'blocked');

-- ---------------------------------------------------------------------
-- The compliance shield
-- ---------------------------------------------------------------------

select pg_temp.check('DIR  a profile shows document states, to the month', 'fix',
  null, 'anon',
  $a$select array_agg(column_name::text order by column_name) = array[
       'kind','label_ro','slug','state','valid_month'
     ]
     from information_schema.columns
     where table_schema = 'public' and table_name = 'v_public_company_documents'$a$, 'true');

select pg_temp.check('DIR  the exact expiry date is not public', 'fix',
  null, 'anon',
  $a$select valid_until from public.v_public_company_documents$a$, 'blocked',
  p_missing_ok => true);

select pg_temp.check('DIR  the month is the first of the month, never the real day', 'fix',
  null, 'anon',
  $a$select bool_and(extract(day from valid_month) = 1)
     from public.v_public_company_documents
     where valid_month is not null$a$, 'true',
  p_setup => $s$update public.companies
                   set public_profile_enabled = true, verification_status = 'verified',
                       is_suspended = false, verified_at = now()
                   where id = 'fc000000-0000-0000-0000-000000000001'$s$);

select pg_temp.check('DIR  a company that is not listed shows no documents either', 'fix',
  null, 'anon',
  $a$select not exists (select 1 from public.v_public_company_documents
                        where slug = (select slug from zz_base))$a$,
  'true',
  p_setup => $s$do $d$
    begin
      create temp table zz_base as select slug from public.companies
      where id = 'fc000000-0000-0000-0000-000000000001';
      grant select on zz_base to anon;
      update public.companies set public_profile_enabled = false
      where id = 'fc000000-0000-0000-0000-000000000001';
    end $d$$s$);

-- ---------------------------------------------------------------------
-- The exemption, in public
-- ---------------------------------------------------------------------

select pg_temp.check('DIR  the public rules carry the exemption, not just the rule', 'fix',
  null, 'anon',
  $a$select excluded_vehicle_types = '{autoutilitara_3_5t}'::public.vehicle_type[]
     from public.v_document_requirements_public where kind = 'copie_conforma'$a$, 'true');

-- ---------------------------------------------------------------------
-- The routes on a profile
-- ---------------------------------------------------------------------

select pg_temp.check('DIR  a listed company shows the routes it published', 'fix',
  null, 'anon',
  $a$select exists (select 1 from public.v_public_company_routes
                    where slug = (select slug from zz_base))$a$, 'true',
  p_setup => $s$do $d$
    begin
      update public.companies
      set public_profile_enabled = true, verification_status = 'verified',
          is_suspended = false, verified_at = now()
      where id = 'fc000000-0000-0000-0000-000000000001';
      create temp table zz_base as select slug from public.companies
      where id = 'fc000000-0000-0000-0000-000000000001';
      grant select on zz_base to anon;
    end $d$$s$);

select pg_temp.check('DIR  opting out takes the routes with the profile', 'fix',
  null, 'anon',
  $a$select not exists (select 1 from public.v_public_company_routes
                        where slug = (select slug from zz_base))$a$, 'true',
  p_setup => $s$do $d$
    begin
      create temp table zz_base as select slug from public.companies
      where id = 'fc000000-0000-0000-0000-000000000001';
      grant select on zz_base to anon;
      update public.companies set public_profile_enabled = false
      where id = 'fc000000-0000-0000-0000-000000000001';
    end $d$$s$);

-- The board stays anonymous. A company column on it would undo the reason
-- v_public_company_routes exists at all.
select pg_temp.check('DIR  the anonymous board is still anonymous', 'guard',
  null, 'anon',
  $a$select not exists (
       select 1 from information_schema.columns
       where table_schema = 'public' and table_name = 'v_departures_public'
         and column_name in ('company_id', 'slug', 'company_name'))$a$, 'true');

select pg_temp.check('DIR  a route inside one country is marked as such', 'fix',
  null, 'anon',
  $a$select bool_and(is_domestic = (from_country = to_country))
     from public.v_departures_public$a$, 'true');

-- =====================================================================
-- ABO - abonamente: prices, periods, settings and the request queue
--
-- A price is what a company is asked to pay, so the rules around it are
-- the ones worth pinning: anon reads only what is public, nobody but staff
-- writes, a discount is never stored, and a paid plan never touches the
-- verification. The request queue is a conversation, not a payment, and a
-- manager sees only their own company's side of it.
-- =====================================================================

-- ---------------------------------------------------------------------
-- What anon may read
-- ---------------------------------------------------------------------

select pg_temp.check('ABO  anon reads the public plans', 'fix',
  null, 'anon',
  $a$select count(*) >= 3 from public.plans where is_public$a$, 'true');

select pg_temp.check('ABO  a plan taken off sale is not readable by anon', 'fix',
  null, 'anon',
  $a$select not exists (select 1 from public.plans where code = 'carrier')$a$, 'true',
  p_setup => $s$update public.plans set is_public = false where code = 'carrier'$s$);

select pg_temp.check('ABO  anon reads the period totals', 'fix',
  null, 'anon',
  $a$select total_price_ron = 1490 from public.plan_billing_periods
     where plan_code = 'carrier' and months = 12$a$, 'true');

select pg_temp.check('ABO  a period taken off sale is not readable by anon', 'fix',
  null, 'anon',
  $a$select not exists (select 1 from public.plan_billing_periods
                        where plan_code = 'carrier' and months = 12)$a$, 'true',
  p_setup => $s$update public.plan_billing_periods set is_public = false
                where plan_code = 'carrier' and months = 12$s$);

-- A period belonging to a plan nobody can see is itself invisible, even
-- when its own flag says public: otherwise taking a plan off sale would
-- leave its prices on the page.
select pg_temp.check('ABO  hiding the plan hides its periods too', 'fix',
  null, 'anon',
  $a$select not exists (select 1 from public.plan_billing_periods where plan_code = 'carrier')$a$,
  'true',
  p_setup => $s$update public.plans set is_public = false where code = 'carrier'$s$);

select pg_temp.check('ABO  anon reads the trial length and the VAT line', 'fix',
  null, 'anon',
  $a$select trial_days = 30 and vat_label is not null from public.pricing_settings where id$a$,
  'true');

select pg_temp.check('ABO  no discount percentage is stored anywhere', 'fix',
  null, 'anon',
  $a$select not exists (
       select 1 from information_schema.columns
       where table_schema = 'public'
         and table_name in ('plans', 'plan_billing_periods')
         and (column_name like '%discount%' or column_name like '%percent%'))$a$, 'true');

-- ---------------------------------------------------------------------
-- Who may write a price
-- ---------------------------------------------------------------------

select pg_temp.check('ABO  nobody writes a period through PostgREST', 'guard',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$update public.plan_billing_periods set total_price_ron = 1
     where plan_code = 'carrier' and months = 12$a$, 'blocked',
  p_verify => $v$select total_price_ron = 1490 from public.plan_billing_periods
                 where plan_code = 'carrier' and months = 12$v$);

select pg_temp.check('ABO  a carrier cannot change a period total', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select public.set_plan_period('carrier', 12, 1, true)$a$, 'blocked',
  p_verify => $v$select total_price_ron = 1490 from public.plan_billing_periods
                 where plan_code = 'carrier' and months = 12$v$);

select pg_temp.check('ABO  staff change a period total through the RPC, audited', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select (public.set_plan_period('carrier', 12, 1400, true)).total_price_ron = 1400$a$, 'true',
  p_verify => $v$select exists (select 1 from public.audit_log
                                where action = 'plan_period.updated')$v$);

-- A "discount" that costs more than paying monthly is a typo in a form,
-- and it would be printed on the page as a saving.
select pg_temp.check('ABO  a period dearer than paying monthly is refused', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.set_plan_period('carrier', 12, 99999, true)$a$, 'blocked');

select pg_temp.check('ABO  a period other than 1, 6 or 12 months is refused', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.set_plan_period('carrier', 3, 400, true)$a$, 'blocked');

select pg_temp.check('ABO  a non-staff user cannot change the billing settings', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select public.set_pricing_settings(1, 'TVA inclus', false, 'x@test.ro')$a$, 'blocked',
  p_verify => $v$select trial_days = 30 from public.pricing_settings where id$v$);

select pg_temp.check('ABO  staff change them through the RPC, audited', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select (public.set_pricing_settings(14, 'TVA inclus', false, 'facturi@test.ro')).trial_days = 14$a$,
  'true',
  p_verify => $v$select exists (select 1 from public.audit_log
                                where action = 'pricing_settings.updated')$v$);

-- An empty box means "say nothing about VAT", not an empty sentence under
-- every price.
select pg_temp.check('ABO  an empty VAT line becomes no line at all', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select (public.set_pricing_settings(30, '   ', true, null)).vat_label is null$a$, 'true');

-- ---------------------------------------------------------------------
-- The recommendation
-- ---------------------------------------------------------------------

-- The RPC is the action, not the setup: p_setup runs before the role is
-- set, so is_platform_admin() would see no caller at all.
select pg_temp.check('ABO  one plan is recommended per audience, never two', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select (public.set_plan('business', 'Flotă', null, 'carrier', 449, true, true, '[]')).highlight$a$,
  'true',
  p_verify => $v$select count(*) = 1 from public.plans
                 where highlight and audience = 'carrier'$v$);

select pg_temp.check('ABO  recommending another plan stands the first one down', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select (public.set_plan('business', 'Flotă', null, 'carrier', 449, true, true, '[]')).highlight$a$,
  'true',
  p_verify => $v$select not highlight from public.plans where code = 'carrier'$v$);

select pg_temp.check('ABO  a plan with no audience cannot be the recommended one', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select not (public.set_plan('individual', 'Persoană fizică', null, null, 0, false, true, '[]')).highlight$a$,
  'true');

select pg_temp.check('ABO  a feature without a status is refused', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.set_plan('carrier', 'Transportator', null, 'carrier', 149, true, true,
            '[{"key":"a","label":"Ceva"}]')$a$, 'blocked');

select pg_temp.check('ABO  a feature with a status we cannot draw is refused', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.set_plan('carrier', 'Transportator', null, 'carrier', 149, true, true,
            '[{"key":"a","label":"Ceva","status":"maybe"}]')$a$, 'blocked');

-- A dearer plan that appears to lack something the free one has reads as a
-- mistake in the comparison table, and the first version of this seed had
-- exactly that. The keys, not the statuses: a paid plan may legitimately
-- mark something "în curând", but it must at least mention it.
select pg_temp.check('ABO  every paid plan answers what the free one answers', 'fix',
  null, 'anon',
  $a$select not exists (
       select 1
       from public.plans free,
            lateral jsonb_array_elements(free.features) f,
            public.plans paid
       where free.code = 'free'
         and paid.code in ('carrier', 'business')
         and not exists (
           select 1 from jsonb_array_elements(paid.features) g
           where g->>'key' = f->>'key'
         ))$a$, 'true');

-- Within one audience the same key must carry the same words, or the
-- comparison table prints one plan's wording in a row covering all of them.
-- Across audiences it may differ: "dispeceri nelimitați" and "mai mulți
-- dispeceri" are different offers, and the two tables never share a row.
select pg_temp.check('ABO  a feature key means one thing in a given table', 'fix',
  null, 'anon',
  $a$select not exists (
       select 1
       from public.plans p, lateral jsonb_array_elements(p.features) f
       where p.audience is not null
       group by p.audience, f->>'key'
       having count(distinct f->>'label') > 1)$a$, 'true');

-- ---------------------------------------------------------------------
-- Asking for a plan
-- ---------------------------------------------------------------------

select pg_temp.check('ABO  anon cannot read the request queue', 'guard',
  null, 'anon', $a$select * from public.subscription_requests$a$, 'blocked');

select pg_temp.check('ABO  nobody inserts a request through PostgREST', 'guard',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$insert into public.subscription_requests
       (company_id, plan_code, months, requested_by)
     values ('fc000000-0000-0000-0000-000000000001', 'carrier', 12,
             'f0000000-0000-0000-0000-000000000002')$a$, 'blocked');

select pg_temp.check('ABO  a manager asks for a plan', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select (public.request_subscription(
       'fc000000-0000-0000-0000-000000000001', 'carrier', 12,
       'Vrem factură pe firmă')).status = 'new'$a$, 'true',
  p_verify => $v$select exists (select 1 from public.audit_log
                                where action = 'subscription_request.created')$v$);

-- A dispatcher runs the day-to-day; committing the firm to a bill is the
-- owner's or an admin's decision.
select pg_temp.check('ABO  a dispatcher cannot commit the firm to a plan', 'fix',
  'f0000000-0000-0000-0000-000000000003', 'authenticated',
  $a$select public.request_subscription('fc000000-0000-0000-0000-000000000001', 'carrier', 12)$a$,
  'blocked');

select pg_temp.check('ABO  nobody asks on behalf of another firm', 'fix',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  $a$select public.request_subscription('fc000000-0000-0000-0000-000000000001', 'carrier', 12)$a$,
  'blocked');

select pg_temp.check('ABO  a period that is not on sale cannot be requested', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select public.request_subscription('fc000000-0000-0000-0000-000000000001', 'carrier', 12)$a$,
  'blocked',
  p_setup => $s$update public.plan_billing_periods set is_public = false
                where plan_code = 'carrier' and months = 12$s$);

select pg_temp.check('ABO  a second open request is refused', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select public.request_subscription('fc000000-0000-0000-0000-000000000001', 'carrier', 6)$a$,
  'blocked',
  p_setup => $s$insert into public.subscription_requests
                  (company_id, plan_code, months, requested_by)
                values ('fc000000-0000-0000-0000-000000000001', 'carrier', 12,
                        'f0000000-0000-0000-0000-000000000002')$s$);

select pg_temp.check('ABO  the team is told to invoice, and the firm gets it in writing', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select (public.request_subscription(
       'fc000000-0000-0000-0000-000000000001', 'carrier', 12)).id is not null$a$, 'true',
  p_setup => $s$update public.pricing_settings set billing_contact_email = 'facturi@test.ro'$s$,
  p_verify => $v$select count(*) = 2 from public.notification_outbox
                 where template in ('subscription_request_staff',
                                    'subscription_request_received')$v$);

-- ---------------------------------------------------------------------
-- Who sees a request
-- ---------------------------------------------------------------------

select pg_temp.check('ABO  a manager sees their own firm''s request', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select count(*) = 1 from public.subscription_requests$a$, 'true',
  p_setup => $s$insert into public.subscription_requests
                  (company_id, plan_code, months, requested_by)
                values ('fc000000-0000-0000-0000-000000000001', 'carrier', 12,
                        'f0000000-0000-0000-0000-000000000002')$s$);

select pg_temp.check('ABO  another firm''s request is not visible', 'fix',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  $a$select count(*) = 0 from public.subscription_requests$a$, 'true',
  p_setup => $s$insert into public.subscription_requests
                  (company_id, plan_code, months, requested_by)
                values ('fc000000-0000-0000-0000-000000000001', 'carrier', 12,
                        'f0000000-0000-0000-0000-000000000002')$s$);

-- ---------------------------------------------------------------------
-- Working the queue
-- ---------------------------------------------------------------------

select pg_temp.check('ABO  a company cannot activate its own subscription', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select public.activate_subscription_request(
       (select id from public.subscription_requests limit 1))$a$, 'blocked',
  p_setup => $s$insert into public.subscription_requests
                  (company_id, plan_code, months, requested_by)
                values ('fc000000-0000-0000-0000-000000000001', 'carrier', 12,
                        'f0000000-0000-0000-0000-000000000002')$s$,
  p_verify => $v$select status = 'new' from public.subscription_requests
                 order by created_at desc limit 1$v$);

select pg_temp.check('ABO  staff activate it, and the plan is the one asked for', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select (public.activate_subscription_request(
       (select id from public.subscription_requests limit 1))).status = 'activated'$a$, 'true',
  p_setup => $s$do $d$
    begin
      update public.companies set verification_status = 'verified', is_suspended = false
      where id = 'fc000000-0000-0000-0000-000000000001';
      insert into public.subscription_requests
        (company_id, plan_code, months, requested_by)
      values ('fc000000-0000-0000-0000-000000000001', 'carrier', 12,
              'f0000000-0000-0000-0000-000000000002');
    end $d$$s$,
  p_verify => $v$select plan_code = 'carrier' and status = 'active'
                   and current_period_end > now() + interval '300 days'
                 from public.subscriptions
                 where company_id = 'fc000000-0000-0000-0000-000000000001'
                   and status in ('trialing', 'active', 'past_due')$v$);

select pg_temp.check('ABO  activation is audited', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select (public.activate_subscription_request(
       (select id from public.subscription_requests limit 1))).status = 'activated'$a$, 'true',
  p_setup => $s$do $d$
    begin
      update public.companies set verification_status = 'verified', is_suspended = false
      where id = 'fc000000-0000-0000-0000-000000000001';
      insert into public.subscription_requests
        (company_id, plan_code, months, requested_by)
      values ('fc000000-0000-0000-0000-000000000001', 'carrier', 12,
              'f0000000-0000-0000-0000-000000000002');
    end $d$$s$,
  p_verify => $v$select exists (select 1 from public.audit_log
                                where action = 'subscription.activated')$v$);

-- A plan is not a shortcut past the paperwork.
select pg_temp.check('ABO  an unverified firm cannot be activated', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.activate_subscription_request(
       (select id from public.subscription_requests limit 1))$a$, 'blocked',
  p_setup => $s$do $d$
    begin
      update public.companies set verification_status = 'pending'
      where id = 'fc000000-0000-0000-0000-000000000001';
      insert into public.subscription_requests
        (company_id, plan_code, months, requested_by)
      values ('fc000000-0000-0000-0000-000000000001', 'carrier', 12,
              'f0000000-0000-0000-0000-000000000002');
    end $d$$s$);

select pg_temp.check('ABO  paying never changes the verification', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select (public.activate_subscription_request(
       (select id from public.subscription_requests limit 1))).status = 'activated'$a$, 'true',
  p_setup => $s$do $d$
    begin
      update public.companies
      set verification_status = 'verified', is_suspended = false, verified_at = now()
      where id = 'fc000000-0000-0000-0000-000000000001';
      insert into public.subscription_requests
        (company_id, plan_code, months, requested_by)
      values ('fc000000-0000-0000-0000-000000000001', 'carrier', 12,
              'f0000000-0000-0000-0000-000000000002');
    end $d$$s$,
  p_verify => $v$select verified_at is not null and verification_status = 'verified'
                 from public.companies where id = 'fc000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('ABO  a rejection without a reason is refused', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.reject_subscription_request(
       (select id from public.subscription_requests limit 1), '   ')$a$, 'blocked',
  p_setup => $s$insert into public.subscription_requests
                  (company_id, plan_code, months, requested_by)
                values ('fc000000-0000-0000-0000-000000000001', 'carrier', 12,
                        'f0000000-0000-0000-0000-000000000002')$s$);

select pg_temp.check('ABO  a closed request cannot be activated afterwards', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.activate_subscription_request(
       (select id from public.subscription_requests limit 1))$a$, 'blocked',
  p_setup => $s$insert into public.subscription_requests
                  (company_id, plan_code, months, requested_by, status)
                values ('fc000000-0000-0000-0000-000000000001', 'carrier', 12,
                        'f0000000-0000-0000-0000-000000000002', 'rejected')$s$);

-- ---------------------------------------------------------------------
-- The trial starts at approval, not at sign-up
-- ---------------------------------------------------------------------

select pg_temp.check('ABO  approving a firm starts its trial on the recommended plan', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select (public.review_company('fc000000-0000-0000-0000-000000000001', true))
            .verification_status = 'verified'$a$, 'true',
  p_setup => $s$do $d$
    begin
      delete from public.subscriptions
      where company_id = 'fc000000-0000-0000-0000-000000000001';
      update public.companies set verification_status = 'pending', company_type = 'transport'
      where id = 'fc000000-0000-0000-0000-000000000001';
    end $d$$s$,
  p_verify => $v$select plan_code = 'carrier' and status = 'trialing'
                 from public.subscriptions
                 where company_id = 'fc000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('ABO  the trial runs for the length in the settings', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select (public.review_company('fc000000-0000-0000-0000-000000000001', true))
            .verification_status = 'verified'$a$, 'true',
  p_setup => $s$do $d$
    begin
      delete from public.subscriptions
      where company_id = 'fc000000-0000-0000-0000-000000000001';
      update public.pricing_settings set trial_days = 45 where id;
      update public.companies set verification_status = 'pending'
      where id = 'fc000000-0000-0000-0000-000000000001';
    end $d$$s$,
  p_verify => $v$select current_period_end > now() + interval '44 days'
                   and current_period_end < now() + interval '46 days'
                 from public.subscriptions
                 where company_id = 'fc000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('ABO  a trial of zero days starts nothing', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select (public.review_company('fc000000-0000-0000-0000-000000000001', true))
            .verification_status = 'verified'$a$, 'true',
  p_setup => $s$do $d$
    begin
      delete from public.subscriptions
      where company_id = 'fc000000-0000-0000-0000-000000000001';
      update public.pricing_settings set trial_days = 0 where id;
      update public.companies set verification_status = 'pending'
      where id = 'fc000000-0000-0000-0000-000000000001';
    end $d$$s$,
  p_verify => $v$select not exists (select 1 from public.subscriptions
                                    where company_id = 'fc000000-0000-0000-0000-000000000001')$v$);

-- A firm that already pays must not be dropped back onto a trial by a
-- later re-approval.
select pg_temp.check('ABO  approval does not overwrite a subscription that exists', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select (public.review_company('fc000000-0000-0000-0000-000000000001', true))
            .verification_status = 'verified'$a$, 'true',
  p_setup => $s$do $d$
    begin
      delete from public.subscriptions
      where company_id = 'fc000000-0000-0000-0000-000000000001';
      insert into public.subscriptions
        (company_id, plan_code, status, current_period_end)
      values ('fc000000-0000-0000-0000-000000000001', 'business', 'active',
              now() + interval '200 days');
      update public.companies set verification_status = 'pending'
      where id = 'fc000000-0000-0000-0000-000000000001';
    end $d$$s$,
  p_verify => $v$select plan_code = 'business' and status = 'active'
                 from public.subscriptions
                 where company_id = 'fc000000-0000-0000-0000-000000000001'$v$);

-- =====================================================================
-- REQ - publishing a transport request (phase 2)
--
-- `cargo_listings` has had policies since phase 0 and no screen until now.
-- These checks are about the four RPCs that write it, and about the
-- privilege that was taken away from the browser at the same time.
-- =====================================================================

select pg_temp.check('REQ  an individual publishes a request', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.create_cargo_request(
       p_from_city => 'Klagenfurt', p_to_city => 'Cluj-Napoca',
       p_loading_from => current_date + 5, p_category => 'autoturism',
       p_make => 'Audi', p_model => 'A4', p_year => 2016, p_is_running => true)$a$,
  'allowed',
  -- The individual plan allows two active requests and this person already
  -- has both, so one is withdrawn first. The quota itself is checked below.
  p_setup => $s$update public.cargo_listings set status = 'cancelled'
                where id = 'f1000000-0000-0000-0000-000000000003'$s$,
  p_verify => $v$select status = 'active' and board = 'retur' and company_id is null
                    and title = 'Audi A4 2016 · Klagenfurt → Cluj-Napoca'
                 from public.cargo_listings where loading_city = 'Klagenfurt'$v$);

-- Two active requests is what the individual plan allows, and the fixture
-- uses both. The third must not be lost, and the person must be told which
-- limit they met - not "something went wrong".
select pg_temp.check('REQ  a third request waits as a draft on the free plan', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.create_cargo_request(
       p_from_city => 'Klagenfurt', p_to_city => 'Cluj-Napoca',
       p_loading_from => current_date + 5, p_category => 'autoturism',
       p_make => 'Audi', p_model => 'A4', p_year => 2016, p_is_running => true)$a$,
  'allowed',
  p_verify => $v$select status = 'draft' from public.cargo_listings
                 where loading_city = 'Klagenfurt'$v$);

select pg_temp.check('REQ  and it names the limit it met', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select publish_error like '%anunțuri active%' from public.create_cargo_request(
       p_from_city => 'Klagenfurt', p_to_city => 'Cluj-Napoca',
       p_loading_from => current_date + 5, p_category => 'autoturism',
       p_make => 'Audi', p_model => 'A4', p_year => 2016, p_is_running => true)$a$,
  'true');

select pg_temp.check('REQ  a request can be kept as a draft on purpose', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select request_status = 'draft' and publish_error is null
     from public.create_cargo_request(
       p_from_city => 'Klagenfurt', p_to_city => 'Cluj-Napoca',
       p_loading_from => current_date + 5, p_category => 'autoturism',
       p_make => 'Audi', p_model => 'A4', p_year => 2016, p_is_running => true,
       p_publish => false)$a$, 'true');

select pg_temp.check('REQ  the vehicle and the contact are written with it', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.create_cargo_request(
       p_from_city => 'Klagenfurt', p_to_city => 'Cluj-Napoca',
       p_loading_from => current_date + 5, p_category => 'autoturism',
       p_make => 'Audi', p_model => 'A4', p_year => 2016, p_is_running => true)$a$,
  'allowed',
  p_verify => $v$select exists (
                   select 1 from public.cargo_vehicle_details d
                   join public.cargo_listings l on l.id = d.cargo_listing_id
                   where l.loading_city = 'Klagenfurt' and d.make = 'Audi' and d.year = 2016)
                 and exists (
                   select 1 from public.listing_contacts c
                   join public.cargo_listings l on l.id = c.cargo_listing_id
                   where l.loading_city = 'Klagenfurt' and c.contact_phone = '+40711000006')$v$);

-- The condition flags drive the price, so a winch must be derived and not
-- believed: the form never sends it.
select pg_temp.check('REQ  a car that does not start is marked for a winch', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.create_cargo_request(
       p_from_city => 'Klagenfurt', p_to_city => 'Cluj-Napoca',
       p_loading_from => current_date + 5, p_category => 'autoturism',
       p_make => 'Audi', p_model => 'A4', p_year => 2016, p_is_running => false)$a$,
  'allowed',
  p_verify => $v$select d.needs_winch
                 from public.cargo_vehicle_details d
                 join public.cargo_listings l on l.id = d.cargo_listing_id
                 where l.loading_city = 'Klagenfurt'$v$);

-- Coordinates come from the server's city list, so the straight-line
-- distance on a card is computed from something the browser did not choose.
select pg_temp.check('REQ  coordinates put a distance on the card', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.create_cargo_request(
       p_from_city => 'Klagenfurt', p_to_city => 'Cluj-Napoca',
       p_loading_from => current_date + 5, p_category => 'autoturism',
       p_make => 'Audi', p_model => 'A4', p_year => 2016, p_is_running => true,
       p_from_lat => 46.6247, p_from_lng => 14.3055,
       p_to_lat => 46.7712, p_to_lng => 23.6236)$a$,
  'allowed',
  p_setup => $s$update public.cargo_listings set status = 'cancelled'
                where id = 'f1000000-0000-0000-0000-000000000003'$s$,
  p_verify => $v$select v.estimated_km between 680 and 720
                 from public.v_requests_public v
                 join public.cargo_listings l on l.id = v.id
                 where l.loading_city = 'Klagenfurt'$v$);

select pg_temp.check('REQ  the board carries what a carrier filters on', 'guard',
  null, 'anon',
  $a$select board = 'retur' and loading_from is not null and needs_winch = false
            and photo_count = 0 and weight_kg = 1200
     from public.v_requests_public
     where id = 'f1000000-0000-0000-0000-000000000002'$a$, 'true');

-- The whole point of returning the draft rather than raising: an hour of
-- typing must not be lost to a step that has nothing to do with the form.
select pg_temp.check('REQ  an unconfirmed phone number leaves a draft, not a hole', 'fix',
  'f0000000-0000-0000-0000-000000000007', 'authenticated',
  $a$select public.create_cargo_request(
       p_from_city => 'Graz', p_to_city => 'Arad',
       p_loading_from => current_date + 5, p_category => 'autoturism',
       p_make => 'Skoda', p_model => 'Octavia', p_year => 2015, p_is_running => true,
       p_contact_phone => '+40711000077')$a$,
  'allowed',
  p_verify => $v$select status = 'draft' from public.cargo_listings
                 where loading_city = 'Graz'$v$);

select pg_temp.check('REQ  and the draft says what is left to do', 'fix',
  'f0000000-0000-0000-0000-000000000007', 'authenticated',
  $a$select publish_error like '%telefon%' from public.create_cargo_request(
       p_from_city => 'Graz', p_to_city => 'Arad',
       p_loading_from => current_date + 5, p_category => 'autoturism',
       p_make => 'Skoda', p_model => 'Octavia', p_year => 2015, p_is_running => true,
       p_contact_phone => '+40711000077')$a$, 'true');

select pg_temp.check('REQ  a draft is not on the public board', 'fix',
  null, 'anon',
  $a$select * from public.v_requests_public
     where id = 'f1000000-0000-0000-0000-000000000002'$a$, 'blocked',
  p_setup => $s$update public.cargo_listings set status = 'draft'
                where id = 'f1000000-0000-0000-0000-000000000002'$s$);

select pg_temp.check('REQ  a firm still in review keeps its draft too', 'fix',
  'f0000000-0000-0000-0000-00000000000a', 'authenticated',
  $a$select request_status = 'draft' from public.create_cargo_request(
       p_from_city => 'Sibiu', p_to_city => 'Iași',
       p_loading_from => current_date + 4, p_category => 'autoturism',
       p_make => 'Dacia', p_model => 'Logan', p_year => 2019, p_is_running => true,
       p_company_id => 'fc000000-0000-0000-0000-000000000003')$a$, 'true');

select pg_temp.check('REQ  a firm answers on its own number', 'fix',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  $a$select public.create_cargo_request(
       p_from_city => 'Rotterdam', p_to_city => 'Constanța',
       p_loading_from => current_date + 6, p_category => 'autoturism',
       p_make => 'Volvo', p_model => 'V60', p_year => 2020, p_is_running => true,
       p_company_id => 'fc000000-0000-0000-0000-000000000002')$a$,
  'allowed',
  p_verify => $v$select c.contact_phone = '+40711000004' and l.board = 'curse'
                 from public.listing_contacts c
                 join public.cargo_listings l on l.id = c.cargo_listing_id
                 where l.loading_city = 'Rotterdam'$v$);

select pg_temp.check('REQ  nobody posts for a firm they do not belong to', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.create_cargo_request(
       p_from_city => 'Leipzig', p_to_city => 'Brașov',
       p_loading_from => current_date + 5, p_category => 'autoturism',
       p_make => 'Opel', p_model => 'Astra', p_year => 2017, p_is_running => true,
       p_company_id => 'fc000000-0000-0000-0000-000000000001')$a$,
  'blocked',
  p_verify => $v$select not exists (select 1 from public.cargo_listings
                                    where loading_city = 'Leipzig')$v$);

select pg_temp.check('REQ  a loading date that has passed is refused', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.create_cargo_request(
       p_from_city => 'Leipzig', p_to_city => 'Brașov',
       p_loading_from => current_date - 1, p_category => 'autoturism',
       p_make => 'Opel', p_model => 'Astra', p_year => 2017, p_is_running => true)$a$,
  'blocked',
  p_verify => $v$select not exists (select 1 from public.cargo_listings
                                    where loading_city = 'Leipzig')$v$);

select pg_temp.check('REQ  the owner publishes their own draft', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.publish_cargo_request('f1000000-0000-0000-0000-000000000003')$a$,
  'allowed',
  p_setup => $s$update public.cargo_listings
                set status = 'draft', published_at = null, expires_at = null
                where id = 'f1000000-0000-0000-0000-000000000003'$s$,
  p_verify => $v$select status = 'active' and published_at is not null
                    and expires_at is not null
                 from public.cargo_listings
                 where id = 'f1000000-0000-0000-0000-000000000003'$v$);

select pg_temp.check('REQ  somebody else''s draft is not theirs to publish', 'fix',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  $a$select public.publish_cargo_request('f1000000-0000-0000-0000-000000000003')$a$,
  'blocked',
  p_setup => $s$update public.cargo_listings
                set status = 'draft', published_at = null
                where id = 'f1000000-0000-0000-0000-000000000003'$s$,
  p_verify => $v$select status = 'draft' from public.cargo_listings
                 where id = 'f1000000-0000-0000-0000-000000000003'$v$);

select pg_temp.check('REQ  publishing is audited', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.publish_cargo_request('f1000000-0000-0000-0000-000000000003')$a$,
  'allowed',
  p_setup => $s$update public.cargo_listings
                set status = 'draft', published_at = null
                where id = 'f1000000-0000-0000-0000-000000000003'$s$,
  p_verify => $v$select exists (
                   select 1 from public.audit_log
                   where action = 'request.published'
                     and entity_id = 'f1000000-0000-0000-0000-000000000003'
                     and actor_user_id = 'f0000000-0000-0000-0000-000000000006')$v$);

select pg_temp.check('REQ  withdrawing takes it off the board', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.cancel_cargo_request('f1000000-0000-0000-0000-000000000002',
                                        'Am vândut mașina')$a$,
  'allowed',
  p_verify => $v$select l.status = 'cancelled'
                    and not exists (select 1 from public.v_requests_public v
                                    where v.id = l.id)
                 from public.cargo_listings l
                 where l.id = 'f1000000-0000-0000-0000-000000000002'$v$);

select pg_temp.check('REQ  the reason a request was withdrawn is kept', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.cancel_cargo_request('f1000000-0000-0000-0000-000000000002',
                                        'Am vândut mașina')$a$,
  'allowed',
  p_verify => $v$select exists (
                   select 1 from public.audit_log
                   where action = 'request.cancelled'
                     and entity_id = 'f1000000-0000-0000-0000-000000000002'
                     and reason = 'Am vândut mașina')$v$);

select pg_temp.check('REQ  another person cannot withdraw it', 'fix',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  $a$select public.cancel_cargo_request('f1000000-0000-0000-0000-000000000002')$a$,
  'blocked',
  p_verify => $v$select status = 'active' from public.cargo_listings
                 where id = 'f1000000-0000-0000-0000-000000000002'$v$);

select pg_temp.check('REQ  reopening on a date that has passed is refused', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.reopen_cargo_request('f1000000-0000-0000-0000-000000000003',
                                        current_date - 1)$a$,
  'blocked',
  p_setup => $s$update public.cargo_listings set status = 'expired'
                where id = 'f1000000-0000-0000-0000-000000000003'$s$,
  p_verify => $v$select status = 'expired' from public.cargo_listings
                 where id = 'f1000000-0000-0000-0000-000000000003'$v$);

select pg_temp.check('REQ  reopening puts it back with the new dates', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.reopen_cargo_request('f1000000-0000-0000-0000-000000000003',
                                        current_date + 10, current_date + 12)$a$,
  'allowed',
  p_setup => $s$update public.cargo_listings set status = 'expired'
                where id = 'f1000000-0000-0000-0000-000000000003'$s$,
  p_verify => $v$select status = 'active' and loading_from = current_date + 10
                    and loading_to = current_date + 12
                 from public.cargo_listings
                 where id = 'f1000000-0000-0000-0000-000000000003'$v$);

select pg_temp.check('REQ  a visitor cannot create a request', 'fix',
  null, 'anon',
  $a$select public.create_cargo_request(
       p_from_city => 'Leipzig', p_to_city => 'Brașov',
       p_loading_from => current_date + 5, p_category => 'autoturism',
       p_make => 'Opel', p_model => 'Astra', p_year => 2017, p_is_running => true)$a$,
  'blocked',
  p_verify => $v$select not exists (select 1 from public.cargo_listings
                                    where loading_city = 'Leipzig')$v$);

-- The policies allowed this; the privilege behind them did not survive
-- phase 2. A status that moves without an audit row is the whole reason.
select pg_temp.check('REQ  nobody sets a status straight from the browser', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$update public.cargo_listings set status = 'active'
     where id = 'f1000000-0000-0000-0000-000000000003'$a$,
  'blocked',
  p_setup => $s$update public.cargo_listings
                set status = 'draft', published_at = null
                where id = 'f1000000-0000-0000-0000-000000000003'$s$,
  p_verify => $v$select status = 'draft' from public.cargo_listings
                 where id = 'f1000000-0000-0000-0000-000000000003'$v$);

select pg_temp.check('REQ  nobody promotes their own request', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$update public.cargo_listings set is_promoted = true
     where id = 'f1000000-0000-0000-0000-000000000002'$a$,
  'blocked',
  p_verify => $v$select not is_promoted from public.cargo_listings
                 where id = 'f1000000-0000-0000-0000-000000000002'$v$);

select pg_temp.check('REQ  the owner still reads their own request', 'guard',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select id from public.cargo_listings
     where id = 'f1000000-0000-0000-0000-000000000002'$a$, 'allowed');

select pg_temp.check('REQ  the jobs still write listings', 'guard',
  null, 'service_role',
  $a$update public.cargo_listings set views_count = views_count + 1
     where id = 'f1000000-0000-0000-0000-000000000002'$a$, 'allowed');

-- 20260917090000 added carrier_selected and delivered and left assigned and
-- completed behind. Nothing may write the old two any more.
--
-- Narrowed to functions that touch a listing table: 20260918180000 gave
-- account_deletion_requests a 'completed' status of its own, and a source
-- scan that cannot tell one word from the other would have forced the
-- wrong name onto the new column rather than catching a real regression.
select pg_temp.check('REQ  no function writes the retired statuses', 'fix',
  null, 'anon',
  $a$select not exists (
       select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and (p.prosrc like '%''assigned''%' or p.prosrc like '%''completed''%')
         and (p.prosrc like '%cargo_listings%' or p.prosrc like '%truck_listings%'))$a$,
  'true');

-- =====================================================================
-- FIRM - the company profile (coverage, capabilities, alerts)
--
-- Migration 20260918090000 gave `companies` the half that says what the
-- firm carries, where, and with what. Three things are being checked
-- here and they are different in kind:
--
--   * who may write it — a manager, and nobody else;
--   * what shape it is stored in — the normalising trigger, which is
--     the reason every reader downstream can compare codes with `=`;
--   * what it causes — an e-mail to a carrier when a request it can do
--     turns up, and not to one it cannot.
--
-- The third is the one worth the most: a matching rule that is only in
-- TypeScript is a matching rule that stops being true the first time
-- somebody writes a script.
-- =====================================================================

select pg_temp.check('FIRM a manager states where the firm carries', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.companies
     set coverage_scope = 'judetean', coverage_counties = array['CJ', 'TM']
     where id = 'fc000000-0000-0000-0000-000000000001'$a$, 'allowed',
  p_verify => $v$select coverage_counties = array['CJ', 'TM'] from public.companies
                 where id = 'fc000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('FIRM a dispatcher does not', 'fix',
  'f0000000-0000-0000-0000-000000000003', 'authenticated',
  $a$update public.companies set coverage_scope = 'international',
         coverage_countries = array['DE']
     where id = 'fc000000-0000-0000-0000-000000000001'$a$, 'blocked',
  p_verify => $v$select coverage_scope = 'national' from public.companies
                 where id = 'fc000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('FIRM nor somebody from another firm', 'fix',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  $a$update public.companies set equipment = array['troliu']
     where id = 'fc000000-0000-0000-0000-000000000001'$a$, 'blocked',
  p_verify => $v$select equipment = '{}'::text[] from public.companies
                 where id = 'fc000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('FIRM nor a visitor', 'fix',
  null, 'anon',
  $a$update public.companies set services = array['tractare']
     where id = 'fc000000-0000-0000-0000-000000000001'$a$, 'blocked',
  p_verify => $v$select services = '{}'::text[] from public.companies
                 where id = 'fc000000-0000-0000-0000-000000000001'$v$);

-- ---------------------------------------------------------------------
-- The shape it is stored in
-- ---------------------------------------------------------------------

select pg_temp.check('FIRM a telephone number is stored one way', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.companies set contact_phone = '0722 000 111'
     where id = 'fc000000-0000-0000-0000-000000000001'$a$, 'allowed',
  p_verify => $v$select contact_phone = '+40722000111' from public.companies
                 where id = 'fc000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('FIRM and 0040 is the same number', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.companies set contact_phone = '0040-722-000-111'
     where id = 'fc000000-0000-0000-0000-000000000001'$a$, 'allowed',
  p_verify => $v$select contact_phone = '+40722000111' from public.companies
                 where id = 'fc000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('FIRM something that is not a number is refused', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.companies set contact_phone = '0722'
     where id = 'fc000000-0000-0000-0000-000000000001'$a$, 'blocked',
  p_verify => $v$select contact_phone = '+40711000002' from public.companies
                 where id = 'fc000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('FIRM a website gets the scheme nobody types', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.companies set website = 'firma-a.ro'
     where id = 'fc000000-0000-0000-0000-000000000001'$a$, 'allowed',
  p_verify => $v$select website = 'https://firma-a.ro' from public.companies
                 where id = 'fc000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('FIRM http is upgraded and the host lower-cased', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.companies set website = 'http://Firma-A.RO/Despre-Noi'
     where id = 'fc000000-0000-0000-0000-000000000001'$a$, 'allowed',
  p_verify => $v$select website = 'https://firma-a.ro/Despre-Noi' from public.companies
                 where id = 'fc000000-0000-0000-0000-000000000001'$v$);

-- Whoever copied this link out of a newsletter would otherwise have every
-- visit from this directory reported to their campaign, for years.
select pg_temp.check('FIRM the campaign that linked it is not stored', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.companies
     set website = 'https://firma-a.ro/servicii?utm_source=nl&gclid=7&pagina=2#top'
     where id = 'fc000000-0000-0000-0000-000000000001'$a$, 'allowed',
  p_verify => $v$select website = 'https://firma-a.ro/servicii?pagina=2' from public.companies
                 where id = 'fc000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('FIRM a website that is not one is refused', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.companies set website = 'firma-a'
     where id = 'fc000000-0000-0000-0000-000000000001'$a$, 'blocked');

select pg_temp.check('FIRM codes arrive sorted and said once', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.companies
     set coverage_scope = 'judetean', coverage_counties = array['tm', 'CJ', ' cj ', 'AB']
     where id = 'fc000000-0000-0000-0000-000000000001'$a$, 'allowed',
  p_verify => $v$select coverage_counties = array['AB', 'CJ', 'TM'] from public.companies
                 where id = 'fc000000-0000-0000-0000-000000000001'$v$);

-- ---------------------------------------------------------------------
-- What the columns have to add up to
-- ---------------------------------------------------------------------

select pg_temp.check('FIRM a county carrier with no county is a half-filled form', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.companies set coverage_scope = 'judetean', coverage_counties = '{}'
     where id = 'fc000000-0000-0000-0000-000000000001'$a$, 'blocked',
  p_verify => $v$select coverage_scope = 'national' from public.companies
                 where id = 'fc000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('FIRM so is an international one with no country', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.companies set coverage_scope = 'international', coverage_countries = '{}'
     where id = 'fc000000-0000-0000-0000-000000000001'$a$, 'blocked');

-- A firm that grew out of its county must not keep six counties that a
-- later reader would take for the whole truth.
select pg_temp.check('FIRM going national clears the counties behind it', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.companies set coverage_scope = 'national'
     where id = 'fc000000-0000-0000-0000-000000000001'$a$, 'allowed',
  p_setup => $s$update public.companies
                set coverage_scope = 'judetean', coverage_counties = array['CJ']
                where id = 'fc000000-0000-0000-0000-000000000001'$s$,
  p_verify => $v$select coverage_counties = '{}'::text[] from public.companies
                 where id = 'fc000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('FIRM a county that is not one of the 42 is refused', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.companies set coverage_scope = 'judetean',
         coverage_counties = array['CJ', 'ZZ']
     where id = 'fc000000-0000-0000-0000-000000000001'$a$, 'blocked');

select pg_temp.check('FIRM neither is a country code that is not one', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.companies set coverage_scope = 'international',
         coverage_countries = array['DE', 'Germania']
     where id = 'fc000000-0000-0000-0000-000000000001'$a$, 'blocked');

select pg_temp.check('FIRM a piece of kit nobody has heard of is refused', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.companies set equipment = array['troliu', 'macara_spatiala']
     where id = 'fc000000-0000-0000-0000-000000000001'$a$, 'blocked',
  p_verify => $v$select equipment = '{}'::text[] from public.companies
                 where id = 'fc000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('FIRM and so is a service that is not offered', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.companies set services = array['transport_spatial']
     where id = 'fc000000-0000-0000-0000-000000000001'$a$, 'blocked');

-- Retiring an option must not lock the firms that already have it out of
-- editing their telephone number.
select pg_temp.check('FIRM retiring an option leaves the firms that have it alone', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.companies set contact_email = 'nou@test.ro'
     where id = 'fc000000-0000-0000-0000-000000000001'$a$, 'allowed',
  p_setup => $s$update public.companies set equipment = array['troliu']
                where id = 'fc000000-0000-0000-0000-000000000001';
                update public.equipment_options set is_active = false where code = 'troliu'$s$,
  p_verify => $v$select equipment = array['troliu'] and contact_email = 'nou@test.ro'
                 from public.companies where id = 'fc000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('FIRM but it cannot be ticked again afterwards', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.companies set equipment = array['troliu']
     where id = 'fc000000-0000-0000-0000-000000000001'$a$, 'blocked',
  p_setup => $s$update public.equipment_options set is_active = false where code = 'troliu'$s$);

select pg_temp.check('FIRM a note about a rate needs a rate beside it', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.companies set indicative_rate_note = 'Negociabil peste 500 km'
     where id = 'fc000000-0000-0000-0000-000000000001'$a$, 'blocked');

select pg_temp.check('FIRM a rate nobody could mean is refused', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.companies set indicative_rate_ron_per_km = 0
     where id = 'fc000000-0000-0000-0000-000000000001'$a$, 'blocked');

select pg_temp.check('FIRM a description longer than the box is refused', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.companies set public_description = repeat('a', 301)
     where id = 'fc000000-0000-0000-0000-000000000001'$a$, 'blocked');

-- ---------------------------------------------------------------------
-- The clock on the profile
-- ---------------------------------------------------------------------

select pg_temp.check('FIRM the profile clock is not the company''s to set', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.companies set profile_updated_at = now() - interval '400 days'
     where id = 'fc000000-0000-0000-0000-000000000001'$a$, 'blocked',
  p_verify => $v$select profile_updated_at is null from public.companies
                 where id = 'fc000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('FIRM it moves when the profile does', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.companies set services = array['tractare']
     where id = 'fc000000-0000-0000-0000-000000000001'$a$, 'allowed',
  p_verify => $v$select profile_updated_at is not null from public.companies
                 where id = 'fc000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('FIRM and stays put when something else does', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.companies set contact_email = 'altul@test.ro'
     where id = 'fc000000-0000-0000-0000-000000000001'$a$, 'allowed',
  p_verify => $v$select profile_updated_at is null from public.companies
                 where id = 'fc000000-0000-0000-0000-000000000001'$v$);

-- ---------------------------------------------------------------------
-- The vocabulary
-- ---------------------------------------------------------------------

-- The same literal as `tests/unit/counties.test.ts`. Two copies of this
-- list exist — `src/lib/counties.ts` builds the checkbox grid, this one is
-- what the CHECK on coverage_counties accepts — and a county added to one
-- and not the other fails on save, which is a bad way to find out.
select pg_temp.check('FIRM the two county lists agree', 'fix',
  null, 'anon',
  $a$select (select array_agg(c order by c) from unnest(public.ro_county_codes()) as c) = array[
       'AB','AG','AR','B','BC','BH','BN','BR','BT','BV','BZ','CJ',
       'CL','CS','CT','CV','DB','DJ','GJ','GL','GR','HD','HR','IF',
       'IL','IS','MH','MM','MS','NT','OT','PH','SB','SJ','SM','SV',
       'TL','TM','TR','VL','VN','VS'
     ]$a$, 'true');

select pg_temp.check('FIRM anybody reads the options the form offers', 'fix',
  null, 'anon',
  $a$select count(*) > 5 from public.equipment_options where is_active$a$, 'true');

select pg_temp.check('FIRM a retired option is not offered any more', 'fix',
  null, 'anon',
  $a$select count(*) = 0 from public.service_options where code = 'tractare'$a$, 'true',
  p_setup => $s$update public.service_options set is_active = false where code = 'tractare'$s$);

select pg_temp.check('FIRM nobody writes an option from the browser', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$insert into public.equipment_options (code, label_ro) values ('inventat', 'Inventat')$a$,
  'blocked',
  p_verify => $v$select not exists (select 1 from public.equipment_options where code = 'inventat')$v$);

select pg_temp.check('FIRM nor changes one through the RPC without being staff', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select public.set_equipment_option('troliu', 'Troliu de mare capacitate')$a$, 'blocked',
  p_verify => $v$select label_ro = 'Troliu' from public.equipment_options where code = 'troliu'$v$);

select pg_temp.check('FIRM the platform adds one, and it is written down', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.set_service_option('transport_ambarcatiuni', 'Ambarcațiuni', null, 110)$a$,
  'allowed',
  p_verify => $v$select exists (
                   select 1 from public.service_options where code = 'transport_ambarcatiuni')
                 and exists (
                   select 1 from public.audit_log
                   where action = 'service_option.created')$v$);

select pg_temp.check('FIRM a code that would not survive a URL is refused', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.set_service_option('Transport Ambarcațiuni', 'Ambarcațiuni')$a$, 'blocked');

-- ---------------------------------------------------------------------
-- What the public profile says, and what it keeps back
-- ---------------------------------------------------------------------

select pg_temp.check('FIRM the directory carries the coverage', 'fix',
  null, 'anon',
  $a$select coverage_scope = 'international' and coverage_countries = array['DE', 'IT']
     from public.v_public_companies where cui = '90000001'$a$, 'true',
  p_setup => $s$update public.companies
                set public_profile_enabled = true, verified_at = now(),
                    coverage_scope = 'international',
                    coverage_countries = array['IT', 'DE']
                where id = 'fc000000-0000-0000-0000-000000000001'$s$);

-- A firm run from a flat should be able to say where it works without
-- publishing where it sleeps.
select pg_temp.check('FIRM a hidden base address takes the city with it', 'fix',
  null, 'anon',
  $a$select city is null and county = 'Timiș'
     from public.v_public_companies where cui = '90000001'$a$, 'true',
  p_setup => $s$update public.companies
                set public_profile_enabled = true, verified_at = now(),
                    city = 'Timișoara', county = 'Timiș', base_address_hidden = true
                where id = 'fc000000-0000-0000-0000-000000000001'$s$);

select pg_temp.check('FIRM and leaves it there when it is not hidden', 'fix',
  null, 'anon',
  $a$select city = 'Timișoara' from public.v_public_companies where cui = '90000001'$a$, 'true',
  p_setup => $s$update public.companies
                set public_profile_enabled = true, verified_at = now(),
                    city = 'Timișoara', county = 'Timiș', base_address_hidden = false
                where id = 'fc000000-0000-0000-0000-000000000001'$s$);

select pg_temp.check('FIRM the fleet count is counted, not claimed', 'fix',
  null, 'anon',
  $a$select vehicles_total = 2 from public.v_public_companies where cui = '90000001'$a$, 'true',
  p_setup => $s$update public.companies
                set public_profile_enabled = true, verified_at = now()
                where id = 'fc000000-0000-0000-0000-000000000001'$s$);

select pg_temp.check('FIRM the alert address is nobody else''s business', 'fix',
  null, 'anon', $a$select alerts_email from public.v_public_companies$a$, 'blocked',
  p_missing_ok => true);

-- ---------------------------------------------------------------------
-- The e-mail a request causes
--
-- The trigger writes to the same outbox the nightly reminders use; n8n
-- delivers it. A row here is the decision, which is the part that has to
-- be right.
-- ---------------------------------------------------------------------

select pg_temp.check('FIRM a request it can do reaches the carrier', 'fix',
  null, 'service_role',
  $a$update public.cargo_listings set status = 'active'
     where id = 'f1000000-0000-0000-0000-0000000000a1'$a$, 'allowed',
  p_setup => $s$update public.companies
                set alerts_enabled = true, coverage_scope = 'national',
                    equipment = array['troliu']
                where id = 'fc000000-0000-0000-0000-000000000001';
                insert into public.cargo_listings (id, company_id, posted_by, board,
                  listing_kind, title, loading_country, loading_city, unloading_country,
                  unloading_city, loading_from, status)
                values ('f1000000-0000-0000-0000-0000000000a1', null,
                        'f0000000-0000-0000-0000-000000000006', 'retur', 'vehicul',
                        'Logan de dus', 'RO', 'Cluj-Napoca', 'RO', 'Timișoara',
                        current_date + 4, 'draft');
                insert into public.cargo_vehicle_details (cargo_listing_id, category)
                values ('f1000000-0000-0000-0000-0000000000a1', 'autoturism')$s$,
  p_verify => $v$select exists (
                   select 1 from public.notification_outbox
                   where template = 'request_match_alert'
                     and recipient_company_id = 'fc000000-0000-0000-0000-000000000001'
                     and to_email = 'a@test.ro')$v$);

select pg_temp.check('FIRM a firm that did not ask for alerts is left alone', 'fix',
  null, 'service_role',
  $a$update public.cargo_listings set status = 'active'
     where id = 'f1000000-0000-0000-0000-0000000000a1'$a$, 'allowed',
  p_setup => $s$insert into public.cargo_listings (id, company_id, posted_by, board,
                  listing_kind, title, loading_country, loading_city, unloading_country,
                  unloading_city, loading_from, status)
                values ('f1000000-0000-0000-0000-0000000000a1', null,
                        'f0000000-0000-0000-0000-000000000006', 'retur', 'vehicul',
                        'Logan de dus', 'RO', 'Cluj-Napoca', 'RO', 'Timișoara',
                        current_date + 4, 'draft');
                insert into public.cargo_vehicle_details (cargo_listing_id, category)
                values ('f1000000-0000-0000-0000-0000000000a1', 'autoturism')$s$,
  p_verify => $v$select not exists (
                   select 1 from public.notification_outbox where template = 'request_match_alert')$v$);

select pg_temp.check('FIRM a firm is not told about its own request', 'fix',
  null, 'service_role',
  $a$update public.cargo_listings set status = 'active'
     where id = 'f1000000-0000-0000-0000-0000000000a2'$a$, 'allowed',
  p_setup => $s$update public.companies
                set alerts_enabled = true, coverage_scope = 'national'
                where id = 'fc000000-0000-0000-0000-000000000001';
                insert into public.cargo_listings (id, company_id, posted_by, board,
                  listing_kind, title, loading_country, loading_city, unloading_country,
                  unloading_city, loading_from, status)
                values ('f1000000-0000-0000-0000-0000000000a2',
                        'fc000000-0000-0000-0000-000000000001',
                        'f0000000-0000-0000-0000-000000000002', 'curse', 'vehicul',
                        'Subcontractare', 'RO', 'Cluj-Napoca', 'RO', 'Timișoara',
                        current_date + 4, 'draft');
                insert into public.cargo_vehicle_details (cargo_listing_id, category)
                values ('f1000000-0000-0000-0000-0000000000a2', 'autoturism')$s$,
  p_verify => $v$select not exists (
                   select 1 from public.notification_outbox
                   where template = 'request_match_alert'
                     and recipient_company_id = 'fc000000-0000-0000-0000-000000000001')$v$);

-- The one hard capability rule in this marketplace.
select pg_temp.check('FIRM a car that does not roll needs a firm with a winch', 'fix',
  null, 'service_role',
  $a$update public.cargo_listings set status = 'active'
     where id = 'f1000000-0000-0000-0000-0000000000a3'$a$, 'allowed',
  p_setup => $s$update public.companies
                set alerts_enabled = true, coverage_scope = 'national', equipment = '{}'
                where id = 'fc000000-0000-0000-0000-000000000001';
                insert into public.cargo_listings (id, company_id, posted_by, board,
                  listing_kind, title, loading_country, loading_city, unloading_country,
                  unloading_city, loading_from, status)
                values ('f1000000-0000-0000-0000-0000000000a3', null,
                        'f0000000-0000-0000-0000-000000000006', 'retur', 'vehicul',
                        'Nu pornește', 'RO', 'Cluj-Napoca', 'RO', 'Timișoara',
                        current_date + 4, 'draft');
                insert into public.cargo_vehicle_details (cargo_listing_id, category, is_running)
                values ('f1000000-0000-0000-0000-0000000000a3', 'autoturism', false)$s$,
  p_verify => $v$select not exists (
                   select 1 from public.notification_outbox where template = 'request_match_alert')$v$);

select pg_temp.check('FIRM and reaches the one that has it', 'fix',
  null, 'service_role',
  $a$update public.cargo_listings set status = 'active'
     where id = 'f1000000-0000-0000-0000-0000000000a3'$a$, 'allowed',
  p_setup => $s$update public.companies
                set alerts_enabled = true, coverage_scope = 'national',
                    equipment = array['troliu']
                where id = 'fc000000-0000-0000-0000-000000000001';
                insert into public.cargo_listings (id, company_id, posted_by, board,
                  listing_kind, title, loading_country, loading_city, unloading_country,
                  unloading_city, loading_from, status)
                values ('f1000000-0000-0000-0000-0000000000a3', null,
                        'f0000000-0000-0000-0000-000000000006', 'retur', 'vehicul',
                        'Nu pornește', 'RO', 'Cluj-Napoca', 'RO', 'Timișoara',
                        current_date + 4, 'draft');
                insert into public.cargo_vehicle_details (cargo_listing_id, category, is_running)
                values ('f1000000-0000-0000-0000-0000000000a3', 'autoturism', false)$s$,
  p_verify => $v$select exists (
                   select 1 from public.notification_outbox where template = 'request_match_alert')$v$);

select pg_temp.check('FIRM a national carrier is not sent a route abroad', 'fix',
  null, 'service_role',
  $a$update public.cargo_listings set status = 'active'
     where id = 'f1000000-0000-0000-0000-0000000000a4'$a$, 'allowed',
  p_setup => $s$update public.companies
                set alerts_enabled = true, coverage_scope = 'national'
                where id = 'fc000000-0000-0000-0000-000000000001';
                insert into public.cargo_listings (id, company_id, posted_by, board,
                  listing_kind, title, loading_country, loading_city, unloading_country,
                  unloading_city, loading_from, status)
                values ('f1000000-0000-0000-0000-0000000000a4', null,
                        'f0000000-0000-0000-0000-000000000006', 'retur', 'vehicul',
                        'Golf din München', 'DE', 'München', 'RO', 'Cluj-Napoca',
                        current_date + 4, 'draft');
                insert into public.cargo_vehicle_details (cargo_listing_id, category)
                values ('f1000000-0000-0000-0000-0000000000a4', 'autoturism')$s$,
  p_verify => $v$select not exists (
                   select 1 from public.notification_outbox where template = 'request_match_alert')$v$);

select pg_temp.check('FIRM a county carrier is not sent the other end of the country', 'fix',
  null, 'service_role',
  $a$update public.cargo_listings set status = 'active'
     where id = 'f1000000-0000-0000-0000-0000000000a5'$a$, 'allowed',
  p_setup => $s$update public.companies
                set alerts_enabled = true, coverage_scope = 'judetean',
                    coverage_counties = array['CJ', 'TM']
                where id = 'fc000000-0000-0000-0000-000000000001';
                insert into public.cargo_listings (id, company_id, posted_by, board,
                  listing_kind, title, loading_country, loading_county, loading_city,
                  unloading_country, unloading_county, unloading_city, loading_from, status)
                values ('f1000000-0000-0000-0000-0000000000a5', null,
                        'f0000000-0000-0000-0000-000000000006', 'retur', 'vehicul',
                        'Dacia de la mare', 'RO', 'CT', 'Constanța',
                        'RO', 'IS', 'Iași', current_date + 4, 'draft');
                insert into public.cargo_vehicle_details (cargo_listing_id, category)
                values ('f1000000-0000-0000-0000-0000000000a5', 'autoturism')$s$,
  p_verify => $v$select not exists (
                   select 1 from public.notification_outbox where template = 'request_match_alert')$v$);

select pg_temp.check('FIRM a firm that does not carry lorries is not offered one', 'fix',
  null, 'service_role',
  $a$update public.cargo_listings set status = 'active'
     where id = 'f1000000-0000-0000-0000-0000000000a6'$a$, 'allowed',
  p_setup => $s$update public.companies
                set alerts_enabled = true, coverage_scope = 'national',
                    vehicle_types_accepted = array['autoturism']::public.cargo_category[]
                where id = 'fc000000-0000-0000-0000-000000000001';
                insert into public.cargo_listings (id, company_id, posted_by, board,
                  listing_kind, title, loading_country, loading_city, unloading_country,
                  unloading_city, loading_from, status)
                values ('f1000000-0000-0000-0000-0000000000a6', null,
                        'f0000000-0000-0000-0000-000000000006', 'retur', 'vehicul',
                        'Camion de mutat', 'RO', 'Cluj-Napoca', 'RO', 'Timișoara',
                        current_date + 4, 'draft');
                insert into public.cargo_vehicle_details (cargo_listing_id, category)
                values ('f1000000-0000-0000-0000-0000000000a6', 'camion')$s$,
  p_verify => $v$select not exists (
                   select 1 from public.notification_outbox where template = 'request_match_alert')$v$);

select pg_temp.check('FIRM a firm still in review is not e-mailed', 'fix',
  null, 'service_role',
  $a$update public.cargo_listings set status = 'active'
     where id = 'f1000000-0000-0000-0000-0000000000a7'$a$, 'allowed',
  p_setup => $s$update public.companies
                set alerts_enabled = true, coverage_scope = 'national',
                    verification_status = 'pending'
                where id = 'fc000000-0000-0000-0000-000000000001';
                insert into public.cargo_listings (id, company_id, posted_by, board,
                  listing_kind, title, loading_country, loading_city, unloading_country,
                  unloading_city, loading_from, status)
                values ('f1000000-0000-0000-0000-0000000000a7', null,
                        'f0000000-0000-0000-0000-000000000006', 'retur', 'vehicul',
                        'Logan de dus', 'RO', 'Cluj-Napoca', 'RO', 'Timișoara',
                        current_date + 4, 'draft');
                insert into public.cargo_vehicle_details (cargo_listing_id, category)
                values ('f1000000-0000-0000-0000-0000000000a7', 'autoturism')$s$,
  p_verify => $v$select not exists (
                   select 1 from public.notification_outbox where template = 'request_match_alert')$v$);

-- A request withdrawn and put back is the same request, and the carrier
-- who already read about it should not read about it twice.
select pg_temp.check('FIRM republishing does not send it again', 'fix',
  null, 'service_role',
  $a$update public.cargo_listings set status = 'active'
     where id = 'f1000000-0000-0000-0000-0000000000a8'$a$, 'allowed',
  p_setup => $s$update public.companies
                set alerts_enabled = true, coverage_scope = 'national'
                where id = 'fc000000-0000-0000-0000-000000000001';
                insert into public.cargo_listings (id, company_id, posted_by, board,
                  listing_kind, title, loading_country, loading_city, unloading_country,
                  unloading_city, loading_from, status)
                values ('f1000000-0000-0000-0000-0000000000a8', null,
                        'f0000000-0000-0000-0000-000000000006', 'retur', 'vehicul',
                        'Logan de dus', 'RO', 'Cluj-Napoca', 'RO', 'Timișoara',
                        current_date + 4, 'draft');
                insert into public.cargo_vehicle_details (cargo_listing_id, category)
                values ('f1000000-0000-0000-0000-0000000000a8', 'autoturism');
                update public.cargo_listings set status = 'active'
                where id = 'f1000000-0000-0000-0000-0000000000a8';
                update public.cargo_listings set status = 'cancelled'
                where id = 'f1000000-0000-0000-0000-0000000000a8'$s$,
  p_verify => $v$select count(*) = 1 from public.notification_outbox
                 where template = 'request_match_alert'
                   and recipient_company_id = 'fc000000-0000-0000-0000-000000000001'$v$);

select pg_temp.check('FIRM a forwarder gets the route without owning the winch', 'fix',
  null, 'service_role',
  $a$update public.cargo_listings set status = 'active'
     where id = 'f1000000-0000-0000-0000-0000000000a9'$a$, 'allowed',
  p_setup => $s$update public.companies
                set alerts_enabled = true, coverage_scope = 'national', equipment = '{}'
                where id = 'fc000000-0000-0000-0000-000000000002';
                insert into public.cargo_listings (id, company_id, posted_by, board,
                  listing_kind, title, loading_country, loading_city, unloading_country,
                  unloading_city, loading_from, status)
                values ('f1000000-0000-0000-0000-0000000000a9', null,
                        'f0000000-0000-0000-0000-000000000006', 'retur', 'vehicul',
                        'Nu pornește', 'RO', 'Cluj-Napoca', 'RO', 'Timișoara',
                        current_date + 4, 'draft');
                insert into public.cargo_vehicle_details (cargo_listing_id, category, is_running)
                values ('f1000000-0000-0000-0000-0000000000a9', 'autoturism', false)$s$,
  p_verify => $v$select exists (
                   select 1 from public.notification_outbox
                   where template = 'request_match_alert'
                     and recipient_company_id = 'fc000000-0000-0000-0000-000000000002')$v$);

select pg_temp.check('FIRM the matching helper is not callable by hand', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select public.company_matches_request('fc000000-0000-0000-0000-000000000001',
                                           'f1000000-0000-0000-0000-000000000002')$a$, 'blocked');

-- =====================================================================
-- SEO - the landing pages
--
-- One rule carries the whole feature: an unpublished page does not exist
-- as far as anon is concerned. Not "visible but marked draft" — the row
-- itself is unreadable, so it cannot reach the sitemap, an internal link
-- or a render, and every one of those places gets the rule for free
-- rather than repeating an `is_published` check that somebody eventually
-- forgets.
--
-- The rest is about who may publish. Publishing is the moment a page
-- becomes visible to search engines, which is the one action here that
-- cannot be quietly undone, so it goes through an RPC that writes to
-- `audit_log` and nowhere else.
-- =====================================================================

select pg_temp.check('SEO  a visitor reads a published page', 'fix',
  null, 'anon',
  $a$select count(*) = 1 from public.seo_pages where slug = 'germania-romania'$a$, 'true',
  p_setup => $s$update public.seo_pages set is_published = true
                where slug = 'germania-romania'$s$);

select pg_temp.check('SEO  and cannot see an unpublished one at all', 'fix',
  null, 'anon',
  $a$select count(*) = 0 from public.seo_pages where slug = 'germania-romania'$a$, 'true');

select pg_temp.check('SEO  the whole starting set ships unpublished', 'fix',
  null, 'anon',
  $a$select count(*) = 0 from public.seo_pages$a$, 'true');

select pg_temp.check('SEO  a signed-in visitor sees no more than anon', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select count(*) = 0 from public.seo_pages$a$, 'true');

select pg_temp.check('SEO  staff read the drafts, which is the point of drafts', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select count(*) = 161 from public.seo_pages$a$, 'true');

-- 9 corridors, 105 city pairs, 42 counties, 5 vehicle types.
select pg_temp.check('SEO  the starting set is the set that was promised', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select
       count(*) filter (where type = 'corridor_international') = 9
       and count(*) filter (where type = 'route_internal') = 105
       and count(*) filter (where type = 'county') = 42
       and count(*) filter (where type = 'vehicle_type') = 5
     from public.seo_pages$a$, 'true');

select pg_temp.check('SEO  the slugs are the ones the brief named', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select count(*) = 4 from public.seo_pages
     where slug in ('germania-romania', 'bucuresti-cluj-napoca', 'cluj', 'motocicleta')$a$,
  'true');

-- ---------------------------------------------------------------------
-- Writing
-- ---------------------------------------------------------------------

select pg_temp.check('SEO  nobody writes a page straight from the browser', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.seo_pages set title = 'Titlu inventat de cineva'
     where slug = 'germania-romania'$a$, 'blocked',
  p_verify => $v$select title <> 'Titlu inventat de cineva' from public.seo_pages
                 where slug = 'germania-romania'$v$);

select pg_temp.check('SEO  nor publishes one', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.seo_pages set is_published = true where slug = 'germania-romania'$a$,
  'blocked',
  p_verify => $v$select not is_published from public.seo_pages
                 where slug = 'germania-romania'$v$);

select pg_temp.check('SEO  nor inserts one of their own', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$insert into public.seo_pages (type, slug, title, h1, intro, vehicle_type)
     values ('vehicle_type', 'pagina-mea', 'Un titlu suficient de lung aici',
             'Un titlu', 'O introducere suficient de lungă ca să treacă de constrângere.',
             'autoturism')$a$, 'blocked',
  p_verify => $v$select not exists (select 1 from public.seo_pages where slug = 'pagina-mea')$v$);

select pg_temp.check('SEO  the RPC refuses somebody who is not staff', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select public.set_seo_page('germania-romania', 'Titlu nou și suficient de lung',
                                'Titlu nou', null,
                                'O introducere nouă, suficient de lungă ca să treacă.', null)$a$,
  'blocked');

select pg_temp.check('SEO  and refuses them the publish button too', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select public.set_seo_page_published('germania-romania', true)$a$, 'blocked',
  p_verify => $v$select not is_published from public.seo_pages
                 where slug = 'germania-romania'$v$);

select pg_temp.check('SEO  staff edit the words, and it is written down', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.set_seo_page('germania-romania',
       'Transport auto Germania România — titlu nou',
       'Transport auto Germania — România', 'cu firme verificate.',
       'O introducere nouă, scrisă de cineva care a citit pagina înainte să o publice.',
       null)$a$, 'allowed',
  p_verify => $v$select exists (
                   select 1 from public.seo_pages
                   where slug = 'germania-romania' and h1_soft = 'cu firme verificate.')
                 and exists (
                   select 1 from public.audit_log where action = 'seo_page.updated')$v$);

select pg_temp.check('SEO  staff publish one, and that is written down too', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.set_seo_page_published('germania-romania', true)$a$, 'allowed',
  p_verify => $v$select exists (
                   select 1 from public.seo_pages
                   where slug = 'germania-romania' and is_published and published_at is not null)
                 and exists (
                   select 1 from public.audit_log where action = 'seo_page.published')$v$);

-- Unpublishing has to leave no trace of having been published, or the
-- sitemap keeps a lastmod for a page that is no longer there.
select pg_temp.check('SEO  unpublishing clears the publication date', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.set_seo_page_published('germania-romania', false)$a$, 'allowed',
  p_setup => $s$update public.seo_pages set is_published = true, published_at = now()
                where slug = 'germania-romania'$s$,
  p_verify => $v$select exists (
                   select 1 from public.seo_pages
                   where slug = 'germania-romania' and not is_published
                     and published_at is null)$v$);

-- Publishing forty-two county pages one at a time is how a person ends up
-- publishing forty-one.
select pg_temp.check('SEO  staff publish a whole type at once', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.set_seo_pages_published_by_type('county', true) = 42$a$, 'true',
  p_verify => $v$select count(*) = 42 from public.seo_pages
                 where type = 'county' and is_published$v$);

select pg_temp.check('SEO  and the bulk publish does not touch another type', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.set_seo_pages_published_by_type('county', true) > 0$a$, 'true',
  p_verify => $v$select count(*) = 0 from public.seo_pages
                 where type <> 'county' and is_published$v$);

select pg_temp.check('SEO  a bulk publish nobody else may run', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select public.set_seo_pages_published_by_type('county', true)$a$, 'blocked',
  p_verify => $v$select count(*) = 0 from public.seo_pages where is_published$v$);

-- ---------------------------------------------------------------------
-- What the words have to be
-- ---------------------------------------------------------------------

-- An entry with no answer renders an empty accordion row and, worse, an
-- FAQPage entry with an empty acceptedAnswer — a structured-data error on
-- a page whose whole purpose is structured data.
select pg_temp.check('SEO  a question with no answer is refused', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.set_seo_page('germania-romania', 'Un titlu suficient de lung aici',
       'Un titlu', null, 'O introducere suficient de lungă ca să treacă de constrângere.',
       '[{"q": "O întrebare fără răspuns?", "a": ""}]'::jsonb)$a$, 'blocked');

select pg_temp.check('SEO  and so is a list of questions that is not a list', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.set_seo_page('germania-romania', 'Un titlu suficient de lung aici',
       'Un titlu', null, 'O introducere suficient de lungă ca să treacă de constrângere.',
       '{"q": "Nu sunt o listă"}'::jsonb)$a$, 'blocked');

select pg_temp.check('SEO  a title too short for a search result is refused', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.set_seo_page('germania-romania', 'Scurt', 'Un titlu', null,
       'O introducere suficient de lungă ca să treacă de constrângere.', null)$a$, 'blocked');

select pg_temp.check('SEO  a slug with spaces in it never gets written', 'fix',
  null, 'service_role',
  $a$insert into public.seo_pages (type, slug, title, h1, intro, vehicle_type)
     values ('vehicle_type', 'nu e slug', 'Un titlu suficient de lung aici', 'Un titlu',
             'O introducere suficient de lungă ca să treacă de constrângere.',
             'autoturism')$a$, 'blocked');

-- A page of a type that needs two ends and has one renders an empty block
-- nobody notices until it is indexed.
select pg_temp.check('SEO  a corridor with no destination is refused', 'fix',
  null, 'service_role',
  $a$insert into public.seo_pages (type, slug, title, h1, intro, origin)
     values ('corridor_international', 'undeva-romania', 'Un titlu suficient de lung aici',
             'Un titlu', 'O introducere suficient de lungă ca să treacă de constrângere.',
             'DE')$a$, 'blocked');

select pg_temp.check('SEO  a county page with no county is refused', 'fix',
  null, 'service_role',
  $a$insert into public.seo_pages (type, slug, title, h1, intro)
     values ('county', 'un-judet', 'Un titlu suficient de lung aici', 'Un titlu',
             'O introducere suficient de lungă ca să treacă de constrângere.')$a$, 'blocked');

select pg_temp.check('SEO  two pages cannot share a slug', 'fix',
  null, 'service_role',
  $a$insert into public.seo_pages (type, slug, title, h1, intro, vehicle_type)
     values ('vehicle_type', 'motocicleta', 'Un titlu suficient de lung aici', 'Un titlu',
             'O introducere suficient de lungă ca să treacă de constrângere.',
             'autoturism')$a$, 'blocked');

select pg_temp.check('SEO  the jobs still read every page', 'guard',
  null, 'service_role', $a$select count(*) = 161 from public.seo_pages$a$, 'true');

-- =====================================================================
-- PUSH - subscriptions, preferences and when not to send
--
-- Two things are being protected here and they are different in kind.
--
-- The first is the keys. A `push_subscriptions` row carries the pair that
-- lets anyone send a notification to that browser, so the policy is the
-- owner and nobody else — no admin bypass, which is unusual in this
-- schema and deliberate. The checks below prove it for the platform team
-- as well as for a stranger.
--
-- The second is the person's attention. A channel that ignores quiet
-- hours or sends thirty in an hour is a channel that gets switched off at
-- the operating system, and there is no policy that gets it back. So the
-- rate limit, the digest and the quiet-hour hold are checked as carefully
-- as the access rules.
-- =====================================================================

-- ---------------------------------------------------------------------
-- The keys
-- ---------------------------------------------------------------------

select pg_temp.check('PUSH a person subscribes this browser', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
     values (auth.uid(), 'https://push.example/aaa', 'k1', 'a1')$a$, 'allowed',
  p_verify => $v$select exists (
                   select 1 from public.push_subscriptions
                   where endpoint = 'https://push.example/aaa')$v$);

select pg_temp.check('PUSH but not one for somebody else', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
     values ('f0000000-0000-0000-0000-000000000002', 'https://push.example/bbb', 'k1', 'a1')$a$,
  'blocked',
  p_verify => $v$select not exists (
                   select 1 from public.push_subscriptions
                   where endpoint = 'https://push.example/bbb')$v$);

select pg_temp.check('PUSH nobody reads another person''s subscription', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select count(*) = 0 from public.push_subscriptions$a$, 'true',
  p_setup => $s$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
                values ('f0000000-0000-0000-0000-000000000006',
                        'https://push.example/ccc', 'secret-key', 'secret-auth')$s$);

-- The unusual one. Everywhere else in this schema the platform team can
-- read what it needs; here it cannot, because what the row carries is the
-- ability to send to somebody's telephone.
select pg_temp.check('PUSH not even the platform team reads the keys', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select count(*) = 0 from public.push_subscriptions$a$, 'true',
  p_setup => $s$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
                values ('f0000000-0000-0000-0000-000000000006',
                        'https://push.example/ddd', 'secret-key', 'secret-auth')$s$);

select pg_temp.check('PUSH but the team can count them', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select (public.push_subscription_stats()).active = 2$a$, 'true',
  p_setup => $s$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
                values ('f0000000-0000-0000-0000-000000000006', 'https://push.example/e1', 'k', 'a'),
                       ('f0000000-0000-0000-0000-000000000002', 'https://push.example/e2', 'k', 'a')$s$);

select pg_temp.check('PUSH a disabled subscription is not counted as active', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select active = 0 and total = 1 from public.push_subscription_stats()$a$, 'true',
  p_setup => $s$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, disabled_at)
                values ('f0000000-0000-0000-0000-000000000006', 'https://push.example/gone',
                        'k', 'a', now())$s$);

select pg_temp.check('PUSH a person removes their own device', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$delete from public.push_subscriptions where endpoint = 'https://push.example/own'$a$,
  'allowed',
  p_setup => $s$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
                values ('f0000000-0000-0000-0000-000000000006', 'https://push.example/own', 'k', 'a')$s$,
  p_verify => $v$select not exists (
                   select 1 from public.push_subscriptions
                   where endpoint = 'https://push.example/own')$v$);

select pg_temp.check('PUSH and cannot remove somebody else''s', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$delete from public.push_subscriptions where endpoint = 'https://push.example/theirs'$a$,
  'blocked',
  p_setup => $s$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
                values ('f0000000-0000-0000-0000-000000000006', 'https://push.example/theirs', 'k', 'a')$s$,
  p_verify => $v$select exists (
                   select 1 from public.push_subscriptions
                   where endpoint = 'https://push.example/theirs')$v$);

select pg_temp.check('PUSH a visitor cannot touch them at all', 'fix',
  null, 'anon',
  $a$select count(*) from public.push_subscriptions$a$, 'blocked',
  p_missing_ok => true);

-- ---------------------------------------------------------------------
-- The preferences
-- ---------------------------------------------------------------------

select pg_temp.check('PUSH a person sets their own preference', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$insert into public.notification_preferences (user_id, type, push)
     values (auth.uid(), 'request_match', false)$a$, 'allowed',
  p_verify => $v$select exists (
                   select 1 from public.notification_preferences
                   where user_id = 'f0000000-0000-0000-0000-000000000006'
                     and type = 'request_match' and push = false)$v$);

select pg_temp.check('PUSH and not somebody else''s', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$insert into public.notification_preferences (user_id, type, push)
     values ('f0000000-0000-0000-0000-000000000002', 'request_match', false)$a$, 'blocked',
  p_verify => $v$select not exists (
                   select 1 from public.notification_preferences
                   where user_id = 'f0000000-0000-0000-0000-000000000002')$v$);

-- The two messages that explain why an account stopped working.
select pg_temp.check('PUSH a suspension cannot be silenced in the app', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$insert into public.notification_preferences (user_id, type, inapp)
     values (auth.uid(), 'company_suspended', false)$a$, 'blocked');

select pg_temp.check('PUSH nor on e-mail', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$insert into public.notification_preferences (user_id, type, email)
     values (auth.uid(), 'company_suspended', false)$a$, 'blocked');

-- Push is different: somebody who turned push off everywhere did so on
-- purpose, and overriding that is how an app gets its notifications
-- revoked at the operating system.
select pg_temp.check('PUSH but push can be turned off even for that', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$insert into public.notification_preferences (user_id, type, push)
     values (auth.uid(), 'company_suspended', false)$a$, 'allowed',
  p_verify => $v$select not public.notification_channel_enabled(
                   'f0000000-0000-0000-0000-000000000006', 'company_suspended', 'push')$v$);

select pg_temp.check('PUSH a mandatory type reads as on however the row looks', 'fix',
  null, 'service_role',
  $a$select public.notification_channel_enabled(
       'f0000000-0000-0000-0000-000000000006', 'company_suspended', 'inapp')$a$, 'true');

select pg_temp.check('PUSH a preference for a type that does not exist is refused', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$insert into public.notification_preferences (user_id, type, push)
     values (auth.uid(), 'tip_inventat', true)$a$, 'blocked');

-- ---------------------------------------------------------------------
-- Which channel is on
-- ---------------------------------------------------------------------

select pg_temp.check('PUSH the type default applies when nothing was set', 'fix',
  null, 'service_role',
  $a$select public.notification_channel_enabled(
       'f0000000-0000-0000-0000-000000000006', 'request_match', 'push')$a$, 'true');

select pg_temp.check('PUSH an override wins over the default', 'fix',
  null, 'service_role',
  $a$select not public.notification_channel_enabled(
       'f0000000-0000-0000-0000-000000000006', 'request_match', 'push')$a$, 'true',
  p_setup => $s$insert into public.notification_preferences (user_id, type, push)
                values ('f0000000-0000-0000-0000-000000000006', 'request_match', false)$s$);

-- A type with no screen behind it is off on every channel whatever
-- anybody set, because a push that opens a 404 spends the one tap a
-- person gives you.
select pg_temp.check('PUSH a type with no screen is off on every channel', 'fix',
  null, 'service_role',
  $a$select not public.notification_channel_enabled(
           'f0000000-0000-0000-0000-000000000006', 'offer_received', 'push')
       and not public.notification_channel_enabled(
           'f0000000-0000-0000-0000-000000000006', 'offer_received', 'email')$a$, 'true',
  p_setup => $s$insert into public.notification_preferences (user_id, type, push, email)
                values ('f0000000-0000-0000-0000-000000000006', 'offer_received', true, true)$s$);

-- ---------------------------------------------------------------------
-- When a push actually leaves
-- ---------------------------------------------------------------------

select pg_temp.check('PUSH nothing is queued for a person with no device', 'fix',
  null, 'service_role',
  $a$select public.queue_push('f0000000-0000-0000-0000-000000000006', 'request_match',
                              'Titlu', 'Corp') is null$a$, 'true');

select pg_temp.check('PUSH nothing is queued for a channel that is off', 'fix',
  null, 'service_role',
  $a$select public.queue_push('f0000000-0000-0000-0000-000000000006', 'request_match',
                              'Titlu', 'Corp') is null$a$, 'true',
  p_setup => $s$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
                values ('f0000000-0000-0000-0000-000000000006', 'https://push.example/q1', 'k', 'a');
                insert into public.notification_preferences (user_id, type, push)
                values ('f0000000-0000-0000-0000-000000000006', 'request_match', false)$s$);

select pg_temp.check('PUSH nothing is queued for a type with no screen', 'fix',
  null, 'service_role',
  $a$select public.queue_push('f0000000-0000-0000-0000-000000000006', 'offer_received',
                              'Titlu', 'Corp') is null$a$, 'true',
  p_setup => $s$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
                values ('f0000000-0000-0000-0000-000000000006', 'https://push.example/q2', 'k', 'a')$s$);

select pg_temp.check('PUSH a wanted notification is queued, with its deep link', 'fix',
  null, 'service_role',
  $a$select public.queue_push('f0000000-0000-0000-0000-000000000006', 'request_match',
         'Cerere nouă', 'München — Cluj-Napoca',
         jsonb_build_object('id', 'f1000000-0000-0000-0000-000000000002')) is not null$a$,
  'true',
  p_setup => $s$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
                values ('f0000000-0000-0000-0000-000000000006', 'https://push.example/q3', 'k', 'a')$s$,
  p_verify => $v$select exists (
                   select 1 from public.notification_outbox
                   where channel = 'push' and template = 'request_match'
                     and payload ->> 'deep_link' = '/cereri/f1000000-0000-0000-0000-000000000002'
                     and payload ->> 'tag' = 'request_match')$v$);

-- The same event twice is one notification. A person who sees the same
-- request buzz twice stops trusting the channel.
select pg_temp.check('PUSH the same event does not queue twice', 'fix',
  null, 'service_role',
  $a$select public.queue_push('f0000000-0000-0000-0000-000000000006', 'request_match',
         'Cerere nouă', 'Corp', '{}'::jsonb, 'req:abc') is null$a$, 'true',
  p_setup => $s$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
                values ('f0000000-0000-0000-0000-000000000006', 'https://push.example/q4', 'k', 'a');
                select public.queue_push('f0000000-0000-0000-0000-000000000006',
                  'request_match', 'Cerere nouă', 'Corp', '{}'::jsonb, 'req:abc')$s$,
  p_verify => $v$select count(*) = 1 from public.notification_outbox
                 where dedupe_key = 'req:abc'$v$);

-- Quiet hours: 20:30 UTC in January is 22:30 in Bucharest.
select pg_temp.check('PUSH a night-time notification waits for the morning', 'fix',
  null, 'service_role',
  $a$select public.queue_push('f0000000-0000-0000-0000-000000000006', 'request_match',
         'Cerere nouă', 'Corp', '{}'::jsonb, null,
         '2026-01-15 20:30:00+00'::timestamptz) is not null$a$, 'true',
  p_setup => $s$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
                values ('f0000000-0000-0000-0000-000000000006', 'https://push.example/q5', 'k', 'a')$s$,
  p_verify => $v$select exists (
                   select 1 from public.notification_outbox
                   where channel = 'push'
                     and (send_after at time zone 'Europe/Bucharest')::time = '07:00')$v$);

-- The one a UTC comparison gets wrong: 19:30 UTC in July is also 22:30
-- local, because Romania is UTC+3 in summer.
select pg_temp.check('PUSH and so does one in summer, when the offset differs', 'fix',
  null, 'service_role',
  $a$select public.queue_push('f0000000-0000-0000-0000-000000000006', 'request_match',
         'Cerere nouă', 'Corp', '{}'::jsonb, null,
         '2026-07-15 19:30:00+00'::timestamptz) is not null$a$, 'true',
  p_setup => $s$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
                values ('f0000000-0000-0000-0000-000000000006', 'https://push.example/q6', 'k', 'a')$s$,
  p_verify => $v$select exists (
                   select 1 from public.notification_outbox
                   where channel = 'push'
                     and (send_after at time zone 'Europe/Bucharest')::time = '07:00')$v$);

select pg_temp.check('PUSH a suspension does not wait for the morning', 'fix',
  null, 'service_role',
  $a$select public.queue_push('f0000000-0000-0000-0000-000000000006', 'company_suspended',
         'Cont suspendat', 'Corp', '{}'::jsonb, null,
         '2026-01-15 20:30:00+00'::timestamptz) is not null$a$, 'true',
  p_setup => $s$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
                values ('f0000000-0000-0000-0000-000000000006', 'https://push.example/q7', 'k', 'a')$s$,
  p_verify => $v$select exists (
                   select 1 from public.notification_outbox
                   where channel = 'push' and template = 'company_suspended'
                     and send_after = '2026-01-15 20:30:00+00'::timestamptz)$v$);

select pg_temp.check('PUSH a daytime notification goes straight out', 'fix',
  null, 'service_role',
  $a$select public.queue_push('f0000000-0000-0000-0000-000000000006', 'request_match',
         'Cerere nouă', 'Corp', '{}'::jsonb, null,
         '2026-07-15 09:00:00+00'::timestamptz) is not null$a$, 'true',
  p_setup => $s$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
                values ('f0000000-0000-0000-0000-000000000006', 'https://push.example/q8', 'k', 'a')$s$,
  p_verify => $v$select exists (
                   select 1 from public.notification_outbox
                   where channel = 'push'
                     and send_after = '2026-07-15 09:00:00+00'::timestamptz)$v$);

-- Thirty buzzes in an hour is a disabled channel, and there is no policy
-- that gets one back.
select pg_temp.check('PUSH past the cap, the rest of the hour is one digest', 'fix',
  null, 'service_role',
  $a$select public.queue_push('f0000000-0000-0000-0000-000000000006', 'request_match',
         'Cerere nouă', 'Corp', '{}'::jsonb, null,
         '2026-07-15 09:00:00+00'::timestamptz) is not null$a$, 'true',
  p_setup => $s$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
                values ('f0000000-0000-0000-0000-000000000006', 'https://push.example/q9', 'k', 'a');
                insert into public.notification_settings (user_id, max_push_per_hour)
                values ('f0000000-0000-0000-0000-000000000006', 2);
                insert into public.notification_outbox
                  (channel, template, recipient_user_id, created_at)
                select 'push', 'request_match', 'f0000000-0000-0000-0000-000000000006',
                       '2026-07-15 08:30:00+00'
                from generate_series(1, 2)$s$,
  p_verify => $v$select exists (
                   select 1 from public.notification_outbox
                   where template = 'push_digest')$v$);

select pg_temp.check('PUSH and a second one folds into the same digest', 'fix',
  null, 'service_role',
  $a$select public.queue_push('f0000000-0000-0000-0000-000000000006', 'request_match',
         'A treia', 'Corp', '{}'::jsonb, null,
         '2026-07-15 09:10:00+00'::timestamptz) is null$a$, 'true',
  p_setup => $s$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
                values ('f0000000-0000-0000-0000-000000000006', 'https://push.example/qa', 'k', 'a');
                insert into public.notification_settings (user_id, max_push_per_hour)
                values ('f0000000-0000-0000-0000-000000000006', 2);
                insert into public.notification_outbox
                  (channel, template, recipient_user_id, created_at)
                select 'push', 'request_match', 'f0000000-0000-0000-0000-000000000006',
                       '2026-07-15 08:40:00+00'
                from generate_series(1, 2);
                select public.queue_push('f0000000-0000-0000-0000-000000000006',
                  'request_match', 'A doua', 'Corp', '{}'::jsonb, null,
                  '2026-07-15 09:00:00+00'::timestamptz)$s$,
  p_verify => $v$select count(*) = 1 from public.notification_outbox
                 where template = 'push_digest'$v$);

-- ---------------------------------------------------------------------
-- A firm's notification reaches people, because a firm has no browser
-- ---------------------------------------------------------------------

select pg_temp.check('PUSH a firm''s notification reaches each member once', 'fix',
  null, 'service_role',
  $a$select public.queue_push_for_company('fc000000-0000-0000-0000-000000000001',
         'document_expiry', 'Document care expiră', 'ITP', '{}'::jsonb, 'doc:1') = 2$a$,
  'true',
  p_setup => $s$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
                values ('f0000000-0000-0000-0000-000000000002', 'https://push.example/m1', 'k', 'a'),
                       ('f0000000-0000-0000-0000-000000000003', 'https://push.example/m2', 'k', 'a')$s$,
  p_verify => $v$select count(*) = 2 from public.notification_outbox
                 where template = 'document_expiry' and channel = 'push'$v$);

-- One key shared by five members would deliver to exactly one of them.
select pg_temp.check('PUSH the dedupe key is per member, not per firm', 'fix',
  null, 'service_role',
  $a$select public.queue_push_for_company('fc000000-0000-0000-0000-000000000001',
         'document_expiry', 'Document care expiră', 'ITP', '{}'::jsonb, 'doc:2') = 2$a$,
  'true',
  p_setup => $s$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
                values ('f0000000-0000-0000-0000-000000000002', 'https://push.example/m3', 'k', 'a'),
                       ('f0000000-0000-0000-0000-000000000003', 'https://push.example/m4', 'k', 'a')$s$,
  p_verify => $v$select count(distinct dedupe_key) = 2 from public.notification_outbox
                 where template = 'document_expiry'$v$);

-- ---------------------------------------------------------------------
-- The test button
-- ---------------------------------------------------------------------

select pg_temp.check('PUSH the test button says so when there is no device', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.send_test_push()$a$, 'blocked');

select pg_temp.check('PUSH and sends one when there is', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.send_test_push() is not null$a$, 'true',
  p_setup => $s$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
                values ('f0000000-0000-0000-0000-000000000006', 'https://push.example/t1', 'k', 'a')$s$,
  p_verify => $v$select exists (
                   select 1 from public.notification_outbox
                   where template = 'push_test'
                     and payload ->> 'deep_link' = '/cont/setari/notificari')$v$);

select pg_temp.check('PUSH a visitor cannot send themselves one', 'fix',
  null, 'anon', $a$select public.send_test_push()$a$, 'blocked');

select pg_temp.check('PUSH nobody queues a push by hand from the browser', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.queue_push(auth.uid(), 'request_match', 'Titlu', 'Corp')$a$, 'blocked');

-- ---------------------------------------------------------------------
-- The two booking events
--
-- Both have a screen and neither had a producer, so the preference rows
-- would have been switches over nothing. A reservation is the one
-- notification in this set with a deadline attached: a carrier who does
-- not see it loses the booking, and the person who made it waits for an
-- answer that is not coming.
-- ---------------------------------------------------------------------

select pg_temp.check('PUSH a new reservation reaches the carrier', 'fix',
  null, 'service_role',
  $a$insert into public.departure_bookings (truck_listing_id, cargo_listing_id, slots, status)
     values ('fb000000-0000-0000-0000-000000000004',
             'f1000000-0000-0000-0000-000000000003', 1, 'reserved')$a$, 'allowed',
  p_setup => $s$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
                values ('f0000000-0000-0000-0000-000000000002', 'https://push.example/b1', 'k', 'a')$s$,
  p_verify => $v$select exists (
                   select 1 from public.notification_outbox
                   where channel = 'push' and template = 'booking_to_confirm')$v$);

select pg_temp.check('PUSH and does not wait for the morning', 'fix',
  null, 'service_role',
  $a$insert into public.departure_bookings (truck_listing_id, cargo_listing_id, slots, status)
     values ('fb000000-0000-0000-0000-000000000004',
             'f1000000-0000-0000-0000-000000000003', 1, 'reserved')$a$, 'allowed',
  p_setup => $s$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
                values ('f0000000-0000-0000-0000-000000000002', 'https://push.example/b2', 'k', 'a')$s$,
  p_verify => $v$select exists (
                   select 1 from public.notification_outbox
                   where template = 'booking_to_confirm' and send_after <= now() + interval '1 minute')$v$);

-- A reservation sitting in the window for three hours is mentioned once
-- an hour, not once per run of a job that runs every hour anyway.
select pg_temp.check('PUSH a lapsing reservation is mentioned once an hour', 'fix',
  null, 'service_role',
  $a$select public.queue_booking_expiry_alerts() = 0$a$, 'true',
  p_setup => $s$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
                values ('f0000000-0000-0000-0000-000000000002', 'https://push.example/b3', 'k', 'a');
                update public.departure_bookings
                set status = 'reserved', expires_at = now() + interval '2 hours'
                where id = 'f6000000-0000-0000-0000-000000000001';
                select public.queue_booking_expiry_alerts()$s$,
  p_verify => $v$select count(*) = 1 from public.notification_outbox
                 where template = 'booking_expiring'$v$);

select pg_temp.check('PUSH a reservation with no deadline is left alone', 'fix',
  null, 'service_role',
  $a$select public.queue_booking_expiry_alerts() = 0$a$, 'true',
  p_setup => $s$insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
                values ('f0000000-0000-0000-0000-000000000002', 'https://push.example/b4', 'k', 'a');
                update public.departure_bookings
                set status = 'reserved', expires_at = null
                where id = 'f6000000-0000-0000-0000-000000000001'$s$);

select pg_temp.check('PUSH the jobs still queue and drain', 'guard',
  null, 'service_role',
  $a$select public.push_sent_last_hour('f0000000-0000-0000-0000-000000000006') = 0$a$, 'true');

-- =====================================================================
-- P4 - concurrency: two accepts on the same listing, at the same time
--
-- Two real connections (dblink). The first accepts OC1 and holds its
-- transaction open; the second tries OC2 and must block on the listing lock.
-- When the first commits, the second must fail, leaving exactly one
-- accepted offer and one transport. This one commits for real.
-- =====================================================================
do $$
declare
  v_conn text := format('dbname=%s port=%s', current_database(), current_setting('port'));
  v_setup constant text := $q$set local role authenticated; set local "request.jwt.claim.sub" = 'f0000000-0000-0000-0000-000000000002'$q$;
  v_waited boolean := false;
  v_second_error text;
  v_detail text;
  v_pass boolean := false;
begin
  perform dblink_connect('rls_c1', v_conn);
  perform dblink_connect('rls_c2', v_conn);
  begin
    perform dblink_exec('rls_c1', 'begin');
    perform dblink_exec('rls_c1', v_setup);
    perform 1 from dblink('rls_c1', $q$select (public.accept_offer('f2000000-0000-0000-0000-000000000006')).id::text$q$) as t(id text);

    perform dblink_exec('rls_c2', 'begin');
    perform dblink_exec('rls_c2', v_setup);
    perform dblink_send_query('rls_c2', $q$select (public.accept_offer('f2000000-0000-0000-0000-000000000007')).id::text$q$);

    for i in 1..100 loop
      select exists (
        select 1 from pg_stat_activity
        where query like '%f2000000-0000-0000-0000-000000000007%' and wait_event_type = 'Lock'
      ) into v_waited;
      exit when v_waited;
      perform pg_sleep(0.05);
    end loop;

    perform dblink_exec('rls_c1', 'commit');

    perform 1 from dblink_get_result('rls_c2', false) as t(id text);
    v_second_error := nullif(dblink_error_message('rls_c2'), 'OK');
    perform 1 from dblink_get_result('rls_c2', false) as t(id text);
    perform dblink_exec('rls_c2', 'rollback');

    v_pass := v_waited
      and v_second_error is not null
      and (select status from public.offers where id = 'f2000000-0000-0000-0000-000000000006') = 'accepted'
      and (select status from public.offers where id = 'f2000000-0000-0000-0000-000000000007') = 'rejected'
      and (select count(*) from public.transports where truck_listing_id = 'fb000000-0000-0000-0000-000000000005') = 1;
    v_detail := format('second accept waited on the lock: %s; second accept error: %s',
                       v_waited, coalesce(v_second_error, 'none'));
  exception when others then
    v_detail := 'error: ' || sqlerrm;
  end;
  perform dblink_disconnect('rls_c1');
  perform dblink_disconnect('rls_c2');

  insert into rls_results (label, kind, pass, detail)
  values ('P4   two simultaneous accepts on one listing: the second waits, then fails; one transport', 'fix',
          v_pass, v_detail);
end $$;

-- =====================================================================
-- Listing import: the quota is the whole protection
--
-- A model call costs money and the caller is the party being limited, so
-- every check here is one of three things: the counter cannot be reached,
-- the counter cannot be avoided, and nothing about a third-party page is
-- kept.
--
-- Each check runs in its own rolled-back transaction, so the setup of one
-- is never the state of the next. Where a check needs an attempt on
-- record, it claims one itself.
-- =====================================================================

select pg_temp.check('IMP the limits are readable by anyone, logged out included', 'fix',
  null, 'anon',
  $a$select count(*) = 1 from public.import_settings$a$, 'true');

select pg_temp.check('IMP a user cannot raise their own daily limit', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$update public.import_settings set daily_limit_per_user = 5000 where id$a$, 'blocked',
  p_verify => $v$select daily_limit_per_user = 10 from public.import_settings where id$v$);

select pg_temp.check('IMP nor through the settings RPC', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.set_import_settings(true, 5000, 500, 9999, 80, 0.1)$a$, 'blocked');

select pg_temp.check('IMP staff can, and it is audited', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.set_import_settings(true, 12, 3, 50, 80, 0.70)$a$, 'allowed',
  p_verify => $v$select (select daily_limit_per_user from public.import_settings where id) = 12
                 and exists (select 1 from public.audit_log
                             where action = 'import_settings.update')$v$);

-- ---------------------------------------------------------------------
-- The counter is out of reach of the party being counted
-- ---------------------------------------------------------------------
select pg_temp.check('IMP nobody writes an extraction row by hand', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$insert into public.listing_extractions (user_id, source_type, status)
     values (auth.uid(), 'link', 'ok')$a$, 'blocked');

select pg_temp.check('IMP nor deletes one to get the allowance back', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$delete from public.listing_extractions$a$, 'blocked',
  p_setup => $s$select public.claim_import_slot(
                  'f0000000-0000-0000-0000-000000000006', null, 'link')$s$,
  p_verify => $v$select count(*) = 1 from public.listing_extractions$v$);

select pg_temp.check('IMP a person cannot claim a slot themselves', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.claim_import_slot(auth.uid(), null, 'link')$a$, 'blocked');

select pg_temp.check('IMP nor can an anonymous visitor', 'fix',
  null, 'anon',
  $a$select public.claim_import_slot(null, 'ip-hash-a', 'link')$a$, 'blocked');

select pg_temp.check('IMP nobody closes their own row to hide the cost', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.finish_import(
       (select id from public.listing_extractions limit 1), 'ok', 10, 1, 1, 0)$a$, 'blocked',
  p_setup => $s$select public.claim_import_slot(
                  'f0000000-0000-0000-0000-000000000006', null, 'link')$s$,
  p_verify => $v$select status = 'running' from public.listing_extractions limit 1$v$);

-- ---------------------------------------------------------------------
-- Who sees what
-- ---------------------------------------------------------------------
select pg_temp.check('IMP a person sees their own attempts', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select count(*) = 1 from public.listing_extractions$a$, 'true',
  p_setup => $s$select public.claim_import_slot(
                  'f0000000-0000-0000-0000-000000000006', null, 'link')$s$);

select pg_temp.check('IMP and not somebody else''s', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select count(*) = 0 from public.listing_extractions$a$, 'true',
  p_setup => $s$select public.claim_import_slot(
                  'f0000000-0000-0000-0000-000000000006', null, 'link')$s$);

select pg_temp.check('IMP staff see every attempt', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select count(*) = 1 from public.listing_extractions$a$, 'true',
  p_setup => $s$select public.claim_import_slot(
                  'f0000000-0000-0000-0000-000000000006', null, 'link')$s$);

select pg_temp.check('IMP the platform''s spend is not every account''s business', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.import_budget_status()$a$, 'blocked');

select pg_temp.check('IMP staff can read it', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select spent_usd is not null from public.import_budget_status()$a$, 'true');

select pg_temp.check('IMP and nobody reads the raw month total', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.import_month_spend()$a$, 'blocked');

select pg_temp.check('IMP the quota shown is the caller''s own', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select used = 1 and remaining = 9 from public.import_quota()$a$, 'true',
  p_setup => $s$select public.claim_import_slot(
                  'f0000000-0000-0000-0000-000000000006', null, 'link')$s$);

select pg_temp.check('IMP somebody else''s attempts do not count against yours', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select used = 0 from public.import_quota()$a$, 'true',
  p_setup => $s$select public.claim_import_slot(
                  'f0000000-0000-0000-0000-000000000006', null, 'link')$s$);

-- ---------------------------------------------------------------------
-- The refusals, each by its own name
--
-- The interface turns the name into a Romanian sentence, and "încearcă
-- din nou" on a refusal that cannot change is a lie the person acts on.
-- ---------------------------------------------------------------------
select pg_temp.check('IMP past the daily limit, the answer is daily_limit', 'fix',
  null, 'service_role',
  $a$select reason = 'daily_limit' and not allowed
     from public.claim_import_slot('f0000000-0000-0000-0000-000000000007', null, 'link')$a$, 'true',
  p_setup => $s$update public.import_settings set daily_limit_per_user = 1 where id;
                select public.claim_import_slot(
                  'f0000000-0000-0000-0000-000000000007', null, 'link')$s$);

select pg_temp.check('IMP and the refused attempt writes no row', 'fix',
  null, 'service_role',
  $a$select count(*) = 1 from public.listing_extractions
     where user_id = 'f0000000-0000-0000-0000-000000000007'$a$, 'true',
  p_setup => $s$update public.import_settings set daily_limit_per_user = 1 where id;
                select public.claim_import_slot(
                  'f0000000-0000-0000-0000-000000000007', null, 'link');
                select public.claim_import_slot(
                  'f0000000-0000-0000-0000-000000000007', null, 'link')$s$);

select pg_temp.check('IMP an anonymous caller runs out sooner', 'fix',
  null, 'service_role',
  $a$select reason = 'daily_limit'
     from public.claim_import_slot(null, 'ip-hash-x', 'link')$a$, 'true',
  p_setup => $s$update public.import_settings set daily_limit_per_ip = 1 where id;
                select public.claim_import_slot(null, 'ip-hash-x', 'link')$s$);

select pg_temp.check('IMP one address does not spend another''s allowance', 'fix',
  null, 'service_role',
  $a$select allowed from public.claim_import_slot(null, 'ip-hash-y', 'link')$a$, 'true',
  p_setup => $s$update public.import_settings set daily_limit_per_ip = 1 where id;
                select public.claim_import_slot(null, 'ip-hash-x', 'link')$s$);

select pg_temp.check('IMP a signed-in attempt stores no address at all', 'fix',
  null, 'service_role',
  $a$select count(*) = 0 from public.listing_extractions
     where user_id is not null and ip_hash is not null$a$, 'true',
  p_setup => $s$select public.claim_import_slot(
                  'f0000000-0000-0000-0000-000000000002', 'ip-hash-z', 'link')$s$);

select pg_temp.check('IMP a claim with nobody to count is refused', 'fix',
  null, 'service_role',
  $a$select reason = 'bad_request' from public.claim_import_slot(null, null, 'link')$a$, 'true');

select pg_temp.check('IMP and so is a source nobody offers', 'fix',
  null, 'service_role',
  $a$select reason = 'bad_request' from public.claim_import_slot(
       'f0000000-0000-0000-0000-000000000002', null, 'scrape')$a$, 'true');

select pg_temp.check('IMP turning the feature off refuses every claim', 'fix',
  null, 'service_role',
  $a$select reason = 'disabled' from public.claim_import_slot(
       'f0000000-0000-0000-0000-000000000002', null, 'link')$a$, 'true',
  p_setup => $s$update public.import_settings set is_enabled = false where id$s$);

-- ---------------------------------------------------------------------
-- The budget
-- ---------------------------------------------------------------------
select pg_temp.check('IMP a spent budget refuses the next claim', 'fix',
  null, 'service_role',
  $a$select reason = 'budget' from public.claim_import_slot(
       'f0000000-0000-0000-0000-00000000000a', null, 'photo')$a$, 'true',
  p_setup => $s$update public.import_settings set monthly_budget_usd = 0.10 where id;
                select public.finish_import(
                  (select extraction_id from public.claim_import_slot(
                     'f0000000-0000-0000-0000-00000000000a', null, 'photo')),
                  'ok', 900, 1500, 200, 0.20)$s$);

-- This one fails on a schema where the alert reads a column that no longer
-- exists: nothing calls it until a threshold is actually crossed, so the
-- function compiles happily and only a crossing finds the mistake.
-- Two kinds, two channels, every admin: asserted as that rule rather than
-- as a number, so adding a colleague does not fail the check.
select pg_temp.check('IMP crossing the budget tells every admin, on both channels', 'fix',
  null, 'service_role',
  $a$select (select count(*) from public.notification_outbox
             where template like 'import_budget_%')
          = 4 * (select count(*) from public.platform_staff where role = 'admin')$a$, 'true',
  p_setup => $s$update public.import_settings set monthly_budget_usd = 0.10 where id;
                select public.finish_import(
                  (select extraction_id from public.claim_import_slot(
                     'f0000000-0000-0000-0000-00000000000a', null, 'photo')),
                  'ok', 900, 1500, 200, 0.20)$s$,
  p_verify => $v$select exists (
                   select 1 from public.notification_outbox
                   where template = 'import_budget_spent'
                     and recipient_user_id = 'f0000000-0000-0000-0000-000000000001'
                     and channel = 'email')
                 and exists (
                   select 1 from public.notification_outbox
                   where template = 'import_budget_warning'
                     and recipient_user_id = 'f0000000-0000-0000-0000-000000000001'
                     and channel = 'inapp')$v$);

-- The second extraction of the month crosses nothing, so it announces
-- nothing. A dedupe key per month and kind is what holds it if a second
-- crossing ever happens.
select pg_temp.check('IMP and tells them once, not once per extraction', 'fix',
  null, 'service_role',
  $a$select public.finish_import(
       (select id from public.listing_extractions where status = 'running' limit 1),
       'ok', 900, 1500, 200, 0.20)$a$, 'allowed',
  p_setup => $s$update public.import_settings set monthly_budget_usd = 999 where id;
                select public.claim_import_slot(
                  'f0000000-0000-0000-0000-00000000000a', null, 'photo');
                select public.claim_import_slot(
                  'f0000000-0000-0000-0000-00000000000a', null, 'photo');
                update public.import_settings set monthly_budget_usd = 0.10 where id;
                select public.finish_import(
                  (select id from public.listing_extractions where status = 'running' limit 1),
                  'ok', 900, 1500, 200, 0.20)$s$,
  p_verify => $v$select (select count(*) from public.notification_outbox
                         where template like 'import_budget_%')
                      = 4 * (select count(*) from public.platform_staff where role = 'admin')$v$);

select pg_temp.check('IMP a failed extraction is still counted and still logged', 'fix',
  null, 'service_role',
  $a$select status = 'failed' and failure_reason = 'robots_disallow'
       and source_host = 'example.com' and cost_usd = 0
     from public.listing_extractions
     where user_id = 'f0000000-0000-0000-0000-000000000004'$a$, 'true',
  p_setup => $s$select public.finish_import(
                  (select extraction_id from public.claim_import_slot(
                     'f0000000-0000-0000-0000-000000000004', null, 'link')),
                  'failed', 120, null, null, 0, 'robots_disallow', 'example.com')$s$);

select pg_temp.check('IMP a failure the caller did not name is still named', 'fix',
  null, 'service_role',
  $a$select failure_reason = 'unknown' from public.listing_extractions
     where user_id = 'f0000000-0000-0000-0000-000000000005'$a$, 'true',
  p_setup => $s$select public.finish_import(
                  (select extraction_id from public.claim_import_slot(
                     'f0000000-0000-0000-0000-000000000005', null, 'photo')),
                  'failed', 90)$s$);

select pg_temp.check('IMP a status nobody defined is refused outright', 'fix',
  null, 'service_role',
  $a$select public.finish_import(
       (select extraction_id from public.claim_import_slot(
          'f0000000-0000-0000-0000-000000000005', null, 'photo')), 'maybe')$a$, 'blocked');

-- ---------------------------------------------------------------------
-- What is never stored
-- ---------------------------------------------------------------------
select pg_temp.check('IMP the log has no column a page could be written into', 'guard',
  null, 'service_role',
  $a$select count(*) = 0 from information_schema.columns
     where table_schema = 'public' and table_name = 'listing_extractions'
       and column_name in ('source_url', 'url', 'page_html', 'page_text',
                           'raw_response', 'extracted', 'title', 'description')$a$, 'true');

select pg_temp.check('IMP neither counter function is reachable from a browser', 'guard',
  null, 'service_role',
  $a$select count(*) = 0 from information_schema.routine_privileges
     where routine_schema = 'public'
       and routine_name in ('claim_import_slot', 'finish_import',
                            'queue_import_budget_alert', 'import_month_spend')
       and grantee in ('authenticated', 'anon', 'PUBLIC')$a$, 'true');

-- =====================================================================
-- Delivering the outbox
--
-- The queue has been filling since migration 0007 and nothing drained it.
-- These checks are about the two ways a drain goes wrong: it sends the
-- same thing twice, or it gives up without anybody noticing.
-- =====================================================================

select pg_temp.check('OUT only email and in-app are claimed', 'fix',
  null, 'service_role',
  $a$select count(*) = 2 and bool_and(channel in ('email', 'inapp'))
     from public.claim_outbox_batch(50)$a$, 'true',
  p_setup => $s$delete from public.notification_outbox;
                insert into public.notification_outbox (channel, template, recipient_user_id)
                values ('email', 'company_verified', 'f0000000-0000-0000-0000-000000000006'),
                       ('inapp', 'company_verified', 'f0000000-0000-0000-0000-000000000006'),
                       ('push',  'request_match_alert', 'f0000000-0000-0000-0000-000000000006'),
                       ('sms',   'company_verified', 'f0000000-0000-0000-0000-000000000006')$s$);

-- Push has its own claim function and its own sender. Two functions
-- claiming the same row is the one bug this shape exists to prevent.
select pg_temp.check('OUT a push row is left for its own dispatcher', 'fix',
  null, 'service_role',
  $a$select status = 'queued' from public.notification_outbox where channel = 'push'$a$, 'true',
  p_setup => $s$delete from public.notification_outbox;
                insert into public.notification_outbox (channel, template, recipient_user_id)
                values ('push', 'request_match_alert', 'f0000000-0000-0000-0000-000000000006');
                select public.claim_outbox_batch(50)$s$);

-- Nothing queues sms or whatsapp today and no provider has been chosen.
-- Claiming one would drain it into nowhere.
select pg_temp.check('OUT an sms row is not quietly drained', 'fix',
  null, 'service_role',
  $a$select status = 'queued' from public.notification_outbox where channel = 'sms'$a$, 'true',
  p_setup => $s$delete from public.notification_outbox;
                insert into public.notification_outbox (channel, template, recipient_user_id)
                values ('sms', 'company_verified', 'f0000000-0000-0000-0000-000000000006');
                select public.claim_outbox_batch(50)$s$);

select pg_temp.check('OUT a claimed row is marked sending', 'fix',
  null, 'service_role',
  $a$select status = 'sending' and attempts = 1
     from public.notification_outbox where channel = 'email'$a$, 'true',
  p_setup => $s$delete from public.notification_outbox;
                insert into public.notification_outbox (channel, template, recipient_user_id)
                values ('email', 'company_verified', 'f0000000-0000-0000-0000-000000000006');
                select public.claim_outbox_batch(50)$s$);

select pg_temp.check('OUT a row whose time has not come is left alone', 'fix',
  null, 'service_role',
  $a$select count(*) = 0 from public.claim_outbox_batch(50)$a$, 'true',
  p_setup => $s$delete from public.notification_outbox;
                insert into public.notification_outbox
                  (channel, template, recipient_user_id, send_after)
                values ('email', 'company_verified',
                        'f0000000-0000-0000-0000-000000000006', now() + interval '1 hour')$s$);

select pg_temp.check('OUT the batch size is respected', 'fix',
  null, 'service_role',
  $a$select count(*) = 3 from public.claim_outbox_batch(3)$a$, 'true',
  p_setup => $s$delete from public.notification_outbox;
                insert into public.notification_outbox (channel, template, recipient_user_id)
                select 'email', 'company_verified', 'f0000000-0000-0000-0000-000000000006'
                from generate_series(1, 10)$s$);

-- ---------------------------------------------------------------------
-- The backoff, and the point at which we stop
-- ---------------------------------------------------------------------
select pg_temp.check('OUT the backoff is 10, 20, 30, 40 and then stays 40', 'fix',
  null, 'service_role',
  $a$select public.outbox_backoff_minutes(1) = 10
        and public.outbox_backoff_minutes(2) = 20
        and public.outbox_backoff_minutes(3) = 30
        and public.outbox_backoff_minutes(4) = 40
        and public.outbox_backoff_minutes(9) = 40$a$, 'true');

select pg_temp.check('OUT a failure goes back to the queue with its wait', 'fix',
  null, 'service_role',
  $a$select status = 'queued'
        and send_after > now() + interval '9 minutes'
        and send_after < now() + interval '11 minutes'
        and last_error = 'provider a răspuns 500'
     from public.notification_outbox where channel = 'email'$a$, 'true',
  p_setup => $s$delete from public.notification_outbox;
                insert into public.notification_outbox (channel, template, recipient_user_id)
                values ('email', 'company_verified', 'f0000000-0000-0000-0000-000000000006');
                select public.finish_outbox(
                  (select id from public.claim_outbox_batch(1)), 'failed', 'provider a răspuns 500')$s$);

select pg_temp.check('OUT after five attempts it stays failed', 'fix',
  null, 'service_role',
  $a$select status = 'failed' and attempts = 5 and last_error is not null
     from public.notification_outbox where channel = 'email'$a$, 'true',
  p_setup => $s$delete from public.notification_outbox;
                insert into public.notification_outbox
                  (channel, template, recipient_user_id, attempts)
                values ('email', 'company_verified',
                        'f0000000-0000-0000-0000-000000000006', 4);
                select public.finish_outbox(
                  (select id from public.claim_outbox_batch(1)), 'failed', 'al cincilea eșec')$s$);

select pg_temp.check('OUT a sent row records when, and clears the error', 'fix',
  null, 'service_role',
  $a$select status = 'sent' and sent_at is not null and last_error is null
     from public.notification_outbox where channel = 'email'$a$, 'true',
  p_setup => $s$delete from public.notification_outbox;
                insert into public.notification_outbox
                  (channel, template, recipient_user_id, last_error)
                values ('email', 'company_verified',
                        'f0000000-0000-0000-0000-000000000006', 'eșec anterior');
                select public.finish_outbox(
                  (select id from public.claim_outbox_batch(1)), 'sent')$s$);

select pg_temp.check('OUT a status nobody defined is refused', 'fix',
  null, 'service_role',
  $a$select public.finish_outbox(
       (select id from public.notification_outbox limit 1), 'poate')$a$, 'blocked',
  p_setup => $s$delete from public.notification_outbox;
                insert into public.notification_outbox (channel, template, recipient_user_id)
                values ('email', 'company_verified', 'f0000000-0000-0000-0000-000000000006')$s$);

-- ---------------------------------------------------------------------
-- The same thing, twice
-- ---------------------------------------------------------------------
select pg_temp.check('OUT the dedupe key refuses a second identical row', 'fix',
  null, 'service_role',
  $a$insert into public.notification_outbox
       (channel, template, recipient_user_id, dedupe_key)
     values ('email', 'document_expiry_reminder',
             'f0000000-0000-0000-0000-000000000006', 'doc:1:30')$a$, 'blocked',
  p_setup => $s$delete from public.notification_outbox;
                insert into public.notification_outbox
                  (channel, template, recipient_user_id, dedupe_key)
                values ('email', 'document_expiry_reminder',
                        'f0000000-0000-0000-0000-000000000006', 'doc:1:30')$s$);

select pg_temp.check('OUT and still refuses it after the first one was sent', 'fix',
  null, 'service_role',
  $a$insert into public.notification_outbox
       (channel, template, recipient_user_id, dedupe_key)
     values ('email', 'document_expiry_reminder',
             'f0000000-0000-0000-0000-000000000006', 'doc:1:30')$a$, 'blocked',
  p_setup => $s$delete from public.notification_outbox;
                insert into public.notification_outbox
                  (channel, template, recipient_user_id, dedupe_key)
                values ('email', 'document_expiry_reminder',
                        'f0000000-0000-0000-0000-000000000006', 'doc:1:30');
                select public.finish_outbox(
                  (select id from public.claim_outbox_batch(1)), 'sent')$s$);

-- ---------------------------------------------------------------------
-- Two runs at once
--
-- The real thing this protects: a run that takes longer than five minutes
-- overlaps the next one. Without `for update skip locked` both claim the
-- same rows and every recipient gets two e-mails.
-- ---------------------------------------------------------------------
do $$
declare
  v_a bigint;
  v_b bigint;
  v_pass boolean;
  v_detail text;
begin
  perform dblink_connect('out_c1', 'dbname=' || current_database());
  perform dblink_connect('out_c2', 'dbname=' || current_database());

  perform dblink_exec('out_c1', 'begin');
  perform dblink_exec('out_c2', 'begin');

  -- This block is not inside pg_temp.check, so it owns its cleanup at both
  -- ends: the fixture's own outbox rows would otherwise be counted here.
  perform dblink_exec('out_c1', 'delete from public.notification_outbox');
  perform dblink_exec('out_c1',
    $q$insert into public.notification_outbox (channel, template)
       select 'email', 'company_verified' from generate_series(1, 6)$q$);
  perform dblink_exec('out_c1', 'commit');
  perform dblink_exec('out_c1', 'begin');

  -- Both connections claim while the other's transaction is open.
  select t.n into v_a from dblink('out_c1',
    'select count(*) from public.claim_outbox_batch(10)') as t(n bigint);
  select t.n into v_b from dblink('out_c2',
    'select count(*) from public.claim_outbox_batch(10)') as t(n bigint);

  perform dblink_exec('out_c1', 'commit');
  perform dblink_exec('out_c2', 'commit');

  v_pass := (v_a + v_b) = 6 and v_a > 0;
  v_detail := format('first run took %s, second took %s, six rows in total', v_a, v_b);

  perform dblink_exec('out_c1', 'delete from public.notification_outbox');
  perform dblink_disconnect('out_c1');
  perform dblink_disconnect('out_c2');

  insert into rls_results (label, kind, pass, detail)
  values ('OUT two overlapping runs never claim the same row', 'fix', v_pass, v_detail);
end $$;

-- ---------------------------------------------------------------------
-- Who may touch any of this
-- ---------------------------------------------------------------------
select pg_temp.check('OUT nobody claims a batch from a browser', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.claim_outbox_batch(50)$a$, 'blocked');

select pg_temp.check('OUT nor marks one sent', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.finish_outbox(
       (select id from public.notification_outbox limit 1), 'sent')$a$, 'blocked',
  p_setup => $s$delete from public.notification_outbox;
                insert into public.notification_outbox (channel, template)
                values ('email', 'company_verified')$s$);

select pg_temp.check('OUT nor writes a run into the log', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.log_job_run('outbox-dispatcher', 99, 0)$a$, 'blocked');

select pg_temp.check('OUT a visitor cannot see the state of the jobs', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.job_health()$a$, 'blocked');

select pg_temp.check('OUT staff can', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select count(*) = 10 from public.job_health()$a$, 'true');

select pg_temp.check('OUT a job that never ran reads as late, not as fine', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select bool_and(is_late) and bool_and(last_status = 'niciodată')
     from public.job_health()$a$, 'true');

select pg_temp.check('OUT a run within the window clears the alarm', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select not is_late from public.job_health()
     where job = 'nightly-compliance-sweep'$a$, 'true',
  p_setup => $s$delete from public.notification_outbox;
                insert into public.job_run_log (workflow, ran_at)
                values ('nightly-compliance-sweep', now() - interval '2 hours')$s$);

select pg_temp.check('OUT thirty-six hours without a sweep is late', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select is_late from public.job_health()
     where job = 'nightly-compliance-sweep'$a$, 'true',
  p_setup => $s$delete from public.notification_outbox;
                insert into public.job_run_log (workflow, ran_at)
                values ('nightly-compliance-sweep', now() - interval '37 hours')$s$);

select pg_temp.check('OUT a failed run reads as failed', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select last_status = 'failed' from public.job_health()
     where job = 'outbox-dispatcher'$a$, 'true',
  p_setup => $s$delete from public.notification_outbox;
                insert into public.job_run_log (workflow, processed, failed)
                values ('outbox-dispatcher', 10, 2)$s$);

-- ---------------------------------------------------------------------
-- Retrying by hand
-- ---------------------------------------------------------------------
select pg_temp.check('OUT a user cannot retry a notification', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.retry_outbox_row((select id from public.notification_outbox limit 1))$a$, 'blocked',
  p_setup => $s$delete from public.notification_outbox;
                insert into public.notification_outbox (channel, template, status)
                values ('email', 'company_verified', 'failed')$s$);

select pg_temp.check('OUT staff can, and it is audited', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.retry_outbox_row((select id from public.notification_outbox limit 1))$a$, 'allowed',
  p_setup => $s$delete from public.notification_outbox;
                insert into public.notification_outbox
                  (channel, template, status, attempts, last_error)
                values ('email', 'company_verified', 'failed', 5, 'a picat')$s$,
  p_verify => $v$select status = 'queued' and attempts = 0 and last_error is null
                 from public.notification_outbox limit 1$v$);

select pg_temp.check('OUT a row that is still going is not retried', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.retry_outbox_row((select id from public.notification_outbox limit 1))$a$, 'blocked',
  p_setup => $s$delete from public.notification_outbox;
                insert into public.notification_outbox (channel, template, status)
                values ('email', 'company_verified', 'queued')$s$);

-- ---------------------------------------------------------------------
-- End to end: an expiring document becomes exactly one e-mail per
-- milestone, and running everything twice changes nothing
--
-- This is the check that would have caught the original bug, if the
-- original bug had been "sends twice" rather than "never sends".
-- ---------------------------------------------------------------------
select pg_temp.check('OUT an expiring document queues one reminder per milestone', 'fix',
  null, 'service_role',
  $a$select count(*) = 1 from public.notification_outbox
     where template = 'document_expiry_reminder'$a$, 'true',
  p_setup => $s$delete from public.notification_outbox;
                update public.documents
                set valid_until = current_date + 30, status = 'approved'
                where id = (select id from public.documents
                            where status = 'approved' limit 1);
                select public.queue_expiry_reminders()$s$);

select pg_temp.check('OUT running the reminder job twice queues nothing new', 'fix',
  null, 'service_role',
  $a$select count(*) = 1 from public.notification_outbox
     where template = 'document_expiry_reminder'$a$, 'true',
  p_setup => $s$delete from public.notification_outbox;
                update public.documents
                set valid_until = current_date + 30, status = 'approved'
                where id = (select id from public.documents
                            where status = 'approved' limit 1);
                select public.queue_expiry_reminders();
                select public.queue_expiry_reminders()$s$);

select pg_temp.check('OUT the reminder is delivered once and then gone from the queue', 'fix',
  null, 'service_role',
  $a$select count(*) = 0 from public.claim_outbox_batch(50)$a$, 'true',
  p_setup => $s$delete from public.notification_outbox;
                update public.documents
                set valid_until = current_date + 30, status = 'approved'
                where id = (select id from public.documents
                            where status = 'approved' limit 1);
                select public.queue_expiry_reminders();
                select public.finish_outbox(id, 'sent') from public.claim_outbox_batch(50)$s$);

select pg_temp.check('OUT and the job log records the run', 'guard',
  null, 'service_role',
  $a$select processed = 4 and failed = 1 from public.job_run_log
     where workflow = 'outbox-dispatcher' order by ran_at desc limit 1$a$, 'true',
  p_setup => $s$delete from public.notification_outbox;
                select public.log_job_run('outbox-dispatcher', 4, 1,
                  jsonb_build_object('sent', 4, 'failed', 1))$s$);

-- =====================================================================
-- DEL - erasure, the grace period and the export
--
-- Migration 20260918180000. Three groups, and they fail in different
-- ways if they are wrong.
--
--   * The door. `account_deletion_requests` has no write privilege for
--     anybody, so every row in it came through an RPC that checked who
--     was asking. A grant slipping back in is the kind of thing nothing
--     else would notice.
--   * The rules. Sole ownership and unfinished transports are checked in
--     the database, twice — once when the request is made and once when
--     the job finishes it, because a fortnight is long enough for a new
--     transport to start.
--   * The hold. A deletion that leaves the account posting for a
--     fortnight is not the deletion anybody asked for, and the nightly
--     compliance sweep must not undo it.
-- =====================================================================

select pg_temp.check('DEL  nobody writes a deletion request by hand', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$insert into public.account_deletion_requests (user_id, kind)
     values ('f0000000-0000-0000-0000-000000000006', 'user')$a$, 'blocked');

select pg_temp.check('DEL  nor edits one that exists', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$update public.account_deletion_requests set status = 'cancelled'
     where user_id = 'f0000000-0000-0000-0000-000000000006'$a$, 'blocked',
  p_setup => $s$update public.transports set status = 'closed'
                where shipper_user_id = 'f0000000-0000-0000-0000-000000000006';
                insert into public.account_deletion_requests (user_id, kind, status, scheduled_for)
                values ('f0000000-0000-0000-0000-000000000006', 'user', 'scheduled', now() + interval '14 days')$s$);

select pg_temp.check('DEL  nor reads somebody else''s', 'fix',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  $a$select count(*) = 0 from public.account_deletion_requests$a$, 'true',
  p_setup => $s$insert into public.account_deletion_requests (user_id, kind, status, scheduled_for)
                values ('f0000000-0000-0000-0000-000000000006', 'user', 'scheduled', now() + interval '14 days')$s$);

select pg_temp.check('DEL  a visitor cannot ask for a deletion at all', 'fix',
  null, 'anon',
  $a$select public.request_account_deletion('user') is not null$a$, 'blocked');

select pg_temp.check('DEL  a personal request is scheduled, not done', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select (public.request_account_deletion('user')).status = 'scheduled'$a$, 'true',
  p_setup => $s$update public.transports set status = 'closed'
                where shipper_user_id = 'f0000000-0000-0000-0000-000000000006'$s$);

select pg_temp.check('DEL  the grace period is the setting, not a guess', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select (public.request_account_deletion('user')).scheduled_for::date
            = (current_date + 21)$a$, 'true',
  p_setup => $s$update public.transports set status = 'closed'
                where shipper_user_id = 'f0000000-0000-0000-0000-000000000006';
                update public.deletion_settings set grace_days = 21$s$);

select pg_temp.check('DEL  the account is held: its requests come off the board', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select (public.request_account_deletion('user')).id is not null$a$, 'true',
  p_verify => $v$select not exists (
     select 1 from public.cargo_listings
     where posted_by = 'f0000000-0000-0000-0000-000000000006' and status = 'active')$v$,
  p_setup => $s$update public.transports set status = 'closed'
                where shipper_user_id = 'f0000000-0000-0000-0000-000000000006'$s$);

select pg_temp.check('DEL  and it cannot publish another one meanwhile', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.publish_cargo_request('f1000000-0000-0000-0000-000000000002') is not null$a$,
  'blocked',
  p_setup => $s$update public.transports set status = 'closed'
                where shipper_user_id = 'f0000000-0000-0000-0000-000000000006';
                update public.profiles set deletion_scheduled_at = now()
                where id = 'f0000000-0000-0000-0000-000000000006';
                update public.cargo_listings set status = 'draft'
                where id = 'f1000000-0000-0000-0000-000000000002'$s$);

select pg_temp.check('DEL  the nightly sweep does not undo the hold', 'fix',
  null, 'service_role',
  $a$select count(*) >= 0 from public.run_compliance_sweep()$a$, 'true',
  p_verify => $v$select exists (select 1 from public.cargo_listings
     where id = 'f1000000-0000-0000-0000-000000000002' and status = 'suspended')$v$,
  p_setup => $s$update public.profiles set deletion_scheduled_at = now()
                where id = 'f0000000-0000-0000-0000-000000000006';
                update public.cargo_listings
                set previous_status = 'active', status = 'suspended'
                where id = 'f1000000-0000-0000-0000-000000000002'$s$);

select pg_temp.check('DEL  cancelling puts the account back on the board', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select (public.cancel_account_deletion(
              (select id from public.account_deletion_requests
               where user_id = 'f0000000-0000-0000-0000-000000000006'))).status = 'cancelled'$a$,
  'true',
  p_verify => $v$select exists (select 1 from public.cargo_listings
     where id = 'f1000000-0000-0000-0000-000000000002' and status = 'active')
     and (select deletion_scheduled_at is null from public.profiles
          where id = 'f0000000-0000-0000-0000-000000000006')$v$,
  p_setup => $s$update public.transports set status = 'closed'
                where shipper_user_id = 'f0000000-0000-0000-0000-000000000006';
                insert into public.account_deletion_requests (user_id, kind, status, scheduled_for)
                values ('f0000000-0000-0000-0000-000000000006', 'user', 'scheduled',
                        now() + interval '14 days');
                select public.hold_account_for_deletion(
                  'f0000000-0000-0000-0000-000000000006', null, 'user')$s$);

select pg_temp.check('DEL  the link in the e-mail works without a session', 'fix',
  null, 'anon',
  $a$select public.cancel_account_deletion_by_token('00000000-0000-0000-0000-00000000cccc')$a$,
  'true',
  p_verify => $v$select exists (select 1 from public.account_deletion_requests
     where user_id = 'f0000000-0000-0000-0000-000000000006' and status = 'cancelled')$v$,
  p_setup => $s$insert into public.account_deletion_requests
                  (user_id, kind, status, scheduled_for, cancel_token)
                values ('f0000000-0000-0000-0000-000000000006', 'user', 'scheduled',
                        now() + interval '14 days', '00000000-0000-0000-0000-00000000cccc')$s$);

select pg_temp.check('DEL  a token nobody issued cancels nothing', 'fix',
  null, 'anon',
  $a$select not public.cancel_account_deletion_by_token(
       '00000000-0000-0000-0000-0000000000ff')$a$, 'true',
  p_setup => $s$insert into public.account_deletion_requests (user_id, kind, status, scheduled_for)
                values ('f0000000-0000-0000-0000-000000000006', 'user', 'scheduled', now() + interval '14 days')$s$);

select pg_temp.check('DEL  and a token that worked once does not work twice', 'fix',
  null, 'anon',
  $a$select not public.cancel_account_deletion_by_token('00000000-0000-0000-0000-00000000aaaa')$a$,
  'true',
  p_setup => $s$insert into public.account_deletion_requests
                  (user_id, kind, status, scheduled_for, cancel_token)
                values ('f0000000-0000-0000-0000-000000000006', 'user', 'scheduled',
                        now() + interval '14 days', '00000000-0000-0000-0000-00000000aaaa');
                select public.cancel_account_deletion_by_token(
                  '00000000-0000-0000-0000-00000000aaaa')$s$);

-- --- The rules -------------------------------------------------------
select pg_temp.check('DEL  asking twice answers with the request already running', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select (public.request_account_deletion('user')).id
            = (select id from public.account_deletion_requests
               where user_id = 'f0000000-0000-0000-0000-000000000006')$a$, 'true',
  p_setup => $s$update public.transports set status = 'closed'
                where shipper_user_id = 'f0000000-0000-0000-0000-000000000006';
                insert into public.account_deletion_requests (user_id, kind, status, scheduled_for)
                values ('f0000000-0000-0000-0000-000000000006', 'user', 'scheduled',
                        now() + interval '14 days')$s$);

select pg_temp.check('DEL  the sole owner of a firm with other people is blocked', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select (public.request_account_deletion('user')).status = 'blocked'$a$, 'true');

select pg_temp.check('DEL  and is told which firm and how many people', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select (public.request_account_deletion('user')).reason_blocked
            like '%RLS Carrier A SRL%membri%'$a$, 'true');

select pg_temp.check('DEL  a blocked request holds nothing', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select (public.request_account_deletion('user')).id is not null$a$, 'true',
  p_verify => $v$select (select deletion_scheduled_at is null from public.profiles
     where id = 'f0000000-0000-0000-0000-000000000002')$v$);

select pg_temp.check('DEL  an unfinished transport blocks a personal deletion', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select (public.request_account_deletion('user')).reason_blocked
            like '%transport nefinalizat%'$a$, 'true',
  p_setup => $s$update public.transports set status = 'in_transit'
                where shipper_user_id = 'f0000000-0000-0000-0000-000000000006'$s$);

select pg_temp.check('DEL  a closed one does not', 'guard',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select (public.request_account_deletion('user')).status = 'scheduled'$a$, 'true',
  p_setup => $s$update public.transports set status = 'closed'
                where shipper_user_id = 'f0000000-0000-0000-0000-000000000006'$s$);

select pg_temp.check('DEL  a firm with an unfinished transport cannot be erased', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select (public.request_account_deletion('company', 'fc000000-0000-0000-0000-000000000001')).status
            = 'blocked'$a$, 'true');

select pg_temp.check('DEL  only the owner may ask for a firm''s erasure', 'fix',
  'f0000000-0000-0000-0000-000000000003', 'authenticated',
  $a$select public.request_account_deletion('company', 'fc000000-0000-0000-0000-000000000001')
            is not null$a$, 'blocked');

select pg_temp.check('DEL  the rules cannot be asked about somebody else', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.account_deletion_blockers(
       'f0000000-0000-0000-0000-000000000002', 'user', null) is not null$a$, 'blocked');

select pg_temp.check('DEL  the screen may ask about the caller', 'guard',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select array_length(public.my_deletion_blockers('user'), 1) = 1$a$, 'true');

-- --- The job ---------------------------------------------------------
select pg_temp.check('DEL  a browser cannot claim the deletion batch', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.claim_account_deletions(10) is not null$a$, 'blocked');

select pg_temp.check('DEL  nor finish one', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.complete_account_deletion(
       (select id from public.account_deletion_requests limit 1)) is not null$a$, 'blocked',
  p_setup => $s$insert into public.account_deletion_requests (user_id, kind, status, scheduled_for)
                values ('f0000000-0000-0000-0000-000000000006', 'user', 'scheduled', now() - interval '1 day')$s$);

select pg_temp.check('DEL  the job leaves a request whose grace period is still running', 'fix',
  null, 'service_role',
  $a$select count(*) = 0 from public.claim_account_deletions(10)$a$, 'true',
  p_setup => $s$insert into public.account_deletion_requests (user_id, kind, status, scheduled_for)
                values ('f0000000-0000-0000-0000-000000000006', 'user', 'scheduled', now() + interval '1 day')$s$);

select pg_temp.check('DEL  and takes one whose period is up', 'guard',
  null, 'service_role',
  $a$select count(*) = 1 from public.claim_account_deletions(10)$a$, 'true',
  p_setup => $s$insert into public.account_deletion_requests (user_id, kind, status, scheduled_for)
                values ('f0000000-0000-0000-0000-000000000006', 'user', 'scheduled', now() - interval '1 day')$s$);

select pg_temp.check('DEL  a transport that started during the grace period stops it', 'fix',
  null, 'service_role',
  $a$select (public.complete_account_deletion(
       (select id from public.account_deletion_requests
        where user_id = 'f0000000-0000-0000-0000-000000000006'))).status = 'blocked'$a$, 'true',
  p_verify => $v$select exists (select 1 from auth.users
     where id = 'f0000000-0000-0000-0000-000000000006')$v$,
  p_setup => $s$update public.transports set status = 'in_transit'
                where shipper_user_id = 'f0000000-0000-0000-0000-000000000006';
                insert into public.account_deletion_requests (user_id, kind, status, scheduled_for)
                values ('f0000000-0000-0000-0000-000000000006', 'user', 'scheduled', now() - interval '1 day')$s$);

select pg_temp.check('DEL  a finished erasure takes the login with it', 'fix',
  null, 'service_role',
  $a$select (public.complete_account_deletion(
       (select id from public.account_deletion_requests
        where user_id = 'f0000000-0000-0000-0000-000000000006'))).status = 'completed'$a$, 'true',
  p_verify => $v$select not exists (select 1 from auth.users
     where id = 'f0000000-0000-0000-0000-000000000006')$v$,
  p_setup => $s$update public.transports set status = 'closed'
                where shipper_user_id = 'f0000000-0000-0000-0000-000000000006';
                insert into public.account_deletion_requests (user_id, kind, status, scheduled_for)
                values ('f0000000-0000-0000-0000-000000000006', 'user', 'scheduled', now() - interval '1 day')$s$);

select pg_temp.check('DEL  the transport stays, without the person', 'fix',
  null, 'service_role',
  $a$select (public.complete_account_deletion(
       (select id from public.account_deletion_requests
        where user_id = 'f0000000-0000-0000-0000-000000000006'))).status = 'completed'$a$, 'true',
  p_verify => $v$select exists (select 1 from public.transports
     where id = 'f3000000-0000-0000-0000-000000000003' and shipper_user_id is null)$v$,
  p_setup => $s$update public.transports set status = 'closed'
                where shipper_user_id = 'f0000000-0000-0000-0000-000000000006';
                insert into public.account_deletion_requests (user_id, kind, status, scheduled_for)
                values ('f0000000-0000-0000-0000-000000000006', 'user', 'scheduled', now() - interval '1 day')$s$);

select pg_temp.check('DEL  and the record of the erasure names nobody', 'fix',
  null, 'service_role',
  $a$select (public.complete_account_deletion(
       (select id from public.account_deletion_requests
        where user_id = 'f0000000-0000-0000-0000-000000000006'))).status = 'completed'$a$, 'true',
  p_verify => $v$select exists (select 1 from public.account_deletion_requests
     where status = 'completed' and user_id is null and completed_at is not null)$v$,
  p_setup => $s$update public.transports set status = 'closed'
                where shipper_user_id = 'f0000000-0000-0000-0000-000000000006';
                insert into public.account_deletion_requests (user_id, kind, status, scheduled_for)
                values ('f0000000-0000-0000-0000-000000000006', 'user', 'scheduled', now() - interval '1 day')$s$);

select pg_temp.check('DEL  a one-person firm becomes a shell, not a gap', 'fix',
  null, 'service_role',
  $a$select (public.complete_account_deletion(
       (select id from public.account_deletion_requests
        where user_id = 'f0000000-0000-0000-0000-00000000000a'))).status = 'completed'$a$, 'true',
  p_verify => $v$select exists (select 1 from public.companies
     where id = 'fc000000-0000-0000-0000-000000000003'
       and legal_name = 'Firmă ștearsă' and contact_email is null and contact_phone is null
       and anonymised_at is not null and cui like 'STERS-%')$v$,
  p_setup => $s$insert into public.account_deletion_requests (user_id, company_id, kind, status, scheduled_for)
                values ('f0000000-0000-0000-0000-00000000000a', 'fc000000-0000-0000-0000-000000000003',
                        'user', 'scheduled', now() - interval '1 day')$s$);

select pg_temp.check('DEL  the shell keeps no vehicles', 'fix',
  null, 'service_role',
  $a$select (public.complete_account_deletion(
       (select id from public.account_deletion_requests
        where user_id = 'f0000000-0000-0000-0000-00000000000a'))).status = 'completed'$a$, 'true',
  p_verify => $v$select not exists (select 1 from public.vehicles
     where company_id = 'fc000000-0000-0000-0000-000000000003')$v$,
  p_setup => $s$insert into public.account_deletion_requests (user_id, company_id, kind, status, scheduled_for)
                values ('f0000000-0000-0000-0000-00000000000a', 'fc000000-0000-0000-0000-000000000003',
                        'user', 'scheduled', now() - interval '1 day')$s$);

select pg_temp.check('DEL  nor documents', 'fix',
  null, 'service_role',
  $a$select (public.complete_account_deletion(
       (select id from public.account_deletion_requests
        where user_id = 'f0000000-0000-0000-0000-00000000000a'))).status = 'completed'$a$, 'true',
  p_verify => $v$select not exists (select 1 from public.documents
     where company_id = 'fc000000-0000-0000-0000-000000000003')$v$,
  p_setup => $s$insert into public.account_deletion_requests (user_id, company_id, kind, status, scheduled_for)
                values ('f0000000-0000-0000-0000-00000000000a', 'fc000000-0000-0000-0000-000000000003',
                        'user', 'scheduled', now() - interval '1 day')$s$);

select pg_temp.check('DEL  nor people', 'fix',
  null, 'service_role',
  $a$select (public.complete_account_deletion(
       (select id from public.account_deletion_requests
        where user_id = 'f0000000-0000-0000-0000-00000000000a'))).status = 'completed'$a$, 'true',
  p_verify => $v$select not exists (select 1 from public.company_members
     where company_id = 'fc000000-0000-0000-0000-000000000003')$v$,
  p_setup => $s$insert into public.account_deletion_requests (user_id, company_id, kind, status, scheduled_for)
                values ('f0000000-0000-0000-0000-00000000000a', 'fc000000-0000-0000-0000-000000000003',
                        'user', 'scheduled', now() - interval '1 day')$s$);

-- --- Staff -----------------------------------------------------------
select pg_temp.check('DEL  staff anonymisation needs a reason', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.staff_anonymise_account('f0000000-0000-0000-0000-000000000006', '  ')
            is not null$a$, 'blocked');

select pg_temp.check('DEL  and is not something a user can do to anybody', 'fix',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  $a$select public.staff_anonymise_account('f0000000-0000-0000-0000-000000000006', 'pentru că da')
            is not null$a$, 'blocked');

select pg_temp.check('DEL  staff anonymisation is immediate and audited', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select (public.staff_anonymise_account(
       'f0000000-0000-0000-0000-000000000006', 'Cerere scrisă, dosar 42')).scheduled_for
       <= now()$a$, 'true',
  p_verify => $v$select exists (select 1 from public.audit_log
     where action = 'account.staff_anonymised' and reason = 'Cerere scrisă, dosar 42')$v$,
  p_setup => $s$update public.transports set status = 'closed'
                where shipper_user_id = 'f0000000-0000-0000-0000-000000000006'$s$);

select pg_temp.check('DEL  a browser still cannot remove an owner', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$delete from public.company_members
     where company_id = 'fc000000-0000-0000-0000-000000000001' and role = 'owner'$a$, 'blocked');

select pg_temp.check('DEL  but the erasure can, silence being the old bug', 'fix',
  null, 'service_role',
  $a$select (public.complete_account_deletion(
       (select id from public.account_deletion_requests
        where user_id = 'f0000000-0000-0000-0000-00000000000a'))).status = 'completed'$a$, 'true',
  p_verify => $v$select not exists (select 1 from public.company_members
     where company_id = 'fc000000-0000-0000-0000-000000000003' and role = 'owner')$v$,
  p_setup => $s$insert into public.account_deletion_requests (user_id, company_id, kind, status, scheduled_for)
                values ('f0000000-0000-0000-0000-00000000000a', 'fc000000-0000-0000-0000-000000000003',
                        'user', 'scheduled', now() - interval '1 day')$s$);

select pg_temp.check('DEL  a person cannot lift their own hold from the profile row', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$update public.profiles set deletion_scheduled_at = null
     where id = 'f0000000-0000-0000-0000-000000000006'$a$, 'blocked',
  p_setup => $s$update public.profiles set deletion_scheduled_at = now()
                where id = 'f0000000-0000-0000-0000-000000000006'$s$);

select pg_temp.check('DEL  nor from the company row', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.companies set deletion_scheduled_at = null
     where id = 'fc000000-0000-0000-0000-000000000001'$a$, 'blocked',
  p_setup => $s$update public.companies set deletion_scheduled_at = now()
                where id = 'fc000000-0000-0000-0000-000000000001'$s$);

select pg_temp.check('DEL  the grace period is not a browser setting', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.deletion_settings set grace_days = 0$a$, 'blocked');

select pg_temp.check('DEL  nor a setting a user can change through the RPC', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select public.set_deletion_settings(0, null) is not null$a$, 'blocked');

-- --- The export ------------------------------------------------------
select pg_temp.check('DEL  the export answers about the caller and nobody else', 'guard',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.my_data_export() -> 'profil' ->> 'email' = 'rls-pf@test.ro'$a$, 'true');

select pg_temp.check('DEL  a visitor gets no export', 'fix',
  null, 'anon',
  $a$select public.my_data_export() is not null$a$, 'blocked');

select pg_temp.check('DEL  one archive a day', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.request_data_export() is not null$a$, 'blocked',
  p_setup => $s$insert into public.data_export_requests (user_id)
                values ('f0000000-0000-0000-0000-000000000006')$s$);

select pg_temp.check('DEL  an archive cannot be pointed at somebody else''s folder', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.finish_data_export(
       (select id from public.data_export_requests limit 1),
       'f0000000-0000-0000-0000-000000000002/date.zip') is not null$a$, 'blocked',
  p_setup => $s$insert into public.data_export_requests (user_id)
                values ('f0000000-0000-0000-0000-000000000006')$s$);

select pg_temp.check('DEL  a link that was already used hands nothing over', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.claim_data_export(
       (select id from public.data_export_requests limit 1),
       '00000000-0000-0000-0000-00000000bbbb') is not null$a$, 'blocked',
  p_setup => $s$insert into public.data_export_requests
                  (user_id, status, file_path, expires_at, download_token, downloaded_at)
                values ('f0000000-0000-0000-0000-000000000006', 'downloaded',
                        'f0000000-0000-0000-0000-000000000006/date.zip',
                        now() + interval '24 hours', '00000000-0000-0000-0000-00000000bbbb', now())$s$);

select pg_temp.check('DEL  and refuses an archive that is not the caller''s', 'fix',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  $a$select public.claim_data_export(
       (select id from public.data_export_requests limit 1),
       '00000000-0000-0000-0000-00000000bbbb') is not null$a$, 'blocked',
  p_setup => $s$insert into public.data_export_requests
                  (user_id, status, file_path, expires_at, download_token)
                values ('f0000000-0000-0000-0000-000000000006', 'ready',
                        'f0000000-0000-0000-0000-000000000006/date.zip',
                        now() + interval '24 hours', '00000000-0000-0000-0000-00000000bbbb')$s$);

select pg_temp.check('DEL  an expired link hands nothing over', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.claim_data_export(
       (select id from public.data_export_requests limit 1),
       '00000000-0000-0000-0000-00000000bbbb') is not null$a$, 'blocked',
  p_setup => $s$insert into public.data_export_requests
                  (user_id, status, file_path, expires_at, download_token)
                values ('f0000000-0000-0000-0000-000000000006', 'ready',
                        'f0000000-0000-0000-0000-000000000006/date.zip',
                        now() - interval '1 hour', '00000000-0000-0000-0000-00000000bbbb')$s$);

select pg_temp.check('DEL  a user cannot read another''s export row', 'fix',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  $a$select count(*) = 0 from public.data_export_requests$a$, 'true',
  p_setup => $s$insert into public.data_export_requests (user_id)
                values ('f0000000-0000-0000-0000-000000000006')$s$);

-- =====================================================================
-- MAT - „N transportatori verificați circulă pe această rută"
--
-- Migrations 20260918190000 and 20260918200000. The number a person sees
-- after publishing, so the checks are about two things: that it is the
-- owner's number and nobody else's, and that it counts what the sentence
-- claims — coverage, category and equipment, and nothing about a diary.
--
-- The rule itself is not re-tested here — the FIRM block above already
-- covers every branch of it, and it is now the same function body, which
-- is the point of the refactor.
--
-- Every check here first takes the rest of the database out of the count.
-- `smoke_test.sql` runs into the same database before this file and
-- leaves a verified carrier of its own behind, so an absolute number here
-- would be a number about two suites rather than about these fixtures.
-- The date-aware version of this count hid that by accident — the smoke
-- company has no announced route — which is exactly the kind of passing
-- test that is not evidence of anything.
-- =====================================================================

\set mat_isolate 'update public.companies set is_suspended = true where id not in (''fc000000-0000-0000-0000-000000000001'', ''fc000000-0000-0000-0000-000000000002'', ''fc000000-0000-0000-0000-000000000003'')'

select pg_temp.check('MAT  the owner of a request gets a number', 'guard',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.count_matching_carriers('f1000000-0000-0000-0000-000000000002') = 1$a$,
  'true',
  p_setup => :'mat_isolate');

select pg_temp.check('MAT  somebody else''s request answers nothing', 'fix',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  $a$select public.count_matching_carriers('f1000000-0000-0000-0000-000000000002') >= 0$a$,
  'blocked',
  p_setup => :'mat_isolate');

select pg_temp.check('MAT  a visitor gets no count at all', 'fix',
  null, 'anon',
  $a$select public.count_matching_carriers('f1000000-0000-0000-0000-000000000002') >= 0$a$,
  'blocked',
  p_setup => :'mat_isolate');

-- Coverage is the whole claim now. A carrier that has never announced a
-- route still works the route it says it works, and the sentence no
-- longer promises anything about when.
select pg_temp.check('MAT  a carrier with no announced route still counts', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.count_matching_carriers('f1000000-0000-0000-0000-000000000002') = 1$a$,
  'true',
  p_setup => :'mat_isolate' || '; ' || $s$update public.truck_listings set status = 'draft'
                where company_id = 'fc000000-0000-0000-0000-000000000001'$s$);

select pg_temp.check('MAT  nor do its dates matter any more', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.count_matching_carriers('f1000000-0000-0000-0000-000000000002') = 1$a$,
  'true',
  p_setup => :'mat_isolate' || '; ' || $s$update public.truck_listings
                set available_from = current_date + 600, available_to = null
                where company_id = 'fc000000-0000-0000-0000-000000000001'$s$);

-- What does still decide it: coverage, category, and the winch.
select pg_temp.check('MAT  a county-only carrier off the route is not counted', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.count_matching_carriers('f1000000-0000-0000-0000-000000000004') = 0$a$,
  'true',
  p_setup => :'mat_isolate' || '; ' || $s$update public.cargo_listings
                set loading_country = 'RO', unloading_country = 'RO',
                    loading_county = 'CJ', unloading_county = 'TM',
                    posted_by = 'f0000000-0000-0000-0000-000000000006',
                    company_id = null, board = 'retur'
                where id = 'f1000000-0000-0000-0000-000000000004';
                update public.companies
                set coverage_scope = 'judetean', coverage_counties = array['BV']
                where id = 'fc000000-0000-0000-0000-000000000001'$s$);

select pg_temp.check('MAT  a car that does not roll needs a firm with a winch', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.count_matching_carriers('f1000000-0000-0000-0000-000000000002') = 0$a$,
  'true',
  p_setup => :'mat_isolate' || '; ' || $s$update public.cargo_vehicle_details set is_running = false
                where cargo_listing_id = 'f1000000-0000-0000-0000-000000000002';
                update public.companies set equipment = '{}'
                where id = 'fc000000-0000-0000-0000-000000000001'$s$);

select pg_temp.check('MAT  and is counted once the firm has one', 'guard',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.count_matching_carriers('f1000000-0000-0000-0000-000000000002') = 1$a$,
  'true',
  p_setup => :'mat_isolate' || '; ' || $s$update public.cargo_vehicle_details set is_running = false
                where cargo_listing_id = 'f1000000-0000-0000-0000-000000000002';
                update public.companies set equipment = array['troliu']
                where id = 'fc000000-0000-0000-0000-000000000001'$s$);

select pg_temp.check('MAT  a suspended carrier is not a verified one', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.count_matching_carriers('f1000000-0000-0000-0000-000000000002') = 0$a$,
  'true',
  p_setup => :'mat_isolate' || '; ' || $s$update public.companies set is_suspended = true
                where id = 'fc000000-0000-0000-0000-000000000001'$s$);

select pg_temp.check('MAT  nor is one on its way out', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.count_matching_carriers('f1000000-0000-0000-0000-000000000002') = 0$a$,
  'true',
  p_setup => :'mat_isolate' || '; ' || $s$update public.companies set deletion_scheduled_at = now()
                where id = 'fc000000-0000-0000-0000-000000000001'$s$);

select pg_temp.check('MAT  the preview needs a session', 'fix',
  null, 'anon',
  $a$select public.preview_matching_carriers('RO', null, 'RO', null) >= 0$a$,
  'blocked',
  p_setup => :'mat_isolate');

select pg_temp.check('MAT  the preview answers the same number', 'guard',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.preview_matching_carriers('RO', null, 'RO', null) = 1$a$,
  'true',
  p_setup => :'mat_isolate');

select pg_temp.check('MAT  thirty routes an hour, and no more', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.preview_matching_carriers('RO', null, 'RO', null) >= 0$a$,
  'blocked',
  p_setup => :'mat_isolate' || '; ' || $s$insert into public.carrier_count_probes (user_id)
                select 'f0000000-0000-0000-0000-000000000006' from generate_series(1, 30)$s$);

select pg_temp.check('MAT  an hour later it answers again', 'guard',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.preview_matching_carriers('RO', null, 'RO', null) >= 0$a$,
  'true',
  p_setup => :'mat_isolate' || '; ' || $s$insert into public.carrier_count_probes (user_id, created_at)
                select 'f0000000-0000-0000-0000-000000000006', now() - interval '2 hours'
                from generate_series(1, 30)$s$);

select pg_temp.check('MAT  the probe log is not a table a browser reads', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select count(*) from public.carrier_count_probes$a$, 'blocked',
  p_setup => $s$insert into public.carrier_count_probes (user_id)
                values ('f0000000-0000-0000-0000-000000000006')$s$);

select pg_temp.check('MAT  the route count itself is not callable from a browser', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.count_matching_carriers_on_route('RO', null, 'RO', null) >= 0$a$,
  'blocked',
  p_setup => :'mat_isolate');

select pg_temp.check('MAT  nor is the rule, which would name a firm', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.company_matches_route('fc000000-0000-0000-0000-000000000001',
       'RO', null, 'RO', null)$a$, 'blocked',
  p_setup => :'mat_isolate');

-- A count is a count. Anything that returned a set could be read as a
-- list of firms, which is the one thing this feature must never be.
select pg_temp.check('MAT  nothing here can return a name', 'fix',
  null, 'anon',
  $a$select bool_and(p.prorettype = 'integer'::regtype and not p.proretset)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('count_matching_carriers', 'preview_matching_carriers',
                         'count_matching_carriers_on_route')$a$, 'true',
  p_setup => :'mat_isolate');

-- =====================================================================
-- LAW - accepting the terms, and letting go of the reveal log
--
-- Migrations 20260918220000 and 20260918230000.
--
-- Consent that the person consenting can write is not evidence of
-- anything, so the first half of this block is about the fact that they
-- cannot: not the version, not the date, not a row in the history. The
-- second half is the retention period from
-- `docs/06-gdpr-and-antifraud.md`, which was a sentence in a document for
-- as long as it took somebody to ask why we still held a record of who
-- looked at their telephone number two years ago.
-- =====================================================================

select pg_temp.check('LAW  nobody writes their own acceptance', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$insert into public.terms_acceptances (user_id, document, version)
     values ('f0000000-0000-0000-0000-000000000006', 'termeni', '9.9')$a$, 'blocked');

select pg_temp.check('LAW  nor the version on their profile', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$update public.profiles set terms_version_accepted = '9.9'
     where id = 'f0000000-0000-0000-0000-000000000006'$a$, 'blocked');

select pg_temp.check('LAW  nor the date they agreed', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$update public.profiles set terms_accepted_at = now() - interval '2 years'
     where id = 'f0000000-0000-0000-0000-000000000006'$a$, 'blocked');

select pg_temp.check('LAW  accepting records the version on the profile', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select (public.accept_terms('1.0')).version = '1.0'$a$, 'true',
  p_verify => $v$select terms_version_accepted = '1.0' and terms_accepted_at is not null
     from public.profiles where id = 'f0000000-0000-0000-0000-000000000006'$v$);

select pg_temp.check('LAW  and in the history, which the profile cannot hold', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select (public.accept_terms('2.0')).version = '2.0'$a$, 'true',
  p_verify => $v$select count(*) = 2 from public.terms_acceptances
     where user_id = 'f0000000-0000-0000-0000-000000000006'$v$,
  p_setup => $s$insert into public.terms_acceptances (user_id, document, version)
                values ('f0000000-0000-0000-0000-000000000006', 'termeni', '1.0')$s$);

select pg_temp.check('LAW  accepting the same version twice keeps the first time', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select (public.accept_terms('1.0')).accepted_at < now() - interval '300 days'$a$, 'true',
  p_setup => $s$insert into public.terms_acceptances (user_id, document, version, accepted_at)
                values ('f0000000-0000-0000-0000-000000000006', 'termeni', '1.0',
                        now() - interval '1 year')$s$);

select pg_temp.check('LAW  a version that is not a version is refused', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select (public.accept_terms('am citit')).version is not null$a$, 'blocked');

select pg_temp.check('LAW  a visitor accepts nothing', 'fix',
  null, 'anon',
  $a$select (public.accept_terms('1.0')).version is not null$a$, 'blocked');

select pg_temp.check('LAW  one person cannot read another''s consent', 'fix',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  $a$select count(*) = 0 from public.terms_acceptances$a$, 'true',
  p_setup => $s$insert into public.terms_acceptances (user_id, document, version)
                values ('f0000000-0000-0000-0000-000000000006', 'termeni', '1.0')$s$);

select pg_temp.check('LAW  staff can, which is what a complaint needs', 'guard',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select count(*) = 1 from public.terms_acceptances$a$, 'true',
  p_setup => $s$insert into public.terms_acceptances (user_id, document, version)
                values ('f0000000-0000-0000-0000-000000000006', 'termeni', '1.0')$s$);

-- Sign-up is where almost every acceptance is recorded, and it happens
-- inside a trigger on a table no application role can write.
select pg_temp.check('LAW  sign-up carries the version it showed', 'fix',
  null, 'service_role',
  $a$select count(*) = 1 from public.terms_acceptances
     where user_id = 'f0000000-0000-0000-0000-0000000000e1' and version = '1.0'$a$, 'true',
  p_setup => $s$insert into auth.users (id, email, raw_user_meta_data) values
     ('f0000000-0000-0000-0000-0000000000e1', 'lawsignup@test.ro',
      '{"full_name":"Nou","account_type":"individual","terms_version":"1.0"}')$s$);

select pg_temp.check('LAW  and the profile with it', 'fix',
  null, 'service_role',
  $a$select terms_version_accepted = '1.0' and terms_accepted_at is not null
     from public.profiles where id = 'f0000000-0000-0000-0000-0000000000e2'$a$, 'true',
  p_setup => $s$insert into auth.users (id, email, raw_user_meta_data) values
     ('f0000000-0000-0000-0000-0000000000e2', 'lawsignup2@test.ro',
      '{"full_name":"Nou","account_type":"individual","terms_version":"1.0"}')$s$);

select pg_temp.check('LAW  a sign-up with no version is not refused, only unrecorded', 'guard',
  null, 'service_role',
  $a$select terms_version_accepted is null
     from public.profiles where id = 'f0000000-0000-0000-0000-0000000000e3'$a$, 'true',
  p_setup => $s$insert into auth.users (id, email, raw_user_meta_data) values
     ('f0000000-0000-0000-0000-0000000000e3', 'lawsignup3@test.ro',
      '{"full_name":"Nou","account_type":"individual"}')$s$);

select pg_temp.check('LAW  and a version the browser invented is not stored', 'fix',
  null, 'service_role',
  $a$select terms_version_accepted is null
     from public.profiles where id = 'f0000000-0000-0000-0000-0000000000e4'$a$, 'true',
  p_setup => $s$insert into auth.users (id, email, raw_user_meta_data) values
     ('f0000000-0000-0000-0000-0000000000e4', 'lawsignup4@test.ro',
      '{"full_name":"Nou","account_type":"individual","terms_version":"am citit tot"}')$s$);

-- --- Retention -------------------------------------------------------
select pg_temp.check('LAW  a reveal older than the period is deleted', 'fix',
  null, 'service_role',
  $a$select public.purge_contact_reveals() = 1$a$, 'true',
  p_verify => $v$select count(*) = 0 from public.contact_reveals$v$,
  p_setup => $s$delete from public.contact_reveals;
                insert into public.contact_reveals (user_id, cargo_listing_id, created_at)
                values ('f0000000-0000-0000-0000-000000000006',
                        'f1000000-0000-0000-0000-000000000001', now() - interval '25 months')$s$);

select pg_temp.check('LAW  one inside the period stays', 'fix',
  null, 'service_role',
  $a$select public.purge_contact_reveals() = 0$a$, 'true',
  p_verify => $v$select count(*) = 1 from public.contact_reveals$v$,
  p_setup => $s$delete from public.contact_reveals;
                insert into public.contact_reveals (user_id, cargo_listing_id, created_at)
                values ('f0000000-0000-0000-0000-000000000006',
                        'f1000000-0000-0000-0000-000000000001', now() - interval '23 months')$s$);

select pg_temp.check('LAW  the period is the setting, not a constant', 'fix',
  null, 'service_role',
  $a$select public.purge_contact_reveals() = 1$a$, 'true',
  p_setup => $s$delete from public.contact_reveals;
                update public.deletion_settings set contact_reveal_months = 12;
                insert into public.contact_reveals (user_id, cargo_listing_id, created_at)
                values ('f0000000-0000-0000-0000-000000000006',
                        'f1000000-0000-0000-0000-000000000001', now() - interval '13 months')$s$);

select pg_temp.check('LAW  the clock can be handed to it, which is how this is tested', 'guard',
  null, 'service_role',
  $a$select public.purge_contact_reveals(now() + interval '25 months') = 1$a$, 'true',
  p_setup => $s$delete from public.contact_reveals;
                insert into public.contact_reveals (user_id, cargo_listing_id, created_at)
                values ('f0000000-0000-0000-0000-000000000006',
                        'f1000000-0000-0000-0000-000000000001', now())$s$);

select pg_temp.check('LAW  a run that deletes nothing still says it ran', 'fix',
  null, 'service_role',
  $a$select public.purge_contact_reveals() = 0$a$, 'true',
  p_verify => $v$select exists (select 1 from public.job_run_log
     where workflow = 'nightly-retention')$v$,
  p_setup => $s$delete from public.contact_reveals; delete from public.job_run_log$s$);

select pg_temp.check('LAW  nobody purges the log from a browser', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.purge_contact_reveals() >= 0$a$, 'blocked');

select pg_temp.check('LAW  nor shortens the period to make it disappear', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$update public.deletion_settings set contact_reveal_months = 1$a$, 'blocked');

select pg_temp.check('LAW  staff change it through the audited call', 'guard',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select (public.set_deletion_settings(21, 'ajutor@exemplu.ro', 36)).contact_reveal_months = 36$a$,
  'true',
  p_verify => $v$select exists (select 1 from public.audit_log
     where action = 'settings.deletion_changed')$v$);

-- =====================================================================
-- JOB - the scheduled jobs are actually scheduled
--
-- This is the check that did not exist in September, and its absence is
-- why nobody could tell a project with a nightly compliance sweep from
-- one without: every migration succeeded either way, because no test
-- asked. pg_cron was never enabled, so for weeks the insurance-expiry
-- suspension the client asked for was enforced by nothing at all.
--
-- The throwaway database cannot have the real pg_cron — it needs
-- shared_preload_libraries — so `supabase_shim.sql` stubs `cron.schedule`
-- and `net.http_post` and lets the scheduling blocks run exactly as they
-- do on a project that has them. What is asserted below is therefore the
-- real code path, not a description of it.
--
-- A job removed from a migration, or a scheduling block that returns
-- early because somebody moved a guard, fails here.
-- =====================================================================

select pg_temp.check('JOB  every job a migration schedules is scheduled', 'fix',
  null, 'service_role',
  $a$select string_agg(jobname, ', ' order by jobname) =
     'account-deletion, hourly-booking-expiry-alerts, hourly-listing-cleanup, '
     'hourly-push-cleanup, nightly-compliance-sweep, nightly-expiry-reminders, '
     'nightly-listing-expiry-reminders, nightly-retention, '
     'nightly-saved-search-digest, outbox-dispatcher'
     from cron.job$a$, 'true');

select pg_temp.check('JOB  and every one of them is active', 'fix',
  null, 'service_role',
  $a$select bool_and(coalesce(active, false)) from cron.job$a$, 'true');

select pg_temp.check('JOB  the compliance sweep runs the compliance sweep', 'fix',
  null, 'service_role',
  $a$select command like '%run_compliance_sweep%'
     from cron.job where jobname = 'nightly-compliance-sweep'$a$, 'true');

select pg_temp.check('JOB  the reminders job queues reminders', 'fix',
  null, 'service_role',
  $a$select command like '%queue_expiry_reminders%'
     from cron.job where jobname = 'nightly-expiry-reminders'$a$, 'true');

select pg_temp.check('JOB  the listing reminder queues listing reminders', 'fix',
  null, 'service_role',
  $a$select command like '%queue_listing_expiry_reminders%'
     from cron.job where jobname = 'nightly-listing-expiry-reminders'$a$, 'true');

select pg_temp.check('JOB  the digest job queues digests', 'fix',
  null, 'service_role',
  $a$select command like '%queue_saved_search_digests%'
     from cron.job where jobname = 'nightly-saved-search-digest'$a$, 'true');

select pg_temp.check('JOB  the cleanup job expires stale listings', 'fix',
  null, 'service_role',
  $a$select command like '%expire_stale_listings%'
     from cron.job where jobname = 'hourly-listing-cleanup'$a$, 'true');

select pg_temp.check('JOB  the dispatcher calls the outbox function', 'fix',
  null, 'service_role',
  $a$select command like '%dispatch_outbox_http%'
     from cron.job where jobname = 'outbox-dispatcher'$a$, 'true');

select pg_temp.check('JOB  the deletion job calls the deletion function', 'fix',
  null, 'service_role',
  $a$select command like '%dispatch_account_deletions_http%'
     from cron.job where jobname = 'account-deletion'$a$, 'true');

-- Every job `job_health()` expects has to be one that exists, and every
-- job that exists has to be one it watches. A job scheduled but not
-- watched is a job that can stop without anybody noticing, which is the
-- whole failure this block exists to prevent.
-- Compared against the same literal as the check above rather than
-- against `cron.job` directly: staff read the schedule through
-- `job_health()` and have no business reading the `cron` schema, so the
-- two lists meet on the page instead of in a join.
select pg_temp.check('JOB  the health screen watches exactly those', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select string_agg(job, ', ' order by job) =
     'account-deletion, hourly-booking-expiry-alerts, hourly-listing-cleanup, '
     'hourly-push-cleanup, nightly-compliance-sweep, nightly-expiry-reminders, '
     'nightly-listing-expiry-reminders, nightly-retention, '
     'nightly-saved-search-digest, outbox-dispatcher'
     from public.job_health()$a$, 'true');

select pg_temp.check('JOB  and reports them as scheduled', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select bool_and(scheduled) from public.job_health()$a$, 'true');

select pg_temp.check('JOB  a visitor cannot read the schedule', 'fix',
  null, 'anon',
  $a$select count(*) from cron.job$a$, 'blocked');

-- =====================================================================
-- Report
-- =====================================================================
drop function public.zz_rls_default_privilege_probe();

-- =====================================================================
-- PUB - who may publish a request, after 20260920100000
--
-- The rule that was closed by accident. Publishing used to need a phone
-- confirmed by SMS, and no SMS provider was ever configured, so the whole
-- individual side of the marketplace was shut by a condition nobody could
-- meet. These checks pin down both halves of the replacement: what
-- publishing asks for now, and what still asks for a verified number.
-- =====================================================================

select pg_temp.check('PUB  a confirmed e-mail and a phone on file is enough to publish', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select (public.create_cargo_request(
       p_from_city => 'Cluj-Napoca', p_to_city => 'Arad',
       p_loading_from => (now() at time zone 'Europe/Bucharest')::date + 3,
       p_category => 'autoturism', p_make => 'VW', p_model => 'Golf',
       p_year => 2015, p_is_running => true)).request_status = 'active'$a$,
  'true',
  -- The individual plan allows two active requests and the fixtures use
  -- both, so the quota would refuse a third and this check would read as
  -- a publish-guard failure. Clearing them first keeps it about the guard.
  p_setup => $s$update public.cargo_listings set status = 'cancelled'
                  where posted_by = 'f0000000-0000-0000-0000-000000000006'$s$);

select pg_temp.check('PUB  an unconfirmed address cannot', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select (public.create_cargo_request(
       p_from_city => 'Cluj-Napoca', p_to_city => 'Arad',
       p_loading_from => (now() at time zone 'Europe/Bucharest')::date + 3,
       p_category => 'autoturism', p_make => 'VW', p_model => 'Golf',
       p_year => 2015, p_is_running => true)).publish_error
     like 'Confirmă adresa de e-mail%'$a$,
  'true',
  p_setup => $s$update auth.users set email_confirmed_at = null
                  where id = 'f0000000-0000-0000-0000-000000000006'$s$);

select pg_temp.check('PUB  nor can somebody with no telephone number', 'fix',
  'f0000000-0000-0000-0000-000000000007', 'authenticated',
  $a$select (public.create_cargo_request(
       p_from_city => 'Cluj-Napoca', p_to_city => 'Arad',
       p_loading_from => (now() at time zone 'Europe/Bucharest')::date + 3,
       p_category => 'autoturism', p_make => 'VW', p_model => 'Golf',
       p_year => 2015, p_is_running => true)).request_status$a$,
  'blocked');

-- The RPC refuses first, with its own sentence about the telephone
-- number, so the guard underneath never runs in the check above. This one
-- drives the guard directly, as the role that writes the table.
select pg_temp.check('PUB  and the guard underneath refuses it too', 'fix',
  null, 'service_role',
  $a$insert into public.cargo_listings
       (posted_by, board, listing_kind, title, loading_city, unloading_city,
        loading_from, status)
     values ('f0000000-0000-0000-0000-000000000007', 'retur', 'vehicul', 'Golf 2015',
             'Cluj-Napoca', 'Arad',
             (now() at time zone 'Europe/Bucharest')::date + 3, 'active')$a$,
  'blocked');

select pg_temp.check('PUB  and a phone that was never confirmed by SMS is no longer a reason to refuse', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select (public.create_cargo_request(
       p_from_city => 'Cluj-Napoca', p_to_city => 'Arad',
       p_loading_from => (now() at time zone 'Europe/Bucharest')::date + 3,
       p_category => 'autoturism', p_make => 'VW', p_model => 'Golf',
       p_year => 2015, p_is_running => true)).request_status = 'active'$a$,
  'true',
  p_setup => $s$update public.profiles set phone_verified = false
                  where id = 'f0000000-0000-0000-0000-000000000006';
                update public.cargo_listings set status = 'cancelled'
                  where posted_by = 'f0000000-0000-0000-0000-000000000006'$s$);

-- The other half: opening a stranger's telephone number still needs a
-- confirmed one, and says so in a sentence a person can act on.
select pg_temp.check('PUB  opening a contact still needs a confirmed number', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.reveal_contact('f1000000-0000-0000-0000-000000000001', null)$a$,
  'blocked',
  p_setup => $s$update public.profiles set phone_verified = false
                  where id = 'f0000000-0000-0000-0000-000000000006'$s$);

select pg_temp.check('PUB  and the refusal says where to write', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select case when public.reveal_contact('f1000000-0000-0000-0000-000000000001', null) is null
              then false else false end$a$,
  'blocked',
  p_setup => $s$update public.profiles set phone_verified = false
                  where id = 'f0000000-0000-0000-0000-000000000006';
                update public.deletion_settings set support_email = 'ajutor@coridor.ro' where id$s$);

-- =====================================================================
-- STF - staff confirming a number by hand
--
-- Until an SMS provider exists this is the only way a number becomes
-- verified, so it is a real function with a real audit row.
-- =====================================================================

select pg_temp.check('STF  staff can confirm a number, with a reason', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select (public.staff_set_phone_verified(
       'f0000000-0000-0000-0000-000000000006', true, 'sunat 20.09, a raspuns')).phone_verified$a$,
  'true',
  p_setup => $s$update public.profiles set phone_verified = false
                  where id = 'f0000000-0000-0000-0000-000000000006'$s$,
  p_verify => $v$select exists (select 1 from public.audit_log
                 where action = 'profile.phone_verified'
                   and entity_id = 'f0000000-0000-0000-0000-000000000006')$v$);

select pg_temp.check('STF  without a reason it refuses', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.staff_set_phone_verified(
       'f0000000-0000-0000-0000-000000000006', true, '   ')$a$, 'blocked');

select pg_temp.check('STF  and it cannot confirm a number that is not there', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.staff_set_phone_verified(
       'f0000000-0000-0000-0000-000000000007', true, 'sunat')$a$, 'blocked');

select pg_temp.check('STF  a visitor cannot confirm their own number', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.staff_set_phone_verified(
       'f0000000-0000-0000-0000-000000000006', true, 'eu zic ca e bun')$a$, 'blocked');

select pg_temp.check('STF  a staff confirmation survives a change to the e-mail address', 'fix',
  null, 'service_role',
  $a$select phone_verified from public.profiles
     where id = 'f0000000-0000-0000-0000-000000000006'$a$, 'true',
  p_setup => $s$update public.profiles
                  set phone_verified = true, phone_verified_by_staff = true
                  where id = 'f0000000-0000-0000-0000-000000000006';
                update auth.users set email = 'rls-pf-nou@test.ro'
                  where id = 'f0000000-0000-0000-0000-000000000006'$s$);

select pg_temp.check('STF  but changing the number itself drops it', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$update public.profiles set phone = '+40711000999' where id = auth.uid()$a$,
  'allowed',
  p_setup => $s$update public.profiles
                  set phone_verified = true, phone_verified_by_staff = true
                  where id = 'f0000000-0000-0000-0000-000000000006'$s$,
  p_verify => $v$select not phone_verified and not phone_verified_by_staff
                 from public.profiles where id = 'f0000000-0000-0000-0000-000000000006'$v$);

-- =====================================================================
-- TST - our own accounts, kept out of everything public
--
-- A counter that includes the firms we seeded is a counter that lies, and
-- every number on the homepage invites a visitor to check it.
-- =====================================================================

select pg_temp.check('TST  only staff may mark an account as ours', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select public.staff_set_test_account(
       p_company => 'fc000000-0000-0000-0000-000000000001')$a$, 'blocked');

select pg_temp.check('TST  staff may, and it is audited', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.staff_set_test_account(
       p_company => 'fc000000-0000-0000-0000-000000000001')$a$, 'allowed',
  p_verify => $v$select exists (select 1 from public.audit_log
                 where action = 'company.test_flag'
                   and entity_id = 'fc000000-0000-0000-0000-000000000001')$v$);

select pg_temp.check('TST  a test firm disappears from the verified count', 'fix',
  null, 'anon',
  $a$select (public.directory_stats()).verified_companies = 0$a$, 'true',
  p_setup => $s$update public.companies set is_test = true$s$);

select pg_temp.check('TST  a test firm cannot be listed in the directory', 'fix',
  null, 'service_role',
  $a$select not public_profile_enabled from public.companies
     where id = 'fc000000-0000-0000-0000-000000000001'$a$, 'true',
  p_setup => $s$update public.companies
                  set is_test = true, public_profile_enabled = true
                  where id = 'fc000000-0000-0000-0000-000000000001'$s$);

select pg_temp.check('TST  a test account''s request is off the public board', 'fix',
  null, 'anon',
  $a$select not exists (select 1 from public.v_requests_public
                        where id = 'f1000000-0000-0000-0000-000000000001')$a$, 'true',
  p_setup => $s$update public.profiles set is_test = true
                  where id = (select posted_by from public.cargo_listings
                              where id = 'f1000000-0000-0000-0000-000000000001')$s$);

select pg_temp.check('TST  and out of the route count a client is shown', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.preview_matching_carriers('RO', null, 'RO', null) = 0$a$, 'true',
  p_setup => $s$update public.companies set is_test = true;
                delete from public.carrier_count_probes$s$);

-- =====================================================================
-- DUR - how long a request stays on the board
-- =====================================================================

select pg_temp.check('DUR  the client''s choice decides when it comes off', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select (public.create_cargo_request(
       p_from_city => 'Cluj-Napoca', p_to_city => 'Arad',
       p_loading_from => (now() at time zone 'Europe/Bucharest')::date + 2,
       p_category => 'autoturism', p_make => 'VW', p_model => 'Golf', p_year => 2015,
       p_is_running => true, p_duration_days => 3)).request_status = 'active'$a$,
  'true',
  p_setup => $s$update public.cargo_listings set status = 'cancelled'
                  where posted_by = 'f0000000-0000-0000-0000-000000000006'$s$,
  p_verify => $v$select expires_at < now() + interval '4 days'
                 from public.cargo_listings
                 where posted_by = 'f0000000-0000-0000-0000-000000000006'
                 order by created_at desc limit 1$v$);

select pg_temp.check('DUR  a duration nobody offers is refused by the column, not the form', 'fix',
  null, 'service_role',
  $a$update public.cargo_listings set duration_days = 365
     where id = 'f1000000-0000-0000-0000-000000000001'$a$, 'blocked');

-- =====================================================================
-- MAIL - what the provider tells us back
-- =====================================================================

select pg_temp.check('MAIL  a hard bounce marks the address and skips what is queued', 'fix',
  null, 'service_role',
  $a$select public.flag_email_undeliverable('rls-pf@test.ro', 'mailbox does not exist') = 1$a$,
  'true',
  p_setup => $s$insert into public.notification_outbox (channel, template, to_email)
                values ('email', 'company_verified', 'rls-pf@test.ro')$s$,
  p_verify => $v$select email_undeliverable_at is not null
                 from public.profiles where id = 'f0000000-0000-0000-0000-000000000006'$v$);

select pg_temp.check('MAIL  a visitor cannot flag somebody else''s address', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.flag_email_undeliverable('rls-owner-a@test.ro', 'nu imi place')$a$, 'blocked');

select pg_temp.check('MAIL  only staff clear the flag, and it is audited', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select (public.staff_clear_email_undeliverable(
       'f0000000-0000-0000-0000-000000000006')).email_undeliverable_at is null$a$, 'true',
  p_setup => $s$update public.profiles set email_undeliverable_at = now()
                  where id = 'f0000000-0000-0000-0000-000000000006'$s$,
  p_verify => $v$select exists (select 1 from public.audit_log
                 where action = 'profile.email_reactivated')$v$);

select pg_temp.check('MAIL  a visitor cannot clear it', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.staff_clear_email_undeliverable(
       'f0000000-0000-0000-0000-000000000006')$a$, 'blocked');

select pg_temp.check('MAIL  the dispatcher records the provider''s id', 'fix',
  null, 'service_role',
  $a$select public.finish_outbox(
       (select id from public.notification_outbox order by created_at desc limit 1),
       'sent', null, now(), 'resend-abc-123') = 'sent'$a$, 'true',
  p_setup => $s$insert into public.notification_outbox (channel, template, to_email)
                values ('email', 'company_verified', 'cineva@exemplu.ro')$s$,
  p_verify => $v$select provider_message_id = 'resend-abc-123'
                 from public.notification_outbox order by created_at desc limit 1$v$);

select pg_temp.check('MAIL  staff only for the test send, and it is audited', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.enqueue_test_notification(
       'company_verified', 'edi@exemplu.ro', '{"company_name":"Test SRL"}'::jsonb) is not null$a$,
  'true',
  p_verify => $v$select exists (select 1 from public.audit_log
                 where action = 'notification.test_send')$v$);

select pg_temp.check('MAIL  a visitor cannot send themselves one', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.enqueue_test_notification('company_verified', 'oricine@exemplu.ro')$a$,
  'blocked');

select pg_temp.check('MAIL  and an address that is not one is refused', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.enqueue_test_notification('company_verified', 'nu e o adresa')$a$,
  'blocked');

select pg_temp.check('MAIL  the provider state is staff-only reading', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select (public.mail_provider_state()).queued_now >= 0$a$, 'true');

-- =====================================================================
-- REM - telling somebody before the request comes off the board
-- =====================================================================

select pg_temp.check('REM  a request about to expire gets one e-mail, once', 'fix',
  null, 'service_role',
  $a$select public.queue_listing_expiry_reminders() >= 1$a$, 'true',
  p_setup => $s$delete from public.notification_outbox;
                update public.profiles set is_test = false;
                update public.cargo_listings
                  set status = 'active', expires_at = now() + interval '1 day',
                      expiry_reminded_at = null
                  where id = 'f1000000-0000-0000-0000-000000000001'$s$,
  p_verify => $v$select count(*) = 1 from public.notification_outbox
                 where template = 'listing_expiring_soon'$v$);

select pg_temp.check('REM  and not a second time the next night', 'fix',
  null, 'service_role',
  $a$select public.queue_listing_expiry_reminders() = 0$a$, 'true',
  p_setup => $s$delete from public.notification_outbox;
                update public.cargo_listings
                  set status = 'active', expires_at = now() + interval '1 day',
                      expiry_reminded_at = now() - interval '1 hour'
                  where id = 'f1000000-0000-0000-0000-000000000001'$s$);

select pg_temp.check('REM  an address that bounces is not written to again', 'fix',
  null, 'service_role',
  $a$select public.queue_listing_expiry_reminders() = 0$a$, 'true',
  p_setup => $s$delete from public.notification_outbox;
                update public.cargo_listings
                  set status = 'active', expires_at = now() + interval '1 day',
                      expiry_reminded_at = null
                  where id = 'f1000000-0000-0000-0000-000000000001';
                update public.profiles set email_undeliverable_at = now()
                  where id = (select posted_by from public.cargo_listings
                              where id = 'f1000000-0000-0000-0000-000000000001')$s$);

select pg_temp.check('REM  a visitor cannot run the job', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.queue_listing_expiry_reminders()$a$, 'blocked');

-- =====================================================================
-- PIL - the pilot dashboard
-- =====================================================================

select pg_temp.check('PIL  staff can read the two exit criteria', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select carriers_target = 20 and forwarders_target = 5
     from public.pilot_overview()$a$, 'true');

select pg_temp.check('PIL  a visitor cannot', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.pilot_overview()$a$, 'blocked');

select pg_temp.check('PIL  and our own firms are not counted towards them', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select verified_carriers = 0 from public.pilot_overview()$a$, 'true',
  p_setup => $s$update public.companies set is_test = true$s$);

select pg_temp.check('PIL  the weekly series has a row per week, newest last', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select count(*) = 3 from public.pilot_weekly_activity(
       (current_date - 14)::date, current_date)$a$, 'true');

-- =====================================================================
-- PHO - a request's photographs go when the request goes
-- =====================================================================

select pg_temp.check('PHO  deleting a request takes its photographs with it', 'fix',
  null, 'service_role',
  $a$delete from public.cargo_listings
     where id = 'f1000000-0000-0000-0000-000000000001'$a$, 'allowed',
  p_setup => $s$insert into storage.objects (bucket_id, name, owner)
                values ('listing-photos',
                        'f0000000-0000-0000-0000-000000000006/foto-1.jpg',
                        'f0000000-0000-0000-0000-000000000006');
                update public.cargo_listings
                  set photo_paths = array['f0000000-0000-0000-0000-000000000006/foto-1.jpg']
                  where id = 'f1000000-0000-0000-0000-000000000001'$s$,
  p_verify => $v$select not exists (select 1 from storage.objects
                 where name = 'f0000000-0000-0000-0000-000000000006/foto-1.jpg')$v$);




-- =====================================================================
-- DET - the detour tolerance, finally read
--
-- `max_detour_km` has been on truck_listings since 20260916120300 with a
-- default of 50 and no reader at all. These pin down the three answers
-- that matter: inside the tolerance, outside it, and no route to measure
-- against — which is not the same as a bad fit and must not be treated
-- as one.
-- =====================================================================

select pg_temp.check('DET  the insertion detour is what it costs to take the job', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  -- A route along the 45th parallel, and a request just off it. The
  -- numbers are checked loosely on purpose: the point is the shape of the
  -- formula, not the fourth decimal of a haversine.
  $a$select public.detour_km(45, 21, 45, 26, 45, 22, 45, 25) < 5$a$, 'true');

select pg_temp.check('DET  a request far off the line costs a lot', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select public.detour_km(45, 21, 45, 26, 48, 22, 48, 25) > 300$a$, 'true');

select pg_temp.check('DET  a missing coordinate is "cannot tell", not zero', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select public.detour_km(45, 21, 45, 26, null, 22, 45, 25) is null$a$, 'true');

select pg_temp.check('DET  a firm with no published route is not ruled out', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select public.company_detour_ok('fc000000-0000-0000-0000-000000000002', 45, 21, 45, 26)$a$,
  'true');

select pg_temp.check('DET  a request inside the tolerance matches', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select public.company_detour_ok('fc000000-0000-0000-0000-000000000001', 45.1, 21.1, 45.1, 25.9)$a$,
  'true',
  p_setup => $s$update public.truck_listings
                  set from_lat = 45, from_lng = 21, to_lat = 45, to_lng = 26,
                      max_detour_km = 200, status = 'active',
                      available_from = (now() at time zone 'Europe/Bucharest')::date + 2
                  where company_id = 'fc000000-0000-0000-0000-000000000001'$s$);

select pg_temp.check('DET  and one outside it does not', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select not public.company_detour_ok('fc000000-0000-0000-0000-000000000001', 48, 22, 48, 25)$a$,
  'true',
  p_setup => $s$update public.truck_listings
                  set from_lat = 45, from_lng = 21, to_lat = 45, to_lng = 26,
                      max_detour_km = 40, status = 'active',
                      available_from = (now() at time zone 'Europe/Bucharest')::date + 2
                  where company_id = 'fc000000-0000-0000-0000-000000000001'$s$);

select pg_temp.check('DET  a route with no tolerance falls back to the setting', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select tolerance_km = 50 from public.best_route_detour(
       'fc000000-0000-0000-0000-000000000001', 45.1, 21.1, 45.1, 25.9)$a$,
  'true',
  p_setup => $s$update public.truck_listings
                  set from_lat = 45, from_lng = 21, to_lat = 45, to_lng = 26,
                      max_detour_km = 0, status = 'active',
                      available_from = (now() at time zone 'Europe/Bucharest')::date + 2
                  where company_id = 'fc000000-0000-0000-0000-000000000001'$s$);

select pg_temp.check('DET  and the setting is what the team says it is', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select (public.set_matching_settings(90, 30)).default_detour_km = 90$a$, 'true',
  p_verify => $v$select exists (select 1 from public.audit_log
                 where action = 'settings.matching_changed')$v$);

select pg_temp.check('DET  a visitor cannot move it', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.set_matching_settings(500, 365)$a$, 'blocked');

-- =====================================================================
-- SRC - saved searches and their alerts
-- =====================================================================

select pg_temp.check('SRC  somebody saves a search of their own', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select (public.save_search('Germania → România', 'cargo',
       '{"from_country":"DE","to_country":"RO"}'::jsonb)).name = 'Germania → România'$a$,
  'true');

select pg_temp.check('SRC  a search with no name is refused', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select public.save_search('   ', 'cargo', '{}'::jsonb)$a$, 'blocked');

select pg_temp.check('SRC  the plan limit is applied, and names the plan', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  -- The individual plan allows one saved search. The second is the one
  -- that has to be refused with a sentence somebody can act on.
  $a$select public.save_search('A doua', 'cargo', '{}'::jsonb)$a$, 'blocked',
  p_setup => $s$insert into public.saved_searches (user_id, name, target, filters)
                values ('f0000000-0000-0000-0000-000000000006', 'Prima', 'cargo', '{}')$s$);

select pg_temp.check('SRC  the quota says what is used and what is allowed', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select used = 0 and allowed = 1
     from public.saved_search_quota('f0000000-0000-0000-0000-000000000006')$a$, 'true');

select pg_temp.check('SRC  a visitor cannot read another person''s matches', 'fix',
  'f0000000-0000-0000-0000-000000000004', 'authenticated',
  $a$select count(*) = 0 from public.saved_search_matches$a$, 'true',
  p_setup => $s$insert into public.saved_searches (id, user_id, name, target, filters)
                values ('fe000000-0000-0000-0000-000000000001',
                        'f0000000-0000-0000-0000-000000000002', 'A mea', 'cargo', '{}');
                insert into public.saved_search_matches
                  (saved_search_id, cargo_listing_id, reasons)
                values ('fe000000-0000-0000-0000-000000000001',
                        'f1000000-0000-0000-0000-000000000001', array['Ruta'])$s$);

select pg_temp.check('SRC  and nobody writes a match by hand', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$insert into public.saved_search_matches (saved_search_id, cargo_listing_id, reasons)
     values ('fe000000-0000-0000-0000-000000000001',
             'f1000000-0000-0000-0000-000000000001', array['inventat'])$a$,
  'blocked',
  p_setup => $s$insert into public.saved_searches (id, user_id, name, target, filters)
                values ('fe000000-0000-0000-0000-000000000001',
                        'f0000000-0000-0000-0000-000000000002', 'A mea', 'cargo', '{}')$s$);

select pg_temp.check('SRC  a matching request produces reasons, not just a yes', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select array_length(reasons, 1) >= 2 from public.saved_search_match(
       'fe000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001')$a$,
  'true',
  p_setup => $s$insert into public.saved_searches (id, user_id, name, target, filters)
                values ('fe000000-0000-0000-0000-000000000001',
                        'f0000000-0000-0000-0000-000000000002', 'A mea', 'cargo', '{}');
                update public.cargo_listings set status = 'active'
                  where id = 'f1000000-0000-0000-0000-000000000001'$s$);

select pg_temp.check('SRC  a filter that does not fit returns nothing at all', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select count(*) = 0 from public.saved_search_match(
       'fe000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001')$a$,
  'true',
  p_setup => $s$insert into public.saved_searches (id, user_id, name, target, filters)
                values ('fe000000-0000-0000-0000-000000000001',
                        'f0000000-0000-0000-0000-000000000002', 'A mea', 'cargo',
                        '{"from_country":"ES"}');
                update public.cargo_listings set status = 'active'
                  where id = 'f1000000-0000-0000-0000-000000000001'$s$);

select pg_temp.check('SRC  a paused search matches nothing', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select count(*) = 0 from public.saved_search_match(
       'fe000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001')$a$,
  'true',
  p_setup => $s$insert into public.saved_searches (id, user_id, name, target, filters, is_active)
                values ('fe000000-0000-0000-0000-000000000001',
                        'f0000000-0000-0000-0000-000000000002', 'A mea', 'cargo', '{}', false)$s$);

select pg_temp.check('SRC  the digest groups a day into one e-mail', 'fix',
  null, 'service_role',
  $a$select public.queue_saved_search_digests() = 1$a$, 'true',
  p_setup => $s$delete from public.notification_outbox;
                insert into public.saved_searches (id, user_id, name, target, filters, frequency)
                values ('fe000000-0000-0000-0000-000000000001',
                        'f0000000-0000-0000-0000-000000000002', 'A mea', 'cargo', '{}', 'daily');
                insert into public.saved_search_matches
                  (saved_search_id, cargo_listing_id, reasons)
                values ('fe000000-0000-0000-0000-000000000001',
                        'f1000000-0000-0000-0000-000000000001', array['Ruta']),
                       ('fe000000-0000-0000-0000-000000000001',
                        'f1000000-0000-0000-0000-000000000002', array['Ruta'])$s$,
  p_verify => $v$select count(*) = 1 from public.notification_outbox
                 where template = 'saved_search_digest'$v$);

select pg_temp.check('SRC  and does not send the same day twice', 'fix',
  null, 'service_role',
  $a$select public.queue_saved_search_digests() = 0$a$, 'true',
  p_setup => $s$delete from public.notification_outbox;
                insert into public.saved_searches (id, user_id, name, target, filters, frequency)
                values ('fe000000-0000-0000-0000-000000000001',
                        'f0000000-0000-0000-0000-000000000002', 'A mea', 'cargo', '{}', 'daily');
                insert into public.saved_search_matches
                  (saved_search_id, cargo_listing_id, reasons, notified_at)
                values ('fe000000-0000-0000-0000-000000000001',
                        'f1000000-0000-0000-0000-000000000001', array['Ruta'], now())$s$);

select pg_temp.check('SRC  a visitor cannot run the digest job', 'fix',
  'f0000000-0000-0000-0000-000000000002', 'authenticated',
  $a$select public.queue_saved_search_digests()$a$, 'blocked');

-- =====================================================================
-- REP - reports, and the person who sent one
-- =====================================================================

select pg_temp.check('REP  closing one needs a written decision', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.handle_report('fd000000-0000-0000-0000-000000000001', 'resolved', '  ')$a$,
  'blocked',
  p_setup => $s$insert into public.reports (id, reporter_user_id, reason)
                values ('fd000000-0000-0000-0000-000000000001',
                        'f0000000-0000-0000-0000-000000000006', 'Firma nu răspunde')$s$);

select pg_temp.check('REP  staff closes it, and it is audited', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select (public.handle_report('fd000000-0000-0000-0000-000000000001', 'resolved',
       'Am sunat firma și au confirmat. Anunțul a fost corectat.')).status = 'resolved'$a$,
  'true',
  p_setup => $s$insert into public.reports (id, reporter_user_id, reason)
                values ('fd000000-0000-0000-0000-000000000001',
                        'f0000000-0000-0000-0000-000000000006', 'Firma nu răspunde')$s$,
  p_verify => $v$select exists (select 1 from public.audit_log
                 where action = 'report.resolved'
                   and entity_id = 'fd000000-0000-0000-0000-000000000001')$v$);

select pg_temp.check('REP  and the person who reported it is told', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select (public.handle_report('fd000000-0000-0000-0000-000000000001', 'resolved',
       'Am verificat și am corectat anunțul.')).reporter_notified_at is not null$a$,
  'true',
  p_setup => $s$delete from public.notification_outbox;
                insert into public.reports (id, reporter_user_id, reason)
                values ('fd000000-0000-0000-0000-000000000001',
                        'f0000000-0000-0000-0000-000000000006', 'Firma nu răspunde')$s$,
  p_verify => $v$select count(*) = 1 from public.notification_outbox
                 where template = 'report_closed'$v$);

select pg_temp.check('REP  a visitor cannot close somebody else''s report', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.handle_report('fd000000-0000-0000-0000-000000000001', 'dismissed', 'las-o')$a$,
  'blocked',
  p_setup => $s$insert into public.reports (id, reporter_user_id, reason)
                values ('fd000000-0000-0000-0000-000000000001',
                        'f0000000-0000-0000-0000-000000000006', 'Ceva')$s$);

select pg_temp.check('REP  the reporter reads their own, and nobody else''s', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select count(*) = 1 from public.reports$a$, 'true',
  p_setup => $s$insert into public.reports (reporter_user_id, reason) values
                  ('f0000000-0000-0000-0000-000000000006', 'A mea'),
                  ('f0000000-0000-0000-0000-000000000002', 'A altcuiva')$s$);

-- =====================================================================
-- AUD - reading the audit log
-- =====================================================================

select pg_temp.check('AUD  staff reads it', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select count(*) >= 0 from public.audit_entries()$a$, 'true');

select pg_temp.check('AUD  a visitor does not', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.audit_entries()$a$, 'blocked');

select pg_temp.check('AUD  filtering by action narrows it', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select bool_and(action like 'company.%') from public.audit_entries(p_action => 'company')$a$,
  'true',
  p_missing_ok => true,
  p_setup => $s$insert into public.audit_log (actor_role, action, entity) values
                  ('staff', 'company.verified', 'companies'),
                  ('staff', 'document.approved', 'documents')$s$);

select pg_temp.check('AUD  and the total travels with the page', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select bool_and(total_count >= 2) from public.audit_entries(p_limit => 1)$a$, 'true',
  p_setup => $s$insert into public.audit_log (actor_role, action, entity) values
                  ('staff', 'company.verified', 'companies'),
                  ('staff', 'document.approved', 'documents')$s$);

select pg_temp.check('AUD  the facets are staff-only too', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.audit_facets()$a$, 'blocked');

select pg_temp.check('AUD  and nobody writes to the log through the API', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$insert into public.audit_log (actor_role, action, entity)
     values ('staff', 'inventat', 'nimic')$a$, 'blocked');

-- =====================================================================
-- TEA - the team
-- =====================================================================

select pg_temp.check('TEA  staff sees who works here', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select count(*) >= 1 from public.staff_members()$a$, 'true');

select pg_temp.check('TEA  a visitor does not', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.staff_members()$a$, 'blocked');

select pg_temp.check('TEA  an account can be found by its address', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select count(*) = 1 from public.find_account_by_email('rls-owner-a@test.ro')$a$, 'true');

select pg_temp.check('TEA  but not by anybody else', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$select public.find_account_by_email('rls-owner-a@test.ro')$a$, 'blocked');

select pg_temp.check('TEA  granting works and is audited', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.set_platform_staff('f0000000-0000-0000-0000-000000000002', 'admin',
       'Intră în echipa de verificare')$a$, 'allowed',
  p_verify => $v$select exists (select 1 from public.platform_staff
                 where user_id = 'f0000000-0000-0000-0000-000000000002')
                 and exists (select 1 from public.audit_log where action = 'staff.granted')$v$);

select pg_temp.check('TEA  the last administrator cannot be removed', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.set_platform_staff('f0000000-0000-0000-0000-000000000001', null, 'plec')$a$,
  'blocked',
  -- smoke_test.sql runs first into the same database and leaves a staff
  -- row of its own behind, so „the last one" has to be made true here
  -- rather than assumed. A check written against a constant passes or
  -- fails depending on what ran before it.
  p_setup => $s$delete from public.platform_staff
                  where user_id <> 'f0000000-0000-0000-0000-000000000001'$s$);

select pg_temp.check('TEA  one of two can', 'fix',
  'f0000000-0000-0000-0000-000000000001', 'authenticated',
  $a$select public.set_platform_staff('f0000000-0000-0000-0000-000000000002', null,
       'A plecat din echipă')$a$, 'allowed',
  p_setup => $s$insert into public.platform_staff (user_id) values
                  ('f0000000-0000-0000-0000-000000000002')
                on conflict do nothing$s$,
  p_verify => $v$select not exists (select 1 from public.platform_staff
                 where user_id = 'f0000000-0000-0000-0000-000000000002')$v$);

-- =====================================================================
-- CAT - what the board holds, per category
-- =====================================================================

select pg_temp.check('CAT  a visitor may read the counts', 'fix',
  null, 'anon',
  $a$select count(*) >= 0 from public.category_counts()$a$, 'true');

select pg_temp.check('CAT  a category with nothing in it is absent, not zero', 'fix',
  null, 'anon',
  $a$select not exists (select 1 from public.category_counts() where requests = 0)$a$, 'true');

select pg_temp.check('CAT  our own accounts are not counted', 'fix',
  null, 'anon',
  $a$select count(*) = 0 from public.category_counts()$a$, 'true',
  p_setup => $s$update public.profiles set is_test = true$s$);

select pg_temp.check('CAT  the window is what the team set', 'fix',
  null, 'anon',
  $a$select count(*) = 0 from public.category_counts(1)$a$, 'true',
  p_setup => $s$update public.cargo_listings
                  set published_at = now() - interval '30 days'$s$);

-- psql -v verbose=1 prints why each check passed, not only why one failed.
\if :{?verbose}
select format('%s  %-5s  %s%s',
              case when pass then 'PASS' else 'FAIL' end, kind, label,
              coalesce(E'\n             -> ' || detail, ''))
from rls_results order by n;
\else
select format('%s  %-5s  %s%s',
              case when pass then 'PASS' else 'FAIL' end, kind, label,
              case when pass then '' else E'\n             -> ' || coalesce(detail, '') end)
from rls_results order by n;
\endif

select format(E'\n%s checks: %s passed, %s failed (fix %s/%s passed, guard %s/%s passed)',
              count(*), count(*) filter (where pass), count(*) filter (where not pass),
              count(*) filter (where pass and kind = 'fix'), count(*) filter (where kind = 'fix'),
              count(*) filter (where pass and kind = 'guard'), count(*) filter (where kind = 'guard'))
from rls_results;

do $$
begin
  if exists (select 1 from rls_results where not pass) then
    raise exception 'rls_test: % check(s) failed', (select count(*) from rls_results where not pass);
  end if;
end $$;

\echo 'All RLS checks passed.'
