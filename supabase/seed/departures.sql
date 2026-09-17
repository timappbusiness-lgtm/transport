-- =====================================================================
-- Demo departures, for a local or preview database only.
--
-- Run through scripts/seed-departures.sh, which refuses to touch a
-- database that already holds non-demo departures. Every row here carries
-- "DEMO" in its notes, which is both how the guard recognises them and how
-- anyone looking at the data can tell it is not real.
--
-- There is deliberately no seed for production: an empty board is honest,
-- and the empty state was designed for exactly that.
-- =====================================================================

\set ON_ERROR_STOP on
set client_min_messages = warning;

do $seed$
declare
  v_owner uuid;
  v_company uuid;
  v_vehicle uuid;
begin
  -- A demo carrier. Reuses the first verified company when one exists, so
  -- seeding a preview that already has a real account does not create a
  -- second, confusing one.
  select c.id, m.user_id into v_company, v_owner
  from public.companies c
  join public.company_members m on m.company_id = c.id and m.role = 'owner'
  where c.verification_status = 'verified'
  order by c.created_at
  limit 1;

  if v_company is null then
    raise notice 'No verified company found; seed a company first. Nothing written.';
    return;
  end if;

  select id into v_vehicle
  from public.vehicles
  where company_id = v_company
  order by created_at
  limit 1;

  if v_vehicle is null then
    raise notice 'Company % has no vehicle; nothing written.', v_company;
    return;
  end if;

  -- Compliance is computed from documents, so a demo row cannot simply
  -- claim it. Mark the vehicle compliant the way the sweep would.
  update public.vehicles set is_compliant = true, compliance_checked_at = now()
  where id = v_vehicle;

  -- The free plan allows three active listings and this seed writes four:
  -- the quota guard is a real business rule, so the demo company gets a
  -- real plan rather than the guard being worked around.
  -- company_id is not unique on subscriptions (a company keeps its history),
  -- so this replaces rather than upserts.
  delete from public.subscriptions where company_id = v_company;
  insert into public.subscriptions (company_id, plan_code, status, current_period_end)
  values (v_company, 'carrier', 'active', now() + interval '365 days');

  insert into public.truck_listings (
    company_id, vehicle_id, posted_by, direction,
    from_country, from_county, from_city,
    to_country, to_county, to_city,
    waypoints, available_from, available_to,
    platform_slots_total, service_types, accepted_vehicle_types,
    price_indicative, currency, notes, status, published_at
  )
  values
    (v_company, v_vehicle, v_owner, 'retur',
     'DE', 'Bayern', 'München', 'RO', 'Cluj', 'Cluj-Napoca',
     '[{"city":"Viena","country":"AT"},{"city":"Budapesta","country":"HU"}]'::jsonb,
     current_date + 3, current_date + 6,
     8, '{pe_sens,expres}', '{autoturism,autoutilitara,motocicleta}',
     650, 'EUR', 'DEMO — traseu de test', 'active', now()),

    (v_company, v_vehicle, v_owner, 'retur',
     'IT', 'Lombardia', 'Milano', 'RO', 'Timiș', 'Timișoara',
     '[{"city":"Verona","country":"IT"}]'::jsonb,
     current_date + 5, current_date + 9,
     6, '{pe_sens}', '{autoturism,motocicleta}',
     700, 'EUR', 'DEMO — traseu de test', 'active', now()),

    (v_company, v_vehicle, v_owner, 'tur',
     'RO', 'Cluj', 'Cluj-Napoca', 'DE', 'Hamburg', 'Hamburg',
     '[]'::jsonb,
     current_date + 8, current_date + 12,
     8, '{pe_sens,expres}', '{autoturism,autoutilitara,microbuz}',
     820, 'EUR', 'DEMO — traseu de test', 'active', now()),

    -- A single-seat platform: one booking fills it, which is how the
    -- "plină" state is reached without inventing a booking here.
    (v_company, v_vehicle, v_owner, 'retur',
     'NL', 'Noord-Holland', 'Amsterdam', 'RO', 'Bihor', 'Oradea',
     '[]'::jsonb,
     current_date + 4, current_date + 7,
     1, '{pe_sens}', '{autoturism}',
     690, 'EUR', 'DEMO — traseu plin', 'active', now());

  raise notice 'Seeded 4 demo departures for company %.', v_company;
end;
$seed$;
