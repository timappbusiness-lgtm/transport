# Localități

Nomenclatorul de localități: de unde vine, cum se caută, cum se reface.

## Sursa

**GeoNames `cities1000`** — fiecare așezare de peste 1.000 de locuitori,
cu populație, coordonate, codul diviziunii administrative și un cod de
tip. Ajunge la noi prin pachetul npm **`all-the-cities`**.

| | |
|---|---|
| Date | [GeoNames](https://www.geonames.org/), licență **CC BY 4.0** |
| Pachet | [`all-the-cities`](https://www.npmjs.com/package/all-the-cities), licență MIT |
| Atribuire | „Include date din GeoNames, sub licență CC BY 4.0." |

Atribuirea este o condiție a licenței. Apare în antetul migrării generate
și trebuie să apară și pe orice pagină publică ce arată lista întreagă.

**O singură sursă, intenționat.** A doua — `dr5hn/countries-states-cities-
database`, unită pe (țară, cod FIPS) — a fost încercată pentru numele
diviziunii administrative din străinătate și scoasă: codurile admin1 din
GeoNames nu sunt coduri FIPS peste tot, iar unirea a dat Brno în
„Praha-východ", Plzeň în „Vsetín", Barcelona în „Tarragona" și Lyon în
„Occitanie". Un nomenclator cu regiuni greșite cu încredere este mai rău
decât unul fără, deci un oraș din străinătate poartă țara. România
păstrează județul, dintr-o hartă de patruzeci și două de rânduri scrisă
de mână.

## Ce intră

| | Prag | Câte |
|---|---|---|
| România | 3.000 de locuitori | 1.572 |
| DE, IT, NL, BE, FR, ES, AT, HU, PL, CZ, SK, CH, GB, BG, GR, PT, SE, DK | 50.000, plus fiecare capitală | 1.177 |

Toate cele **41 de reședințe de județ** sunt înăuntru, iar o verificare
din `rls_test.sql` le numără — la primul import lipseau trei, pierdute la
deduplicarea după nume în fața unui sat omonim.

**Ce nu intră:** `PPLX`, adică o bucată dintr-un oraș — sectoarele
Bucureștiului, cartierele Hamburgului și ale Londrei. Cine cere transport
în „Sector 3" vrea București, iar un nomenclator care le oferă pe
amândouă îl pune să aleagă între două răspunsuri corecte.

## Corecțiile pe care le cer datele

1. **Diacriticele.** Româna scrie ș și ț cu virgulă dedesubt; GeoNames
   are pe alocuri sedila turcească ş și ţ. `Iaşi` devine `Iași`.
2. **Exonimele englezești.** GeoNames ține numele englezesc ca nume
   principal pentru orașele mari: Munich, Rome, Vienna, Prague. Numele
   local este ce scrie pe hârtiile transportului, deci el este rândul, iar
   forma englezească devine alias.
3. **Exonimele românești.** Cele 75 de localități scrise de mână foloseau
   Viena, Praga, Londra, Varșovia. Se unesc cu rândul local — direcția
   este scrisă pe fiecare rând în `20261006120000`, fiindcă nu este
   aceeași peste tot: Târgu Mureș și Miercurea Ciuc păstrează forma din
   listă, care este cea oficială, iar Țăndărei o ia pe cea din GeoNames,
   fiindcă în listă era scris greșit.

## Cum se reface

```bash
pnpm add -D all-the-cities            # dacă nu e deja
node scripts/import-localities.mjs > supabase/migrations/<ts>_localitati_import.sql
pnpm db:test
```

Scriptul scrie pe `stdout` migrarea și pe `stderr` câte rânduri a scos.
Pragurile, lista de țări și hărțile de nume sunt constante în capul lui.

Migrarea este `on conflict (name, country) do update`: rândurile scrise de
mână își păstrează numele, regiunea și coordonatele — au fost verificate
și sunt referite de anunțuri publicate — și primesc doar ce nu aveau,
populație și aliasuri. `source` rămâne `manual` pe ele și este `geonames`
pe restul, ca un reimport să știe ce poate atinge.

## Căutarea

`search_localities(text, lat, lng, limit)`, în Postgres, cu index. Nu se
descarcă nicio listă în browser: sunt 2.750 de rânduri, vreo 200 KB pe
fiecare vizită, pe telefon, ca să se caute un oraș.

Patru feluri de potrivire, în ordinea încrederii:

1. **exact**, pe numele normalizat sau pe un alias — „timisoara" și
   „Timișoara" sunt același lucru, în ambele sensuri;
2. **început de nume** — „cluj" → Cluj-Napoca;
3. **început de cuvânt** — „mare" → Baia Mare, Satu Mare. Fără asta,
   jumătate din localitățile compuse sunt de negăsit dacă nu începi cu
   primul cuvânt;
4. **trigrame**, pentru greșeli de tastare — „timisora" → Timișoara.

Ordonarea, după felul potrivirii: ce a ales chiar persoana înainte,
apropierea de ce a ales deja (în trepte largi, ca o diferență de câțiva
kilometri să nu răstoarne ordinea), reședință de județ, populație.

Măsurat pe baza de test: 66–80 ms per căutare, sub pragul de 150 ms.

## Ce lipsește

**Codurile poștale.** Cerute „dacă datele permit" — nu permit: fișierul
de coduri poștale al GeoNames nu este accesibil din mediul în care rulează
importul, iar sursa npm nu îl conține. Coloana nu există; când apare o
sursă, se adaugă odată cu ea.

## Când o localitate lipsește

Câmpul acceptă text liber, intenționat: cineva dintr-un sat care nu e în
nomenclator trebuie să poată publica. Sub câmp apare „Nu găsim
localitatea?", care păstrează ce a scris pe cerere și ridică un steag
pentru echipă — `locality_requests`, citibilă de autor și de echipă.
