-- =====================================================================
-- Categoriile de vehicule: valorile noi de enum
--
-- Fișier separat, cu o singură treabă, fiindcă `alter type ... add
-- value` și folosirea valorii adăugate nu pot sta în aceeași tranzacție.
-- Restul (etichete, greutăți, potrivire) vine în migrarea următoare.
--
-- Nișa rămâne ce era: vehicule care urcă pe o platformă auto. Nu se
-- adaugă ambarcațiuni, containere, utilaje agricole sau de construcții,
-- camioane, autobuze, capete tractor și semiremorci — concurentul le
-- listează, dar cer alt echipament și alte autorizații, iar o bursă care
-- promite ce nu poate duce își pierde transportatorii înainte să-i
-- câștige.
--
-- Trei categorii lipseau din nișa asta și se publicau ca „altele":
--
--   atv_quad     ATV sau quad
--   cvadriciclu  cvadriciclu sau vehicul electric mic
--   istoric      vehicul istoric sau de colecție
--
-- Nicio valoare veche nu se șterge. Postgres nu poate oricum, dar nici
-- nu trebuie: rândurile publicate pe `utilaj_agricol` sau `camion`
-- rămân valide și lizibile. Ce se schimbă este ce **se oferă** de acum
-- încolo, iar asta este o listă din aplicație, nu o proprietate a
-- tipului — `OFFERED_CATEGORIES` în `src/lib/departures.ts`.
-- =====================================================================

alter type public.cargo_category add value if not exists 'atv_quad';
alter type public.cargo_category add value if not exists 'cvadriciclu';
alter type public.cargo_category add value if not exists 'istoric';
