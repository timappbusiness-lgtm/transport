-- =====================================================================
-- Trei lucruri care lipseau, și una care exista pe jumătate
--
-- 1. **Trasee care se repetă.** Un transportator care pleacă în
--    fiecare marți și joi pe aceeași rută își republică plecarea de
--    două ori pe săptămână, la nesfârșit. Nimeni nu face asta mult
--    timp; se lasă, și bursa arată mai goală decât este.
--
-- 2. **Cereri private.** O casă de expediții cu cinci transportatori
--    pe care îi știe nu vrea să scoată fiecare marfă pe panoul public.
--    Până acum singura variantă era panoul; acum poate trimite o
--    cerere numai celor aleși, și o poate deschide public mai târziu
--    dacă nu răspunde nimeni.
--
-- 3. **Transportatori favoriți.** Lista cu cine lucrezi, ca să nu o
--    ții în cap. Este și ce face invitația la o cerere privată un
--    singur clic.
--
-- Regula care le leagă: **o cerere privată nu este o cerere ascunsă cu
-- un filtru pe ecran.** Este invizibilă în RLS pentru cine nu este
-- invitat — la fel cererea, ofertele ei, conversațiile ei și numerele
-- publice. Un filtru în interfață s-ar fi uitat o singură dată și ar
-- fi arătat marfa cuiva care nu trebuia să o vadă.
--
-- Seriile generează **plecări obișnuite**. Nu o a doua specie de
-- anunț: fiecare rând generat trece prin aceleași gărzi ca unul scris
-- de mână — firmă verificată, vehicul conform, cotele planului. Dacă
-- vehiculul iese din conformitate, generarea se oprește și omul este
-- anunțat; când revine, continuă.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Cât de departe generăm
-- ---------------------------------------------------------------------
create table public.recurrence_settings (
  id boolean primary key default true check (id),
  updated_at timestamptz not null default now(),
  -- Cât în avans stau plecările pe bursă. Paisprezece zile: destul cât
  -- un client care caută peste două săptămâni să te găsească, puțin
  -- destul cât o serie uitată să nu umple bursa până la anul.
  horizon_days integer not null default 14 check (horizon_days between 1 and 90),
  -- Câte plecări face o serie într-o singură noapte. O plagă contra
  -- unei reguli scrise greșit — „la fiecare zi, până în 2030" — care
  -- altfel ar scrie o mie de rânduri înainte să observe cineva.
  max_per_run integer not null default 20 check (max_per_run between 1 and 200)
);

insert into public.recurrence_settings (id) values (true);

alter table public.recurrence_settings enable row level security;

create policy "recurrence_settings_read_all" on public.recurrence_settings
  for select to anon, authenticated using (true);

revoke all on public.recurrence_settings from anon, authenticated;
grant select on public.recurrence_settings to anon, authenticated;

comment on table public.recurrence_settings is
  'How far ahead a route series is generated, and how many departures one night may create. One row, read by everybody, written by set_recurrence_settings().';

create or replace function public.set_recurrence_settings(
  p_horizon_days integer,
  p_max_per_run integer
)
returns public.recurrence_settings
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_row public.recurrence_settings;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate schimba setările' using errcode = '42501';
  end if;

  update public.recurrence_settings
  set horizon_days = p_horizon_days, max_per_run = p_max_per_run, updated_at = now()
  where id
  returning * into v_row;

  perform public.write_audit('settings.recurrence_changed', 'recurrence_settings', null, null,
    to_jsonb(v_row), null);
  return v_row;
end;
$fn$;

revoke all on function public.set_recurrence_settings(integer, integer) from public;
grant execute on function public.set_recurrence_settings(integer, integer) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Seria
--
-- Regula de repetare stă în două câmpuri, nu într-un RRULE. Un RRULE
-- ar fi acoperit „a treia marți din lună", pe care nu o cere nimeni,
-- și ar fi cerut un parser în două limbaje. „În zilele astea ale
-- săptămânii" și „la fiecare N zile" sunt tot ce am auzit până acum.
-- ---------------------------------------------------------------------
create type public.recurrence_kind as enum ('saptamanal', 'la_n_zile');

comment on type public.recurrence_kind is
  'Weekly on chosen days, or every N days. Deliberately not an RRULE: nobody has asked for „the third Tuesday".';

create table public.route_series (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  company_id uuid not null references public.companies (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  created_by uuid not null references public.profiles (id) on delete restrict,

  -- Șablonul: exact coloanele unei plecări, minus datele.
  direction public.truck_direction not null,
  from_country text not null default 'RO',
  from_county text,
  from_city text not null,
  to_country text not null default 'RO',
  to_county text,
  to_city text not null,
  waypoints jsonb not null default '[]'::jsonb,
  max_detour_km integer not null default 50 check (max_detour_km >= 0),
  platform_slots_total integer,
  service_types public.service_type[] not null default '{}'::public.service_type[],
  -- Cel puțin unul: `truck_listings_accepted_types_ck` cere asta de la
  -- fiecare plecare, iar o serie cu lista goală ar fi generat zero
  -- plecări și s-ar fi oprit singură în prima noapte, cu numele unei
  -- constrângeri drept motiv. Refuzul se dă aici, unde omul îl poate
  -- încă repara.
  accepted_vehicle_types public.cargo_category[] not null
    default '{}'::public.cargo_category[]
    check (coalesce(array_length(accepted_vehicle_types, 1), 0) >= 1),
  price_indicative numeric(10,2),
  notes text,

  -- Regula.
  kind public.recurrence_kind not null,
  -- 0 = duminică … 6 = sâmbătă, ca `extract(dow)`. Folosit doar la
  -- „săptămânal".
  weekdays smallint[] not null default '{}'::smallint[],
  every_n_days integer check (every_n_days between 1 and 90),
  starts_on date not null,
  ends_on date not null,
  -- Cât ține fiecare plecare generată. Null = o singură zi.
  window_days integer check (window_days between 0 and 30),

  is_paused boolean not null default false,
  paused_reason text,
  -- Ultima zi pentru care s-a generat ceva. Reluarea pleacă de aici, nu
  -- de la `starts_on`, ca o serie pusă pe pauză o lună să nu scrie
  -- treizeci de plecări în trecut când revine.
  generated_through date,
  ended_at timestamptz,

  constraint route_series_window_ck check (ends_on >= starts_on),
  constraint route_series_rule_ck check (
    case kind
      when 'saptamanal' then array_length(weekdays, 1) between 1 and 7 and every_n_days is null
      when 'la_n_zile' then every_n_days is not null and coalesce(array_length(weekdays, 1), 0) = 0
    end
  ),
  constraint route_series_weekdays_ck check (
    weekdays <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]
  )
);

comment on table public.route_series is
  'A repeating departure. Generates ordinary truck_listings rows through the same guards as a hand-written one; this table holds only the rule and the template.';
