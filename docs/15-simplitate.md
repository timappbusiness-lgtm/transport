# Simplitate: ce vede un dispecer, în cifre

Un profesionist din transport a deschis platforma și a spus două lucruri:
arată bine, dar **nu se leagă între ele**, și **trebuie să fie mult mai
simplu**. Concurentul, bursatractari.ro, arată un panou cu trei filtre și
carduri mari și nu cere aproape nimic înainte ca omul să vadă ceva de
valoare.

Documentul ăsta nu argumentează. Numără.

## Cum s-a măsurat

`scripts/measure-simplitate.mjs`, rulat de două ori: o dată pe `main`
construit într-un worktree separat, o dată pe ramura asta. Aceeași
copie a scriptului pe amândouă, același browser, același viewport
(1280×900), aceeași bază de date (niciuna — panourile își arată starea
goală, care este cazul obișnuit la lansare).

Se numără:

- **câmpuri** — `input`, `select` și `textarea` din `<main>` pe care
  `checkVisibility()` le raportează vizibile;
- **câmpuri deasupra pliului** — dintre acelea, cele care încep în
  primul ecran;
- **controale deasupra pliului** — câmpurile plus butoanele și
  linkurile-buton;
- **cuvinte în `<main>`** — `innerText`, despărțit pe spații.

> Prima versiune a scriptului măsura cu `getBoundingClientRect()` și
> raporta **13 filtre** pe un panou care arată trei: în Chromium un
> `<details>` închis păstrează ultima așezare a conținutului. Ambele
> coloane de mai jos sunt măsurate cu `checkVisibility()`.

Ecranele din spatele autentificării nu se pot deschide în sandbox — nu
există Supabase — așa că pentru ele se numără câmpurile din componentă.
Rândurile respective sunt marcate.

## Panoul de cereri — `/cereri`

| | înainte | după |
|---|---:|---:|
| câmpuri | 13 | **4** |
| câmpuri deasupra pliului | 12 | **4** |
| controale deasupra pliului | 12 | **5** |
| cuvinte în `<main>` | 461 | **98** |
| ecrane până la primul rezultat | 1 | 1 |

Cele patru câmpuri sunt *De unde*, *Unde*, *Tip vehicul* și ordonarea.
Celelalte zece filtre sunt sub „Mai multe filtre", închis, cu o insignă
care numără câte dintre ele îngustează panoul. Un link salvat luna
trecută funcționează neschimbat — cheile din URL sunt aceleași — și
**lasă panoul închis**: numărul de pe buton și câte o etichetă
detașabilă pentru fiecare filtru, sub cele trei câmpuri, spun după ce a
fost îngustat. Vezi „Panoul închis, mereu" mai jos.

## Panoul de trasee — `/trasee`

| | înainte | după |
|---|---:|---:|
| câmpuri | 10 | **4** |
| câmpuri deasupra pliului | 9 | **4** |
| controale deasupra pliului | 10 | **5** |
| cuvinte în `<main>` | 457 | **98** |

Aceleași trei întrebări, în aceleași locuri: un dispecer care a învățat
un panou le-a învățat pe amândouă. Aici „De unde" este un județ, nu o
localitate — un traseu pleacă dintr-o zonă și trece prin orașe.

## Clientul publică o cerere — `/cerere/noua`

| | înainte | după |
|---|---:|---:|
| câmpuri | 6 | 6 |
| câmpuri deasupra pliului | 6 | 6 |
| controale deasupra pliului | 11 | 11 |
| cuvinte în `<main>` | 122 | 122 |

**Neschimbat, și intenționat.** Formularul avea deja patru pași cu șase
câmpuri pe primul, iar feedbackul nu l-a atins. Cifra e aici ca să se
vadă că nu a fost atins, nu ca realizare.

## Transportatorul se înscrie

