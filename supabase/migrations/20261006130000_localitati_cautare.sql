-- =====================================================================
-- Căutarea de localități
--
-- Înainte era o egalitate pe numele normalizat: „timisoara" găsea
-- „Timișoara", dar „timisora" nu găsea nimic, „Munich" nu găsea nimic,
-- iar cine scria „cluj" primea „Cluj-Napoca" abia dacă nimerea cratima.
--
-- Patru feluri de potrivire, în ordinea încrederii:
--
--   1. exact, pe numele normalizat sau pe un alias;
--   2. începutul numelui — „cluj" → „Cluj-Napoca";
--   3. începutul oricărui cuvânt din nume — „mare" → „Baia Mare",
--      „Satu Mare". Fără asta, jumătate din localitățile compuse din
--      România sunt de negăsit dacă nu începi cu primul cuvânt;
--   4. trigrame, pentru greșeli de tastare — „timisora" → „Timișoara".
--
-- Ordonarea, după felul potrivirii:
--
--   - populația, fiindcă între două potriviri la fel de bune orașul mare
--     este aproape întotdeauna cel căutat;
--   - reședința de județ înaintea unei comune omonime;
--   - apropierea de ce a ales deja persoana: cu plecarea pusă, o
--     destinație apropiată urcă puțin. Puțin, nu mult — cineva care
--     trimite o mașină din Cluj la Madrid nu vrea Clujul sus;
--   - ce a folosit ea însăși ultima dată.
--
-- Totul într-o funcție, pe server, cu index. Nu se descarcă nicio listă
-- în browser: sunt 2.750 de rânduri și ar fi 200 KB pe fiecare vizită,
-- pe telefon, ca să caute un oraș.
-- =====================================================================

create or replace function public.search_localities(
  p_query text,
  p_near_lat numeric default null,
  p_near_lng numeric default null,
  p_limit integer default 8
)
returns table (
  id uuid,
  name text,
  region text,
  country text,
  lat numeric,
  lng numeric,
  population integer,
  is_county_seat boolean,
  match_kind text
)
language sql
stable
security definer
set search_path = public
as $fn$
  with q as (
    select
      public.normalise_locality(p_query) as needle,
      greatest(1, least(coalesce(p_limit, 8), 25)) as take,
      auth.uid() as who
  ),
  scored as (
    select
      l.id, l.name, l.region, l.country, l.lat, l.lng,
      l.population, l.is_county_seat,
      case
        when public.normalise_locality(l.name) = q.needle then 'exact'
        when exists (
          select 1 from unnest(l.aliases) a
          where public.normalise_locality(a) = q.needle
        ) then 'alias'
        when public.normalise_locality(l.name) like q.needle || '%' then 'prefix'
        -- Începutul unui cuvânt înaintea „conține": „mare" trebuie să
        -- dea Baia Mare ca potrivire de cuvânt, nu ca bucată nimerită la
        -- mijloc. Se sparge numele scris, nu cel normalizat — normalizarea
        -- scoate spațiile și cratimele, deci după ea nu mai există
        -- cuvinte.
        when exists (
          select 1 from regexp_split_to_table(l.name, '[\s-]+') w
          where public.normalise_locality(w) like q.needle || '%'
        ) then 'word'
        when public.normalise_locality(l.name) like '%' || q.needle || '%' then 'contains'
        else 'fuzzy'
      end as kind,
      similarity(public.normalise_locality(l.name), q.needle) as sim,
      -- Distanța până la ce a ales deja persoana, în grade pătrate. Nu
      -- este kilometri și nu trebuie să fie: se folosește numai ca să
      -- așeze două potriviri egale, iar ordinea este aceeași.
      case
        when p_near_lat is null or p_near_lng is null then null
        else (l.lat - p_near_lat) ^ 2 + (l.lng - p_near_lng) ^ 2
      end as near_d,
      (select r.used_at from public.locality_recent r
       where r.user_id = q.who and r.locality_id = l.id) as used_at
    from public.localities l, q
    where q.needle <> ''
      and (
        public.normalise_locality(l.name) like '%' || q.needle || '%'
        or exists (
          select 1 from unnest(l.aliases) a
          where public.normalise_locality(a) like q.needle || '%'
        )
        or public.normalise_locality(l.name) % q.needle
      )
  )
  select id, name, region, country, lat, lng, population, is_county_seat, kind
  from scored, q
  order by
    case kind
      when 'exact' then 0 when 'alias' then 1 when 'prefix' then 2
      when 'word' then 3 when 'contains' then 4 else 5
    end,
    -- Ce a ales chiar persoana asta, între potriviri la fel de bune.
    (used_at is null),
    used_at desc nulls last,
    -- Apropierea de plecare, în trepte largi: sub ~100 km, sub ~300 km,
    -- restul. Trepte, nu o valoare continuă, ca să nu răstoarne ordinea
    -- după populație pentru o diferență de câțiva kilometri.
    case
      when near_d is null then 1
      when near_d < 1 then 0
      when near_d < 9 then 1
      else 2
    end,
    is_county_seat desc,
    population desc nulls last,
    sim desc,
    name
  limit (select take from q);
