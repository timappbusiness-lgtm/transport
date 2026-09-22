-- =====================================================================
-- Gărzile structurale de securitate
--
-- Nu verifică o regulă de business. Verifică **forma** schemei, ca să
-- nu se mai poată strecura tăcut clasele de bug pe care le-a găsit
-- `docs/12-audit-securitate.md`:
--
--   1. o tabelă publică fără RLS, sau fără nicio politică
--   2. o funcție SECURITY DEFINER fără `search_path` fixat
--   3. o funcție SECURITY DEFINER care folosește `current_user` ca să
--      afle cine a chemat-o — de trei ori a apărut, de trei ori a fost
--      o gardă moartă sau o portiță care nu se deschidea
--   4. o funcție executabilă de `anon` fără să fie pe listă
--   5. `SELECT` acordat lui `anon` pe o tabelă fără politică pentru el
--   6. drept de scriere acordat lui `anon` oriunde
--   7. drept de scriere pe o vedere, unde RLS nu are cum să îl țină
--   8. o vedere citibilă de `anon` care nu filtrează nimic
--
-- **Relațiile se numără dintr-un singur loc.** C2 — `anon` ștergea
-- firme prin `v_public_companies` — a trecut pe lângă audit, pe lângă
-- migrarea de revocare **și** pe lângă garda ei, fiindcă toate trei
-- întrebau `relkind = 'r'`. O tabelă este `'r'`; o vedere este `'v'`.
-- Lista de feluri de relație stă acum în `sec_relkinds`, iar fiecare
-- gardă se leagă de ea: un fel nou se adaugă o singură dată, și nicio
-- gardă nu îl poate uita.
--
-- Fiecare listă de excepții de aici este scurtă intenționat, și fiecare
-- intrare are un motiv scris lângă ea. Dacă se lungește, înseamnă că
-- regula nu mai este o regulă.
--
-- Rulat de `pnpm db:test`, pe aceeași bază de unică folosință.
-- =====================================================================

\set ON_ERROR_STOP on
\set QUIET on
\pset tuples_only on
\pset format unaligned

create temp table sec_results (n serial, label text, pass boolean, detail text);

create or replace function pg_temp.guard(p_label text, p_query text)
returns void language plpgsql as $$
declare
  v_offenders text;
begin
  execute p_query into v_offenders;
  insert into sec_results (label, pass, detail)
  values (p_label, v_offenders is null, v_offenders);
end $$;

-- ---------------------------------------------------------------------
-- Felurile de relație, o singură dată
--
-- `can_have_rls` este linia care desparte cele două familii de gărzi:
--
--   true   tabele, tabele partiționate, tabele străine. RLS le poate
--          ține, deci regula este „RLS pornită, cel puțin o politică,
--          și niciun grant care să se sprijine pe altceva".
--   false  vederi și vederi materializate. RLS **nu** le poate ține —
--          o vedere `security_invoker = off` citește și scrie ca
--          proprietarul ei. Pentru ele regula este mai strictă: niciun
--          drept de scriere pentru nimeni din afară, și un filtru
--          explicit dacă se citesc fără cont.
--
-- Postgres mai are `'t'` (toast) și `'i'` (index), care nu se acordă
-- nimănui și nu au ce căuta în `public`.
-- ---------------------------------------------------------------------
create temp table sec_relkinds (kind "char", label text, can_have_rls boolean);
insert into sec_relkinds (kind, label, can_have_rls) values
  ('r', 'tabelă',                 true),
  ('p', 'tabelă partiționată',    true),
  ('f', 'tabelă străină',         true),
  ('v', 'vedere',                 false),
  ('m', 'vedere materializată',   false);

-- Excepțiile, cu motivul lor într-o coloană și nu într-un comentariu
-- pierdut într-un `not in (...)`. O gardă care cade îți arată numele;
-- rândul de aici îți arată de ce nu ar trebui să cadă.
create temp table sec_rls_allowed (relname text, reason text);
insert into sec_rls_allowed (relname, reason) values
  ('carrier_count_probes',
   'scrisă numai de o funcție SECURITY DEFINER și citită de nimeni; refuzul total este ce trebuie'),
  ('phone_verifications',
   'ține code_hash-ul unui cod de verificare; ecranul primește ce îi trebuie din my_phone_verification(), mascat');

-- Nicio vedere nu este o ușă de scriere astăzi. Dacă una devine,
-- grantul se scrie în migrarea ei și motivul aici — altfel garda cade.
create temp table sec_write_allowed (relname text, grantee text, reason text);

-- Nicio vedere citibilă fără cont nu este nefiltrată astăzi.
create temp table sec_unfiltered_allowed (relname text, reason text);

