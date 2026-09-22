-- =====================================================================
-- Categoriile de vehicule: etichete, descriere obligatorie, transport
-- închis
--
-- Partea a doua, după fișierul de valori de enum. Trei lucruri:
--
--   1. `cargo_category_label()` capătă cele trei categorii noi și
--      etichetele schimbate. Funcția asta scrie în e-mailuri, deci
--      trebuie să știe fiecare valoare pe care o poate ține tipul, nu
--      doar pe cele oferite azi — un anunț publicat pe `camion` înainte
--      de retragerea categoriei este tot un anunț real.
--
--   2. „Altceva" cere o descriere. Regula este în Postgres, unde este
--      regula: un check în formular este o curtoazie, iar
--      `publish_cargo_request` se poate chema direct cu cheia din
--      pachetul browserului.
--
--   3. „Vehicul istoric sau de colecție" sugerează transport închis.
--      Sugestie, nu filtru: cine vrea clasicul pe platformă deschisă
--      poate cere asta. Ce face este să pună în față firmele cu remorcă
--      închisă, prin `company_carries_closed()`.
--
-- SUV nu devine categorie separată. Distincția care contează — greutatea
-- — este deja un câmp pe formular, în kilograme, filtrabil pe ambele
-- panouri, iar partea de preț o separă de mult: `price_rates` are
-- clasele `sedan` și `suv` una lângă alta de când a fost scrisă tabela.
-- Argumentul întreg stă în `src/lib/vehicle-categories.ts`.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Etichetele
-- ---------------------------------------------------------------------
create or replace function public.cargo_category_label(p_category public.cargo_category)
returns text
language sql
immutable
set search_path = public
as $fn$
  select case p_category
    when 'autoturism' then 'Autoturism / SUV'
    when 'autoutilitara' then 'Autoutilitară'
    when 'motocicleta' then 'Motocicletă'
    when 'utilaj_agricol' then 'Utilaj agricol'
    when 'microbuz' then 'Microbuz'
    when 'utilaj_constructii' then 'Utilaj de construcții'
    when 'rulota' then 'Rulotă'
    when 'cap_tractor' then 'Cap tractor'
    when 'camion' then 'Camion'
    when 'remorca' then 'Remorcă ușoară (până la 750 kg)'
    when 'utilaj_manipulare' then 'Utilaj de manipulare'
    when 'container' then 'Container'
    when 'ambarcatiune' then 'Ambarcațiune'
    when 'altele' then 'Altceva'
    when 'atv_quad' then 'ATV sau quad'
    when 'cvadriciclu' then 'Cvadriciclu sau vehicul electric mic'
    when 'istoric' then 'Vehicul istoric sau de colecție'
  end;
$fn$;

-- ---------------------------------------------------------------------
-- 2. Ce se mai oferă, și ce doar se mai citește
--
-- Lista trăiește și aici, nu numai în TypeScript, fiindcă regula „altceva
-- cere descriere" se aplică în baza de date și are nevoie de ea. Testul
-- `tests/unit/vehicle-categories.test.ts` compară cele două liste și cade
-- dacă se despart.
-- ---------------------------------------------------------------------
create or replace function public.cargo_category_is_offered(p_category public.cargo_category)
returns boolean
language sql
immutable
set search_path = public
as $fn$
  select p_category in (
    'autoturism', 'autoutilitara', 'microbuz', 'motocicleta', 'atv_quad',
    'rulota', 'remorca', 'cvadriciclu', 'istoric', 'altele'
  );
$fn$;

-- Numai `authenticated`. Panoul public își desenează filtrul din lista
-- din TypeScript, deci `anon` nu are ce întreba aici — iar garda
-- „numai funcțiile de pe listă sunt executabile de anon" are dreptate să
-- ceară un motiv pentru fiecare ușă deschisă fără cont.
revoke all on function public.cargo_category_is_offered(public.cargo_category)
  from public, anon, authenticated, service_role;
grant execute on function public.cargo_category_is_offered(public.cargo_category)
  to authenticated;

comment on function public.cargo_category_is_offered(public.cargo_category) is
  'Ce categorii se mai pot alege. Cele din afara nișei — utilaje, camioane, containere, ambarcațiuni — rămân în enum și se citesc pe anunțurile vechi, dar nu se mai propun.';

