-- =====================================================================
-- Demo transport requests, for a local or preview database only.
--
-- Run through scripts/seed-requests.sh, which refuses to touch a database
-- that already holds requests which are not demo rows. Every row here
-- carries "DEMO" in its title, which is both how the guard recognises them
-- and how anyone looking at the data can tell it is not real.
--
-- There is deliberately no seed for production. The homepage's thresholds
-- exist so that an empty platform says so; seeding it to look busy would be
-- the invented number the whole section was built to avoid.
--
-- What it writes:
--   8 live requests   — enough to clear the default feed threshold of 6
--   ~54 delivered     — enough to clear the default stats threshold of 50,
--                       spread over the last 30 days so the sparkline has a
--                       shape and the seven-day figure is not the total
-- =====================================================================

\set ON_ERROR_STOP on
set client_min_messages = warning;

do $seed$
declare
  v_owner uuid;
  v_company uuid;
  v_id uuid;
  v_routes jsonb := $j$[
    {"from":"Mizil","fc":"RO","flat":45.0103,"flng":26.4506,"to":"Pamplona","tc":"ES","tlat":42.8125,"tlng":-1.6458},
    {"from":"München","fc":"DE","flat":48.1351,"flng":11.5820,"to":"Cluj-Napoca","tc":"RO","tlat":46.7712,"tlng":23.6236},
    {"from":"Milano","fc":"IT","flat":45.4642,"flng":9.1900,"to":"Timișoara","tc":"RO","tlat":45.7489,"tlng":21.2087},
    {"from":"București","fc":"RO","flat":44.4268,"flng":26.1025,"to":"Iași","tc":"RO","tlat":47.1585,"tlng":27.6014},
    {"from":"Paris","fc":"FR","flat":48.8566,"flng":2.3522,"to":"Brașov","tc":"RO","tlat":45.6427,"tlng":25.5887},
    {"from":"Rotterdam","fc":"NL","flat":51.9244,"flng":4.4777,"to":"Oradea","tc":"RO","tlat":47.0465,"tlng":21.9189},
    {"from":"Craiova","fc":"RO","flat":44.3302,"flng":23.7949,"to":"Constanța","tc":"RO","tlat":44.1598,"tlng":28.6348},
    {"from":"Viena","fc":"AT","flat":48.2082,"flng":16.3738,"to":"Sibiu","tc":"RO","tlat":45.7983,"tlng":24.1256},
    {"from":"Stuttgart","fc":"DE","flat":48.7758,"flng":9.1829,"to":"Arad","tc":"RO","tlat":46.1866,"tlng":21.3123},
    {"from":"Bruxelles","fc":"BE","flat":50.8503,"flng":4.3517,"to":"Galați","tc":"RO","tlat":45.4353,"tlng":28.0080}
  ]$j$::jsonb;
  v_vehicles jsonb := $j$[
    {"cat":"autoturism","make":"Opel","model":"Combo","year":2019,"run":true,"svc":"pe_sens"},
    {"cat":"autoturism","make":"Volkswagen","model":"Passat","year":2016,"run":true,"svc":"pe_sens"},
    {"cat":"autoturism","make":"Dacia","model":"Duster","year":2021,"run":false,"svc":"expres"},
    {"cat":"autoutilitara","make":"Ford","model":"Transit","year":2018,"run":true,"svc":"pe_sens"},
    {"cat":"motocicleta","make":"Yamaha","model":"MT-07","year":2020,"run":true,"svc":"expres"},
    {"cat":"autoturism","make":"BMW","model":"Seria 3","year":2015,"run":false,"svc":"pe_sens"},
    {"cat":"microbuz","make":"Mercedes-Benz","model":"Sprinter","year":2017,"run":true,"svc":"pe_sens"},
    {"cat":"autoturism","make":"Renault","model":"Clio","year":2014,"run":true,"svc":"expres"}
  ]$j$::jsonb;
  v_route jsonb;
  v_vehicle jsonb;
  i integer;
