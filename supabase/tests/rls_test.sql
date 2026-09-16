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
--          list), or a rule added since (INV). Fails on the schema before
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

insert into auth.users (id, email, raw_user_meta_data) values
  ('f0000000-0000-0000-0000-000000000001', 'rls-staff@test.ro',   '{"full_name":"Staff","account_type":"company"}'),
  ('f0000000-0000-0000-0000-000000000002', 'rls-owner-a@test.ro', '{"full_name":"Owner A","account_type":"company"}'),
  ('f0000000-0000-0000-0000-000000000003', 'rls-disp-a@test.ro',  '{"full_name":"Dispatcher A","account_type":"company"}'),
  ('f0000000-0000-0000-0000-000000000004', 'rls-owner-b@test.ro', '{"full_name":"Owner B","account_type":"company"}'),
  ('f0000000-0000-0000-0000-000000000005', 'rls-disp-b@test.ro',  '{"full_name":"Dispatcher B","account_type":"company"}'),
  ('f0000000-0000-0000-0000-000000000006', 'rls-pf@test.ro',      '{"full_name":"Persoană Fizică","account_type":"individual"}'),
  ('f0000000-0000-0000-0000-000000000007', 'rls-pf2@test.ro',     '{"full_name":"Fără Telefon","account_type":"individual"}'),
  ('f0000000-0000-0000-0000-000000000008', 'rls-noco@test.ro',    '{"full_name":"Fără Firmă","account_type":"company"}'),
  ('f0000000-0000-0000-0000-000000000009', 'rls-newco@test.ro',   '{"full_name":"Firmă Nouă","account_type":"company"}'),
  ('f0000000-0000-0000-0000-00000000000a', 'rls-owner-c@test.ro', '{"full_name":"Owner C","account_type":"company"}');

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
  ('fb000000-0000-0000-0000-000000000008', 'fc000000-0000-0000-0000-000000000001', 'fe000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', 'retur', 'Linz',      'Sibiu',       current_date,     'active', 2);

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
                    and (select status from public.truck_listings where id = 'fb000000-0000-0000-0000-000000000001') = 'assigned'
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
                    and (select status from public.cargo_listings where id = 'f1000000-0000-0000-0000-000000000002') = 'assigned'
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
  p_verify => $v$select (select status from public.truck_listings where id = 'fb000000-0000-0000-0000-000000000002') = 'assigned'
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
-- #17 audit_log, #18 n8n_run_log
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

select pg_temp.check('#18  n8n_run_log exists and a user cannot write to it', 'fix',
  'f0000000-0000-0000-0000-000000000006', 'authenticated',
  $a$insert into public.n8n_run_log (workflow) values ('forged')$a$, 'blocked');

select pg_temp.check('#18  n8n (service_role) writes its run log', 'fix',
  null, 'service_role',
  $a$insert into public.n8n_run_log (workflow, processed) values ('outbox-dispatcher', 3)$a$, 'allowed');

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
  p_setup => $s$insert into public.company_invitations (id, company_id, invited_email, role)
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
-- Report
-- =====================================================================
drop function public.zz_rls_default_privilege_probe();

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