-- ---------------------------------------------------------------------
-- 3. „Altceva" cere o descriere
--
-- Trigger, nu check: descrierea stă pe `cargo_listings` iar categoria pe
-- `cargo_vehicle_details`, deci nicio constrângere pe o singură tabelă nu
-- le poate vedea pe amândouă. Se declanșează pe detalii, fiindcă acolo se
-- scrie categoria, și citește anunțul.
--
-- Numai la publicare. Un draft poate fi orice: cineva care alege
-- „Altceva" și pleacă să caute greutatea nu trebuie oprit la jumătate.
-- ---------------------------------------------------------------------
create or replace function public.require_description_for_other()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_status public.listing_status;
  v_description text;
begin
  if new.category <> 'altele' then
    return new;
  end if;

  select l.status, l.description into v_status, v_description
  from public.cargo_listings l where l.id = new.cargo_listing_id;

  if v_status is distinct from 'active' then
    return new;
  end if;

  if coalesce(length(trim(v_description)), 0) < 10 then
    raise exception 'Pentru „Altceva" scrie în descriere ce transporți, în cel puțin 10 caractere.'
      using errcode = '23514';
  end if;

  return new;
end;
$fn$;

revoke all on function public.require_description_for_other() from public, anon, authenticated, service_role;

drop trigger if exists cargo_vehicle_details_require_description on public.cargo_vehicle_details;
create trigger cargo_vehicle_details_require_description
  after insert or update of category on public.cargo_vehicle_details
  for each row execute function public.require_description_for_other();

-- Și pe cealaltă parte: dacă descrierea se golește după publicare, sau
-- anunțul trece pe `active` cu o descriere prea scurtă. Fără asta, regula
-- de mai sus se ocolește publicând întâi și ștergând descrierea apoi.
create or replace function public.require_description_on_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_category public.cargo_category;
begin
  if new.status is distinct from 'active' then
    return new;
  end if;

  select d.category into v_category
  from public.cargo_vehicle_details d where d.cargo_listing_id = new.id;

  if v_category is distinct from 'altele' then
    return new;
  end if;

  if coalesce(length(trim(new.description)), 0) < 10 then
    raise exception 'Pentru „Altceva" scrie în descriere ce transporți, în cel puțin 10 caractere.'
      using errcode = '23514';
  end if;

  return new;
end;
$fn$;

revoke all on function public.require_description_on_publish() from public, anon, authenticated, service_role;

drop trigger if exists cargo_listings_require_description on public.cargo_listings;
create trigger cargo_listings_require_description
  after insert or update of status, description on public.cargo_listings
  for each row execute function public.require_description_on_publish();

