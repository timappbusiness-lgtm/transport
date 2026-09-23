# Continuitate: nimeni nu reface ce a completat

Bug-ul raportat: în `/cerere/noua` pasul curent nu era ținut nicăieri. O
reîncărcare pe pasul 2, 3 sau 4 ducea înapoi la pasul 1 (datele rămâneau,
dar omul nu mai știa unde e), iar cine intra în cont sau își făcea cont la
pasul 4 se întorcea tot la pasul 1.

Documentul ăsta spune cauza și reparația, apoi ia la rând **fiecare** flux
lung sau care poate fi întrerupt, cu ce se întâmpla înainte, ce se întâmplă
acum și ce întreruperi supraviețuiește.

## Cele șase întreruperi

| Cod | Întreruperea |
| --- | --- |
| **R** | reîncărcarea paginii, la orice pas |
| **Î** | butonul Înapoi (și Înainte) al browserului |
| **A** | autentificarea la mijloc: intrarea în cont, contul nou cu confirmare pe e-mail, parola uitată |
| **S** | sesiunea care expiră cât formularul e deschis |
| **C** | o cerere eșuată: fără semnal, eroare de server, platforma actualizată între timp |
| **E** | revenirea dintr-un link din e-mail |

În tabele: **da** — supraviețuiește; **n/a** — întreruperea nu se aplică
fluxului; **parțial** — cu limita scrisă dedesubt.

## Bug-ul raportat: cauza și reparația

**Cauza.** `RequestForm` ținea pasul în `useState('ruta')`. Starea React nu
supraviețuiește unei reîncărcări și nici drumului prin autentificare (care
e o navigare către altă pagină și înapoi), iar linkurile „Am deja cont" /
„Fă-ți cont" purtau `next=/cerere/noua` fără pas. Ciorna era în
`sessionStorage`, deci o filă închisă sau un link de confirmare deschis în
altă filă o pierdea. Mai era un al treilea defect, găsit pe drum: un link din
calculatorul de preț (`?plecare=…`) punea precompletarea peste ciornă la
fiecare încărcare, deci întoarcerea din autentificare ștergea ce fusese
schimbat după calculator.

**Reparația.**

- Pasul e în adresă: `?pas=traseu|vehicul|serviciu|contact` (sau `?pas=1`…`4`).
  Fiecare pas nou e o intrare în istoric (`history.pushState`), deci
  Înapoi/Înainte merg între pași; formularul citește pasul din
  `useSearchParams`.
- Adresa nu e crezută pe cuvânt: un pas la care nu se poate ajunge încă
  (pașii dinainte incompleți) e corectat pe loc (`replaceState`) la primul
  pas incomplet. Mesajele apar doar dacă pasul acela fusese completat (de
  exemplu, data de încărcare a trecut peste noapte); pe un pas neatins nu
  apare nimic roșu. Corecția se face **la sosire** — nu la fiecare tastă:
  golirea unui câmp din rezumat pe pasul 4 nu te mai aruncă la pasul 1
  (testul existent `publicare-cerere.spec.ts` a prins asta).
- Ciorna e în `localStorage` (trei zile) și, după ce există cont, și în
  `form_drafts` (o lună), ca să continue pe alt dispozitiv. Câștigă copia
  salvată ultima. Pagina citește copia din cont pe server, deci pe
  telefon primul desen e deja ciorna de pe desktop. Ciornele vechi din
  `sessionStorage` sunt mutate o dată.
- Pozele deja încărcate intră în ciornă (căile lor), cu previzualizare prin
  link semnat la revenire.
- Linkul din calculator precompletează o singură dată, apoi parametrii
  dispar din adresă.
- „Intră în cont" și „Fă-ți cont" poartă `next=/cerere/noua?pas=contact`,
  iar **fiecare** pagină de pe drum îl poartă mai departe: alegerea tipului
  de cont, înregistrarea firmă/persoană fizică, pagina de confirmare și
  „Trimite din nou", resetarea parolei → linkul din e-mail → parola nouă,
  erorile din `/auth/callback` („linkul a expirat" — mesaj care înainte nu
  se afișa deloc). Cine e deja în cont și ajunge pe o pagină de
  autentificare e trimis la `next`, nu la `/cont`.