-- ---------------------------------------------------------------------
-- 1. RLS pe fiecare relație publică ce o poate purta
--
-- Nicio excepție. O tabelă fără RLS este vizibilă întreagă oricui are
-- cheia anon, care este publică. Tabelele partiționate și cele străine
-- intră aici pentru că și ele pot purta RLS — iar o tabelă străină
-- fără RLS este o bază de date străină deschisă prin a noastră.
-- ---------------------------------------------------------------------
select pg_temp.guard(
  'fiecare relație publică ce poate purta RLS o are pornită',
  $q$select string_agg(k.label || ' ' || c.relname, ', ' order by c.relname)
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     join sec_relkinds k on k.kind = c.relkind
     where n.nspname = 'public' and k.can_have_rls and not c.relrowsecurity$q$);

-- O relație cu RLS și fără nicio politică refuză tot, ceea ce este
-- sigur — dar aproape întotdeauna este o scăpare, nu o intenție. Cele
-- care chiar sunt intenționate sunt în `sec_rls_allowed`, cu motivul.
select pg_temp.guard(
  'fiecare relație cu RLS are cel puțin o politică',
  $q$select string_agg(k.label || ' ' || c.relname, ', ' order by c.relname)
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     join sec_relkinds k on k.kind = c.relkind
     where n.nspname = 'public' and k.can_have_rls and c.relrowsecurity
       and not exists (select 1 from sec_rls_allowed a where a.relname = c.relname)
       and not exists (select 1 from pg_policy p where p.polrelid = c.oid)$q$);

-- ---------------------------------------------------------------------
-- 2. `search_path` fixat pe fiecare funcție SECURITY DEFINER
--
-- Fără el, cine poate crea un obiect într-o schemă de pe `search_path`
-- poate deturna un apel din interiorul funcției — care rulează cu
-- drepturile proprietarului.
-- ---------------------------------------------------------------------
select pg_temp.guard(
  'fiecare funcție SECURITY DEFINER are search_path fixat',
  $q$select string_agg(p.proname, ', ' order by p.proname)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
       and not exists (select 1 from pg_depend d
                       where d.classid = 'pg_proc'::regclass
                         and d.objid = p.oid and d.deptype = 'e')
       and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c
                       where c like 'search_path=%')$q$);

-- ---------------------------------------------------------------------
-- 3. `current_user` nu spune cine a chemat
--
-- Garda care a lipsit de trei ori. Înăuntrul unei funcții SECURITY
-- DEFINER, `current_user` este **proprietarul funcției**, niciodată
-- apelantul. O condiție pe el ori nu se declanșează niciodată (portiță
-- moartă), ori se declanșează întotdeauna (gardă moartă).
--
-- Testul corect al apelantului este `auth.uid()`, sau un flag de
-- sesiune pus de cine are voie — vezi `app.audit_retention` și
-- `app.rating_write`.
--
-- Gărzile SECURITY INVOKER pot folosi `current_user` liniștite: acolo
-- chiar este apelantul. De-aia condiția de aici cere `prosecdef`.
-- ---------------------------------------------------------------------
select pg_temp.guard(
  'nicio funcție SECURITY DEFINER nu întreabă current_user cine a chemat-o',
  $q$select string_agg(p.proname, ', ' order by p.proname)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
       and not exists (select 1 from pg_depend d
                       where d.classid = 'pg_proc'::regclass
                         and d.objid = p.oid and d.deptype = 'e')
       -- Comentariile care explică de ce NU se folosește nu sunt o
       -- folosire. Se caută în cod, nu în text: o linie de comentariu
       -- începe cu `--`.
       and exists (
         select 1
         from unnest(string_to_array(p.prosrc, E'\n')) as line
         where line !~ '^\s*--'
           and line ~* '\m(current_user|session_user|current_role)\M')$q$);

