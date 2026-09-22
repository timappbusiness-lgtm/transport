-- =====================================================================
-- Restanțele auditului din septembrie 2026.
--
-- Auditul (docs/12-audit-securitate.md) a lăsat în urmă un singur lucru
-- de cod: `route_series_upcoming` răspundea diferit la o serie care nu
-- există față de una care există dar este a altcuiva. Diferența dintre
-- cele două răspunsuri este chiar informația pe care nu ai voie să o
-- afli — regula 7 din secțiunea Securitate: 404, nu 403, pentru ce nu
-- ai voie să știi că există.
-- =====================================================================

/** Următoarele date ale unei serii, pentru ecran.
 *
 *  O serie străină și o serie inexistentă dau același răspuns: mulțimea
 *  goală. Varianta veche ridica `42501` pentru prima și tăcea pentru a
 *  doua, deci un cont putea afla dacă un `uuid` este o serie reală a
 *  altei firme doar cerându-i datele. */
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

  -- Un singur `return` pentru amândouă cazurile, intenționat: nu există
  -- și nu este a ta se văd la fel din afară.
  if v_row.id is null then
    return;
  end if;
  if not (public.is_company_member(v_row.company_id) or public.is_platform_admin()) then
    return;
  end if;

  return query
  select d from public.recurrence_dates(
    v_row.kind, v_row.weekdays, v_row.every_n_days,
    greatest(v_row.starts_on, current_date), v_row.ends_on, p_limit) as d;
end;
$fn$;

comment on function public.route_series_upcoming(uuid, integer) is
  'Următoarele date ale unei serii. O serie străină și una inexistentă dau amândouă mulțimea goală: răspunsul nu confirmă niciodată că id-ul există.';

revoke all on function public.route_series_upcoming(uuid, integer) from public, anon;
grant execute on function public.route_series_upcoming(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------
-- `is_assisted_company()`, cerut direct
--
-- Verificările noi pe cei optsprezece ajutători de politică au găsit
-- una singură care spunea mai mult decât trebuie: chemată direct de un
-- cont oarecare, întorcea „firma asta este în curs de înscriere
-- asistată" despre orice firmă. Nu este o gaură de acces — nu deschide
-- niciun rând — dar este o informație despre o firmă străină dată
-- oricui o cere.
--
-- Toate cele trei politici care o folosesc o scriu deja ca
-- `is_platform_admin() and is_assisted_company(...)`. Mutând condiția
-- înăuntru, politicile citesc exact la fel, iar apelul direct al unui
-- cont care nu este din echipă întoarce `false`, indiferent de firmă.
-- ---------------------------------------------------------------------
create or replace function public.is_assisted_company(p_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select public.is_platform_admin() and exists (
    select 1 from public.assisted_onboardings a
    where a.company_id = p_company_id
      and a.status in ('in_lucru', 'trimis')
  );
$fn$;

comment on function public.is_assisted_company(uuid) is
  'True while a company is an assisted onboarding that has not been claimed, and only for the team. The whole extra reach of the team during onboarding, in one place.';

revoke all on function public.is_assisted_company(uuid) from public, anon;
grant execute on function public.is_assisted_company(uuid) to authenticated;

-- =====================================================================
-- Vederile aveau drept de scriere
--
-- Găsită în timp ce se scria nota de advisor din `docs/DEPLOYMENT.md`,
-- uitându-mă a doua oară la lista de vederi. Auditul a numărat
-- granturile pe **tabele** — `relkind = 'r'`, și în migrarea
-- 20260930100000, și în garda din `security_test.sql`. Vederile au
-- `relkind = 'v'` și au rămas pe dinafară, cu implicitul Supabase pe
-- ele: `insert`, `update`, `delete` pentru `anon` și `authenticated`.
--
-- Pe cele mai multe nu înseamnă nimic: o vedere cu agregări nu se poate
-- scrie. Dar trei dintre ele sunt simple proiecții dintr-o singură
-- tabelă, deci Postgres le face scriibile automat — iar toate vederile
-- noastre sunt `security_invoker = off`, ceea ce înseamnă că scrierea
-- se face ca proprietarul vederii, **pe lângă RLS**.
--
-- Deci:
--
--     set role anon;
--     delete from public.v_public_companies where cui = '...';
--     DELETE 1
--
-- Un vizitator fără cont ștergea firma. Politicile de pe `companies`
-- nu apucau să fie consultate; singurul lucru care a oprit un `update`
-- în proba de mai sus a fost triggerul `guard_company_write`, și acela
-- numai pe coloanele de identificare.
--
-- Regula 3 din secțiunea Securitate, exact: un grant și o politică sunt
-- două lucruri. Și regula 5: o vedere `security_invoker = off` citește
-- — și scrie — pe lângă RLS.
-- =====================================================================
do $revoke_view_writes$
declare
  r record;
begin
  for r in
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('v', 'm')
      and (has_table_privilege('anon', c.oid, 'INSERT')
           or has_table_privilege('anon', c.oid, 'UPDATE')
           or has_table_privilege('anon', c.oid, 'DELETE')
           or has_table_privilege('authenticated', c.oid, 'INSERT')
           or has_table_privilege('authenticated', c.oid, 'UPDATE')
           or has_table_privilege('authenticated', c.oid, 'DELETE'))
    order by c.relname
  loop
    execute format(
      'revoke insert, update, delete, truncate, references, trigger on public.%I from anon, authenticated',
      r.relname);
  end loop;
end
$revoke_view_writes$;

-- Și pentru ce se creează de acum încolo. Migrarea 20260916130300 a
-- scos implicitul numai pentru funcții; pentru tabele și vederi a rămas
-- `grant all`, motiv pentru care fiecare tabelă nouă venea cu drept de
-- scriere pentru `anon` (M4b) și fiecare vedere nouă vine la fel.
--
-- `anon` nu scrie nicăieri, niciodată: înscrierea trece prin `auth`,
-- restul prin RPC-uri care verifică cine cheamă. `authenticated` rămâne
-- neatins aici, fiindcă el chiar scrie în tabele, sub politici — iar o
-- schimbare a implicitului lui ar trebui însoțită de granturi explicite
-- în fiecare migrare viitoare, care este o discuție separată.
alter default privileges in schema public
  revoke insert, update, delete, truncate on tables from anon;

comment on schema public is
  'Coridor. Granturile sunt explicite: anon nu are drept de scriere pe nimic, nici pe tabele, nici pe vederi, iar implicitul nu i-l mai dă.';