- La revenire formularul se remontează (e cheiat pe starea contului) și pe
  pasul Contact apare „Cont — gata" în locul panoului de cont.
- „Salvat" / „Salvat în cont" lângă butoane, anunțul „Am păstrat ce
  completaseși azi la 14:05" cu „Începe din nou".

## Regulile, o singură dată pentru toată platforma

Sunt în `src/lib/continuity/` și în trei componente; secțiunea „Continuitate"
din CLAUDE.md le cere pentru orice ecran nou.

| Regula | Cum e ținută |
| --- | --- |
| O cerere eșuată nu pierde nimic | `useKeptActionState` + `KeepingForm`: rețeaua, eroarea de server, sesiunea expirată și pagina rămasă în urma unei actualizări devin stare cu o frază, în loc de pagina de eroare; React nu mai golește câmpurile după o încercare eșuată (82 de fișiere, fiecare `<form action={fn}>`). |
| Redirecționarea după autentificare duce înapoi | `next` validat de `safeNextPath` (numai căi interne), `returnPathAfterAuth` (niciodată înapoi pe o pagină de autentificare), `withNext` pe fiecare link, butonul „Autentificare" din antet poartă pagina curentă. |
| Formularele lungi își salvează ciorna | `useDraft` / `useFormDraft` / `useTextDraft`: în browser mereu, în cont (`form_drafts`) după autentificare; „Salvat", anunțul de reluare, „Începe din nou"; acțiunea care termină formularul șterge ambele copii (`?gata=<formular>`). |
| Plecarea cu modificări nesalvate întreabă o dată | `useLeaveGuard` / `useUnsavedGuard`: `beforeunload` plus clicurile pe linkuri interne (inclusiv tab-urile profilului), o singură dată, niciodată după o salvare reușită. |
| Încărcările eșuate păstrează fișierul | fișierul rămâne ales și primește „Încearcă din nou"; pozele șoferului stau în IndexedDB până ajung pe server; pozele sunt micșorate înainte de trimitere; limita acțiunilor e 4 MB. |
| Sesiunea expirată nu golește formularul | acțiunea aruncă o eroare recunoscută (digest `CORIDOR_SESSION_EXPIRED`) în loc să redirecționeze; middleware-ul nu mai redirecționează POST-urile acțiunilor; formularul arată mesajul cu „Intră din nou în cont (se deschide o filă nouă)"; fila nouă ajunge pe `/reconectat`, care anunță prima filă pe un `BroadcastChannel` („Ești din nou în cont — apasă din nou pe buton"). |

## Fiecare flux

### 1. Publicarea unei cereri (`/cerere/noua`) — bug-ul raportat

| | Înainte | Acum |
| --- | --- | --- |
| Pasul | în `useState`, pierdut la orice reîncărcare sau autentificare | în adresă, corectat la sosire dacă nu se poate ajunge la el |
| Ciorna | `sessionStorage`, pierdută cu fila | `localStorage` 3 zile + contul, cea mai nouă câștigă |
| Autentificarea la pasul 4 | înapoi la pasul 1 | înapoi la pasul 4, „Cont — gata" |
| Pozele încărcate | pierdute la reîncărcare | în ciornă, cu previzualizare semnată |
| Panoul de poze | o poză respinsă oprea tot lotul, un eșec de rețea arunca pagina de eroare, „Se încarcă" nu apărea niciodată | continuă după o poză respinsă, păstrează fișierele eșuate cu „Încearcă din nou", progres „poza 2 din 4" |
| Publicarea eșuată | pagina de eroare | mesaj lângă buton, totul rămâne |