-- ---------------------------------------------------------------------
-- 4. Ce poate chema un vizitator fără cont
--
-- Lista este scurtă și fiecare intrare are un motiv. O funcție nouă
-- care ajunge aici fără să fie trecută pe listă oprește CI-ul, ceea ce
-- este exact ideea: `grant execute ... to anon` trebuie să fie o
-- decizie, nu un reflex.
-- ---------------------------------------------------------------------
select pg_temp.guard(
  'numai funcțiile de pe listă sunt executabile de anon',
  $q$select string_agg(p.proname, ', ' order by p.proname)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and has_function_privilege('anon', p.oid, 'EXECUTE')
       -- Funcțiile extensiilor (pg_trgm, pgcrypto) nu sunt ale noastre.
       and not exists (select 1 from pg_depend d
                       where d.classid = 'pg_proc'::regclass
                         and d.objid = p.oid and d.deptype = 'e')
       and p.proname not in (
         -- Pagina de revendicare, deschisă pe un link din e-mail, de
         -- cineva care încă nu are cont. Token de 256 de biți, ținut ca
         -- SHA-256, același mesaj pentru „nu există" și „a fost folosit".
         'assisted_onboarding_preview',
         -- Anularea unei ștergeri programate, tot de pe un link.
         'cancel_account_deletion_by_token',
         -- Numere agregate pentru prima pagină și pentru paginile de
         -- destinație. Niciunul nu numește pe nimeni.
         'category_counts', 'directory_stats', 'homepage_activity',
         'verified_carriers_count', 'company_ratings',
         -- Ajutători de afișare, fără date în ei.
         'cargo_category_label', 'contact_mask_text', 'detour_km',
         'distance_km', 'order_required_photos', 'prices_are_published',
         'reveal_reason_order', 'ro_county_codes',
         -- Întoarce fals pentru anon. Politicile o cheamă.
         'is_platform_admin',
         -- Politica de citire a bucketului `listing-photos`. Poza unei
         -- cereri publice se vede de pe panou, fără cont, deci politica
         -- trebuie să poată fi evaluată și pentru `anon`. Funcția nu
         -- întoarce date: răspunde da/nu pentru o cale dată.
         'can_see_listing_photo',
         -- Normalizarea unui nume de localitate, chemată din interiorul
         -- lui `v_departures_public`. O vedere își citește tabelele cu
         -- drepturile proprietarului, dar o funcție din corpul ei se
         -- verifică tot pe apelant — deci fără astea două panoul public
         -- nu se mai poate deschide fără cont. Sunt funcții de șiruri:
         -- litere mici, fără diacritice, fără semne. Nu ating nicio
         -- tabelă și nu spun nimic despre nimeni.
         'normalise_locality', 'unaccent_simple',
         -- Nomenclatorul de localități, căutat. Tabela `localities` este
         -- deja citibilă fără cont — este un nomenclator public, nu date
         -- despre cineva — iar funcția nu face decât să o caute și să o
         -- ordoneze. Formularul de cerere și filtrul „lângă" de pe panou
         -- se deschid amândouă fără cont, deci fără grantul ăsta
         -- vizitatorul rămâne cu un câmp care nu sugerează nimic.
         --
         -- Partea de „ce am ales eu ultima dată" pleacă de la
         -- `auth.uid()`, care pentru `anon` este null: un vizitator nu
         -- vede istoricul nimănui, fiindcă nu are unul.
         'search_localities'
       )$q$);

-- ---------------------------------------------------------------------
-- 5. `anon` nu are SELECT pe tabele fără politică pentru el
--
-- Nu pentru că ar curge ceva azi — RLS întoarce zero rânduri. Pentru
-- că fără grant trebuie să meargă prost două lucruri, nu unul: dacă
-- RLS se oprește vreodată pe o tabelă, grantul singur ar deschide tot.
-- ---------------------------------------------------------------------
select pg_temp.guard(
  'anon nu are SELECT pe nicio relație cu RLS fără politică pentru anon',
  $q$select string_agg(k.label || ' ' || c.relname, ', ' order by c.relname)
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     join sec_relkinds k on k.kind = c.relkind
     where n.nspname = 'public' and k.can_have_rls
       and has_table_privilege('anon', c.oid, 'SELECT')
       and not exists (
         select 1 from pg_policy p
         where p.polrelid = c.oid
           and 'anon' = any(array(
             select ro.rolname from pg_roles ro where ro.oid = any(p.polroles))))$q$);

-- ---------------------------------------------------------------------
-- 6. `anon` nu scrie nicăieri, indiferent de felul relației
--
-- Scrierile trec prin RPC-uri care verifică cine cheamă. Un `insert`
-- de la un vizitator fără cont nu are cum să fie intenționat.
--
-- „Indiferent de felul relației" este partea care lipsea: garda veche
-- întreba `relkind = 'r'`, iar `v_public_companies` este `'v'`.
-- ---------------------------------------------------------------------
select pg_temp.guard(
  'anon nu poate scrie în nicio relație, de niciun fel',
  $q$select string_agg(distinct k.label || ' ' || c.relname || ' (' || pr.privilege || ')', ', ')
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     join sec_relkinds k on k.kind = c.relkind
     cross join lateral (values ('INSERT'), ('UPDATE'), ('DELETE')) as pr(privilege)
     where n.nspname = 'public'
       and has_table_privilege('anon', c.oid, pr.privilege)
       and not exists (
         select 1 from sec_write_allowed a
         where a.relname = c.relname and a.grantee = 'anon')$q$);

