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
                    and (select status from public.cargo_listings where id = 'f1000000-0000-0000-0000-000000000002') = 'assigned'$v$);

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
       'category','estimated_km','from_city','from_country','id','is_running',
       'make','model','published_at','service_type','to_city','to_country','year'
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
       'city','company_type','compliant_vehicles','county','cui','last_checked_at',
       'legal_name','logo_path','name','public_description','rating_avg','rating_count',
       'serves_international','serves_national','slug','verified_since'
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
