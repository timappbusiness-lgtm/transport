-- =====================================================================
-- Rază și greutate, pe amândouă panourile
--
-- Panoul de cereri putea fi filtrat după țară, oraș, dată, categorie,
-- stare și serviciu — dar nu după „cât de departe de mine" și nu după
-- greutate. Panoul de trasee, la fel.
--
-- Raza a cerut trei lucruri care lipseau, în ordinea asta:
--
--   1. **Coordonate pe trasee.** `truck_listings.from_lat` există din
--      prima migrare și **nu o scrie nimeni**: nici formularul, nici
--      `create_route_series`, nici generatorul de plecări. Coloana era
--      goală peste tot. Asta nu strica doar filtrul de rază care urma —
--      strica și potrivirea după ocol (`best_route_detour`), care
--      măsoară față de aceleași coordonate și deci nu găsea niciodată
--      nimic. O funcție care se uită la o coloană goală nu dă eroare, dă
--      „nu se potrivește nimic".
--
--   2. **Un loc de unde se iau.** Coordonatele cererilor sunt ștampilate
--      din `src/lib/cities.ts`, un fișier TypeScript. Generatorul de
--      serii este SQL și nu îl poate citi. Deci lista se mută în
--      `localities`, iar `cities.ts` rămâne ce era: lista pe care o
--      arată un picker. Un test ține cele două sincronizate.
--
--   3. **Capacitatea liberă.** `free_capacity_kg` există de la fel de
--      mult timp și e la fel de goală. Formularul de traseu o cere de
--      acum.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Localitățile
--
-- Aceleași 75 pe care le are `src/lib/cities.ts`, cu aceleași
-- coordonate. Nomenclator public: panoul îl citește fără cont, ca să
-- poată desena pickerul de „lângă".
-- ---------------------------------------------------------------------
create table if not exists public.localities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  region text not null,
  country text not null check (country ~ '^[A-Z]{2}$'),
  lat numeric(9, 6) not null check (lat between -90 and 90),
  lng numeric(9, 6) not null check (lng between -180 and 180),
  created_at timestamptz not null default now(),
  constraint localities_unique unique (name, country)
);

comment on table public.localities is
  'Localitățile pentru care avem coordonate. Ștampilează anunțurile prin trigger, ca generatorul de serii (care este SQL) să nu depindă de o listă din TypeScript.';