R **da** · Î **da** · A **da** · S **da** · C **da** · E **parțial** — linkul de
confirmare deschis pe **alt** dispozitiv decât cel cu ciorna intră în cont
acolo, dar ciorna (a unui vizitator fără cont) e doar în browserul inițial;
pagina de confirmare spune asta („Deschide linkul pe acest dispozitiv").
Odată în cont, ciorna urmează contul.

### 2. Înscrierea transportatorului / expeditorului (date firmă, documente, vehicule)

Pașii sunt pagini separate (`/cont/firma/creeaza`, `/cont/firma/documente`,
`/cont/firma/flota`), iar lista de pași din cont se calculează din baza de
date — deci „pasul curent" supraviețuia deja oricărei întreruperi. Ce se
pierdea era conținutul formularelor.

| | Înainte | Acum |
| --- | --- | --- |
| Datele firmei | golite la o eroare de validare fără ecou și la orice eșec de rețea | ciornă `firma` (browser + cont), ștearsă când firma există |
| Documentele | în modul „camera întâi" nu exista buton de reîncercare (poza trebuia refăcută); o înregistrare eșuată după o încărcare reușită lăsa la fiecare reîncercare încă o copie orfană în bucket; o excepție arunca pagina de eroare | fișierul rămâne ales, „Încearcă din nou", reîncercarea înregistrează fișierul deja urcat în loc să-l urce din nou |
| Vehiculul nou | golit la eroare | ciornă `vehicul`, ștearsă când vehiculul există |

R **da** · Î **da** · A **da** · S **da** · C **da** · E **da** (e-mailurile de
documente duc pe `/cont/firma/documente`).

### 3. Flota: vehicul nou, editare, șofer, rute

| | Înainte | Acum |
| --- | --- | --- |
| Vehicul nou | câmpurile golite la orice eroare (acțiunea nu întorcea valorile) | ciornă, păstrat la orice eroare |
| Editarea vehiculului | golită la eroare, plecarea fără avertisment | păstrată; plecarea cu modificări nesalvate întreabă o dată |
| Șofer / rută nouă | golite și la eroare | golite **numai** după succes |

R **da** (vehicul nou; editarea întreabă) · Î **da** · A n/a · S **da** · C **da** · E **da**.

### 4. Publicarea unui traseu, cu seria recurentă

| | Înainte | Acum |
| --- | --- | --- |
| Formularul | toate câmpurile golite la o eroare (nicio valoare nu era întoarsă); bifa de serie și tipul ei pierdute | ciornă `traseu` cu opțiunile de serie (zilele săptămânii sunt refăcute după ce apar), ștearsă la publicare |

R **da** · Î **da** · A n/a · S **da** · C **da** · E **da** (e-mailurile despre serii și rezervări duc pe `/cont/trasee`).

### 5. Trimiterea unei oferte și întrebarea de clarificare

| | Înainte | Acum |
| --- | --- | --- |
| Oferta | formular închis la reîncărcare, câmpurile fără valoare implicită, golite la orice eroare | ciornă `oferta` pe cerere (browser + cont), formularul se deschide singur când există ciornă, moneda restaurată, ștearsă la trimitere |
| Clarificarea | **butonul golea textul în propriul clic, înainte ca formularul să-l citească**: întrebarea pleca goală, era refuzată, textul dispărea | textul rămâne până a plecat, păstrat în browser |
| Linkul „ai o întrebare" din e-mail | `?oferta=ID` fără cutie: o firmă care și trimite, și primește oferte vedea lista goală | oferta e căutată în ambele cutii |

R **da** · Î **da** · A **da** · S **da** · C **da** · E **da**.

### 6. Execuția comenzii: pozele șoferului și lista de verificare

| | Înainte | Acum |
| --- | --- | --- |
| Pozele | trimise la mărime întreagă — peste 1 MB, limita acțiunilor, deci o poză de telefon eșua; „Încarcă din nou" redeschidea camera; progresul număra o poză de două ori; o reîncărcare pierdea poza neîncărcată | micșorate la 2000 px, păstrate în IndexedDB din clipa în care sunt făcute până le confirmă serverul, „Trimite din nou" trimite aceeași poză, „N fotografii n-au apucat să plece — Trimite-le acum" la redeschidere, progresul numără doar ce e pe server |
| Lista de verificare | golită la eroare | păstrată pe telefon cât e completată, ștearsă după salvare |
| Anulare / dispută | motivul golit la eroare | păstrat |

R **da** · Î **da** · A n/a · S **da** · C **da** · E **da** (e-mailurile comenzii duc pe comandă).

### 7. Evaluarea și răspunsul la evaluare

| | Înainte | Acum |
| --- | --- | --- |
| Evaluarea | comentariul pierdut la reîncărcare | comentariul păstrat în browser; e-mailul-memento duce direct la formular (`/cont/transporturi/<id>#evaluare`) |
| Răspunsul | formular închis, text pierdut; e-mailul ducea la listă | textul păstrat, formularul se deschide singur cu ciornă sau din linkul e-mailului (`#evaluare-<id>`) |

R **parțial** — stelele nu sunt în ciornă (un clic), comentariul da · Î **da** · A n/a · S **da** · C **da** · E **da**.

### 8. Profilul firmei (tab-uri) și setările

| | Înainte | Acum |
| --- | --- | --- |
| Tab-urile | trecerea pe alt tab arunca modificările fără să întrebe; bifele golite la eroare | plecarea cu modificări nesalvate întreabă o dată (tab, alt link, reîncărcare, închidere); după salvare nu mai întreabă |
| Setările (profil personal, ore de liniște, setările din admin) | la fel | la fel ca tab-urile; parola nouă se golește numai după succes |
| Logo-ul | selectorul golit înainte de încărcare — la eșec nu mai era nimic de reîncercat | fișierul eșuat păstrat, „Încearcă din nou" |

R **da** (întreabă) · Î **da** (întreabă la linkuri; Înapoi al browserului nu poate fi oprit, `beforeunload` acoperă reîncărcarea/închiderea) · A n/a · S **da** · C **da** · E n/a.

### 9. Filtre și căutări

| | Înainte | Acum |
| --- | --- | --- |
| Panourile (`/cereri`, `/trasee`, `/firme`) | filtrele în adresă, dar „← Înapoi la …" de pe pagina de detaliu ducea la panoul gol | panoul își ține ultima căutare pentru fila curentă, linkul de întoarcere duce la ea |
| `/cont/oferte` | filtrul de stare ștergea „favoriți" și invers | fiecare link le păstrează pe celelalte; ordinea ofertelor primite e în adresă |
| Admin: evaluări, anunțuri | paginarea pierdea filtrele | paginarea le păstrează |

R **da** · Î **da** · A **da** (butonul „Autentificare" din antet poartă și filtrele) · S n/a · C n/a · E **da**.

### 10. Înscrierea asistată din admin

| | Înainte | Acum |
| --- | --- | --- |
| Pasul | deja în adresă (`?pas=`) | neschimbat |
| Consimțământul, profilul | golite la eroare | ciorne `inscriere-asistata` (browser + cont), șterse la salvarea pasului |
| Datele firmei | golite la eroare | păstrate la eroare (fără ciornă: căutarea ANAF le recompletează și trebuie să aibă ultimul cuvânt) |

R **da** · Î **da** · A **da** · S **da** · C **da** · E n/a.

### 11. Mesageria

| | Înainte | Acum |
| --- | --- | --- |
| Caseta de scris | remontată la fiecare mesaj nou din fir — inclusiv unul primit în timp ce scriai; fișierele alese rămâneau afișate după golirea selectorului | text păstrat în browser, golit numai după trimitere; fișierele și selectorul golite împreună |
| Linkul din e-mail | ducea la lista de conversații | duce la conversație |

R **da** · Î **da** · A n/a · S **da** · C **da** · E **da**.

### 12. Autentificarea însăși

| | Înainte | Acum |
| --- | --- | --- |
| Formularele | un eșec de rețea arunca pagina de eroare; bifa de termeni golită la refuz | totul păstrat, mesaj lângă formular |
| `next` | pierdut la trecerea spre înregistrare, la alegerea tipului de cont, la confirmare, la retrimitere, la resetarea parolei, la erorile din callback | purtat peste tot |
| Cine e deja în cont pe o pagină de autentificare | trimis la `/cont` | trimis la `next` |

R **da** · Î **da** · A — · S n/a · C **da** · E **da**.

## Ce rămâne, și de ce

- **Ciorna unui vizitator, confirmată pe alt dispozitiv.** Contul nu există
  încă când e scrisă, deci nu are unde să fie ținută pe server fără să
  păstrăm date personale fără cont. Pagina de confirmare spune să fie
  deschis linkul pe același dispozitiv.
- **Fișierele eșuate în afara pozelor șoferului** (documente, logo, pozele
  cererii) rămân alese cât pagina e deschisă; o reîncărcare le pierde. Pozele
  cererii deja **urcate** sunt în ciornă.
- **Butonul Înapoi al browserului pe o pagină cu modificări nesalvate** nu
  poate fi oprit fără trucuri pe istoric; setările nu au ciornă, deci acolo
  Înapoi pierde modificarea. Linkurile și reîncărcarea întreabă.
- **Stelele unei evaluări** nu sunt în ciornă.

## Defecte prinse pe drum, în reparația însăși

Toate cinci au fost prinse de teste: primele două și ultimul cad
determinist dacă revin; al treilea și al patrulea apăreau intermitent în
`continuitate-cerere.spec.ts` (pasul corectat, telefonul la 390 px), care
le prind în continuare la rulări repetate.

- **Editarea rezumatului de la pasul 4 arunca la pasul 1.** Corecția
  pasului rula la fiecare schimbare a ciornei; golirea unui câmp în rezumat
  făcea pasul „inaccesibil". Corecția rulează acum numai la sosire (pasul
  cerut de adresă se schimbă), nu cât omul scrie. Prins de
  `publicare-cerere.spec.ts`.
- **Schimbarea pasului scria o ciornă goală**, care apoi anunța „Am păstrat
  ce completaseși" unui om care nu completase nimic. Ciorna se scrie numai
  după ce există ceva de păstrat (`draft-store.test.ts`).
- **Mesajul de la pasul corectat nu apărea uneori.** Era programat pentru
  cadrul următor, iar corectarea adresei (o randare nouă) îl anula înainte
  să apară. Erorile se pun acum odată cu pasul, în aceeași randare.
- **„Continuă" nu răspundea uneori pe telefon.** Derularea lină spre
  începutul pasului muta butonul de sub deget o jumătate de secundă; al
  doilea tap cădea pe formular. Acum saltul e instantaneu și numai când
  începutul pasului e deasupra ecranului (72 de treceri 3→4 fără ratare,
  față de 3 ratări înainte).
- **Pagina 404 din `/admin` ieșea uneori albă** (aprox. 1 din 130–300 de
  încărcări, niciodată pe `main`). Cauza: notificarea de sesiune și
  curățarea ciornei (`?gata=`) montate în layout-ul rădăcină — o bucată JS
  în plus pe care orice pagină trebuia s-o încarce înainte să se deseneze,
  iar pe pagina de eroare, uneori, n-o cerea. Acum stau în layout-urile
  `/cont` și `/admin` și în `KeepingForm` (o singură notificare desenată pe
  pagină, oricâte formulare are); layout-ul rădăcină e identic cu cel de
  pe `main`, iar un test unitar ține asta. 720 de încărcări fără ratare.

## Teste

- Unitare: `tests/unit/continuity.test.ts`, `continuity-flows.test.ts`,
  `continuity-session.test.ts` (middleware-ul: verificările cad pe
  varianta din `main` și trec acum), `draft-store.test.ts`.
- Baza de date: blocul DRF din `supabase/tests/rls_test.sql` (20 de
  verificări: proprietar, alt utilizator, `anon`, forme, dimensiune, luna,
  jobul de noapte, exportul, ștergerea contului).
- Browser, fără cont (rulate): `continuitate-cerere.spec.ts` (reîncărcare
  pe fiecare pas, Înapoi/Înainte, pas inaccesibil, pas expirat cu mesaj,
  editarea rezumatului, linkurile de autentificare de la pasul 4, filă
  închisă și redeschisă, „Începe din nou", calculatorul, 390 px) și
  `continuitate-fluxuri.spec.ts` (rețea căzută și eroare de server pe
  autentificare și înregistrare, refuzul de validare, linkul expirat,
  confirmarea, resetarea parolei, `/reconectat`, filtrele păstrate la
  Înapoi). Ambele rulează și pe desktop, și pe telefon la 390 px.
- Browser, cu cont (scrise, nerulate aici — cer Supabase):
  `continuitate-supabase.spec.ts` (autentificare și cont nou la pasul 4 cu
  e-mailul de confirmare, ciorna pe al doilea dispozitiv, sesiunea care
  expiră și fila nouă, oferta, traseul, tab-ul profilului, întoarcerea la
  panoul filtrat, poza șoferului cu încărcare eșuată și reîncărcare).