-- ---------------------------------------------------------------------
-- 4. Transport închis pentru vehicule istorice
--
-- Nu este un filtru. O firmă fără remorcă închisă apare în continuare la
-- o cerere de vehicul istoric — clientul poate accepta platformă
-- deschisă, iar a tăia transportatorii dintr-o preferință ar goli
-- panoul. Ce face funcția este să spună **cine are**, ca sortarea să-i
-- pună primii.
-- ---------------------------------------------------------------------
create or replace function public.company_carries_closed(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(
    (select 'remorca_inchisa' = any (c.equipment) or 'transport_inchis' = any (c.services)
     from public.companies c where c.id = p_company_id),
    false);
$fn$;

comment on function public.company_carries_closed(uuid) is
  'Dacă firma are remorcă închisă sau oferă transport închis. Pentru sortare la cererile de vehicul istoric — o preferință, niciodată un filtru.';

revoke all on function public.company_carries_closed(uuid) from public, anon, authenticated, service_role;
grant execute on function public.company_carries_closed(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Potrivirea: „Altceva" nu se potrivește automat
--
-- Nimeni nu poate spune de ce echipament are nevoie un lucru pe care
-- nu l-a descris nimeni. Cererea apare pe panou, etichetată, unde un
-- transportator citește descrierea și răspunde; ce nu face este să fie
-- trimisă automat unor firme al căror profil spune că o duc, fiindcă
-- niciun profil nu spune asta.
--
-- Corpul lui `company_matches_route` se rescrie întreg, fiindcă nu există
-- „adaugă o condiție" în SQL. Restul este identic cu 20260918190000.
-- ---------------------------------------------------------------------
create or replace function public.company_matches_route(
  p_company_id uuid,
  p_loading_country text,
  p_loading_county text,
  p_unloading_country text,
  p_unloading_county text,
  p_category public.cargo_category default null,
  p_needs_winch boolean default false,
  p_service_type public.service_type default 'pe_sens',
  p_posted_by_company_id uuid default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  c public.companies;
  v_domestic boolean;
begin
  select * into c from public.companies where id = p_company_id;
  if c.id is null or p_loading_country is null or p_unloading_country is null then
    return false;
  end if;

  -- Its own request is not a match; it is the thing it just posted.
  if p_posted_by_company_id is not null and p_posted_by_company_id = c.id then
    return false;
  end if;

  -- Nimic nu se potrivește automat la „Altceva". Potrivirea deduce
  -- echipamentul din categorie — troliu pentru ce nu se rostogolește,
  -- remorcă închisă pentru ce este fragil — iar pentru „Altceva" nu are
  -- din ce deduce. Cererea rămâne pe panou, etichetată, unde un
  -- transportator citește descrierea și răspunde; ce nu face este să
  -- plece automat către firme al căror profil spune că o duc, fiindcă
  -- niciun profil nu spune asta.
  if p_category = 'altele' then
    return false;
  end if;

  v_domestic := upper(p_loading_country) = upper(p_unloading_country);

  -- Coverage. A scope is a ceiling, not a label: national includes every
  -- county, international includes the whole of national.
  if v_domestic and upper(p_loading_country) = 'RO' then
    if c.coverage_scope = 'judetean' then
      -- An unknown county cannot be proved to be inside the coverage, and
      -- a county-only carrier is exactly the firm that should not be sent
      -- a job on the other side of the country on a guess.
      if p_loading_county is null or p_unloading_county is null then
        return false;
      end if;
      if not (upper(p_loading_county) = any (c.coverage_counties)
              and upper(p_unloading_county) = any (c.coverage_counties)) then
        return false;
      end if;
    end if;
  elsif v_domestic then
    -- Domestic, but inside another country: only a firm that named that
    -- country carries it.
    if c.coverage_scope <> 'international'
       or not (upper(p_loading_country) = any (c.coverage_countries)) then
      return false;
    end if;
  else
    if c.coverage_scope <> 'international' then
      return false;
    end if;
    -- Romania is always one of the two ends a Romanian carrier serves, so
    -- it never has to be ticked.
    if not (upper(p_loading_country) in ('RO')
            or upper(p_loading_country) = any (c.coverage_countries)) then
      return false;
    end if;
    if not (upper(p_unloading_country) in ('RO')
            or upper(p_unloading_country) = any (c.coverage_countries)) then
      return false;
    end if;
  end if;

  -- What it carries. An empty list is "has not said", which is read as
  -- "everything": a firm that never opened the tab should not silently
  -- stop receiving work.
  if p_category is not null
     and coalesce(array_length(c.vehicle_types_accepted, 1), 0) > 0
     and not (p_category = any (c.vehicle_types_accepted)) then
    return false;
  end if;

  -- A forwarder subcontracts the kit, so the two rules below are about
  -- the vehicle that turns up, and a forwarder is not it.
  if c.company_type in ('transport', 'both') then
    -- The one hard capability rule in this marketplace: a car that does
    -- not roll needs a winch, and a firm without one cannot load it.
    if coalesce(p_needs_winch, false) and not ('troliu' = any (c.equipment)) then
      return false;
    end if;

    -- Recovery is a different job from carriage. Same "empty means has
    -- not said" reading as above.
    if p_service_type = 'tractare'
       and coalesce(array_length(c.services, 1), 0) > 0
       and not ('tractare' = any (c.services)) then
      return false;
    end if;
  end if;

  return true;
end;
$fn$;

comment on function public.company_matches_route(uuid, text, text, text, text, public.cargo_category, boolean, public.service_type, uuid) is
  'Whether a company carries a route: coverage, category, winch and recovery. A filter, never a score. „Altceva" never matches: nobody can say what equipment an undescribed thing needs.';