-- Căutarea se face pe numele normalizat, nu pe cel scris: „cluj napoca"
-- și „Cluj-Napoca" sunt aceeași localitate. Aceeași normalizare ca
-- `normalise()` din `src/lib/cities.ts`, ca pickerul și triggerul să nu
-- găsească lucruri diferite.
--
-- `unaccent` este o extensie care poate lipsi pe un proiect; literele cu
-- semne pe care le avem sunt puține și știute, deci se scriu aici.
create or replace function public.unaccent_simple(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $fn$
  select translate(coalesce(p_text, ''),
                   'ăâîșțĂÂÎȘȚşţŞŢáàäéèëíìïóòôöúùüßçñÁÀÄÉÈËÍÌÏÓÒÔÖÚÙÜÇÑ',
                   'aaistAAISTstSTaaaeeeiiioooouuuscnAAAEEEIIIOOOOUUUCN');
$fn$;

revoke all on function public.unaccent_simple(text) from public, anon, authenticated, service_role;
grant execute on function public.unaccent_simple(text) to anon, authenticated;

create or replace function public.normalise_locality(p_name text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $fn$
  select regexp_replace(lower(public.unaccent_simple(coalesce(p_name, ''))), '[^a-z0-9]', '', 'g');
$fn$;

-- Și `anon`, pentru că `v_departures_public` o cheamă din corpul ei. O
-- vedere își citește tabelele cu drepturile proprietarului, dar o
-- funcție din corpul ei se verifică tot pe apelant — fără grantul ăsta
-- panoul public nu se mai deschide fără cont. Sunt două funcții de
-- șiruri, fără nicio tabelă în ele.
revoke all on function public.normalise_locality(text) from public, anon, authenticated, service_role;
grant execute on function public.normalise_locality(text) to anon, authenticated;

create index if not exists localities_lookup_idx
  on public.localities (public.normalise_locality(name), country);

insert into public.localities (name, region, country, lat, lng) values
  ('București', 'București', 'RO', 44.4268, 26.1025),
  ('Cluj-Napoca', 'Cluj', 'RO', 46.7712, 23.6236),
  ('Timișoara', 'Timiș', 'RO', 45.7489, 21.2087),
  ('Iași', 'Iași', 'RO', 47.1585, 27.6014),
  ('Constanța', 'Constanța', 'RO', 44.1598, 28.6348),
  ('Craiova', 'Dolj', 'RO', 44.3302, 23.7949),
  ('Brașov', 'Brașov', 'RO', 45.6427, 25.5887),
  ('Galați', 'Galați', 'RO', 45.4353, 28.008),
  ('Ploiești', 'Prahova', 'RO', 44.9367, 26.0225),
  ('Oradea', 'Bihor', 'RO', 47.0465, 21.9189),
  ('Brăila', 'Brăila', 'RO', 45.2692, 27.9575),
  ('Arad', 'Arad', 'RO', 46.1866, 21.3123),
  ('Pitești', 'Argeș', 'RO', 44.8565, 24.8692),
  ('Sibiu', 'Sibiu', 'RO', 45.7983, 24.1256),
  ('Bacău', 'Bacău', 'RO', 46.5670, 26.9146),
  ('Târgu Mureș', 'Mureș', 'RO', 46.5425, 24.5579),
  ('Baia Mare', 'Maramureș', 'RO', 47.6573, 23.5681),
  ('Buzău', 'Buzău', 'RO', 45.1500, 26.8333),
  ('Botoșani', 'Botoșani', 'RO', 47.7487, 26.6694),
  ('Satu Mare', 'Satu Mare', 'RO', 47.7900, 22.8850),
  ('Râmnicu Vâlcea', 'Vâlcea', 'RO', 45.1047, 24.3754),
  ('Suceava', 'Suceava', 'RO', 47.6514, 26.2556),
  ('Piatra Neamț', 'Neamț', 'RO', 46.9275, 26.3708),
  ('Drobeta-Turnu Severin', 'Mehedinți', 'RO', 44.6369, 22.6597),
  ('Târgu Jiu', 'Gorj', 'RO', 45.0353, 23.2747),
  ('Târgoviște', 'Dâmbovița', 'RO', 44.9250, 25.4569),
  ('Focșani', 'Vrancea', 'RO', 45.6960, 27.1864),
  ('Bistrița', 'Bistrița-Năsăud', 'RO', 47.1333, 24.4833),
  ('Reșița', 'Caraș-Severin', 'RO', 45.3008, 21.8892),
  ('Slatina', 'Olt', 'RO', 44.4306, 24.3708),
  ('Alba Iulia', 'Alba', 'RO', 46.0733, 23.5805),
  ('Deva', 'Hunedoara', 'RO', 45.8833, 22.9000),
  ('Zalău', 'Sălaj', 'RO', 47.1911, 23.0572),
  ('Vaslui', 'Vaslui', 'RO', 46.6407, 27.7276),
  ('Giurgiu', 'Giurgiu', 'RO', 43.9037, 25.9699),
  ('Tulcea', 'Tulcea', 'RO', 45.1667, 28.8000),
  ('Călărași', 'Călărași', 'RO', 44.2058, 27.3306),
  ('Alexandria', 'Teleorman', 'RO', 43.9833, 25.3333),
  ('Sfântu Gheorghe', 'Covasna', 'RO', 45.8667, 25.7833),
  ('Miercurea Ciuc', 'Harghita', 'RO', 46.3600, 25.8022),
  ('Slobozia', 'Ialomița', 'RO', 44.5639, 27.3661),
  ('Țândărei', 'Ialomița', 'RO', 44.6500, 27.6667),
  ('München', 'Bavaria', 'DE', 48.1351, 11.582),
  ('Berlin', 'Berlin', 'DE', 52.52, 13.405),
  ('Frankfurt', 'Hesse', 'DE', 50.1109, 8.6821),
  ('Hamburg', 'Hamburg', 'DE', 53.5511, 9.9937),
  ('Köln', 'Renania', 'DE', 50.9375, 6.9603),
  ('Stuttgart', 'Baden-Württemberg', 'DE', 48.7758, 9.1829),
  ('Düsseldorf', 'Renania', 'DE', 51.2277, 6.7735),
  ('Milano', 'Lombardia', 'IT', 45.4642, 9.19),
  ('Roma', 'Lazio', 'IT', 41.9028, 12.4964),
  ('Torino', 'Piemonte', 'IT', 45.0703, 7.6869),
  ('Verona', 'Veneto', 'IT', 45.4384, 10.9916),
  ('Napoli', 'Campania', 'IT', 40.8518, 14.2681),
  ('Viena', 'Viena', 'AT', 48.2082, 16.3738),
  ('Graz', 'Stiria', 'AT', 47.0707, 15.4395),
  ('Budapesta', 'Budapesta', 'HU', 47.4979, 19.0402),
  ('Amsterdam', 'Olanda de Nord', 'NL', 52.3676, 4.9041),
  ('Rotterdam', 'Olanda de Sud', 'NL', 51.9244, 4.4777),
  ('Bruxelles', 'Bruxelles', 'BE', 50.8503, 4.3517),
  ('Anvers', 'Flandra', 'BE', 51.2194, 4.4025),
  ('Paris', 'Île-de-France', 'FR', 48.8566, 2.3522),
  ('Lyon', 'Rhône', 'FR', 45.764, 4.8357),
  ('Marsilia', 'Provence', 'FR', 43.2965, 5.3698),
  ('Madrid', 'Madrid', 'ES', 40.4168, -3.7038),
  ('Barcelona', 'Catalonia', 'ES', 41.3851, 2.1734),
  ('Valencia', 'Valencia', 'ES', 39.4699, -0.3763),
  ('Londra', 'Anglia', 'GB', 51.5074, -0.1278),
  ('Varșovia', 'Mazovia', 'PL', 52.2297, 21.0122),
  ('Praga', 'Praga', 'CZ', 50.0755, 14.4378),
  ('Zürich', 'Zürich', 'CH', 47.3769, 8.5417),
  ('Copenhaga', 'Capitala', 'DK', 55.6761, 12.5683),
  ('Stockholm', 'Stockholm', 'SE', 59.3293, 18.0686),
  ('Sofia', 'Sofia', 'BG', 42.6977, 23.3219),
  ('Chișinău', 'Chișinău', 'MD', 47.0105, 28.8638)
on conflict (name, country) do update
  set region = excluded.region, lat = excluded.lat, lng = excluded.lng;

alter table public.localities enable row level security;

-- Nomenclator: se citește de oricine, se scrie de nimeni prin API.
create policy "localities_read" on public.localities
  for select to anon, authenticated using (true);

revoke all on public.localities from public, anon, authenticated;
grant select on public.localities to anon, authenticated;
grant select, insert, update, delete on public.localities to service_role;

-- ---------------------------------------------------------------------
-- 2. Ștampila de coordonate
--
-- Un trigger și nu o linie de TypeScript, pentru că există trei drumuri
-- prin care se naște un traseu — formularul, `create_route_series` și
-- `generate_route_departures` — iar ultimele două sunt SQL și nu pot
-- citi o listă dintr-un fișier `.ts`. Regula stă într-un singur loc.
--
-- Completează numai ce lipsește: o cerere care vine din formular cu
-- coordonate proprii le păstrează pe ale ei.
-- ---------------------------------------------------------------------
create or replace function public.locality_point(p_city text, p_country text)
returns public.localities
language sql
stable
parallel safe
set search_path = public
as $fn$
  select l.* from public.localities l
  where l.country = upper(coalesce(p_country, ''))
    and public.normalise_locality(l.name) = public.normalise_locality(p_city)
  limit 1;
$fn$;

comment on function public.locality_point(text, text) is
  'Coordonatele unei localități, sau niciun rând. „Nu o știm" este un răspuns bun: jumătate din mașini se iau dintr-un sat.';

revoke all on function public.locality_point(text, text) from public, anon, authenticated, service_role;
grant execute on function public.locality_point(text, text) to authenticated;

create or replace function public.stamp_truck_listing_coordinates()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_from public.localities;
  v_to public.localities;
begin
  if new.from_lat is null or new.from_lng is null then
    select * into v_from from public.locality_point(new.from_city, new.from_country);
    if v_from.id is not null then
      new.from_lat := v_from.lat;
      new.from_lng := v_from.lng;
    end if;
  end if;

  if new.to_lat is null or new.to_lng is null then
    select * into v_to from public.locality_point(new.to_city, new.to_country);
    if v_to.id is not null then
      new.to_lat := v_to.lat;
      new.to_lng := v_to.lng;
    end if;
  end if;

  return new;
end;
$fn$;

revoke all on function public.stamp_truck_listing_coordinates()
  from public, anon, authenticated, service_role;

drop trigger if exists stamp_truck_listing_coordinates on public.truck_listings;
create trigger stamp_truck_listing_coordinates
  before insert or update of from_city, from_country, to_city, to_country
  on public.truck_listings
  for each row execute function public.stamp_truck_listing_coordinates();

create or replace function public.stamp_cargo_listing_coordinates()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_from public.localities;
  v_to public.localities;
begin
  if new.loading_lat is null or new.loading_lng is null then
    select * into v_from from public.locality_point(new.loading_city, new.loading_country);
    if v_from.id is not null then
      new.loading_lat := v_from.lat;
      new.loading_lng := v_from.lng;
    end if;
  end if;

  if new.unloading_lat is null or new.unloading_lng is null then
    select * into v_to from public.locality_point(new.unloading_city, new.unloading_country);
    if v_to.id is not null then
      new.unloading_lat := v_to.lat;
      new.unloading_lng := v_to.lng;
    end if;
  end if;

  return new;
end;
$fn$;

revoke all on function public.stamp_cargo_listing_coordinates()
  from public, anon, authenticated, service_role;

drop trigger if exists stamp_cargo_listing_coordinates on public.cargo_listings;
create trigger stamp_cargo_listing_coordinates
  before insert or update of loading_city, loading_country, unloading_city, unloading_country
  on public.cargo_listings
  for each row execute function public.stamp_cargo_listing_coordinates();

-- Și pentru ce este deja publicat. Fără asta, filtrul de rază ar fi
-- pornit peste un panou pe care numai anunțurile noi se pot găsi.
update public.truck_listings t
set from_lat = l.lat, from_lng = l.lng
from public.localities l
where t.from_lat is null
  and l.country = upper(t.from_country)
  and public.normalise_locality(l.name) = public.normalise_locality(t.from_city);

update public.truck_listings t
set to_lat = l.lat, to_lng = l.lng
from public.localities l
where t.to_lat is null
  and l.country = upper(t.to_country)
  and public.normalise_locality(l.name) = public.normalise_locality(t.to_city);

update public.cargo_listings c
set loading_lat = l.lat, loading_lng = l.lng
from public.localities l
where c.loading_lat is null
  and l.country = upper(c.loading_country)
  and public.normalise_locality(l.name) = public.normalise_locality(c.loading_city);

update public.cargo_listings c
set unloading_lat = l.lat, unloading_lng = l.lng
from public.localities l
where c.unloading_lat is null
  and l.country = upper(c.unloading_country)
  and public.normalise_locality(l.name) = public.normalise_locality(c.unloading_city);

-- ---------------------------------------------------------------------
-- 3. Ce vede panoul de trasee
--
-- Vederea publică a refuzat dintotdeauna coordonatele, și o verificare
-- o ține așa („PUB  the public board carries no company column", care
-- numește `from_lat` printre coloanele interzise). Motivul este bun:
-- „oraș, județ, țară, niciodată o adresă", iar o coloană de coordonate
-- este o promisiune pe care nu o poți ține — nu poți ști ce va scrie
-- cineva în ea peste un an.
--
-- Deci raza nu primește coloana din `truck_listings`. Primește
-- **centroidul localității**, luat din `localities` după numele
-- orașului care este deja pe rând. Așa coloana nu poate conține o
-- adresă, oricât de precis ar fi ștampilat cineva anunțul: vederea
-- însăși garantează asta, nu o convenție. `to_lat`/`to_lng` nici nu
-- apar — raza se măsoară de la plecare.
-- ---------------------------------------------------------------------
create or replace view public.v_departures_public as
select
  t.id as truck_listing_id,
  t.direction,
  t.from_country,
  t.from_county,
  t.from_city,
  t.to_country,
  t.to_county,
  t.to_city,
  t.waypoints,
  t.available_from,
  t.available_to,
  t.service_types,
  t.accepted_vehicle_types,
  t.platform_slots_total,
  coalesce(b.taken, 0)::integer as slots_taken,
  greatest(coalesce(t.platform_slots_total, 0) - coalesce(b.taken, 0), 0)::integer as slots_free,
  t.price_indicative,
  t.currency,
  t.published_at,
  t.from_country = t.to_country as is_domestic,
  fl.lat as from_locality_lat,
  fl.lng as from_locality_lng,
  t.free_capacity_kg
from public.truck_listings t
join public.companies c on c.id = t.company_id
left join public.localities fl
  on fl.country = upper(t.from_country)
 and public.normalise_locality(fl.name) = public.normalise_locality(t.from_city)
left join lateral (
  select sum(bb.slots) as taken
  from public.departure_bookings bb
  where bb.truck_listing_id = t.id
    and (bb.status = 'confirmed' or (bb.status = 'reserved' and bb.expires_at > now()))
) b on true
where t.status = 'active'
  and t.hidden_at is null
  and coalesce(t.available_to, t.available_from) >= current_date
  and not c.is_test;

comment on view public.v_departures_public is
  'Active departures at city level for anon and authenticated. No company, vehicle, plate, contact or exact address: those live in v_departures, which is authenticated-only. from_locality_lat/lng are the gazetteer centroid of from_city, read from localities rather than from the listing, so the column cannot carry an address whatever the listing holds.';

-- `create or replace view` nu schimbă granturile, dar ele se scriu
-- explicit oricum: un `revoke` de la `anon` care nu se vede în migrarea
-- vederii este un `revoke` pe care nimeni nu îl găsește.
revoke all on public.v_departures_public from public;
grant select on public.v_departures_public to anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on public.v_departures_public from anon, authenticated;

-- ---------------------------------------------------------------------
-- 4. Capacitatea liberă, pe traseu și pe serie
--
-- `truck_listings.free_capacity_kg` există din prima migrare și nu a
-- scris-o nimeni niciodată. Formularul o cere de acum, iar seria o duce
-- mai departe la fiecare plecare pe care o naște — altfel plecările
-- dintr-o serie ar fi singurele fără greutate pe panou.
-- ---------------------------------------------------------------------
alter table public.route_series
  add column if not exists free_capacity_kg integer check (free_capacity_kg > 0);

comment on column public.route_series.free_capacity_kg is
  'Câte kilograme are liber platforma, dus mai departe la fiecare plecare generată.';

drop function if exists public.create_route_series(
  uuid, public.truck_direction, text, text, text, text, text, text,
  public.recurrence_kind, smallint[], integer, date, date, integer, jsonb,
  integer, integer, public.service_type[], public.cargo_category[], numeric, text);

create function public.create_route_series(
  p_vehicle_id uuid,
  p_direction public.truck_direction,
  p_from_country text,
  p_from_county text,
  p_from_city text,
  p_to_country text,
  p_to_county text,
  p_to_city text,
  p_kind public.recurrence_kind,
  p_weekdays smallint[],
  p_every_n_days integer,
  p_starts_on date,
  p_ends_on date,
  p_window_days integer default null,
  p_waypoints jsonb default '[]'::jsonb,
  p_max_detour_km integer default 50,
  p_platform_slots_total integer default null,
  p_service_types public.service_type[] default '{}'::public.service_type[],
  p_accepted_vehicle_types public.cargo_category[] default '{}'::public.cargo_category[],
  p_price_indicative numeric default null,
  p_notes text default null,
  p_free_capacity_kg integer default null
)
returns public.route_series
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_company uuid;
  v_row public.route_series;
begin
  select v.company_id into v_company from public.vehicles v where v.id = p_vehicle_id;
  if v_company is null then
    raise exception 'Vehiculul nu există' using errcode = 'P0002';
  end if;
  if not public.is_company_member(v_company) then
    raise exception 'Vehiculul nu este al firmei tale' using errcode = '42501';
  end if;
  -- Aceeași întrebare pe care o pune garda de publicare, pusă acum: o
  -- serie deschisă de o firmă neverificată nu ar genera niciodată
  -- nimic, și omul ar aștepta degeaba.
  if not public.company_can_act(v_company) then
    raise exception 'Compania nu poate publica anunțuri: cont neverificat sau suspendat'
      using errcode = '42501';
  end if;
  if p_ends_on < current_date then
    raise exception 'Seria se termină în trecut' using errcode = '22023';
  end if;
  if coalesce(array_length(p_accepted_vehicle_types, 1), 0) = 0 then
    raise exception 'Alege ce vehicule poate duce plecarea' using errcode = '22023';
  end if;
  if p_ends_on > current_date + interval '1 year' then
    raise exception 'O serie ține cel mult un an. Vei putea să o prelungești.'
      using errcode = '22023';
  end if;

  insert into public.route_series
    (company_id, vehicle_id, created_by, direction,
     from_country, from_county, from_city, to_country, to_county, to_city,
     waypoints, max_detour_km, platform_slots_total, service_types,
     accepted_vehicle_types, price_indicative, notes,
     kind, weekdays, every_n_days, starts_on, ends_on, window_days,
     free_capacity_kg)
  values
    (v_company, p_vehicle_id, auth.uid(), p_direction,
     coalesce(p_from_country, 'RO'), p_from_county, p_from_city,
     coalesce(p_to_country, 'RO'), p_to_county, p_to_city,
     coalesce(p_waypoints, '[]'::jsonb), coalesce(p_max_detour_km, 50),
     p_platform_slots_total, coalesce(p_service_types, '{}'),
     coalesce(p_accepted_vehicle_types, '{}'), p_price_indicative, p_notes,
     p_kind, coalesce(p_weekdays, '{}'), p_every_n_days,
     greatest(p_starts_on, current_date), p_ends_on, p_window_days,
     p_free_capacity_kg)
  returning * into v_row;

  perform public.write_audit('route_series.created', 'route_series', v_row.id, null,
    to_jsonb(v_row), null);
  return v_row;
end;
$fn$;

revoke all on function public.create_route_series(uuid, public.truck_direction, text, text, text, text, text, text, public.recurrence_kind, smallint[], integer, date, date, integer, jsonb, integer, integer, public.service_type[], public.cargo_category[], numeric, text, integer) from public, anon;
grant execute on function public.create_route_series(uuid, public.truck_direction, text, text, text, text, text, text, public.recurrence_kind, smallint[], integer, date, date, integer, jsonb, integer, integer, public.service_type[], public.cargo_category[], numeric, text, integer) to authenticated;

-- Plecările născute dintr-o serie duc mai departe capacitatea liberă a
-- seriei. Reprodusă întreagă pentru o coloană, fiindcă asta este
-- singura formă în care se poate: `create or replace` nu schimbă un
-- `insert` din mijlocul unui corp.
create or replace function public.generate_route_departures(p_now date default current_date)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  s public.recurrence_settings;
  v_series record;
  v_date date;
  v_made integer := 0;
  v_in_series integer;
  v_horizon date;
  v_compliant boolean;
  v_error text;
begin
  -- `current_user` într-o funcție SECURITY DEFINER este proprietarul
  -- ei, nu apelantul; ce deosebește jobul este că nu are utilizator de
  -- sesiune. Grantul de mai jos este ce ține pe toți ceilalți afară.
  if not (public.is_platform_admin() or auth.uid() is null) then
    raise exception 'Doar jobul sau echipa platformei pot genera plecări'
      using errcode = '42501';
  end if;

  select * into s from public.recurrence_settings where id;
  v_horizon := p_now + s.horizon_days;

  for v_series in
    select * from public.route_series
    where not is_paused and ended_at is null and ends_on >= p_now
    order by created_at
  loop
    -- Vehiculul, întâi. O serie pe un vehicul ieșit din conformitate
    -- nu trebuie să încerce douăzeci de inserturi ca să afle.
    select v.is_compliant into v_compliant
    from public.vehicles v where v.id = v_series.vehicle_id;

    if not coalesce(v_compliant, false) then
      update public.route_series
      set is_paused = true,
          paused_reason = 'Vehiculul nu mai are documentele valide (ITP / RCA / copie conformă). Seria repornește după ce le reînnoiești.'
      where id = v_series.id;

      insert into public.notification_outbox
        (channel, template, recipient_user_id, recipient_company_id, to_email, payload, dedupe_key)
      select 'email', 'series_paused', p.id, v_series.company_id, p.email,
             jsonb_build_object(
               'full_name', coalesce(nullif(p.full_name, ''), 'colega/colegul nostru'),
               'route', v_series.from_city || ' → ' || v_series.to_city,
               'plate', coalesce((select ve.plate_number from public.vehicles ve
                                   where ve.id = v_series.vehicle_id), '—'),
               'reason', 'documentele vehiculului au expirat'),
             'series-paused:' || v_series.id || ':' || p_now::text
      from public.profiles p
      where p.id = v_series.created_by and p.email is not null
      on conflict (dedupe_key) where dedupe_key is not null do nothing;

      perform public.write_audit('route_series.paused_noncompliant', 'route_series',
        v_series.id, null, jsonb_build_object('vehicle_id', v_series.vehicle_id), null);
      continue;
    end if;

    v_in_series := 0;

    for v_date in
      select d from public.recurrence_dates(
        v_series.kind, v_series.weekdays, v_series.every_n_days,
        -- De unde reluăm: de la ziua de după ultima generată, sau de la
        -- începutul seriei dacă nu s-a generat încă nimic. Niciodată
        -- din trecut.
        greatest(coalesce(v_series.generated_through + 1, v_series.starts_on), p_now),
        least(v_series.ends_on, v_horizon),
        s.max_per_run
      ) as d
    loop
      exit when v_in_series >= s.max_per_run;

      -- Idempotent: o a doua rulare în aceeași noapte nu dublează
      -- nimic, și nici o repornire după o cădere la jumătate.
      if exists (
        select 1 from public.truck_listings t
        where t.series_id = v_series.id and t.available_from = v_date
      ) then
        continue;
      end if;

      begin
        insert into public.truck_listings
          (company_id, vehicle_id, posted_by, direction,
           from_country, from_county, from_city, to_country, to_county, to_city,
           waypoints, max_detour_km, available_from, available_to,
           platform_slots_total, service_types, accepted_vehicle_types,
           price_indicative, notes, status, series_id, free_capacity_kg)
        values
          (v_series.company_id, v_series.vehicle_id, v_series.created_by, v_series.direction,
           v_series.from_country, v_series.from_county, v_series.from_city,
           v_series.to_country, v_series.to_county, v_series.to_city,
           v_series.waypoints, v_series.max_detour_km, v_date,
           case when v_series.window_days is null then null
                else v_date + v_series.window_days end,
           v_series.platform_slots_total, v_series.service_types,
           v_series.accepted_vehicle_types, v_series.price_indicative,
           v_series.notes, 'active', v_series.id, v_series.free_capacity_kg);

        v_made := v_made + 1;
        v_in_series := v_in_series + 1;

        update public.route_series set generated_through = v_date where id = v_series.id;
      exception when others then
        -- Cota planului, sau orice altă gardă. Propoziția refuzului
        -- este a bazei și ajunge întreagă la om, pentru că ea spune ce
        -- are de făcut.
        v_error := sqlerrm;
        update public.route_series
        set is_paused = true, paused_reason = v_error
        where id = v_series.id;

        insert into public.notification_outbox
          (channel, template, recipient_user_id, recipient_company_id, to_email, payload, dedupe_key)
        select 'email', 'series_paused', p.id, v_series.company_id, p.email,
               jsonb_build_object(
                 'full_name', coalesce(nullif(p.full_name, ''), 'colega/colegul nostru'),
                 'route', v_series.from_city || ' → ' || v_series.to_city,
                 'plate', coalesce((select ve.plate_number from public.vehicles ve
                                     where ve.id = v_series.vehicle_id), '—'),
                 'reason', v_error),
               'series-paused:' || v_series.id || ':' || p_now::text
        from public.profiles p
        where p.id = v_series.created_by and p.email is not null
        on conflict (dedupe_key) where dedupe_key is not null do nothing;

        exit;
      end;
    end loop;
  end loop;

  return v_made;
end;
$fn$;

comment on function public.generate_route_departures(date) is
  'Writes ordinary departures for every live series, through every existing guard. A refusal pauses the series with the database''s own sentence and tells the carrier. Idempotent: a second run the same night adds nothing.';

revoke all on function public.generate_route_departures(date) from public, anon, authenticated;
grant execute on function public.generate_route_departures(date) to service_role;

-- ---------------------------------------------------------------------
-- 5. Alerta știe aceleași două filtre
--
-- Dacă panoul filtrează după rază și greutate iar potrivirea salvată nu
-- o face, o alertă trimite exact ce ecranul refuză să arate. Reprodusă
-- întreagă pentru două reguli, fiindcă asta este singura formă în care
-- se poate.
-- ---------------------------------------------------------------------
create or replace function public.saved_search_match(
  p_search_id uuid,
  p_listing_id uuid
)
returns table (reasons text[], detour_km numeric)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  s public.saved_searches;
  l public.cargo_listings;
  d public.cargo_vehicle_details;
  f jsonb;
  v_reasons text[] := '{}';
  v_detour record;
  -- Held separately because `v_detour` is only assigned when the search
  -- belongs to a firm with routes. Reading a field off an unassigned
  -- record raises, which is how this was found.
  v_detour_km numeric := null;
  v_label text;
  v_near public.localities;
  v_radius numeric;
  v_distance numeric;
begin
  select * into s from public.saved_searches where id = p_search_id;
  if s.id is null or not s.is_active or s.target <> 'cargo' then return; end if;

  select * into l from public.cargo_listings where id = p_listing_id;
  if l.id is null then return; end if;
  select * into d from public.cargo_vehicle_details where cargo_listing_id = p_listing_id;

  -- Never your own request.
  if s.company_id is not null and l.company_id = s.company_id then return; end if;

  f := coalesce(s.filters, '{}'::jsonb);

  if f ? 'from_country' and upper(f ->> 'from_country') <> upper(l.loading_country) then
    return;
  end if;
  if f ? 'to_country' and upper(f ->> 'to_country') <> upper(l.unloading_country) then
    return;
  end if;
  if f ? 'from_county'
     and upper(coalesce(f ->> 'from_county', '')) <> upper(coalesce(l.loading_county, '')) then
    return;
  end if;
  if f ? 'to_county'
     and upper(coalesce(f ->> 'to_county', '')) <> upper(coalesce(l.unloading_county, '')) then
    return;
  end if;
  if f ? 'category' and (f ->> 'category') <> d.category::text then return; end if;
  if f ? 'service' and (f ->> 'service') <> l.service_type::text then return; end if;
  if f ? 'condition' then
    if (f ->> 'condition') = 'ruleaza' and not coalesce(d.is_running, true) then return; end if;
    if (f ->> 'condition') = 'nu-ruleaza' and coalesce(d.is_running, true) then return; end if;
  end if;
  if f ? 'scope' then
    if (f ->> 'scope') = 'intern'
       and upper(l.loading_country) <> upper(l.unloading_country) then return; end if;
    if (f ->> 'scope') = 'international'
       and upper(l.loading_country) = upper(l.unloading_country) then return; end if;
  end if;

  -- Greutatea. O cerere fără greutate scrisă rămâne în listă: câmpul
  -- este opțional pe formularul de publicare, iar filtrul de pe panou
  -- o păstrează pe același motiv. Cele două trebuie să spună la fel,
  -- altfel alerta trimite ce panoul nu arată.
  if f ? 'max_weight_kg' then
    if l.weight_kg is not null
       and l.weight_kg > (f ->> 'max_weight_kg')::integer then return; end if;
  end if;

  -- Raza. `near` este exact valoarea pe care o poartă linkul panoului
  -- („Cluj-Napoca|RO"), ca să nu existe două scrieri ale aceluiași
  -- lucru. O cerere fără coordonate **nu** intră: gazetarul știe numai
  -- reședințe de județ, iar un „da" pentru restul ar goli filtrul de
  -- înțeles tocmai când contează.
  if f ? 'near' then
    select * into v_near from public.locality_point(
      split_part(f ->> 'near', '|', 1), split_part(f ->> 'near', '|', 2));
    if v_near.id is null then return; end if;

    v_radius := coalesce((f ->> 'radius_km')::numeric, 50);
    v_distance := public.distance_km(v_near.lat, v_near.lng, l.loading_lat, l.loading_lng);
    if v_distance is null or v_distance > v_radius then return; end if;
  end if;

  -- Matched. Now say why, in the order a person reads it.
  v_reasons := array_append(v_reasons,
    format('Ruta: %s (%s) — %s (%s)',
           l.loading_city, l.loading_country, l.unloading_city, l.unloading_country));

  if d.category is not null then
    v_label := public.cargo_category_label(d.category);
    v_reasons := array_append(v_reasons, format('Tip vehicul: %s', v_label));
  end if;

  if coalesce(d.needs_winch, false) then
    v_reasons := array_append(v_reasons, 'Nu rulează: are nevoie de troliu');
  end if;

  if l.service_type = 'expres' then
    v_reasons := array_append(v_reasons, 'Serviciu: expres');
  end if;

  if v_distance is not null then
    v_reasons := array_append(v_reasons,
      format('La %s km de %s', trim(to_char(v_distance, 'FM999999')), v_near.name));
  end if;

  if l.weight_kg is not null then
    v_reasons := array_append(v_reasons, format('Greutate: %s kg', l.weight_kg));
  end if;

  -- The detour, when the firm has a route to measure against. This is
  -- the reason that was impossible to give before max_detour_km had a
  -- reader.
  if s.company_id is not null then
    select * into v_detour
    from public.best_route_detour(
      s.company_id, l.loading_lat, l.loading_lng, l.unloading_lat, l.unloading_lng);

    if v_detour.truck_listing_id is not null then
      if not v_detour.within then return; end if;
      v_detour_km := v_detour.detour_km;
      v_reasons := array_append(v_reasons,
        format('Ocol de %s km față de traseul %s — %s (toleranță %s km)',
               trim(to_char(v_detour.detour_km, 'FM999999')),
               v_detour.from_city, v_detour.to_city, v_detour.tolerance_km));
    end if;
  end if;

  return query select v_reasons, v_detour_km;
end;
$fn$;

comment on function public.saved_search_match(uuid, uuid) is
  'No row when the search does not match; one row with the reasons when it does. The reasons are the sentences the e-mail and the screen both show, built once so they cannot disagree.';

revoke all on function public.saved_search_match(uuid, uuid) from public, anon;
grant execute on function public.saved_search_match(uuid, uuid) to authenticated;
