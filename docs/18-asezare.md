# Așezare: nimic nu se mișcă pentru că s-a mișcat vecinul

Bug-ul raportat: în întrebările despre facturare de pe `/abonamente`,
deschiderea unei întrebări făcea cardul de alături la fel de înalt, dar
gol. Numai cel deschis trebuia să crească.

Documentul spune cauza și reparația, apoi fiecare defect de aceeași
familie găsit pe ecranele publice, din cont și din administrare, la 1440
și la 390: ecranul, cauza, reparația și testul care îl ține.

## Bug-ul raportat: cauza și reparația

**Cauza.** `FaqAccordion` era o grilă CSS cu două coloane
(`lg:grid-cols-2`). Două întrebări vecine stăteau pe același rând, iar un
rând de grilă e cât cea mai înaltă celulă a lui (`align-items: stretch`).
Chiar cu `items-start`, tot ce era sub întrebarea deschisă cobora în
ambele coloane, pentru că rândurile erau comune.

Măsurat la 1440, înainte: vecinul creștea de la 57px la 125px pe
`/abonamente`, la 198px pe `/intrebari-frecvente` și la 101px pe prima
pagină. Aceeași componentă, același bug, pe toate trei.

**Reparația.** `FaqAccordion columns={2}` desenează două coloane
independente (`splitColumns` din `src/lib/columns.ts`), fiecare o stivă a
ei. O întrebare deschisă crește singură și mută doar ce e sub ea, în
coloana ei. Ordinea de citire e în jos pe prima coloană, apoi pe a doua,
aceeași ca pe telefon, unde coloanele se așază una sub alta.

**Testele.** `tests/unit/columns.test.ts` (împărțirea și faptul că nicio
pagină nu mai dă `grid-cols` acordeonului). `tests/e2e/acordeon.spec.ts`
verifică, pe fiecare pagină cu acordeon, la 1440 și la 390, că deschiderea
unei întrebări schimbă înălțimea ei și doar a ei, iar coloana de alături
nu se mișcă. Pe codul vechi testul cade exact cu numerele de mai sus.

Pe paginile SEO (`/transport-auto/[slug]`) acordeonul era deja pe o
singură coloană. `/verificare` și `/transportatori/inscriere` nu au
acordeon. Celelalte elemente care se deschid (`<details>` în contul
firmei, ajutor, oferte, reputație, alerte, jurnalul de audit) stau în
coloane flex, nu în grile, deci nu își afectează vecinii.

## Cum au fost găsite celelalte

Ecranele din cont și din administrare au nevoie de sesiune și de bază de
date, pe care nici CI-ul, nici sandboxul nu le au. De aceea
`/proba/ecrane` (numai cu `E2E_HARNESS=1`, 404 altfel, `noindex`) desenează
componentele reale cu date de probă duse la limită, în copii ale
cadrelor din cont și din administrare: nume de firmă de 93 de caractere,
cu 30 de litere fără spațiu; localități de 49 de caractere; o referință
de 120 de caractere fără nicio pauză; 1.250.000 lei; mesaje de o mie de
cuvinte. Datele sunt în `src/components/proba/fixtures.ts`, iar CUI-urile
de acolo au cifra de control greșită, deci nu pot fi ale unei firme reale.

`tests/e2e/aspect-asezare.spec.ts` trece prin toate ecranele publice și
prin cele 13 secțiuni ale paginii de probă, la 1440 și la 390, și cade la:

- pagina care se poate trage în lateral;
- text care iese din cutia lui fără „…";
- control mai mic de 24×24 fără spațiu în jur (WCAG 2.5.8);
- imagine deformată;
- text desenat peste text;
- control care, primind focusul, rămâne sub o bară fixă;
- sfârșitul paginii rămas sub bara de jos.

## Defectele, ecran cu ecran

