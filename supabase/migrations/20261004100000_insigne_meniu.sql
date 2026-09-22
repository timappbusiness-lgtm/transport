-- Insigna de oferte din meniu.
--
-- Mesajele aveau deja `unread_message_count()`, scrisă pentru exact acest
-- loc. Ofertele nu aveau nimic: ecranul își încărca lista întreagă și o
-- număra, ceea ce pentru o insignă înseamnă să aduci douăzeci de rânduri ca
-- să afișezi cifra 3.
--
-- Ce numără: ofertele **primite** și încă fără răspuns. Numai alea așteaptă
-- pe cineva. O ofertă trimisă așteaptă pe altcineva, iar o insignă care nu
-- ajunge niciodată la zero este o insignă pe care oamenii învață să o
-- ignore — deci un transportator care doar trimite oferte nu are insignă
-- acolo, și asta este purtarea corectă, nu o lipsă.
--
-- Se sprijină pe `my_offers('primite', 'pending')`, care decide deja cine
-- vede ce: cutia „primite" sunt ofertele de pe anunțurile pe care le-a pus
-- chiar apelantul sau firma lui. Nu se repetă regula aici — două locuri
-- care răspund la „ale cui sunt ofertele astea" sunt două locuri care pot
-- să nu fie de acord.

/** Câte oferte primite așteaptă un răspuns. Pentru insigna din meniu. */
create or replace function public.unanswered_offer_count()
returns integer
language sql
stable
security definer
set search_path = public
as $fn$
  select count(*)::integer from public.my_offers('primite', 'pending');
$fn$;

-- Privilegiul implicit pe funcții nu îl are nimeni (migrarea 20260916130300).
-- O cheamă ecranul, în numele persoanei conectate, deci `authenticated` și
-- nimeni altcineva: pentru `anon` nu există „ofertele mele", iar
-- `auth.uid()` din interiorul lui `my_offers()` ar fi null și ar ridica
-- excepție.
revoke all on function public.unanswered_offer_count() from public;
grant execute on function public.unanswered_offer_count() to authenticated;