-- ---------------------------------------------------------------------
-- 7. Nicio vedere nu se scrie, nici de un cont obișnuit
--
-- Aici regula este mai strictă decât la tabele, și trebuie să fie:
-- pe o tabelă, `authenticated` chiar scrie, iar RLS îl ține. Pe o
-- vedere `security_invoker = off` nu îl ține nimic — scrierea se face
-- cu drepturile proprietarului vederii, pe lângă politici.
--
-- Iar o vedere care este o proiecție simplă dintr-o singură tabelă
-- este **scriibilă automat**: nu trebuie să facă nimeni nimic ca să
-- devină o ușă. `anon` chiar ștergea firme prin `v_public_companies`,
-- și nimeni nu scrisese vreodată un `grant` pentru asta — a venit din
-- implicitul Supabase.
--
-- **Garda asta va cădea la fiecare vedere nouă, și este în regulă.**
-- Implicitul Supabase dă `insert`, `update`, `delete` lui
-- `authenticated` pe orice relație nouă din `public`, iar `alter
-- default privileges ... on tables` nu deosebește o vedere de o
-- tabelă — deci nu se poate închide la sursă fără să rupă fiecare
-- tabelă nouă, unde `authenticated` chiar scrie sub politici. Migrarea
-- care adaugă o vedere își revocă singură ce a primit din oficiu:
--
--     revoke insert, update, delete, truncate, references, trigger
--       on public.v_noua from anon, authenticated;
--
-- Dacă vreodată o vedere chiar trebuie să fie scriibilă, se scrie
-- grantul în migrarea ei, cu un trigger `instead of` care verifică
-- apelantul, și un rând în `sec_write_allowed` care spune de ce.
-- ---------------------------------------------------------------------
select pg_temp.guard(
  'nicio vedere nu dă drept de scriere lui anon sau authenticated',
  $q$select string_agg(distinct k.label || ' ' || c.relname
                       || ' (' || who.role || ': ' || pr.privilege || ')', ', ')
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     join sec_relkinds k on k.kind = c.relkind
     cross join lateral (values ('anon'), ('authenticated')) as who(role)
     cross join lateral (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) as pr(privilege)
     where n.nspname = 'public' and not k.can_have_rls
       and has_table_privilege(who.role, c.oid, pr.privilege)
       and not exists (
         select 1 from sec_write_allowed a
         where a.relname = c.relname and a.grantee = who.role)$q$);

-- ---------------------------------------------------------------------
-- 8. O vedere citită fără cont trebuie să filtreze ceva
--
-- O vedere `security_invoker = off` citește pe lângă RLS: singurul ei
-- filtru este `where`-ul ei. Dacă nu are niciunul și este dată lui
-- `anon`, servește tabela întreagă oricui are cheia din browser —
-- exact ce a fost `v_companies_public` până în `20260928100000`.
--
-- Două ieșiri, amândouă bune: `security_invoker = on`, și atunci RLS
-- chiar se aplică apelantului; sau un `where` explicit, și atunci
-- vederea spune singură pe cine lasă înăuntru. Ce nu este bun este o
-- vedere fără niciuna dintre ele.
--
-- Garda se uită la forma definiției, nu la înțelesul ei: un `where`
-- care nu filtrează nimic util trece de aici. Nu este o slăbiciune, ci
-- limita a ceea ce poate verifica o gardă structurală — ce **poate**
-- face este să nu lase pe nimeni să adauge o vedere publică fără să se
-- fi gândit deloc la filtru.
-- ---------------------------------------------------------------------
select pg_temp.guard(
  'orice vedere citibilă de anon are security_invoker sau un filtru propriu',
  $q$select string_agg(k.label || ' ' || c.relname, ', ' order by c.relname)
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     join sec_relkinds k on k.kind = c.relkind
     where n.nspname = 'public' and not k.can_have_rls
       and has_table_privilege('anon', c.oid, 'SELECT')
       and coalesce((select option_value from pg_options_to_table(c.reloptions)
                     where option_name = 'security_invoker'), 'off') <> 'on'
       and pg_get_viewdef(c.oid) !~* '\swhere\s'
       and not exists (select 1 from sec_unfiltered_allowed a where a.relname = c.relname)$q$);

-- ---------------------------------------------------------------------
-- Raportul
-- ---------------------------------------------------------------------
select format('%s  %s%s',
              case when pass then 'PASS' else 'FAIL' end, label,
              case when pass then '' else E'\n      -> ' || coalesce(detail, '') end)
from sec_results order by n;

select format(E'\n%s gărzi: %s trecute, %s căzute',
              count(*), count(*) filter (where pass), count(*) filter (where not pass))
from sec_results;

do $$
begin
  if exists (select 1 from sec_results where not pass) then
    raise exception 'security_test: % gardă/gărzi căzute',
      (select count(*) from sec_results where not pass);
  end if;
end $$;

\echo 'All security guards passed.'