| # | Ecran | Ce se vedea | Cauza | Reparația | Testul |
| --- | --- | --- | --- | --- | --- |
| 1 | `/abonamente`, `/intrebari-frecvente`, prima pagină (1440) | Vecinul întrebării deschise creștea gol | Grilă cu rânduri comune | Coloane independente, `splitColumns` | `acordeon.spec.ts`, `columns.test.ts` |
| 2 | `/cont/transporturi/[id]` (390) | Pagina se trăgea **881px** în lateral | Grila nu avea coloană sub lg; coloana implicită `auto` e cât cel mai lung cuvânt | `ORDER_GRID` cu `minmax(0,1fr)`, folosit și de pagina de probă | `aspect-asezare`, `aspect-continut-lung` |
| 3 | Ofertele primite (390 și 1440) | Numele firmei ieșea din card cu **500px** la 390 | `IconLabel` e `inline-flex` fără limită de lățime, deci `truncate` nu avea ce tăia | `max-w-full` în `IconLabel` (repară toate folosirile), numele de firmă se rup (`wrap`) | `aspect-continut-lung` |
| 4 | `/cont/mesaje/[id]` (390) | Titlul conversației trăgea pagina 48px în lateral | Numele era text gol într-un rând flex | `ConversationTitle`, comun cu pagina de probă, numele în cutia lui, `[overflow-wrap:anywhere]` | `aspect-asezare` |
| 5 | `/cont/cereri`, anunț ascuns (390) | Motivul trăgea pagina **687px** în lateral | Motivul nu se putea rupe | `[overflow-wrap:anywhere]` pe motiv | `aspect-continut-lung` |
| 6 | `/firme/[slug]`, actele (390) | Numele actelor strivite câte un cuvânt pe rând | `flex-1` (bază 0) într-un rând care se rupe nu se rupe niciodată | `flex-[1_1_12rem]` | `aspect-asezare` |
| 7 | Prima pagină, cardul de încredere (390) | Etichetele strivite și desenate peste dată | Aceeași cauză ca la 6 | `flex-[1_1_9rem]` | `aspect-asezare` (text peste text) |
| 8 | Contul, bara „Salvează" pe `/cont/firma` (390) | Bara stătea sub meniul fix de jos | `sticky bottom-0` sub o bară `fixed` | `--bottom-bar` pus de cadrul contului, bara stă deasupra meniului | `aspect-interactiuni`, `layout-rules.test.ts` |
| 9 | Contul, caseta de mesaj (390) | La fel ca la 8 | La fel | La fel | La fel |
| 10 | Contul, subsolul (390) | Termeni, Confidențialitate, Cookie-uri rămâneau sub meniul de jos | Spațiul era păstrat doar în coloana de conținut, deasupra subsolului | `body:has([data-bottom-nav])` păstrează spațiul la capătul paginii; `pb-20` scos | `aspect-interactiuni`, `aspect-asezare` |
| 11 | Contul, meniul lateral (1440×900) | Ultimele linkuri (Setări, Ajutor, Ieșire) erau sub marginea ecranului | Meniu `sticky` fără limită de înălțime | `max-h-[calc(100dvh-7.5rem)]`, meniul se derulează în el | `aspect-interactiuni`, `aspect-asezare` |
| 12 | Contul, „Mai mult" (390) | Pagina se derula în spatele foii; foaia nu avea limită de înălțime | Nicio blocare a derulării | `lockScroll` (cu imbricare), `max-h-[85dvh]` și derulare în foaie | `aspect-interactiuni`, `scroll-lock.test.ts` |
| 13 | Contul, „Mai mult" | O atingere pe fundal închidea foaia, dar focusul se pierdea | Doar Escape și ✕ dădeau focusul înapoi | Și fundalul dă focusul înapoi la „Mai mult" | `aspect-interactiuni` |
| 14 | Contul, „Publică" (390) | Meniul se deschidea cu 100px în afara ecranului | Agățat de marginea dreaptă a unui buton care, pe telefon, ajunge în stânga | `menuSide()` alege marginea la deschidere | `aspect-interactiuni`, `menu-side.test.ts` |
| 15 | Antet, meniul contului și meniul de pe telefon | Tăiate pe un telefon ținut orizontal | Fără limită de înălțime | `max-h-[calc(100dvh-5.5rem)]` și derulare | `aspect-interactiuni`, `layout-rules.test.ts` |
| 16 | `/cerere/noua`, pasul 2 (390) | Anul și „Mai multe" ajungeau sub „Continuă" la focus | Nimic nu spunea browserului că jos e o bară | `scroll-padding-bottom` pe `html:has([data-action-bar])` | `aspect-interactiuni` |
| 17 | `/cont/mesaje/[id]` | Un atașament focusat ajungea sub caseta de mesaj | Caseta își schimbă înălțimea | Caseta își publică înălțimea (`--composer-height`), `scroll-padding-bottom` o citește | `aspect-asezare`, `layout-rules.test.ts` |
| 18 | Contul, legătura „Sari la conținut" | Ducea înaintea meniului lateral, nu după el | `id="continut"` de două ori; browserul îl alege pe primul | Ținta contului e `continut-cont`, eticheta „Sari peste meniu" | `layout-rules.test.ts` |
| 19 | `/preturi`, `/verificare`, tabelele (640–1000px) | Ultima coloană tăiată | `overflow-hidden` pe cutia tabelului | `overflow-x-auto` | `layout-rules.test.ts` (fiecare tabel) |
| 20 | `/abonamente`, comparația | Capul de tabel „lipicios" nu se lipea | `sticky` într-o cutie care derulează în lateral se lipește de cutie, nu de pagină | `sticky` scos, comentariul corectat | — (nu mai pretinde nimic) |
| 21 | Tot site-ul, pe telefon | Un câmp sau un link rămânea în culoarea de hover după o atingere | Trei reguli `:hover` scrise de mână, în afara `@media (hover: hover)` | Mutate în `@media (hover: hover)`, ca utilitarele Tailwind | `layout-rules.test.ts` |
| 22 | Contul, notificările (iPhone) | Notificarea stătea peste etichetele meniului de jos | `bottom-20` fără zona sigură | `bottom-[calc(5rem+env(safe-area-inset-bottom))]` | `layout-rules.test.ts` |
| 23 | `/cereri`, `/trasee` goale | Două butoane pline în accent unul sub altul („Caută" și „Publică o cerere") | Butonul filtrului era `primary` | Butonul filtrului e `ink` | `aspect-interactiuni` |
| 24 | Prima pagină, activitatea goală | Două „Publică o cerere" pline la 200px | Cardul gol repeta acțiunea cardului de dedesubt | Cel din cardul gol e contur | `aspect-interactiuni` |
| 25 | Câmpurile de dată (iOS Safari) | Câmpul gol mai scund decât vecinii, valoarea centrată | Comportamentul WebKit pentru `input[type=date]` | `::-webkit-date-and-time-value` cu `min-height: 1lh` și aliniere la stânga | — (vezi mai jos) |
| 26 | Traseele (opriri), cardul de firmă (oraș), fotografiile comenzii (autor) | Cu date lungi, textul ar fi ieșit din cutie | Fără punct de rupere | `[overflow-wrap:anywhere]` | `aspect-continut-lung` |

