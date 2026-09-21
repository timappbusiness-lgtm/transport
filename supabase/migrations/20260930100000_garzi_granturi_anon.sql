-- =====================================================================
-- `anon` nu mai are drept de scriere nicăieri
--
-- Găsit de garda nouă din `supabase/tests/security_test.sql`, la prima
-- ei rulare. Este aceeași poveste ca la `SELECT` în migrarea
-- 20260928100000, dar pentru scriere: implicitul Supabase dă
-- `insert`, `update` și `delete` pe tot, iar RLS le refuză pe toate —
-- nu există nicio politică de scriere pentru `anon` nicăieri.
--
-- Deci astăzi nu se scrie nimic. Dar dreptul stă acolo și așteaptă o
-- politică scrisă neatent sau un RLS oprit într-o depanare. Un
-- vizitator fără cont nu are ce scrie în nicio tabelă a noastră:
-- înscrierea trece prin `auth`, iar restul prin RPC-uri care verifică
-- cine cheamă.
--
-- Condus din catalog, ca revocarea de `select`: o listă de patruzeci
-- de nume se învechește la prima tabelă nouă.
-- =====================================================================
do $revoke_anon_writes$
declare
  r record;
begin
  for r in
    select c.relname
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and (has_table_privilege('anon', c.oid, 'INSERT')
           or has_table_privilege('anon', c.oid, 'UPDATE')
           or has_table_privilege('anon', c.oid, 'DELETE'))
    order by c.relname
  loop
    execute format('revoke insert, update, delete on public.%I from anon', r.relname);
  end loop;
end
$revoke_anon_writes$;