| ecran | înainte | după |
|---|---|---|
| `/transportatori/inscriere` | redirect în formular: **4 câmpuri**, 74 de cuvinte | **0 câmpuri**, 77 de cuvinte: trei pași și o durată |
| `/inregistrare/firma` | 4 câmpuri, 74 de cuvinte | 4 câmpuri, **94** de cuvinte |
| după confirmarea e-mailului | `/cont` — tablou de bord gol care cere dosarul firmei | `/cereri` — panoul, cu o bandă calmă care spune ce mai e de făcut |
| dosarul firmei | 5 taburi fără numere | 5 pași numerotați („Pasul 2 din 4"), fiecare cu o linie care spune de ce |
| documente | un ecran cu listă + formular cu două câmpuri | **un ecran per document**, cu desen-exemplu, camera prima, „Îl adaug mai târziu" unde regula permite |

Cele două cifre care au **crescut** sunt intenționate:

- `/transportatori/inscriere` are 77 de cuvinte în loc de 74, dar zero
  câmpuri în loc de patru. Înainte, cine venea de pe un pliant tipărit
  ajunge direct într-un formular, fără să știe la ce e, cât durează sau
  ce urmează după.
- `/inregistrare/firma` are 94 de cuvinte în loc de 74, fiindcă
  paragraful de sub formular spune acum **unde ajungi**: pe panou,
  imediat, iar dosarul firmei îl completezi când ai timp.

Nicăieri nu se promite cât durează verificarea: nimic nu o măsoară.
„Aproximativ 10 minute" este despre completare, adică despre partea pe
care o controlăm.

## Transportatorul trimite o ofertă

Numărat din componentă (`src/components/offers/offer-form.tsx`), fiindcă
ecranul cere o firmă verificată:

| | înainte | după |
|---|---:|---:|
| câmpuri în formular | 8 | 8 |

**Neschimbat.** Ce s-a schimbat este drumul până acolo: motivul pentru
care butonul lipsește se citește acum și pe panou, nu doar pe pagina
cererii. `src/lib/carrier-onboarding.ts` este singurul loc care decide
în ce stadiu se află firma, iar banda de pe panou și „Trimite ofertă"
citesc amândouă de acolo.

## Transportatorul publică un traseu

| | înainte | după |
|---|---:|---:|
| câmpuri în formular | 20 | 20 |

**Neschimbat, și rămâne de făcut.** Douăzeci de câmpuri pe un ecran este
exact problema pe care acest document o descrie în altă parte; formularul
de traseu nu a intrat în task-ul ăsta. Este candidatul evident pentru
următorul pas.

## Ce s-a mutat, nu s-a șters

Nimic din ce se putea face înainte nu s-a pierdut. S-a mutat:

| ce | de unde | unde |
|---|---|---|
| țara de plecare / sosire | pe ecran | „Mai multe filtre" |
| perioada de încărcare | pe ecran | „Mai multe filtre" |
| starea vehiculului | pe ecran | „Mai multe filtre" |
| tipul de serviciu (expres / pe sens) | pe ecran | „Mai multe filtre" |
| acoperirea (intern / internațional) | pe ecran | „Mai multe filtre" |
| rază + localitate | pe ecran | „Mai multe filtre" |
| greutate maximă / capacitate liberă | pe ecran | „Mai multe filtre" |
| locuri libere minime | pe ecran | „Mai multe filtre" |
| „doar potrivite cu firma mea" | pe ecran | comutatorul de deasupra listei — o vedere, nu un filtru, și nu se numără |
| banda de taburi (cine a publicat / direcția) | deasupra panoului | „Mai multe filtre" |
| alertele din starea goală | lângă buton | „Altceva de făcut de aici" |
| linkul către celălalt panou | lângă buton | „Altceva de făcut de aici" |

## Cuvintele care s-au schimbat

| unde | înainte | după |
|---|---|---|
| titlu `/cereri` | eyebrow „PANOUL DE CERERI" + „Cereri *de transport.*" | „Cereri de transport" |
| lede `/cereri` | „Vehicule care așteaptă un transportator. Ruta, perioada și starea sunt publice; datele de contact se deschid din abonament." | „Vehicule care așteaptă un transportator. Caută ruta ta și deschide cererea." |
| titlu `/trasee` | eyebrow + „Trasee *cu locuri libere.*" | „Trasee cu locuri" |
| lede `/trasee` | „Platforme care circulă oricum pe ruta lor. Plătești locul, nu camionul." | „Platforme cu locuri libere pe o rută. Caută ruta ta și deschide traseul." |
| titlu `/firme` | „Firme de transport *cu documente verificate.*" | „Firme de transport" |
| titlu `/abonamente` | „Plătești pentru contacte, *nu pentru a vedea bursa.*" | „Abonamente" |
| titlu `/preturi` | „Cât costă *un transport auto.*" | „Prețuri orientative" |
| titlu `/intrebari-frecvente` | „Întrebări *pe care le primim des.*" | „Cum funcționează" |
| tablou de bord | „Necesită atenție" | „Ce ai de făcut acum" |
| stare goală `/cereri` | „Nicio cerere pentru această căutare." + paragraf de trei propoziții | „Încă nu este nicio cerere aici" + „Aici apar vehiculele care așteaptă un transportator." |
| stare goală `/trasee` | „Încă nu sunt trasee publicate pentru această căutare." + paragraf | „Încă nu este niciun traseu aici" + „Aici apar platformele cu locuri libere pe o rută." |

> **Actualizare, 24 septembrie 2026** (navigarea pe tipul de cont,
> `docs/19-navigatie-pe-rol.md`): titlul `/trasee` a devenit „Trasee
> disponibile", la fel ca meniul, subsolul și e-mailurile, iar lede-ul și
> starea goală spun „trasee publicate de transportatori". Două nume, câte
> unul pentru fiecare lucru publicat, cântăresc mai mult decât un titlu mai
> scurt cu un cuvânt.

Capetele de secțiune în două tonuri au rămas unde cititorul este
*prezentat* cu ceva — pe prima pagină. Au plecat de unde omul *caută*
ceva.

## Navigația publică

Cereri · Trasee · Firme · Abonamente · **Cum funcționează**

A cincea este nouă: patru pagini de produs și nicio explicație este un
meniu care presupune că toată lumea știe deja ce e platforma. Restul —
prețuri orientative, cum verificăm firmele, pentru transportatori,
contact, legal — este în subsol, unde era și înainte.

Pe telefon, numele mărcii din bara plutitoare este citit de un cititor
de ecran, dar nu mai este desenat sub `sm`: bara ține marca, navigația
și două butoane în 390px, iar cuvântul lua exact spațiul de care avea
nevoie navigația — primul element se vedea ca „Ce".

## Regula

Adăugată în `CLAUDE.md`, ca să nu se strecoare înapoi:

> Un ecran nou își spune scopul într-o propoziție, arată cel mult trei
> controale principale deasupra pliului și ține opțiunile avansate la un
> singur clic.

## Ce se verifică automat

- `tests/unit/board-simplicity.test.ts` — împărțirea simplu/avansat
  acoperă exact filtrele care există, insigna numără corect, un link
  vechi se parsează la fel, ordonarea acceptă doar ce oferă panoul ei.
- `tests/unit/board-cards.test.tsx` — ruta este linia cea mai mare și
  singurul link din card; butonul vizibil este duplicatul lui ascuns de
  cititorul de ecran.
- `tests/unit/carrier-onboarding.test.tsx` — stadiul firmei, numerotarea
  pașilor pentru transportator și pentru casă de expediții, și faptul că
  o suspendare nu primește icon.
- `tests/e2e/simplitate.spec.ts` — trei filtre pe ecran și panoul închis,
  un link moștenit care îl lasă închis și își spune filtrele pe buton și
  în etichete, o stare goală cu un singur buton plin, 390px fără
  derulare laterală.
- `tests/unit/filter-disclosure.test.ts`, `tests/unit/filter-chips.test.ts`
  și `tests/e2e/filtre-inchise.spec.ts` — regula de mai jos, pe fiecare
  ecran cu panou.

## Panoul închis, mereu

Pe `/cereri`, panoul „Mai multe filtre" era deschis la fiecare vizită a
unui transportator, cu insigna „1". Cauza: panoul se deschidea singur
când adresa purta un filtru din el, iar vederea implicită a
transportatorului, „Potrivite cu firma mea", era numărată ca filtru —
deși comutatorul ei stă deasupra listei, nu în panou. Același
comportament era pe fiecare ecran cu panou.

Regula acum (`src/lib/filter-disclosure.ts`, `src/components/ui/advanced-filters.tsx`):

- **Închis la prima încărcare, pe orice ecran, orice ar purta adresa.**
- Ce filtrează se spune în afara lui: numărul pe buton („Mai multe
  filtre 2") și câte o etichetă detașabilă pentru fiecare filtru activ,
  sub cele trei câmpuri, cu „Șterge filtrele" la capăt. Eticheta este un
  link către aceeași adresă fără filtrul ei — ordonarea rămâne.
- Deschiderea și închiderea se țin minte **doar în fila curentă**
  (`sessionStorage`, o cheie pe ecran). O filă nouă sau o vizită nouă
  pornește închis.
- Butonul este un `<button>` cu `aria-expanded` și `aria-controls`;
  Enter și Space îl comută, iar la deschidere focusul intră în panou.
  Săgeata arată în jos când e închis și în sus când e deschis.
- Câmpurile din panoul închis rămân în formular (`hidden` ascunde, nu
  dezactivează), deci o căutare din cele trei câmpuri păstrează filtrele
  avansate.
- Fără JavaScript, panoul se arată deschis.

Ecranele cu panou și cele trei câmpuri rămase pe ecran:

| ecran | pe ecran | sub „Mai multe filtre" |
|---|---|---|
| `/cereri` | De unde, Unde, Tip vehicul (+ ordonarea, separat) | cine a publicat, serviciul, țările, perioada, starea, acoperirea, rază, greutate |
| `/trasee` | De unde, Unde, Tip vehicul (+ ordonarea, separat) | direcția, locuri, țările, perioada, acoperirea, rază, capacitate |
| `/firme` | Caută (nume sau CUI), Județ, Tip | acoperirea |
| `/admin/oferte` | Stare, Firmă | perioada |
| `/admin/transporturi` | Stare, Transportator, Doar disputele | perioada |
| `/admin/anunturi` | Stare, Firmă, Doar sesizate | perioada, Doar ascunse |
| `/admin/evaluari` | Nota, Firma evaluată, Doar după dispute | Doar ascunse |
| `/admin/jurnal` | Ce acțiune, Pe ce, Cine a făcut | perioada |

Listele din cont (cereri, trasee, oferte, transporturi, alerte, flotă,
documente) nu au panou de filtre: au taburi sau nimic, deci nu au ce
deschide. `/cont/mesaje` și `/cont/ajutor` au un singur câmp de
căutare. `/admin/pilot` și `/admin/notificari` au două–trei câmpuri,
toate pe ecran.