## Ce a rămas, și de ce

- **Câmpurile de dată pe iOS (25)** sunt reparate după comportamentul
  documentat al WebKit, dar nu sunt verificate pe un iPhone: sandboxul are
  doar Chromium. De verificat cu mâna (lista de mai jos).
- **Căutarea de localități lângă marginea de jos.** Lista se deschide în
  jos, cu `z-40` deasupra barei „Continuă" (`z-20`), și pagina se poate
  derula. Fără bază de date, căutarea nu întoarce nimic, deci lista nu a
  putut fi desenată în test. De verificat cu mâna.
- **Meniul lateral se derulează acum în el** pe un ecran de 900px. E a
  doua bară de derulare de pe pagină, dar numai când meniul e mai înalt
  decât ecranul. Alternativa era un meniu cu linkuri la care nu se poate
  ajunge.
- **Cadrul contului e copiat de mână în pagina de probă**
  (`src/components/proba/shells.tsx`). Grila comenzii și titlul
  conversației au devenit componente comune tocmai pentru că o copie
  rămăsese în urmă după o reparație. Cadrul se schimbă rar, dar se
  schimbă în ambele locuri.

## Lista de verificat cu mâna (5 minute)

Pe un telefon real (iPhone, dacă se poate) și pe un laptop.

1. `/abonamente` pe laptop: deschide „Cum se face plata?". Cardul de
   alături rămâne mic, iar coloana din dreapta nu se mișcă.
2. `/intrebari-frecvente` pe telefon: deschide și închide două întrebări.
   Nimic nu sare lateral.
3. Contul pe telefon, `/cont/firma` → Acoperire: bara „Salvează" stă
   deasupra meniului de jos, nu sub el. Coboară până la capăt: linkurile
   Termeni / Confidențialitate / Cookie-uri se văd întregi.
4. Contul pe telefon, „Mai mult": pagina din spate nu se mișcă. O
   atingere pe zona întunecată închide foaia.
5. Contul pe telefon, „Publică": meniul se deschide întreg, pe ecran.
6. O conversație cu nume lung de firmă, pe telefon: titlul se rupe pe mai
   multe rânduri, pagina nu se trage lateral.
7. O comandă cu o notă lungă, pe telefon: pagina nu se trage lateral.
8. `/cerere/noua` pe iPhone, pasul 1: câmpul de dată e cât câmpul de oraș
   de deasupra. La pasul 2, Tab / „următorul" nu ascunde niciun câmp sub
   „Continuă".
9. `/cerere/noua` pe telefon: scrie un oraș în „Oraș de destinație".
   Lista de sugestii se vede deasupra barei „Continuă".
10. Pe laptop, în cont, cu fereastra de 900px înălțime: meniul lateral se
    derulează până la „Ieșire".