begin
  -- Reuses the first verified company, so seeding a preview that already
  -- has a real account does not create a second, confusing one.
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

  -- The free plan allows three active listings and this seed writes eight:
  -- the quota guard is a real business rule, so the demo company gets a
  -- real plan rather than the guard being worked around. company_id is not
  -- unique on subscriptions (a company keeps its history), so this replaces.
  delete from public.subscriptions where company_id = v_company;
  insert into public.subscriptions (company_id, plan_code, status, current_period_end)
  values (v_company, 'carrier', 'active', now() + interval '365 days');

  -- ------------------------------------------------------------------
  -- Live requests. These are what the feed shows, so their publication
  -- times are minutes and hours apart rather than all identical.
  -- ------------------------------------------------------------------
  for i in 0..7 loop
    v_route := v_routes -> i;
    v_vehicle := v_vehicles -> i;

    insert into public.cargo_listings (
      company_id, posted_by, board, listing_kind, service_type,
      title, description,
      loading_country, loading_city, loading_lat, loading_lng,
      unloading_country, unloading_city, unloading_lat, unloading_lng,
      loading_from, loading_to, status
    ) values (
      v_company, v_owner, 'curse', 'vehicul', (v_vehicle ->> 'svc')::public.service_type,
      format('DEMO %s %s', v_vehicle ->> 'make', v_vehicle ->> 'model'),
      'DEMO - rând demonstrativ, nu o cerere reală.',
      v_route ->> 'fc', v_route ->> 'from',
      (v_route ->> 'flat')::numeric, (v_route ->> 'flng')::numeric,
      v_route ->> 'tc', v_route ->> 'to',
      (v_route ->> 'tlat')::numeric, (v_route ->> 'tlng')::numeric,
      current_date + (i % 5), current_date + 10 + (i % 5), 'draft'
    ) returning id into v_id;

    insert into public.cargo_vehicle_details
      (cargo_listing_id, category, make, model, year, is_running)
    values (
      v_id, (v_vehicle ->> 'cat')::public.cargo_category,
      v_vehicle ->> 'make', v_vehicle ->> 'model',
      (v_vehicle ->> 'year')::integer, (v_vehicle ->> 'run')::boolean
    );

    -- Publishing goes through the guards, exactly as the app would do it.
    update public.cargo_listings
    set status = 'active',
        published_at = now() - make_interval(mins => 6 + i * 47)
    where id = v_id;
  end loop;

  -- ------------------------------------------------------------------
  -- History. Delivered rather than active, so the quota and the details
  -- guard do not apply — and so the feed keeps showing only the eight
  -- above while the totals and the sparkline have something to describe.
  -- ------------------------------------------------------------------
  for i in 0..53 loop
    v_route := v_routes -> (i % 10);
    insert into public.cargo_listings (
      company_id, posted_by, board, listing_kind, service_type,
      title, description,
      loading_country, loading_city, loading_lat, loading_lng,
      unloading_country, unloading_city, unloading_lat, unloading_lng,
      loading_from, status, published_at
    ) values (
      v_company, v_owner, 'curse', 'vehicul', 'pe_sens',
      format('DEMO istoric %s', i + 1),
      'DEMO - rând demonstrativ, nu o cerere reală.',
      v_route ->> 'fc', v_route ->> 'from',
      (v_route ->> 'flat')::numeric, (v_route ->> 'flng')::numeric,
      v_route ->> 'tc', v_route ->> 'to',
      (v_route ->> 'tlat')::numeric, (v_route ->> 'tlng')::numeric,
      current_date - 30 + (i % 29), 'delivered',
      now() - make_interval(days => (i * 29) / 54, hours => i % 24)
    );
  end loop;

  raise notice 'Seeded 8 live and 54 delivered demo requests for company %.', v_company;
end
$seed$;
