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
--
-- Fiecare listă de excepții de aici este scurtă intenționat. Dacă se
-- lungește, înseamnă că regula nu mai este o regulă.
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
-- 1. RLS pe fiecare tabelă publică
--
-- Nicio excepție. O tabelă fără RLS este vizibilă întreagă oricui are
-- cheia anon, care este publică.
-- ---------------------------------------------------------------------
select pg_temp.guard(
  'fiecare tabelă publică are RLS pornită',
  $q$select string_agg(c.relname, ', ' order by c.relname)
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity$q$);

-- O tabelă cu RLS și fără nicio politică refuză tot, ceea ce este
-- sigur — dar aproape întotdeauna este o scăpare, nu o intenție. Cele
-- care chiar sunt intenționate se scriu aici, cu motivul lor.
select pg_temp.guard(
  'fiecare tabelă cu RLS are cel puțin o politică',
  $q$select string_agg(c.relname, ', ' order by c.relname)
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
       -- carrier_count_probes: scris numai de o funcție SECURITY DEFINER
       -- și citit de nimeni. Refuzul total este ce trebuie.
       and c.relname not in ('carrier_count_probes')
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
         'can_see_listing_photo'
       )$q$);

-- ---------------------------------------------------------------------
-- 5. `anon` nu are SELECT pe tabele fără politică pentru el
--
-- Nu pentru că ar curge ceva azi — RLS întoarce zero rânduri. Pentru
-- că fără grant trebuie să meargă prost două lucruri, nu unul: dacă
-- RLS se oprește vreodată pe o tabelă, grantul singur ar deschide tot.
-- ---------------------------------------------------------------------
select pg_temp.guard(
  'anon nu are SELECT pe nicio tabelă fără politică pentru anon',
  $q$select string_agg(c.relname, ', ' order by c.relname)
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r'
       and has_table_privilege('anon', c.oid, 'SELECT')
       and not exists (
         select 1 from pg_policy p
         where p.polrelid = c.oid
           and 'anon' = any(array(
             select ro.rolname from pg_roles ro where ro.oid = any(p.polroles))))$q$);

-- ---------------------------------------------------------------------
-- 6. Nicio tabelă nu se scrie direct de `anon`
--
-- Scrierile trec prin RPC-uri care verifică cine cheamă. Un `insert`
-- de la un vizitator fără cont nu are cum să fie intenționat.
-- ---------------------------------------------------------------------
select pg_temp.guard(
  'anon nu poate scrie în nicio tabelă',
  $q$select string_agg(distinct c.relname || ' (' || pr.privilege || ')', ', ')
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace
     cross join lateral (values ('INSERT'), ('UPDATE'), ('DELETE')) as pr(privilege)
     where n.nspname = 'public' and c.relkind = 'r'
       and has_table_privilege('anon', c.oid, pr.privilege)$q$);

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