$fn$;

comment on function public.search_localities(text, numeric, numeric, integer) is
  'Sugestiile de localități: exact, alias, început de nume, început de cuvânt, apoi trigrame. Ordonate după felul potrivirii, ce a folosit persoana, apropierea de plecare, reședință de județ și populație.';

-- Nomenclator public: panoul și formularul de cerere îl deschid și fără
-- cont. `auth.uid()` este null atunci, deci partea de „ce am folosit eu"
-- pur și simplu nu se aplică.
revoke all on function public.search_localities(text, numeric, numeric, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.search_localities(text, numeric, numeric, integer)
  to anon, authenticated;

-- ---------------------------------------------------------------------
-- Ce a ales persoana
--
-- Se scrie numai prin funcția asta, care pune `auth.uid()` singură:
-- tabela nu are politică de insert, deci nimeni nu poate scrie în dreptul
-- altcuiva nici dacă încearcă.
-- ---------------------------------------------------------------------
create or replace function public.remember_locality(p_locality_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if auth.uid() is null then return; end if;
  if not exists (select 1 from public.localities where id = p_locality_id) then
    return;
  end if;

  insert into public.locality_recent (user_id, locality_id, used_at)
  values (auth.uid(), p_locality_id, now())
  on conflict (user_id, locality_id) do update set used_at = now();
end;
$fn$;

comment on function public.remember_locality(uuid) is
  'Ține minte că persoana a ales localitatea asta, pentru ordonarea sugestiilor. Scrie numai în dreptul apelantului; tabela nu are politică de insert.';

revoke all on function public.remember_locality(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.remember_locality(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Ce nu am găsit
--
-- „Nu găsim localitatea?" scrie aici. Rândul intră pe cerere ca text
-- liber și ridică un steag pentru echipă, care fie adaugă localitatea,
-- fie sună clientul. Fără asta, cineva dintr-un sat care nu e în
-- nomenclator nu poate publica deloc.
-- ---------------------------------------------------------------------
create table if not exists public.locality_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  typed text not null check (length(trim(typed)) between 2 and 120),
  country text not null default 'RO' check (country ~ '^[A-Z]{2}$'),
  cargo_listing_id uuid references public.cargo_listings (id) on delete cascade,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null
);

comment on table public.locality_requests is
  'Localități pe care le-a scris cineva și noi nu le avem. Steag pentru echipă, nu date personale: numai textul scris și anunțul pe care a fost scris.';

alter table public.locality_requests enable row level security;

create policy "locality_requests_read_own" on public.locality_requests
  for select to authenticated using (created_by = auth.uid());

create policy "locality_requests_read_staff" on public.locality_requests
  for select to authenticated using (public.is_platform_admin());

revoke all on public.locality_requests from public, anon, authenticated;
grant select on public.locality_requests to authenticated;
grant select, insert, update, delete on public.locality_requests to service_role;

create index if not exists locality_requests_open_idx
  on public.locality_requests (created_at desc) where resolved_at is null;

create or replace function public.report_missing_locality(
  p_typed text,
  p_country text default 'RO',
  p_listing_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Autentificare necesară' using errcode = '42501';
  end if;
  if coalesce(length(trim(p_typed)), 0) < 2 then
    raise exception 'Scrie numele localității' using errcode = '22023';
  end if;

  -- Numai pe anunțul propriu: altfel oricine poate agăța un steag pe
  -- cererea altcuiva.
  if p_listing_id is not null and not public.can_edit_cargo_listing(p_listing_id) then
    raise exception 'Cererea nu există' using errcode = 'P0002';
  end if;

  insert into public.locality_requests (created_by, typed, country, cargo_listing_id)
  values (auth.uid(), trim(p_typed), upper(coalesce(p_country, 'RO')), p_listing_id)
  returning id into v_id;

  return v_id;
end;
$fn$;

comment on function public.report_missing_locality(text, text, uuid) is
  '„Nu găsim localitatea?" — scrie ce a tastat omul și ridică steagul pentru echipă. Numai pe un anunț propriu.';

revoke all on function public.report_missing_locality(text, text, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.report_missing_locality(text, text, uuid) to authenticated;
