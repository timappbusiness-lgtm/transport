-- =====================================================================
-- Localitățile: coloane noi și căutare
--
-- Tabela avea 75 de rânduri scrise de mână și o căutare care compara
-- numele normalizat, exact. „timisoara" găsea „Timișoara", dar
-- „timisora" nu găsea nimic, iar cine căuta „Munchen" nu găsea nimic
-- fiindcă orașul nu exista în tabelă.
--
-- Ce se adaugă:
--
--   population      pentru prag și pentru ordonare — un oraș mare este
--                   aproape întotdeauna răspunsul căutat
--   is_county_seat  reședință de județ; apare întâi între egale
--   aliases         „Bucuresti", „Bucharest", „Munich". Numele sub care
--                   caută omul, nu cel sub care îl scriem noi
--   source          de unde a venit rândul, ca un reimport să știe ce
--                   poate atinge și ce nu
--
-- Datele vin din migrarea următoare, generată de
-- `scripts/import-localities.mjs`. Aici este numai forma.
-- =====================================================================

alter table public.localities
  add column if not exists population integer
    check (population is null or population >= 0),
  add column if not exists is_county_seat boolean not null default false,
  add column if not exists aliases text[] not null default '{}',
  add column if not exists source text not null default 'manual';

comment on column public.localities.aliases is
  'Cum mai scrie lumea localitatea: fără diacritice, exonimul englezesc, forma scurtă. Căutarea se uită și aici, deci „Munich" găsește München.';
comment on column public.localities.population is
  'Din GeoNames. Folosită la ordonare: între două potriviri la fel de bune, orașul mare este aproape întotdeauna cel căutat.';
comment on column public.localities.source is
  'manual pentru cele 75 scrise de mână, geonames pentru importul automat. Un reimport nu are voie să atingă un rând manual.';

-- Rândurile care existau înainte sunt scrise de mână și sunt referite de
-- anunțuri publicate. Se marchează ca atare, o singură dată.
update public.localities set source = 'manual' where source = 'manual';

-- ---------------------------------------------------------------------
-- Indexuri
--
-- Trei, fiindcă sunt trei feluri de căutare:
--
--   1. exact și început de cuvânt, pe numele normalizat — `text_pattern_ops`
--      face ca `like 'cluj%'` să folosească indexul;
--   2. trigrame, pentru greșeli de tastare;
--   3. aliasuri, ca „Munich" să ajungă la München fără a scana tabela.
-- ---------------------------------------------------------------------
create index if not exists localities_prefix_idx
  on public.localities (public.normalise_locality(name) text_pattern_ops);

create index if not exists localities_trgm_idx
  on public.localities using gin (public.normalise_locality(name) public.gin_trgm_ops);

create index if not exists localities_aliases_idx
  on public.localities using gin (aliases);

create index if not exists localities_population_idx
  on public.localities (country, population desc nulls last);

-- ---------------------------------------------------------------------
-- Ce a căutat și a ales persoana asta
--
-- Ultimul criteriu de ordonare: între două potriviri la fel de bune,
-- cea pe care a folosit-o chiar ea săptămâna trecută este mai probabil
-- cea căutată. Un rând per persoană și localitate; se rescrie data.
-- ---------------------------------------------------------------------
create table if not exists public.locality_recent (
  user_id uuid not null references auth.users (id) on delete cascade,
  locality_id uuid not null references public.localities (id) on delete cascade,
  used_at timestamptz not null default now(),
  primary key (user_id, locality_id)
);

comment on table public.locality_recent is
  'Localitățile pe care le-a ales fiecare persoană. Numai pentru ordonarea sugestiilor; nu apare nicăieri în interfață și se șterge odată cu contul.';

alter table public.locality_recent enable row level security;

-- Fiecare își vede numai propriile rânduri, și numai le citește: scrisul
-- trece prin `remember_locality()`, care pune `auth.uid()` singură.
create policy "locality_recent_read_own" on public.locality_recent
  for select to authenticated using (user_id = auth.uid());

revoke all on public.locality_recent from public, anon, authenticated;
grant select on public.locality_recent to authenticated;
grant select, insert, update, delete on public.locality_recent to service_role;

create index if not exists locality_recent_user_idx
  on public.locality_recent (user_id, used_at desc);