comment on column public.route_series.generated_through is
  'The last date generated for. Resuming starts here, not at starts_on, so a series paused for a month does not write thirty departures into the past.';

create index route_series_company_idx on public.route_series (company_id, created_at desc);
create index route_series_due_idx on public.route_series (ends_on)
  where not is_paused and ended_at is null;

create trigger route_series_set_updated_at
  before update on public.route_series
  for each row execute function public.set_updated_at();

-- Fiecare plecare știe din ce serie vine, ca ștergerea seriei să nu
-- atingă plecările deja publicate și ca ecranul să le poată arăta
-- grupat. `set null`: o plecare rămâne a firmei chiar dacă seria dispare.
alter table public.truck_listings
  add column if not exists series_id uuid references public.route_series (id) on delete set null;

create index if not exists truck_listings_series_idx
  on public.truck_listings (series_id, available_from) where series_id is not null;

alter table public.route_series enable row level security;

create policy "route_series_select_own_or_staff" on public.route_series
  for select to authenticated
  using (public.is_company_member(company_id) or public.is_platform_admin());

revoke all on public.route_series from anon, authenticated;
grant select on public.route_series to authenticated;

-- ---------------------------------------------------------------------
-- 3. Datele pe care le cere o regulă
--
-- Scrisă ca funcție a bazei, nu în TypeScript: jobul de noapte o cere,
-- ecranul o cere ca să arate „următoarele plecări", iar două
-- implementări ale aceleiași socoteli ajung să nu fie de acord exact
-- în ziua în care trece ora.
--
-- `date`, nu `timestamptz`, dinadins. O plecare are o zi, nu o oră, și
-- o zi nu se mută cu ora de vară. Asta scoate din discuție întreaga
-- clasă de greșeli cu fusul orar — inclusiv pe cea în care noaptea de
-- 30 martie generează de două ori aceeași marți.
-- ---------------------------------------------------------------------
create or replace function public.recurrence_dates(
  p_kind public.recurrence_kind,
  p_weekdays smallint[],
  p_every_n_days integer,
  p_from date,
  p_to date,
  p_limit integer default 100
)
returns setof date
language sql
immutable
set search_path = public
as $fn$
  select d::date
  from generate_series(p_from, p_to, interval '1 day') as d
  where case p_kind
          when 'saptamanal' then extract(dow from d)::smallint = any (coalesce(p_weekdays, '{}'))
          -- Ancorat la `p_from`, ca o serie „la fiecare 3 zile" să
          -- cadă în aceleași zile indiferent când o întreabă cineva.
          when 'la_n_zile' then (d::date - p_from) % greatest(coalesce(p_every_n_days, 1), 1) = 0
        end
  order by d
  limit greatest(coalesce(p_limit, 100), 1);
$fn$;

comment on function public.recurrence_dates(public.recurrence_kind, smallint[], integer, date, date, integer) is
  'The dates a rule asks for, in one place. Dates rather than timestamps: a departure has a day, and a day does not move when the clocks do.';

revoke all on function public.recurrence_dates(public.recurrence_kind, smallint[], integer, date, date, integer) from public;
grant execute on function public.recurrence_dates(public.recurrence_kind, smallint[], integer, date, date, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. Deschiderea, oprirea și sfârșitul unei serii
-- ---------------------------------------------------------------------
create or replace function public.create_route_series(
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
  p_notes text default null
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
     kind, weekdays, every_n_days, starts_on, ends_on, window_days)
  values
    (v_company, p_vehicle_id, auth.uid(), p_direction,
     coalesce(p_from_country, 'RO'), p_from_county, p_from_city,
     coalesce(p_to_country, 'RO'), p_to_county, p_to_city,
     coalesce(p_waypoints, '[]'::jsonb), coalesce(p_max_detour_km, 50),
     p_platform_slots_total, coalesce(p_service_types, '{}'),
     coalesce(p_accepted_vehicle_types, '{}'), p_price_indicative, p_notes,
     p_kind, coalesce(p_weekdays, '{}'), p_every_n_days,
     greatest(p_starts_on, current_date), p_ends_on, p_window_days)
  returning * into v_row;

  perform public.write_audit('route_series.created', 'route_series', v_row.id, null,
    to_jsonb(v_row), null);
  return v_row;
end;
$fn$;

revoke all on function public.create_route_series(uuid, public.truck_direction, text, text, text, text, text, text, public.recurrence_kind, smallint[], integer, date, date, integer, jsonb, integer, integer, public.service_type[], public.cargo_category[], numeric, text) from public;
grant execute on function public.create_route_series(uuid, public.truck_direction, text, text, text, text, text, text, public.recurrence_kind, smallint[], integer, date, date, integer, jsonb, integer, integer, public.service_type[], public.cargo_category[], numeric, text) to authenticated;

/**
 * Pauză, reluare, oprire.
 *
 * Una singură pentru toate trei: sunt aceeași scriere pe același rând,
 * cu aceeași verificare, iar trei funcții aproape identice ar fi ajuns
 * să se deosebească într-un an.
 */
create or replace function public.set_route_series_state(
  p_series_id uuid,
  p_action text,
  p_reason text default null
)
returns public.route_series
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_row public.route_series;
begin
  select * into v_row from public.route_series where id = p_series_id for update;
  if v_row.id is null then
    raise exception 'Seria nu există' using errcode = 'P0002';
  end if;
  if not (public.is_company_member(v_row.company_id) or public.is_platform_admin()) then
    raise exception 'Seria nu este a firmei tale' using errcode = '42501';
  end if;
  if v_row.ended_at is not null then
    raise exception 'Seria este deja încheiată' using errcode = '22023';
  end if;

  if p_action = 'pauza' then
    update public.route_series
    set is_paused = true, paused_reason = nullif(btrim(coalesce(p_reason, '')), '')
    where id = p_series_id returning * into v_row;
  elsif p_action = 'reluare' then
    update public.route_series
    set is_paused = false, paused_reason = null
    where id = p_series_id returning * into v_row;
  elsif p_action = 'oprire' then
    -- Plecările deja publicate rămân. Ele au rezervări pe ele, iar o
    -- serie oprită nu este o promisiune retrasă.
    update public.route_series
    set ended_at = now(), is_paused = true,
        paused_reason = nullif(btrim(coalesce(p_reason, '')), '')
    where id = p_series_id returning * into v_row;
  else
    raise exception 'Acțiune necunoscută' using errcode = '22023';
  end if;

  perform public.write_audit('route_series.' || p_action, 'route_series', v_row.id, null,
    to_jsonb(v_row), p_reason);
  return v_row;
end;
$fn$;

revoke all on function public.set_route_series_state(uuid, text, text) from public;
grant execute on function public.set_route_series_state(uuid, text, text) to authenticated;

/**
 * Editarea șablonului.
 *
 * Atinge numai ce se generează de acum înainte. Plecările deja scrise
 * rămân exact cum sunt — au rezervări pe ele, iar o rezervare făcută pe
 * „Cluj → Timișoara, marți" nu are ce căuta pe „Cluj → Arad, joi" doar
 * pentru că cineva a corectat seria.
 */
create or replace function public.update_route_series(
  p_series_id uuid,
  p_kind public.recurrence_kind,
  p_weekdays smallint[],
  p_every_n_days integer,
  p_ends_on date,
  p_window_days integer default null,
  p_price_indicative numeric default null,
  p_notes text default null,
  p_platform_slots_total integer default null
)
returns public.route_series
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.route_series;
  v_row public.route_series;
begin
  select * into v_before from public.route_series where id = p_series_id for update;
  if v_before.id is null then
    raise exception 'Seria nu există' using errcode = 'P0002';
  end if;
  if not public.is_company_member(v_before.company_id) then
    raise exception 'Seria nu este a firmei tale' using errcode = '42501';
  end if;
  if v_before.ended_at is not null then
    raise exception 'Seria este încheiată' using errcode = '22023';
  end if;
  if p_ends_on < current_date then
    raise exception 'Seria se termină în trecut' using errcode = '22023';
  end if;

  update public.route_series
  set kind = p_kind,
      weekdays = coalesce(p_weekdays, '{}'),
      every_n_days = p_every_n_days,
      ends_on = p_ends_on,
      window_days = p_window_days,
      price_indicative = p_price_indicative,
      notes = p_notes,
      platform_slots_total = p_platform_slots_total
  where id = p_series_id
  returning * into v_row;

  perform public.write_audit('route_series.updated', 'route_series', v_row.id,
    to_jsonb(v_before), to_jsonb(v_row),
    'Se aplică numai plecărilor generate de acum înainte');
  return v_row;
end;
$fn$;

revoke all on function public.update_route_series(uuid, public.recurrence_kind, smallint[], integer, date, integer, numeric, text, integer) from public;
grant execute on function public.update_route_series(uuid, public.recurrence_kind, smallint[], integer, date, integer, numeric, text, integer) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Jobul care generează
--
-- Scrie plecări obișnuite. Nu ocolește nicio gardă: `status = 'active'`
-- trece prin `guard_truck_listing_publish` (firmă verificată, vehicul
-- conform) și prin `guard_listing_quota` (cota planului), exact ca o
-- plecare scrisă de mână. Dacă una dintre ele refuză, refuzul este
-- prins, seria se pune pe pauză cu motivul, iar omul este anunțat.
--
-- Pauza nu este o pedeapsă: este singurul fel în care cineva află că
-- ITP-ul a expirat înainte să observe că nu mai primește cereri.
-- ---------------------------------------------------------------------
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
           price_indicative, notes, status, series_id)
        values
          (v_series.company_id, v_series.vehicle_id, v_series.created_by, v_series.direction,
           v_series.from_country, v_series.from_county, v_series.from_city,
           v_series.to_country, v_series.to_county, v_series.to_city,
           v_series.waypoints, v_series.max_detour_km, v_date,
           case when v_series.window_days is null then null
                else v_date + v_series.window_days end,
           v_series.platform_slots_total, v_series.service_types,
           v_series.accepted_vehicle_types, v_series.price_indicative,
           v_series.notes, 'active', v_series.id);

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

