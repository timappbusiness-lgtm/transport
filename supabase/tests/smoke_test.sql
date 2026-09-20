-- =====================================================================
-- Smoke test for the compliance engine and the trading rules.
--
-- Run against a THROWAWAY database that already has the migrations
-- applied. It writes and deletes data - never point it at production.
--
--   createdb bursa_test
--   psql -d bursa_test -f supabase/tests/supabase_shim.sql     # local only
--   for f in supabase/migrations/*.sql; do psql -d bursa_test -f "$f"; done
--   psql -d bursa_test -f supabase/tests/smoke_test.sql
--
-- Every check prints PASS or FAIL. Any FAIL, or any raised exception,
-- means a migration regressed.
-- =====================================================================

\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

create or replace function pg_temp.check(p_label text, p_condition boolean)
returns void language plpgsql as $$
begin
  if p_condition then
    raise notice 'PASS  %', p_label;
  else
    raise exception 'FAIL  %', p_label;
  end if;
end $$;


-- Creates a vehicle listing plus the details row the publish guard requires.
create or replace function pg_temp.new_vehicle_request(
  p_user uuid, p_title text, p_from text, p_to text,
  p_running boolean default true, p_status listing_status default 'active'
) returns uuid language plpgsql as $$
declare v_id uuid;
begin
  insert into public.cargo_listings (posted_by, board, listing_kind, title,
                                     loading_city, unloading_city, loading_from, weight_kg, status)
  values (p_user, 'retur', 'vehicul', p_title, p_from, p_to, current_date + 2, 1400, 'draft')
  returning id into v_id;

  insert into public.cargo_vehicle_details (cargo_listing_id, category, make, model, year, is_running,
                                            wheels_turn, steering_works)
  values (v_id, 'autoturism', 'Volkswagen', 'Passat', 2018, p_running, p_running, p_running);

  update public.cargo_listings set status = p_status where id = v_id;
  return v_id;
end $$;

-- ---------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------
-- email_confirmed_at is set on every fixture because that is what GoTrue
-- does the moment somebody follows the link, and since 20260920100000 it
-- is what the publish guard asks an individual for.
insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111','carrier@test.ro',now(),'{"full_name":"Ion Pop","account_type":"company"}'),
  ('22222222-2222-2222-2222-222222222222','admin@test.ro',now(),'{"full_name":"Admin","account_type":"company"}'),
  ('33333333-3333-3333-3333-333333333333','pf@test.ro',now(),'{"full_name":"Maria Ion","account_type":"individual"}');

select pg_temp.check('profile is auto-created for every new auth user',
  (select count(*) = 3 from public.profiles));

insert into public.platform_staff (user_id) values ('22222222-2222-2222-2222-222222222222');
update public.profiles set phone_verified = true, phone = '+40722000333'
  where id = '33333333-3333-3333-3333-333333333333';

insert into public.companies (id, cui, legal_name, company_type, contact_email, contact_phone, created_by)
values ('aaaaaaaa-0000-0000-0000-000000000001','14399840','Transport Demo SRL','transport',
        'office@demo.ro','+40722000111','11111111-1111-1111-1111-111111111111');
insert into public.company_members (company_id, user_id, role)
values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','owner');
insert into public.vehicles (id, company_id, plate_number, vehicle_type, max_weight_kg)
values ('bbbbbbbb-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','CJ45XYZ','prelata',24000);

-- ---------------------------------------------------------------------
-- 1. An unverified company cannot reach the board
-- ---------------------------------------------------------------------
do $$
begin
  insert into public.truck_listings (company_id, vehicle_id, posted_by, direction,
                                     from_city, to_city, available_from, status)
  values ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001',
          '11111111-1111-1111-1111-111111111111','retur','Hamburg','Cluj-Napoca', current_date, 'active');
  raise exception 'FAIL  unverified company was allowed to publish';
exception when sqlstate '42501' then
  raise notice 'PASS  unverified company cannot publish';
end $$;

-- ---------------------------------------------------------------------
-- 2. Admin approval verifies the company and its vehicle
-- ---------------------------------------------------------------------
insert into public.documents (company_id, scope, kind, file_path, valid_until, uploaded_by, status) values
  ('aaaaaaaa-0000-0000-0000-000000000001','company','licenta_comunitara','aaaaaaaa/1.pdf', current_date + 400,'11111111-1111-1111-1111-111111111111','pending'),
  ('aaaaaaaa-0000-0000-0000-000000000001','company','certificat_inregistrare_onrc','aaaaaaaa/2.pdf', null,'11111111-1111-1111-1111-111111111111','pending'),
  ('aaaaaaaa-0000-0000-0000-000000000001','company','asigurare_cmr','aaaaaaaa/3.pdf', current_date + 200,'11111111-1111-1111-1111-111111111111','pending');
insert into public.documents (company_id, vehicle_id, scope, kind, file_path, valid_until, uploaded_by, status) values
  ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','vehicle','itp','aaaaaaaa/4.pdf', current_date + 300,'11111111-1111-1111-1111-111111111111','pending'),
  ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','vehicle','rca','aaaaaaaa/5.pdf', current_date + 100,'11111111-1111-1111-1111-111111111111','pending'),
  ('aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','vehicle','copie_conforma','aaaaaaaa/6.pdf', current_date + 350,'11111111-1111-1111-1111-111111111111','pending');

set "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
do $$
declare r record;
begin
  for r in select id from public.documents where status = 'pending' loop
    perform public.review_document(r.id, true);
  end loop;
end $$;
reset "request.jwt.claim.sub";

select pg_temp.check('approving the last blocking document verifies the company',
  (select verification_status = 'verified' and not is_suspended
   from public.companies where id = 'aaaaaaaa-0000-0000-0000-000000000001'));
select pg_temp.check('vehicle becomes compliant once ITP, RCA and copie conformă are approved',
  (select is_compliant from public.vehicles where id = 'bbbbbbbb-0000-0000-0000-000000000001'));

-- ---------------------------------------------------------------------
-- 3. A verified company can publish; expiry defaults are applied
-- ---------------------------------------------------------------------
insert into public.truck_listings (id, company_id, vehicle_id, posted_by, direction,
                                   from_city, to_city, available_from, status, waypoints)
values ('cccccccc-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',
        'bbbbbbbb-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',
        -- The Bucharest date, not the server's. A reservation on this
        -- departure expires at the end of its day in Europe/Bucharest,
        -- and between 21:00 and 24:00 UTC `current_date` is the day
        -- before that — so the departure had already passed, the booking
        -- below was refused, and the suite could not pass for three hours
        -- every night.
        'retur','Hamburg','Cluj-Napoca',
        (now() at time zone 'Europe/Bucharest')::date, 'active', '["Budapesta","Arad"]');
insert into public.listing_contacts (truck_listing_id, contact_name, contact_phone)
values ('cccccccc-0000-0000-0000-000000000001','Ion Pop','+40722000111');

select pg_temp.check('publishing sets published_at and expires_at',
  (select published_at is not null and expires_at is not null
   from public.truck_listings where id = 'cccccccc-0000-0000-0000-000000000001'));

-- ---------------------------------------------------------------------
-- 4. Individuals: return board only
-- ---------------------------------------------------------------------
do $$ begin perform pg_temp.new_vehicle_request(
  '33333333-3333-3333-3333-333333333333','Passat 2018','Cluj-Napoca','Arad'); end $$;

select pg_temp.check('individual can publish on the return board',
  (select count(*) = 1 from public.cargo_listings where company_id is null and status = 'active'));

do $$
begin
  perform pg_temp.new_vehicle_request(
    '33333333-3333-3333-3333-333333333333','Marfă','Cluj','Arad');
  update public.cargo_listings set board = 'curse'
    where posted_by = '33333333-3333-3333-3333-333333333333' and title = 'Marfă';
  raise exception 'FAIL  individual was allowed on the curse board';
exception when check_violation then
  raise notice 'PASS  individual cannot publish on the curse board';
end $$;

-- Since 20260920100000 the publish gate is a confirmed e-mail and a phone
-- number on file, not a phone confirmed by SMS. An unverified phone still
-- blocks opening somebody's contact details — that check is in the RLS
-- suite, where it can be run as the API roles.
update public.profiles set phone_verified = false where id = '33333333-3333-3333-3333-333333333333';
do $$
begin
  perform pg_temp.new_vehicle_request(
    '33333333-3333-3333-3333-333333333333','Golf 2015','Cluj','Arad');
  raise notice 'PASS  an unverified phone no longer blocks publishing';
exception when sqlstate '42501' then
  raise exception 'FAIL  publishing still asks for a phone confirmed by SMS';
end $$;
update public.profiles set phone_verified = true where id = '33333333-3333-3333-3333-333333333333';

-- No phone at all, however, still blocks: a carrier who cannot ring the
-- client has a request they cannot act on.
update public.profiles set phone = null where id = '33333333-3333-3333-3333-333333333333';
do $$
begin
  perform pg_temp.new_vehicle_request(
    '33333333-3333-3333-3333-333333333333','Golf 2016','Cluj','Arad');
  raise exception 'FAIL  a request published with no telephone number on file';
exception when sqlstate '42501' then
  raise notice 'PASS  no phone number on file cannot publish';
end $$;
update public.profiles set phone = '+40722000333' where id = '33333333-3333-3333-3333-333333333333';

-- And so does an unconfirmed address.
update auth.users set email_confirmed_at = null where id = '33333333-3333-3333-3333-333333333333';
do $$
begin
  perform pg_temp.new_vehicle_request(
    '33333333-3333-3333-3333-333333333333','Golf 2017','Cluj','Arad');
  raise exception 'FAIL  a request published from an unconfirmed address';
exception when sqlstate '42501' then
  raise notice 'PASS  an unconfirmed e-mail cannot publish';
end $$;
update auth.users set email_confirmed_at = now() where id = '33333333-3333-3333-3333-333333333333';
-- Every write to auth.users recomputes phone_verified from GoTrue's own
-- columns, and this fixture's phone lives only on the profile — so the
-- restore has to come after the last auth.users write, not before it.
update public.profiles set phone_verified = true where id = '33333333-3333-3333-3333-333333333333';

-- ---------------------------------------------------------------------
-- 5. offers_count stays in sync on insert and delete
-- ---------------------------------------------------------------------
insert into public.offers (id, truck_listing_id, from_user_id, price_amount)
values ('ffffffff-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-000000000001',
        '33333333-3333-3333-3333-333333333333', 500);
select pg_temp.check('offers_count increments on insert',
  (select offers_count = 1 from public.truck_listings where id = 'cccccccc-0000-0000-0000-000000000001'));
delete from public.offers where id = 'ffffffff-0000-0000-0000-000000000001';
select pg_temp.check('offers_count decrements on delete',
  (select offers_count = 0 from public.truck_listings where id = 'cccccccc-0000-0000-0000-000000000001'));

-- ---------------------------------------------------------------------
-- 6. A vehicle document expiring takes the truck off the board,
--    but does NOT suspend the company
-- ---------------------------------------------------------------------
update public.documents set valid_until = current_date - 1 where kind = 'itp';
select pg_temp.check('sweep reports the expired vehicle document',
  (select expired_documents = 1 from public.run_compliance_sweep()));
select pg_temp.check('vehicle is no longer compliant',
  (select not is_compliant from public.vehicles where id = 'bbbbbbbb-0000-0000-0000-000000000001'));
select pg_temp.check('its listing is pulled off the board',
  (select status = 'suspended' from public.truck_listings where id = 'cccccccc-0000-0000-0000-000000000001'));
select pg_temp.check('one bad truck does not suspend the whole company',
  (select not is_suspended from public.companies where id = 'aaaaaaaa-0000-0000-0000-000000000001'));

-- ---------------------------------------------------------------------
-- 7. A company document expiring suspends the company
-- ---------------------------------------------------------------------
update public.documents set valid_until = current_date - 1 where kind = 'licenta_comunitara';
select pg_temp.check('sweep reports one suspended company',
  (select suspended_companies = 1 from public.run_compliance_sweep()));
select pg_temp.check('company is suspended with a reason',
  (select is_suspended and verification_status = 'suspended' and suspension_reason is not null
   from public.companies where id = 'aaaaaaaa-0000-0000-0000-000000000001'));
select pg_temp.check('the suspension is recorded with the missing document kinds',
  (select missing_kinds @> array['licenta_comunitara']::document_kind[]
   from public.account_suspensions where ended_at is null));
select pg_temp.check('a suspension notice is queued exactly once',
  (select count(*) = 1 from public.notification_outbox where template = 'account_suspended'));
select pg_temp.check('the company has no active listings left',
  (select count(*) = 0 from public.cargo_listings
   where company_id = 'aaaaaaaa-0000-0000-0000-000000000001' and status = 'active'));

do $$
begin
  insert into public.cargo_listings (company_id, posted_by, board, listing_kind, title, loading_city,
                                     unloading_city, loading_from, status)
  values ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111',
          'curse','vehicul','Audi A6','Cluj','Arad', current_date, 'active');
  raise exception 'FAIL  suspended company was allowed to publish';
exception when sqlstate '42501' then
  raise notice 'PASS  suspended company cannot publish';
end $$;

set "request.jwt.claim.sub" = '11111111-1111-1111-1111-111111111111';
do $$
begin
  perform public.reveal_contact(null, 'cccccccc-0000-0000-0000-000000000001');
  raise exception 'FAIL  suspended company revealed a contact';
exception when sqlstate '42501' then
  raise notice 'PASS  suspended company cannot reveal contacts';
end $$;
reset "request.jwt.claim.sub";

-- ---------------------------------------------------------------------
-- 8. The real fix: a replacement upload, approved by an admin
-- ---------------------------------------------------------------------
insert into public.documents (id, company_id, scope, kind, file_path, valid_until, uploaded_by, status)
values ('dddddddd-0000-0000-0000-00000000000a','aaaaaaaa-0000-0000-0000-000000000001',
        'company','licenta_comunitara','aaaaaaaa/1-nou.pdf', current_date + 400,
        '11111111-1111-1111-1111-111111111111','pending');

select pg_temp.check('uploading a replacement retires the previous document',
  (select status = 'expired' from public.documents
   where kind = 'licenta_comunitara' and file_path = 'aaaaaaaa/1.pdf'));

set "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
do $$ begin perform public.review_document('dddddddd-0000-0000-0000-00000000000a', true); end $$;
reset "request.jwt.claim.sub";

select pg_temp.check('approving the replacement reactivates the company automatically',
  (select not is_suspended and verification_status = 'verified'
   from public.companies where id = 'aaaaaaaa-0000-0000-0000-000000000001'));
select pg_temp.check('the suspension record is closed',
  (select count(*) = 0 from public.account_suspensions where ended_at is null));
select pg_temp.check('a reactivation notice is queued',
  (select count(*) = 1 from public.notification_outbox where template = 'account_reactivated'));

-- ---------------------------------------------------------------------
-- 9. The sweep is idempotent
-- ---------------------------------------------------------------------
select pg_temp.check('a second sweep changes nothing',
  (select expired_documents = 0 and suspended_companies = 0 and reactivated_companies = 0
   from public.run_compliance_sweep()));

-- ---------------------------------------------------------------------
-- 10. Expiry reminders fire once per milestone
-- ---------------------------------------------------------------------
update public.documents set valid_until = current_date + 7 where kind = 'rca' and status = 'approved';
select pg_temp.check('a reminder is queued at the 7-day milestone',
  (select public.queue_expiry_reminders() = 1));
select pg_temp.check('running it again queues nothing (dedupe_key holds)',
  (select public.queue_expiry_reminders() = 0));

-- ---------------------------------------------------------------------
-- 11. Contact reveal: quota is charged once per listing
-- ---------------------------------------------------------------------
-- Contacts are revealed only for active listings. The sweep took this truck
-- off the board in section 6 (expired ITP); put it back for these checks.
-- Replacing the ITP properly is exercised in section 16.
update public.vehicles set is_compliant = true where id = 'bbbbbbbb-0000-0000-0000-000000000001';
update public.truck_listings set status = 'active' where id = 'cccccccc-0000-0000-0000-000000000001';

set "request.jwt.claim.sub" = '33333333-3333-3333-3333-333333333333';
select pg_temp.check('an individual on the fast account can reveal a contact',
  (select contact_phone = '+40722000111'
   from public.reveal_contact(null, 'cccccccc-0000-0000-0000-000000000001')));
select pg_temp.check('the reveal is logged',
  (select count(*) = 1 from public.contact_reveals));
select pg_temp.check('re-opening the same listing does not charge quota again',
  (select contact_phone is not null
   from public.reveal_contact(null, 'cccccccc-0000-0000-0000-000000000001'))
  and (select count(*) = 1 from public.contact_reveals));
select pg_temp.check('an individual resolves to the individual plan',
  ((public.current_plan(null)).code = 'individual'));
reset "request.jwt.claim.sub";

-- ---------------------------------------------------------------------
-- 12. Plan quota on active listings
-- ---------------------------------------------------------------------
do $$
declare i int;
begin
  for i in 1..5 loop
    perform pg_temp.new_vehicle_request(
      '33333333-3333-3333-3333-333333333333','Cerere '||i,'Cluj','Arad');
  end loop;
  raise exception 'FAIL  listing quota was not enforced';
exception when sqlstate '42501' then
  raise notice 'PASS  listing quota is enforced';
end $$;

-- ---------------------------------------------------------------------
-- 13. Requirement configuration
-- ---------------------------------------------------------------------
insert into public.vehicles (id, company_id, plate_number, vehicle_type)
values ('bbbbbbbb-0000-0000-0000-000000000009','aaaaaaaa-0000-0000-0000-000000000001','B99VAN','autoutilitara_3_5t');
select pg_temp.check('a vehicle under 3.5 t is not asked for a copie conformă',
  (select count(*) = 0 from public.v_vehicle_missing_documents
   where vehicle_id = 'bbbbbbbb-0000-0000-0000-000000000009' and kind = 'copie_conforma'));
select pg_temp.check('a carrier is not asked for forwarder credentials',
  (select count(*) = 0 from public.v_company_missing_documents
   where company_id = 'aaaaaaaa-0000-0000-0000-000000000001' and kind = 'certificat_casa_expeditii'));

-- ---------------------------------------------------------------------
-- 14. Helpers
-- ---------------------------------------------------------------------
select pg_temp.check('distance_km returns a sane Cluj-Timișoara distance',
  (select public.distance_km(46.77, 23.60, 45.75, 21.23) between 200 and 230));
select pg_temp.check('distance_km tolerates missing coordinates',
  (select public.distance_km(46.77, null, 45.75, 21.23) is null));
select pg_temp.check('safe_uuid returns null instead of raising on a bad value',
  (select public.safe_uuid('not-a-uuid') is null));

-- ---------------------------------------------------------------------
-- 15. Vehicle transport model
-- ---------------------------------------------------------------------
do $$ begin perform pg_temp.new_vehicle_request(
  '33333333-3333-3333-3333-333333333333','Duba defecta','Kisigmand','Zalau', false, 'draft'); end $$;

select pg_temp.check('needs_winch is derived from the condition flags',
  (select d.needs_winch from public.cargo_vehicle_details d
   join public.cargo_listings l on l.id = d.cargo_listing_id
   where l.title = 'Duba defecta'));
select pg_temp.check('a rolling vehicle does not need a winch',
  (select not d.needs_winch from public.cargo_vehicle_details d
   join public.cargo_listings l on l.id = d.cargo_listing_id
   where l.title = 'Passat 2018'));

do $$
declare v_id uuid;
begin
  insert into public.cargo_listings (posted_by, board, listing_kind, title, loading_city,
                                     unloading_city, loading_from, status)
  values ('33333333-3333-3333-3333-333333333333','retur','vehicul','Fără detalii',
          'Cluj','Arad', current_date, 'draft')
  returning id into v_id;
  update public.cargo_listings set status = 'active' where id = v_id;
  raise exception 'FAIL  a listing published without its details row';
exception when not_null_violation then
  raise notice 'PASS  a listing cannot publish without its details row';
end $$;

-- ---------------------------------------------------------------------
-- 16. Platform slots
-- ---------------------------------------------------------------------
-- The carrier replaces the ITP that expired back in section 6, so the
-- vehicle becomes compliant again and its departure can go back on the board.
insert into public.documents (id, company_id, vehicle_id, scope, kind, file_path,
                              valid_until, uploaded_by, status)
values ('dddddddd-0000-0000-0000-00000000000b','aaaaaaaa-0000-0000-0000-000000000001',
        'bbbbbbbb-0000-0000-0000-000000000001','vehicle','itp','aaaaaaaa/4-nou.pdf',
        current_date + 365,'11111111-1111-1111-1111-111111111111','pending');
set "request.jwt.claim.sub" = '22222222-2222-2222-2222-222222222222';
do $$ begin perform public.review_document('dddddddd-0000-0000-0000-00000000000b', true); end $$;
reset "request.jwt.claim.sub";

select pg_temp.check('replacing the ITP makes the vehicle compliant again',
  (select is_compliant from public.vehicles where id = 'bbbbbbbb-0000-0000-0000-000000000001'));

update public.truck_listings set platform_slots_total = 8, status = 'active'
  where id = 'cccccccc-0000-0000-0000-000000000001';

insert into public.departure_bookings (truck_listing_id, cargo_listing_id, slots)
select 'cccccccc-0000-0000-0000-000000000001', id, 6
from public.cargo_listings where title = 'Passat 2018';

select pg_temp.check('v_departures reports the free slots',
  (select slots_free = 2 and slots_taken = 6 from public.v_departures
   where truck_listing_id = 'cccccccc-0000-0000-0000-000000000001'));

do $$
begin
  insert into public.departure_bookings (truck_listing_id, cargo_listing_id, slots)
  select 'cccccccc-0000-0000-0000-000000000001', id, 3
  from public.cargo_listings where title = 'Duba defecta';
  raise exception 'FAIL  a platform was overbooked';
exception when check_violation then
  raise notice 'PASS  a platform cannot be overbooked';
end $$;

insert into public.departure_bookings (truck_listing_id, cargo_listing_id, slots)
select 'cccccccc-0000-0000-0000-000000000001', id, 2
from public.cargo_listings where title = 'Duba defecta';

select pg_temp.check('a booking that fits the remaining slots is accepted',
  (select slots_free = 0 and slots_taken = 8 from public.v_departures
   where truck_listing_id = 'cccccccc-0000-0000-0000-000000000001'));

-- ---------------------------------------------------------------------
-- 17. Price transparency
-- ---------------------------------------------------------------------
select pg_temp.check('editorial benchmarks are seeded for the main corridors',
  (select count(*) >= 7 from public.price_benchmarks where to_country = 'RO'));
select pg_temp.check('a corridor with fewer than 5 closed deals publishes no median',
  (select count(*) = 0 from public.v_corridor_prices));

-- ---------------------------------------------------------------------
-- 18. Scheduled jobs
-- ---------------------------------------------------------------------
select pg_temp.check('the nightly sweep, the reminders and the listing cleanup are scheduled',
  (select count(*) = 3 from cron.job
   where jobname in ('nightly-compliance-sweep', 'nightly-expiry-reminders', 'hourly-listing-cleanup')));

\echo ''
\echo 'All checks passed.'