/** Următoarele date ale unei serii, pentru ecran. */
create or replace function public.route_series_upcoming(p_series_id uuid, p_limit integer default 5)
returns setof date
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_row public.route_series;
begin
  select * into v_row from public.route_series where id = p_series_id;
  if v_row.id is null then
    return;
  end if;
  if not (public.is_company_member(v_row.company_id) or public.is_platform_admin()) then
    raise exception 'Seria nu este a firmei tale' using errcode = '42501';
  end if;

  return query
  select d from public.recurrence_dates(
    v_row.kind, v_row.weekdays, v_row.every_n_days,
    greatest(v_row.starts_on, current_date), v_row.ends_on, p_limit) as d;
end;
$fn$;

revoke all on function public.route_series_upcoming(uuid, integer) from public;
grant execute on function public.route_series_upcoming(uuid, integer) to authenticated;

-- =====================================================================
-- CERERI PRIVATE
--
-- Regula, într-o propoziție: o cerere privată nu este o cerere publică
-- cu un filtru pe ecran. Este invizibilă în RLS pentru cine nu este
-- invitat, și la fel sunt ofertele ei și conversațiile ei.
--
-- Filtrul pe ecran ar fi funcționat până în ziua în care cineva scrie
-- o a doua interogare și uită de el. Aici nu există „a uita de el":
-- politica întoarce zero rânduri.
-- =====================================================================
create type public.listing_visibility as enum ('publica', 'privata');

comment on type public.listing_visibility is
  'Public board, or only the carriers the owner invited. Private is enforced by RLS, not by a filter on a screen.';

alter table public.cargo_listings
  add column if not exists visibility public.listing_visibility not null default 'publica',
  add column if not exists opened_to_public_at timestamptz;

comment on column public.cargo_listings.visibility is
  '„privata" means only the owner, the invited carriers and staff can see this row, its offers and its conversations.';

create index if not exists cargo_listings_visibility_idx
  on public.cargo_listings (visibility, status) where visibility = 'privata';

-- Cine a fost invitat.
create table public.cargo_listing_invites (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  cargo_listing_id uuid not null references public.cargo_listings (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  invited_by uuid not null references public.profiles (id) on delete restrict,
  -- Când a fost anunțat. Null cât timp cererea este ciornă: invitația
  -- pleacă la publicare, nu la bifare.
  notified_at timestamptz,
  constraint cargo_listing_invites_unique unique (cargo_listing_id, company_id)
);

comment on table public.cargo_listing_invites is
  'Which carriers may see one private request. Rows survive a conversion to public: who was asked first is part of the history.';

create index cargo_listing_invites_company_idx
  on public.cargo_listing_invites (company_id, created_at desc);

/**
 * Două ajutoare care rup o buclă.
 *
 * Politica de pe `cargo_listings` are nevoie să știe dacă firma mea a
 * fost invitată, iar politica de pe `cargo_listing_invites` are nevoie
 * să știe dacă cererea este a mea. Scrise ca subinterogări, cele două
 * se cheamă una pe alta la nesfârșit și Postgres răspunde „infinite
 * recursion detected in policy" — ceea ce a și făcut, la prima rulare.
 *
 * SECURITY DEFINER ocolește RLS înăuntru, deci lanțul se oprește după
 * un pas. Nu lărgesc nimic: fiecare întreabă exact ce întreba
 * subinterogarea din care a ieșit.
 */
create or replace function public.is_invited_to_listing(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.cargo_listing_invites i
    where i.cargo_listing_id = p_listing_id
      and public.is_company_member(i.company_id)
  );
$fn$;

create or replace function public.owns_listing(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.cargo_listings c
    where c.id = p_listing_id
      and (c.posted_by = auth.uid()
           or (c.company_id is not null and public.is_company_member(c.company_id)))
  );
$fn$;

revoke all on function public.is_invited_to_listing(uuid) from public;
revoke all on function public.owns_listing(uuid) from public;
grant execute on function public.is_invited_to_listing(uuid) to authenticated;
grant execute on function public.owns_listing(uuid) to authenticated;

/**
 * Poate firma mea să vadă cererea asta.
 *
 * Numită și folosită în patru politici, ca regula să fie într-un loc.
 * O cerere publică răspunde „da" fără să atingă tabelul de invitații —
 * calea fierbinte a panoului nu plătește un join pentru o coloană care
 * spune deja totul.
 */
create or replace function public.can_see_listing(p_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1 from public.cargo_listings c
    where c.id = p_listing_id
      and (
        c.visibility = 'publica'
        or c.posted_by = auth.uid()
        or (c.company_id is not null and public.is_company_member(c.company_id))
        or public.is_platform_admin()
        or public.is_invited_to_listing(c.id)
      )
  );
$fn$;

comment on function public.can_see_listing(uuid) is
  'Whether the caller may see one request. The whole of the private-request rule, in one place, used by four policies.';

revoke all on function public.can_see_listing(uuid) from public;
grant execute on function public.can_see_listing(uuid) to authenticated;

alter table public.cargo_listing_invites enable row level security;

-- Proprietarul vede pe cine a invitat; transportatorul vede că a fost
-- invitat; nimeni altcineva nu vede lista — cine mai concurează este
-- exact ce nu se dă.
create policy "cargo_listing_invites_select_involved" on public.cargo_listing_invites
  for select to authenticated
  using (
    public.is_company_member(company_id)
    or public.owns_listing(cargo_listing_id)
    or public.is_platform_admin()
  );

revoke all on public.cargo_listing_invites from anon, authenticated;
grant select on public.cargo_listing_invites to authenticated;

-- ---------------------------------------------------------------------
-- Politicile care se schimbă
-- ---------------------------------------------------------------------
drop policy if exists "cargo_listings_select_active_or_own" on public.cargo_listings;
create policy "cargo_listings_select_visible" on public.cargo_listings
  for select to authenticated
  using (
    -- Ce era înainte, plus condiția că o cerere privată se vede doar de
    -- cine a fost invitat. `posted_by` și membrii firmei rămân primii,
    -- ca proprietarul să își vadă ciornele ca până acum.
    posted_by = auth.uid()
    or (company_id is not null and public.is_company_member(company_id))
    or public.is_platform_admin()
    or (
      status = 'active'
      and (
        visibility = 'publica'
        or public.is_invited_to_listing(cargo_listings.id)
      )
    )
  );

-- Ofertele pe o cerere privată. `offers_select_parties` dădea deja
-- accesul părților; asta nu îl lărgește, ci îl îngustează pentru
-- cazul în care cineva ar fi ajuns la o ofertă fără să poată vedea
-- cererea.
-- Reprodusă din 20260916120400 cu o singură condiție în plus. Nu
-- lărgește nimic: adaugă cerința ca cine vede o ofertă să poată vedea
-- și cererea pe care s-a făcut. Staff-ul rămâne exceptat, pentru că
-- `can_see_listing()` îi răspunde oricum „da".
drop policy if exists "offers_select_parties" on public.offers;
create policy "offers_select_parties" on public.offers
  for select to authenticated
  using (
    (
      from_user_id = auth.uid()
      or (from_company_id is not null and public.is_company_member(from_company_id))
      or exists (
        select 1 from public.cargo_listings l
        where l.id = cargo_listing_id
          and (l.posted_by = auth.uid()
               or (l.company_id is not null and public.is_company_member(l.company_id)))
      )
      or exists (
        select 1 from public.truck_listings l
        where l.id = truck_listing_id and public.is_company_member(l.company_id)
      )
      or public.is_platform_admin()
    )
    and (
      cargo_listing_id is null
      or public.can_see_listing(cargo_listing_id)
    )
  );


-- ---------------------------------------------------------------------
-- Ce nu mai apare în public
--
-- `v_requests_public` reprodusă din 20260925100000 cu un rând în plus.
-- Vederea este poarta către panou, prima pagină, potriviri și paginile
-- de destinație — toate citesc din ea, deci o singură condiție le
-- acoperă pe toate.
-- ---------------------------------------------------------------------
create or replace view public.v_requests_public as
select
  c.id,
  d.category,
  d.make,
  d.model,
  d.year,
  d.is_running,
  c.service_type,
  c.loading_city as from_city,
  c.loading_country as from_country,
  c.unloading_city as to_city,
  c.unloading_country as to_country,
  round(
    public.distance_km(c.loading_lat, c.loading_lng, c.unloading_lat, c.unloading_lng)
  )::integer as estimated_km,
  c.published_at,
  c.board,
  c.loading_from,
  c.loading_to,
  c.weight_kg,
  d.needs_winch,
  coalesce(array_length(c.photo_paths, 1), 0) as photo_count,
  c.loading_country = c.unloading_country as is_domestic,
  c.loading_county as from_county,
  c.unloading_county as to_county,
  c.expires_at,

  -- Appended by 20260921100000.
  c.loading_lat as from_lat,
  c.loading_lng as from_lng,
  c.unloading_lat as to_lat,
  c.unloading_lng as to_lng
from public.cargo_listings c
join public.cargo_vehicle_details d on d.cargo_listing_id = c.id
join public.profiles p on p.id = c.posted_by
left join public.companies co on co.id = c.company_id
where c.status = 'active'
  and c.hidden_at is null
  -- O cerere privată nu are ce căuta pe panoul public, în numărătorile
  -- de pe prima pagină sau într-o pagină de destinație. Vederea este
  -- citită de `anon`, deci aici nu există sesiune de întrebat: filtrul
  -- este pe coloană, și nu poate fi altfel.
  and c.visibility = 'publica'
  and c.listing_kind = 'vehicul'
  and c.published_at is not null
  and coalesce(c.loading_to, c.loading_from) >= current_date
  and not p.is_test
  and not coalesce(co.is_test, false);

-- ---------------------------------------------------------------------
-- Alertele de potrivire nu pleacă pentru o cerere privată
--
-- `queue_request_alerts()` reprodusă din 20260918090000 cu o condiție
-- în plus pe firma care primește: fie cererea este publică, fie firma
-- este printre cele invitate. Fără asta, un transportator neinvitat ar
-- fi primit un e-mail despre o marfă pe care nu are voie să o vadă —
-- cea mai proastă formă de scurgere, pentru că pleacă singură.
-- ---------------------------------------------------------------------
create or replace function public.queue_request_alerts()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_queued integer;
begin
  insert into public.notification_outbox
    (channel, template, recipient_company_id, to_email, payload, dedupe_key)
  select
    'email',
    'request_match_alert',
    c.id,
    coalesce(c.alerts_email, c.contact_email),
    jsonb_build_object(
      'company_name', coalesce(c.display_name, c.legal_name),
      'request_id', new.id,
      'title', new.title,
      'from_city', new.loading_city,
      'from_country', new.loading_country,
      'to_city', new.unloading_city,
      'to_country', new.unloading_country,
      'loading_from', new.loading_from,
      'loading_to', new.loading_to,
      'service_type', new.service_type
    ),
    'request_match:' || new.id || ':' || c.id
  from public.companies c
  where c.alerts_enabled
    and c.verification_status = 'verified'
    and not c.is_suspended
    and coalesce(c.alerts_email, c.contact_email) is not null
    and (
      new.visibility = 'publica'
      or exists (
        select 1 from public.cargo_listing_invites i
        where i.cargo_listing_id = new.id and i.company_id = c.id
      )
    )
    and public.company_matches_request(c.id, new.id)
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  get diagnostics v_queued = row_count;
  if v_queued > 0 then
    perform public.write_audit('request.alerts_queued', 'cargo_listings', new.id,
                               null, jsonb_build_object('queued', v_queued));
  end if;
  return null;
end;
$fn$;

-- ---------------------------------------------------------------------
-- Invitațiile
-- ---------------------------------------------------------------------
create or replace function public.set_listing_invites(
  p_cargo_listing_id uuid,
  p_company_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_listing public.cargo_listings;
  v_count integer;
begin
  select * into v_listing from public.cargo_listings
  where id = p_cargo_listing_id for update;
  if v_listing.id is null then
    raise exception 'Cererea nu există' using errcode = 'P0002';
  end if;
  if not (v_listing.posted_by = auth.uid()
          or (v_listing.company_id is not null
              and public.is_company_member(v_listing.company_id))) then
    raise exception 'Cererea nu este a ta' using errcode = '42501';
  end if;
  if v_listing.visibility <> 'privata' then
    raise exception 'Cererea este publică. Invitațiile sunt doar pentru cereri private.'
      using errcode = '22023';
  end if;
  if coalesce(array_length(p_company_ids, 1), 0) = 0 then
    raise exception 'Alege cel puțin un transportator' using errcode = '22023';
  end if;
  if array_length(p_company_ids, 1) > 20 then
    raise exception 'Cel mult 20 de transportatori pe o cerere' using errcode = '22023';
  end if;

  -- Numai firme care chiar pot transporta. O invitație către o firmă
  -- neverificată este o invitație care nu poate fi onorată, iar omul ar
  -- aștepta un răspuns care nu vine.
  if exists (
    select 1 from unnest(p_company_ids) as cid
    where not exists (
      select 1 from public.companies c
      where c.id = cid and c.verification_status = 'verified'
        and not c.is_suspended and c.company_type in ('transport', 'both')
    )
  ) then
    raise exception 'Unul dintre transportatori nu este verificat sau nu mai este activ'
      using errcode = '22023';
  end if;

  delete from public.cargo_listing_invites
  where cargo_listing_id = p_cargo_listing_id
    and company_id <> all (p_company_ids);

  insert into public.cargo_listing_invites (cargo_listing_id, company_id, invited_by)
  select p_cargo_listing_id, cid, auth.uid() from unnest(p_company_ids) as cid
  on conflict (cargo_listing_id, company_id) do nothing;

  select count(*)::integer into v_count from public.cargo_listing_invites
  where cargo_listing_id = p_cargo_listing_id;

  perform public.write_audit('request.invites_set', 'cargo_listings', p_cargo_listing_id,
    null, jsonb_build_object('companies', p_company_ids), null);

  return v_count;
end;
$fn$;

revoke all on function public.set_listing_invites(uuid, uuid[]) from public;
grant execute on function public.set_listing_invites(uuid, uuid[]) to authenticated;

/**
 * Anunțul către cei invitați.
 *
 * Pleacă la publicare, nu la bifare: o cerere care stă în ciornă trei
 * zile nu trebuie să sune de trei ori la cinci firme. `notified_at`
 * este ce face trimiterea idempotentă.
 */
create or replace function public.notify_listing_invites()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.visibility <> 'privata' or new.status <> 'active' then
    return null;
  end if;

  insert into public.notification_outbox
    (channel, template, recipient_company_id, to_email, payload, dedupe_key)
  select
    'email', 'private_request_invite', c.id,
    coalesce(c.alerts_email, c.contact_email),
    jsonb_build_object(
      'company_name', coalesce(nullif(c.display_name, ''), c.legal_name),
      'request_id', new.id,
      'from_city', new.loading_city,
      'to_city', new.unloading_city,
      'loading_from', new.loading_from,
      'client_name', coalesce(
        (select coalesce(nullif(oc.display_name, ''), oc.legal_name)
           from public.companies oc where oc.id = new.company_id),
        'un client')
    ),
    'private_invite:' || new.id || ':' || c.id
  from public.cargo_listing_invites i
  join public.companies c on c.id = i.company_id
  where i.cargo_listing_id = new.id
    and i.notified_at is null
    and coalesce(c.alerts_email, c.contact_email) is not null
  on conflict (dedupe_key) where dedupe_key is not null do nothing;

  perform public.queue_push_for_company(
            i.company_id, 'private_request_invite', 'Cerere directă',
            new.loading_city || ' → ' || new.unloading_city,
            jsonb_build_object('request_id', new.id),
            'private_invite_push:' || new.id || ':' || i.company_id)
  from public.cargo_listing_invites i
  where i.cargo_listing_id = new.id and i.notified_at is null;

  update public.cargo_listing_invites
  set notified_at = now()
  where cargo_listing_id = new.id and notified_at is null;

  return null;
end;
$fn$;

create trigger cargo_listings_notify_invites
  after update of status on public.cargo_listings
  for each row
  when (new.status = 'active' and old.status is distinct from 'active')
  execute function public.notify_listing_invites();

/** «Deschide pe bursă». Ireversibil, și scris în jurnal. */
create or replace function public.open_listing_to_public(p_cargo_listing_id uuid)
returns public.cargo_listings
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_before public.cargo_listings;
  v_row public.cargo_listings;
begin
  select * into v_before from public.cargo_listings
  where id = p_cargo_listing_id for update;
  if v_before.id is null then
    raise exception 'Cererea nu există' using errcode = 'P0002';
  end if;
  if not (v_before.posted_by = auth.uid()
          or (v_before.company_id is not null
              and public.is_company_member(v_before.company_id))) then
    raise exception 'Cererea nu este a ta' using errcode = '42501';
  end if;
  if v_before.visibility = 'publica' then
    raise exception 'Cererea este deja pe bursă' using errcode = '22023';
  end if;

  update public.cargo_listings
  set visibility = 'publica', opened_to_public_at = now()
  where id = p_cargo_listing_id
  returning * into v_row;

  -- Invitațiile rămân. Cine a fost întrebat primul este parte din
  -- istoria cererii, și ecranul o arată.
  perform public.write_audit('request.opened_to_public', 'cargo_listings', v_row.id,
    jsonb_build_object('visibility', v_before.visibility),
    jsonb_build_object('visibility', 'publica'), null);

  return v_row;
end;
$fn$;

revoke all on function public.open_listing_to_public(uuid) from public;
grant execute on function public.open_listing_to_public(uuid) to authenticated;

-- =====================================================================
-- TRANSPORTATORI FAVORIȚI
--
-- Lista firmei, nu a omului. Un dispecer care pleacă nu ia cu el
-- transportatorii cu care lucrează firma de trei ani.
-- =====================================================================
create table public.favourite_carriers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  company_id uuid not null references public.companies (id) on delete cascade,
  carrier_company_id uuid not null references public.companies (id) on delete cascade,
  added_by uuid not null references public.profiles (id) on delete set null,
  note text check (note is null or length(note) <= 200),
  constraint favourite_carriers_unique unique (company_id, carrier_company_id),
  constraint favourite_carriers_not_self check (company_id <> carrier_company_id)
);

comment on table public.favourite_carriers is
  'The carriers a firm works with. A company-level list: a dispatcher who leaves does not take three years of relationships with them.';

create index favourite_carriers_carrier_idx
  on public.favourite_carriers (carrier_company_id);

alter table public.favourite_carriers enable row level security;

-- Numai firma proprie o citește. Un transportator **nu** află că este
-- favoritul cuiva: ar fi o informație comercială despre clientul lui,
-- pe care clientul nu a spus că o dă.
create policy "favourite_carriers_select_own" on public.favourite_carriers
  for select to authenticated
  using (public.is_company_member(company_id) or public.is_platform_admin());

revoke all on public.favourite_carriers from anon, authenticated;
grant select on public.favourite_carriers to authenticated;

create or replace function public.add_favourite_carrier(
  p_company_id uuid,
  p_carrier_company_id uuid,
  p_note text default null
)
returns public.favourite_carriers
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_company uuid := p_company_id;
  v_row public.favourite_carriers;
begin
  -- Firma se dă, nu se ghicește: cineva poate fi în două firme, iar o
  -- ghicitoare ar pune favoritul pe cea greșită exact o dată la zece.
  if v_company is null or not public.is_company_member(v_company) then
    raise exception 'Firma nu este a ta' using errcode = '42501';
  end if;
  -- Proprietar, administrator sau dispecer. Un șofer nu ține lista
  -- comercială a firmei.
  if not public.is_company_manager(v_company)
     and not exists (
       select 1 from public.company_members m
       where m.company_id = v_company and m.user_id = auth.uid()
         and m.role = 'dispatcher'
     ) then
    raise exception 'Doar proprietarul, administratorii și dispecerii pot schimba lista'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.companies c
    where c.id = p_carrier_company_id
      and c.company_type in ('transport', 'both')
      and c.verification_status = 'verified' and not c.is_suspended
  ) then
    raise exception 'Firma nu este un transportator verificat' using errcode = '22023';
  end if;

  insert into public.favourite_carriers (company_id, carrier_company_id, added_by, note)
  values (v_company, p_carrier_company_id, auth.uid(), nullif(btrim(coalesce(p_note, '')), ''))
  on conflict (company_id, carrier_company_id) do update
    set note = coalesce(excluded.note, public.favourite_carriers.note)
  returning * into v_row;

  return v_row;
end;
$fn$;

revoke all on function public.add_favourite_carrier(uuid, uuid, text) from public;
grant execute on function public.add_favourite_carrier(uuid, uuid, text) to authenticated;

create or replace function public.remove_favourite_carrier(
  p_company_id uuid,
  p_carrier_company_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_company uuid := p_company_id;
begin
  if v_company is null or not public.is_company_member(v_company) then
    raise exception 'Firma nu este a ta' using errcode = '42501';
  end if;
  if not public.is_company_manager(v_company)
     and not exists (
       select 1 from public.company_members m
       where m.company_id = v_company and m.user_id = auth.uid()
         and m.role = 'dispatcher'
     ) then
    raise exception 'Doar proprietarul, administratorii și dispecerii pot schimba lista'
      using errcode = '42501';
  end if;

  delete from public.favourite_carriers
  where company_id = v_company and carrier_company_id = p_carrier_company_id;
end;
$fn$;

revoke all on function public.remove_favourite_carrier(uuid, uuid) from public;
grant execute on function public.remove_favourite_carrier(uuid, uuid) to authenticated;

/** Favoriții firmei active, cu numele și reputația lor. */
create or replace function public.my_favourite_carriers(p_company_id uuid)
returns table (
  carrier_company_id uuid,
  name text,
  slug text,
  city text,
  county text,
  rating_avg numeric,
  rating_count integer,
  note text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_company uuid := p_company_id;
begin
  if v_company is null or not public.is_company_member(v_company) then
    return;
  end if;

  return query
  select
    f.carrier_company_id,
    coalesce(nullif(c.display_name, ''), c.legal_name),
    c.slug,
    c.city,
    c.county,
    c.rating_avg,
    c.rating_count,
    f.note,
    f.created_at
  from public.favourite_carriers f
  join public.companies c on c.id = f.carrier_company_id
  where f.company_id = v_company
  order by f.created_at desc;
end;
$fn$;

revoke all on function public.my_favourite_carriers(uuid) from public;
grant execute on function public.my_favourite_carriers(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- Șabloanele și tipurile
-- ---------------------------------------------------------------------
insert into public.notification_types
  (code, label_ro, description_ro, audience, default_push, is_mandatory,
   bypasses_quiet_hours, deep_link, is_available, sort_order)
values
  ('private_request_invite', 'Cerere trimisă direct',
   'Un client ți-a trimis o cerere numai ție și altor câțiva transportatori aleși.',
   'both', true, false, false, '/cereri', true, 700),
  ('series_paused', 'Serie de plecări oprită',
   'O serie care se repeta nu mai poate genera plecări. Mesajul spune de ce.',
   'both', true, false, false, '/cont/trasee', true, 710)
on conflict (code) do update
set label_ro = excluded.label_ro,
    description_ro = excluded.description_ro,
    audience = excluded.audience,
    default_push = excluded.default_push,
    is_mandatory = excluded.is_mandatory,
    bypasses_quiet_hours = excluded.bypasses_quiet_hours,
    deep_link = excluded.deep_link,
    is_available = excluded.is_available,
    sort_order = excluded.sort_order;

-- ---------------------------------------------------------------------
-- Jobul de noapte
--
-- La 02:30, înaintea măturii de conformitate de la 03:00: o serie
-- oprită pentru un ITP expirat trebuie să afle despre expirare din
-- aceeași noapte, nu din următoarea.
-- ---------------------------------------------------------------------
do $cron$
begin
  if to_regprocedure('cron.schedule(text,text,text)') is null then
    raise warning 'pg_cron nu este disponibil, deci seriile de plecări nu sunt programate. Vezi docs/configurare-externa.md.';
    return;
  end if;
  perform cron.schedule('nightly-route-series', '30 2 * * *',
                        'select public.generate_route_departures();');
end;
$cron$;

-- ---------------------------------------------------------------------
-- Ecranul de sănătate învață jobul nou
--
-- `job_health()` reprodusă din 20260926100000 cu un rând în plus în
-- fiecare dintre cele două liste ale ei.
-- ---------------------------------------------------------------------
create or replace function public.job_health(p_now timestamptz default now())
returns table (
  job text,
  scheduled boolean,
  last_run timestamptz,
  last_status text,
  hours_since numeric,
  is_late boolean
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_has_cron boolean := to_regclass('cron.job') is not null;
  v_has_details boolean := to_regclass('cron.job_run_details') is not null;
begin
  if not public.is_platform_admin() then
    raise exception 'Doar echipa platformei poate vedea starea joburilor'
      using errcode = '42501';
  end if;

  return query
  with expected(job, late_after_hours) as (
    values
      ('account-deletion', 36.0),
      ('hourly-booking-expiry-alerts', 3.0),
      ('hourly-listing-cleanup', 3.0), ('hourly-offer-expiry', 3.0),
      ('hourly-order-autocomplete', 3.0),
      ('hourly-push-cleanup', 3.0),
      ('nightly-compliance-sweep', 36.0),
      ('nightly-order-vehicle-check', 36.0),
      ('nightly-conversation-retention', 36.0),
      ('nightly-assisted-sweep', 36.0),
      ('nightly-route-series', 36.0),
      ('nightly-rating-reminders', 36.0),
      ('nightly-reputation', 36.0),
      ('nightly-expiry-reminders', 36.0),
      ('nightly-listing-expiry-reminders', 36.0),
      ('nightly-retention', 36.0),
      ('nightly-saved-search-digest', 36.0),
      ('outbox-dispatcher', 1.0)
  ),
  from_cron as (
    select d.jobname::text as job, max(d.end_time) as last_run,
           (array_agg(d.status order by d.end_time desc))[1]::text as last_status
    from (
      select j.jobname, r.end_time, r.status
      from cron.job j
      left join cron.job_run_details r on r.jobid = j.jobid
      where v_has_cron and v_has_details
    ) d
    group by d.jobname
  ),
  from_log as (
    select l.workflow as job, max(l.ran_at) as last_run,
           case when max(l.failed) > 0 then 'failed' else 'succeeded' end as last_status
    from public.job_run_log l
    group by l.workflow
  ),
  scheduled_jobs as (
    select j.jobname::text as job from cron.job j where v_has_cron
  )
  select
    e.job,
    exists (select 1 from scheduled_jobs s where s.job = e.job),
    greatest(c.last_run, g.last_run),
    coalesce(
      case when g.last_run is not null and (c.last_run is null or g.last_run >= c.last_run)
           then g.last_status else c.last_status end,
      'niciodată'
    ),
    round(extract(epoch from (p_now - greatest(c.last_run, g.last_run))) / 3600.0, 1),
    greatest(c.last_run, g.last_run) is null
      or (p_now - greatest(c.last_run, g.last_run)) > (e.late_after_hours || ' hours')::interval
  from expected e
  left join from_cron c on c.job = e.job
  left join from_log g on g.job = e.job
  order by e.job;
exception
  when undefined_table or invalid_schema_name then
    return query
    select e.job, false, g.last_run,
           coalesce(g.last_status, 'niciodată'),
           round(extract(epoch from (p_now - g.last_run)) / 3600.0, 1),
           g.last_run is null
             or (p_now - g.last_run) > (e.late_after_hours || ' hours')::interval
    from (values
      ('account-deletion', 36.0), ('hourly-booking-expiry-alerts', 3.0),
      ('hourly-listing-cleanup', 3.0), ('hourly-offer-expiry', 3.0),
      ('hourly-order-autocomplete', 3.0), ('hourly-push-cleanup', 3.0),
      ('nightly-compliance-sweep', 36.0), ('nightly-expiry-reminders', 36.0),
      ('nightly-order-vehicle-check', 36.0),
      ('nightly-conversation-retention', 36.0),
      ('nightly-assisted-sweep', 36.0),
      ('nightly-route-series', 36.0),
      ('nightly-rating-reminders', 36.0), ('nightly-reputation', 36.0),
      ('nightly-listing-expiry-reminders', 36.0),
      ('nightly-retention', 36.0), ('nightly-saved-search-digest', 36.0),
      ('outbox-dispatcher', 1.0)
    ) as e(job, late_after_hours)
    left join (
      select l.workflow as job, max(l.ran_at) as last_run,
             case when max(l.failed) > 0 then 'failed' else 'succeeded' end as last_status
      from public.job_run_log l group by l.workflow
    ) g on g.job = e.job
    order by e.job;
end;
$fn$;

-- ---------------------------------------------------------------------
-- Cum devine o cerere privată
--
-- Numai cât timp este ciornă. Asta nu este o precauție teoretică: o
-- cerere care a fost pe bursă a fost deja văzută, poate are oferte pe
-- ea, iar „retragerea" ei în privat ar ascunde de un transportator
-- exact marfa la care tocmai a licitat.
--
-- Drumul invers, `open_listing_to_public()`, nu are limita asta: de la
-- mai puțini la mai mulți nu se pierde nimic.
-- ---------------------------------------------------------------------
create or replace function public.set_listing_private(p_cargo_listing_id uuid)
returns public.cargo_listings
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_row public.cargo_listings;
begin
  select * into v_row from public.cargo_listings
  where id = p_cargo_listing_id for update;
  if v_row.id is null then
    raise exception 'Cererea nu există' using errcode = 'P0002';
  end if;
  if not (v_row.posted_by = auth.uid()
          or (v_row.company_id is not null
              and public.is_company_member(v_row.company_id))) then
    raise exception 'Cererea nu este a ta' using errcode = '42501';
  end if;
  if v_row.status <> 'draft' then
    raise exception 'Cererea a fost deja publicată. O cerere de pe bursă nu mai poate deveni privată.'
      using errcode = '22023';
  end if;

  update public.cargo_listings
  set visibility = 'privata'
  where id = p_cargo_listing_id
  returning * into v_row;

  perform public.write_audit('request.set_private', 'cargo_listings', v_row.id,
    jsonb_build_object('visibility', 'publica'),
    jsonb_build_object('visibility', 'privata'), null);

  return v_row;
end;
$fn$;

revoke all on function public.set_listing_private(uuid) from public;
grant execute on function public.set_listing_private(uuid) to authenticated;


-- ---------------------------------------------------------------------
-- Ofertele primite, cu firma din spatele lor
--
-- `my_offers()` reprodusă din 20260922100000 cu o coloană în plus, ca
-- filtrul «doar favoriți» să compare id-uri și nu nume. `create or
-- replace` nu poate schimba forma unui `returns table`, deci funcția
-- se șterge și se face din nou; semnătura de apel rămâne aceeași.
-- ---------------------------------------------------------------------
drop function if exists public.my_offers(text, public.offer_status);

create function public.my_offers(
  p_box text default 'trimise',
  p_status public.offer_status default null
)
returns table (
  id uuid,
  created_at timestamptz,
  status public.offer_status,
  price_amount numeric,
  currency public.currency_code,
  estimated_pickup_date date,
  estimated_delivery_date date,
  valid_until timestamptz,
  request_id uuid,
  request_title text,
  from_city text,
  to_city text,
  loading_from date,
  counterparty text,
  -- Nou: firma din spatele ofertei, ca filtrul «doar favoriți» să
  -- compare id-uri, nu nume. Două firme cu același nume există, iar un
  -- filtru pe text le-ar amesteca.
  counterparty_company_id uuid,
  conversation_id uuid,
  unread_messages integer,
  transport_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_user uuid := auth.uid();
  v_company uuid;
begin
  if v_user is null then
    raise exception 'Autentificare necesară' using errcode = '42501';
  end if;
  if p_box not in ('trimise', 'primite') then
    raise exception 'Cutia poate fi „trimise" sau „primite"' using errcode = '22023';
  end if;

  select cm.company_id into v_company
  from public.company_members cm where cm.user_id = v_user
  order by cm.created_at limit 1;

  return query
  select
    o.id, o.created_at, o.status, o.price_amount, o.currency,
    o.estimated_pickup_date, o.estimated_delivery_date, o.valid_until,
    l.id, l.title, l.loading_city, l.unloading_city, l.loading_from,
    case
      when p_box = 'trimise'
        then coalesce(oc.display_name, oc.legal_name, op.full_name)
      else coalesce(bc.display_name, bc.legal_name, bp.full_name)
    end,
    case when p_box = 'trimise' then oc.id else bc.id end,
    cv.id,
    (select count(*)::integer from public.messages m
     where m.conversation_id = cv.id
       and m.sender_user_id <> v_user
       and m.read_at is null
       and m.hidden_at is null),
    t.id
  from public.offers o
  join public.cargo_listings l on l.id = o.cargo_listing_id
  join public.profiles bp on bp.id = o.from_user_id
  left join public.companies bc on bc.id = o.from_company_id
  join public.profiles op on op.id = l.posted_by
  left join public.companies oc on oc.id = l.company_id
  left join public.conversations cv on cv.offer_id = o.id
  left join public.transports t on t.offer_id = o.id
  where (p_status is null or o.status = p_status)
    and case
      when p_box = 'trimise' then
        (v_company is not null and o.from_company_id = v_company)
        or (v_company is null and o.from_user_id = v_user)
      else
        l.posted_by = v_user
        or (l.company_id is not null and l.company_id = v_company)
    end
  order by o.created_at desc;
end;
$fn$;

revoke all on function public.my_offers(text, public.offer_status) from public;
grant execute on function public.my_offers(text, public.offer_status) to authenticated;


-- ---------------------------------------------------------------------
-- Pagina cererii private, pentru cine are voie să o deschidă
--
-- `v_requests_public` este poarta către `/cereri/<id>`, iar ea filtrează
-- acum cererile private. Fără ce urmează, transportatorul invitat ar
-- primi 404 exact pe cererea la care a fost invitat — iar e-mailul de
-- invitație duce fix acolo. Baza îl lăsa să vadă rândul; ecranul nu îl
-- întreba niciodată.
--
-- Aceleași coloane, aceeași formă, altă condiție. Vederea nu se dă
-- nimănui: se citește numai prin funcția de sub ea, care întreabă întâi
-- `can_see_listing()`. `is_test` nu se filtrează aici — o cerere
-- privată nu ajunge pe niciun panou și pe nicio statistică, deci
-- singurul lucru pe care l-ar face filtrul este să facă pilotul
-- netestabil.
-- ---------------------------------------------------------------------
create or replace view public.v_requests_private as
select
  c.id,
  d.category,
  d.make,
  d.model,
  d.year,
  d.is_running,
  c.service_type,
  c.loading_city as from_city,
  c.loading_country as from_country,
  c.unloading_city as to_city,
  c.unloading_country as to_country,
  round(
    public.distance_km(c.loading_lat, c.loading_lng, c.unloading_lat, c.unloading_lng)
  )::integer as estimated_km,
  c.published_at,
  c.board,
  c.loading_from,
  c.loading_to,
  c.weight_kg,
  d.needs_winch,
  coalesce(array_length(c.photo_paths, 1), 0) as photo_count,
  c.loading_country = c.unloading_country as is_domestic,
  c.loading_county as from_county,
  c.unloading_county as to_county,
  c.expires_at,
  c.loading_lat as from_lat,
  c.loading_lng as from_lng,
  c.unloading_lat as to_lat,
  c.unloading_lng as to_lng
from public.cargo_listings c
join public.cargo_vehicle_details d on d.cargo_listing_id = c.id
where c.status = 'active'
  and c.hidden_at is null
  and c.visibility = 'privata'
  and c.listing_kind = 'vehicul'
  and c.published_at is not null
  and coalesce(c.loading_to, c.loading_from) >= current_date;

comment on view public.v_requests_private is
  'Cererile private, în forma lui v_requests_public. Nu se citește direct: '
  'numai prin private_request_for_viewer(), care verifică dreptul.';

revoke all on public.v_requests_private from public, anon, authenticated;

/**
 * O cerere privată, pentru cine are voie să o vadă.
 *
 * `can_see_listing()` este aceeași funcție pe care o folosește politica
 * de pe `cargo_listings`: proprietarul, firmele invitate și echipa. O
 * scriem o dată și o întrebăm de două ori, ca răspunsul să nu poată
 * ajunge diferit.
 *
 * `auth.uid()` înăuntrul unei funcții `security definer` este tot
 * apelantul — vine din JWT, nu din rolul de execuție. Proprietarul
 * funcției nu este.
 */
create or replace function public.private_request_for_viewer(p_id uuid)
returns setof public.v_requests_private
language sql
stable
security definer
set search_path = public
as $fn$
  select v.*
  from public.v_requests_private v
  where v.id = p_id
    and public.can_see_listing(p_id);
$fn$;

comment on function public.private_request_for_viewer(uuid) is
  'Rândul de panou al unei cereri private, dacă apelantul are voie să o vadă.';

revoke all on function public.private_request_for_viewer(uuid) from public, anon;
grant execute on function public.private_request_for_viewer(uuid) to authenticated;
