# Faza 1–2 — script de verificare pentru cele cinci lucruri completate

Ce urmează nu este o listă de lucruri care „ar trebui să meargă". Este exact
ce trebuie apăsat, în ce ordine, și ce trebuie să apară după fiecare apăsare.
Durează în jur de treizeci de minute cu trei ferestre deschise.

Cele cinci: **plecări care se repetă**, **returul de pe o comandă**, **cereri
private**, **transportatori favoriți** și **ajutorul din cont**.

Vine după seria fazei 2: `docs/faza-2-verificare.md` (oferte),
`docs/faza-2-comanda-verificare.md` (comanda),
`docs/faza-2-evaluari-verificare.md` (evaluări),
`docs/faza-2-mesagerie-verificare.md` (mesagerie), apoi acesta. Nu depinde de
ele ca să fie parcurs, dar conturile pe care le cere sunt aceleași.

Pașii marcați **[e-mail]** depind de furnizorul de e-mail (Resend). Până când
este configurat — vezi `docs/configurare-externa.md` — mesajele se adună
corect în `notification_outbox` și nu pleacă. Pasul se verifică atunci în
`/admin/notificari` → coada, nu în inbox. **Niciun pas nu depinde de un e-mail
ca să meargă mai departe.**

Pașii marcați **[noapte]** depind de jobul `nightly-route-series`, care rulează
la 02:30. Nu aștepta noaptea: îl poți porni cu mâna, vezi „Cum pornești jobul
fără să aștepți" la final.

---

## Ce îți trebuie înainte să începi

| Cont | Ce trebuie să aibă |
|---|---|
| **Transportator A** | Firmă verificată și **cel puțin un vehicul cu ITP, RCA și copie conformă valabile**. Fără el nu există formular de plecare, deci nici serie. |
| **Transportator B** | Firmă verificată, **fără nicio legătură** cu clientul. El este cel care nu trebuie să vadă cererea privată. |
| **Client / expeditor** | Dreptul de a publica cereri. Pentru favoriți are nevoie de o firmă: lista este a firmei, nu a omului. |
| **Staff** *(pasul 9)* | Un cont din `platform_staff`, pentru `/admin/jurnal`. |

Folosește **conturile de test**. Ce fac ele nu intră în niciun număr public:
`is_test` le scoate din statistici, din `/admin/pilot` și de pe panourile
publice. Nu le scoate din reguli — o cerere privată a unui cont de test este
la fel de privată.

---

## Scriptul

### 1. O serie care se repetă — 4 min *(transportator A)*

1. **Transportator A** → `/cont/trasee/nou`.
2. Completează ruta (de exemplu Cluj-Napoca → București), „Disponibil de la"
   mâine, alege vehiculul.
3. Bifează **„Se repetă"**.
   - **Trebuie să apară** regula: „În zilele săptămânii" / „La fiecare N zile",
     zilele ca bifele scurte (D L Ma Mi J V S) și „Până la".
   - **Trebuie să dispară** butonul „Salvează ca ciornă". O serie nu are ciornă.
4. Alege **luni** și o dată „Până la" peste o lună. Apasă **„Publică seria"**.
5. Ajungi pe `/cont/trasee`.
   - **Trebuie să apară** secțiunea **„Plecări care se repetă"** cu seria,
     insigna **„Activă"**, regula scrisă în cuvinte („În fiecare luni"), data
     până la care ține și numărul de înmatriculare.

> **Ce se verifică:** `create_route_series()` refuză o firmă neverificată, un
> vehicul al altei firme, o serie care se termină în trecut, una mai lungă de
> un an și una fără niciun tip de vehicul acceptat. Toate cinci au verificare
> în `supabase/tests/rls_test.sql`, blocul **SER**.

### 2. Ce plecări urmează din ea — 1 min *(transportator A)*

1. Pe aceeași pagină, sub seria activă.
   - **Trebuie să apară** „Următoarele plecări" și câteva date, ca `2026-10-05`.
2. Numără-le și verifică pe calendar că sunt **luni**.

> Datele de aici sunt calculate în ecran, de `src/lib/recurrence.ts`. Jobul de
> noapte le calculează din nou, în Postgres, cu `recurrence_dates()`.
> `tests/unit/recurrence.test.ts` compară cele două pe aceleași intrări — dacă
> ziua din ecran nu este ziua care se publică, testul acela cade primul.

### 3. Plecările se publică singure — 3 min **[noapte]** *(transportator A)*

1. Pornește jobul (vezi finalul documentului).
2. `/cont/trasee`.
   - **Trebuie să crească** „N plecări publicate" pe cardul seriei.
   - **Trebuie să apară** în lista de trasee, mai jos, plecările concrete —
     una pentru fiecare luni din următoarele **14 zile** (atâta este
     orizontul; se schimbă din `recurrence_settings`).
3. `/trasee`, fără cont.
   - **Trebuie să apară** ca trasee obișnuite. **Nu trebuie să scrie nicăieri**
     „serie" sau „se repetă": pentru client este un traseu ca oricare altul.
4. Pornește jobul **a doua oară**.
   - **Nu trebuie să se dubleze** nimic. Generarea este idempotentă pe
     (serie, zi).

### 4. Un vehicul care iese din reguli oprește seria — 4 min *(transportator A + staff)*

1. `/cont/firma/flota` → vehiculul seriei → pune-i **ITP-ul expirat** (o dată
   din trecut) și salvează.
2. Pornește jobul **[noapte]**.
3. `/cont/trasee`.
   - Seria **trebuie să fie „Pe pauză"**, cu motivul scris întreg:
     *„Vehiculul nu mai are documentele valide…"*.
   - **Nu trebuie să mai apară** „Următoarele plecări": cât e pe pauză, nu
     promitem plecări care nu vin.
   - **Plecările deja publicate rămân.** Cine a rezervat un loc nu pierde nimic.
4. **[e-mail]** Transportatorul primește anunțul `series_paused`. Până la
   Resend: `/admin/notificari` → coada → un rând nou cu tipul acela.
5. Pune ITP-ul la loc, apasă **„Repornește"**, pornește jobul din nou.
   - Seria **trebuie să fie „Activă"** și să genereze mai departe.

> **Ce se verifică:** jobul nu are voie să fie chemat de nimeni din afară.
> `generate_route_departures()` este `service_role` și refuză un
> `authenticated` oarecare. Verificarea este în blocul **SER**.

### 5. Modificarea seriei nu atinge ce este deja publicat — 3 min *(transportator A)*

1. Pe `/cont/trasee`, **„Pune pe pauză"** apoi **„Oprește seria"** pe o serie
   care a generat deja.
   - **Trebuie să rămână** plecările publicate, în listă, neatinse.
   - **Trebuie să rămână** rezervările pe ele.
2. Seria oprită **trebuie să arate „Oprită"** și să nu mai aibă butoane.

### 6. Returul, de pe comandă — 3 min *(transportator A)*

1. **Transportator A** → `/cont/transporturi` → o comandă ajunsă la
   **„Livrare programată"** sau mai departe.
   - **Trebuie să apară** cardul **„Te întorci gol?"**, cu ruta întoarsă:
     localitatea de **livrare** → baza, și o dată **după** livrare.
2. Apasă **„Publică returul"**.
   - Ajungi pe `/cont/trasee/nou?…` — formularul **obișnuit**, completat.
   - „De unde pleci" **trebuie să fie localitatea de livrare**.
   - „Disponibil de la" **trebuie să fie o zi de după livrare**.
   - Vehiculul **trebuie să fie cel al comenzii**.
3. Verifică și publică. Nu se publică nimic singur: apăsarea rămâne a omului.
4. Pe o comandă **fără vehicul repartizat**, cardul spune
   *„Repartizează întâi un vehicul, ca returul să plece cu el."* și nu are buton.

### 7. Favoriți — 3 min *(client)*

1. **Client** → `/firme` → un profil de transportator → **„Adaugă la favoriți"**.
   - Butonul **trebuie să devină** „În favoriți".
2. `/cont/favoriti`.
   - **Trebuie să apară** firma, cu localitatea și evaluările (sau „fără
     evaluări încă" — nu un 0,0 inventat).
   - **Trebuie să scrie** *„Lista este a firmei, nu a ta: rămâne și după ce
     pleacă un coleg."* și, jos, *„Transportatorul nu află că este pe lista ta."*
3. Intră cu **alt om din aceeași firmă**.
   - **Trebuie să vadă aceeași listă.** Este a firmei.
4. Intră cu transportatorul adăugat.
   - **Nu trebuie să existe niciun ecran** care să îi spună că este pe lista
     cuiva. Nici notificare, nici insignă.

> **Ce se verifică:** `add_favourite_carrier()` cere rolul (proprietar, admin
> sau dispecer) și refuză un membru obișnuit; lista se citește numai de
> membrii firmei. Blocul **FAV**, 13 verificări.

### 8. O cerere privată — 7 min *(client + transportator B)*

1. **Client** → `/cerere/noua` → completează până la ultimul pas.
2. La **„Unde apare cererea"** alege **„Doar transportatorii pe care îi aleg"**.
   - **Trebuie să scrie** *„Nu apare pe panoul public și nimeni altcineva nu
     primește alertă pentru ea."*
3. Publică. Pe `/cont/cereri/<id>`:
   - **Trebuie să apară** panoul **„Cine vede cererea"**, cu favoriții ca bife.
4. Bifează unul, **„Salvează invitațiile"**.
   - **[e-mail]** Invitatul primește `private_request_invite`. Până la Resend:
     `/admin/notificari` → coada.
5. **Transportator B** (neinvitat) → `/cereri`.
   - **Nu trebuie să apară** cererea.
   - Numărul de sus („N cereri") **nu trebuie să o numere**.
6. **Transportator B** → deschide direct `/cereri/<id>`, cu id-ul copiat.
   - **Trebuie să primească 404.** Nu 403: un „nu ai voie" ar confirma că
     cererea există, ceea ce este exact ce ascundem.
7. **Transportator B** → `/cont/alerte`. Dacă are o alertă pe ruta aceea:
   - **Nu trebuie să primească** nimic pentru cererea privată.
8. **Transportator B** → încearcă să deschidă un fir de mesaje pe ea, dacă
   ajungi la buton printr-un link direct.
   - **Trebuie să fie refuzat**, cu „Anunț inexistent".
   - **Nu trebuie să i se consume** niciun contact din abonament: verifică
     în `/cont/abonament` înainte și după.
9. Invitatul → `/cereri` → **trebuie să o vadă**, să poată deschide firul, să
   vadă datele de contact și să trimită ofertă.
10. Invitatul → deschide `/cereri/<id>` din **linkul e-mailului de
    invitație**.
    - **Trebuie să se deschidă**, nu 404. Cererea nu este pe panoul public,
      deci pagina o ia pe alt drum; dacă drumul acela nu există, tocmai cel
      invitat rămâne pe dinafară.

> **Ce se verifică:** `can_see_listing()` decide pentru cerere, pentru
> ofertele de pe ea, pentru firul de mesaje și pentru datele de contact —
> patru uși în aceeași cameră, toate patru întrebând aceeași funcție.
> `v_requests_public` o exclude de pe panou, din numărători și din paginile
> de SEO; `queue_request_alerts()` nu trimite alerte decât invitaților.
> Blocul **PRV**, 34 de verificări.

### 9. Deschiderea pe bursă — 2 min *(client)*

1. **Client** → `/cont/cereri/<id>` → panoul „Cine vede cererea".
   - **Trebuie să scrie, înainte de apăsare:** *„Nu se poate reveni: odată
     publică, rămâne publică."*
2. Apasă **„Deschide pe bursă"**.
   - Panoul **trebuie să dispară**: nu mai are ce spune.
3. **Transportator B** → `/cereri` → **trebuie să o vadă acum**.
4. **Staff** → `/admin/jurnal` → **trebuie să existe un rând** cu deschiderea,
   cu cine a făcut-o și când.

> Drumul invers, de la public la privat, este permis **numai pe ciornă**. O
> cerere care a fost pe panou a fost văzută și poate avea oferte; ascunsă
> înapoi, ar lua unui transportator exact marfa pe care tocmai a ofertat-o.

### 10. Filtrul „Doar favoriți" — 1 min *(client)*

1. **Client** → `/cont/oferte?cutie=primite`.
   - **Trebuie să apară** două file: „Toate ofertele" și „Doar favoriți".
2. Apasă **„Doar favoriți"**.
   - **Trebuie să rămână** doar ofertele firmelor din listă.
   - Filtrul compară **id-uri de firmă**, nu nume: două firme se cheamă la fel
     mai des decât crede oricine.

### 11. Ajutorul — 3 min *(fiecare tip de cont)*

1. **Transportator A** → `/cont/ajutor`.
   - **Trebuie să apară** secțiunile care îl privesc pe el.
   - **Nu trebuie să apară** „Cum public o cerere de transport?" — aia este a
     clientului.
2. Caută **„ofertă"** → apasă „Caută".
   - **Trebuie să scrie** câte răspunsuri a găsit și să le arate deschise.
   - **Trebuie să apară** „Vezi tot".
3. Caută **„zzzqqq"**.
   - **Trebuie să scrie** *„Nu am găsit nimic pentru ce ai căutat."* — nu o
     listă goală.
4. Jos, blocul **„Nu ai găsit răspunsul?"**.
   - Ori e-mailul și telefonul reale, ori marcajul **„De completat înainte de
     lansare"** cu legătură spre `/contact`. **Niciodată un rând gol și
     niciodată un e-mail inventat.** Datele vin din `src/config/company.ts`.
5. Intră cu **clientul** → `/cont/ajutor`.
   - **Trebuie să vadă alte secțiuni.**
6. Intră cu un **șofer**, dacă ai unul.
   - **Trebuie să vadă** „Ce văd eu, ca șofer?" și aproape nimic altceva.

### 12. Semnele de întrebare de pe ecrane — 2 min *(oricare cont)*

Pe fiecare dintre ecranele astea trebuie să existe legătura **„Cum
funcționează"**, iar apăsarea ei trebuie să ducă la `/cont/ajutor?raspuns=…`
**cu răspunsul deschis**, nu doar prezent în pagină:

| Ecran | |
|---|---|
| `/cerere/noua` | formularul de cerere |
| `/cont/trasee/nou` | formularul de plecare |
| `/cont/trasee` | seriile |
| `/cont/oferte` | ofertele |
| `/cont/transporturi/<id>` | comanda |
| `/cont/firma/documente` | documentele |
| `/cont/mesaje` | mesajele |
| `/cont/favoriti` | favoriții |
| `/cont/cereri/<id>` | panoul de vizibilitate |

### 13. Pe telefon — 2 min

Cu fereastra la **390px** lățime, deschide `/cont/ajutor`, `/cont/favoriti`,
`/cont/oferte` și `/cont/trasee`.

- **Nu trebuie să existe** bară de derulare pe orizontală.
- Bifele zilelor din formularul de serie **trebuie să încapă** pe două rânduri,
  nu să iasă lateral.

---

## Cum pornești jobul fără să aștepți

Jobul se numește `nightly-route-series` și rulează la 02:30. Ca să îl pornești
acum, din SQL editor cu rol de serviciu:

```sql
select public.generate_route_departures();
```

Ce a făcut se vede în `/admin/notificari` → sănătatea joburilor, rândul
`nightly-route-series`, și în `job_run_log`.

> **De ce merge asta numai cu rol de serviciu:** funcția refuză un
> `authenticated` oarecare. Dacă o chemi din aplicație, primești o eroare — și
> asta este ce trebuie să se întâmple.

---

## Ce rămâne în afara acestui script

- **E-mailurile propriu-zise** — până la Resend, se verifică în coadă.
  `docs/configurare-externa.md` spune ce mai este de configurat.
- **Notificările push** pentru invitația la o cerere privată — depind de VAPID,
  configurat separat.
- **Faza 3** nu este atinsă deloc: fără contracte PDF, fără index de prețuri,
  fără localizare în timp real, fără anunțuri promovate, fără tractări.

---

## Dacă ceva nu merge

| Simptom | Unde te uiți întâi |
|---|---|
| Seria nu generează nimic | Este „Pe pauză"? Are motiv scris? Vehiculul mai are actele valide? A rulat jobul? |
| Seria s-a pus singură pe pauză | Motivul este scris pe card. Aproape întotdeauna: vehiculul a ieșit din reguli. |
| Plecările apar de două ori | Nu ar trebui: generarea este idempotentă. Dacă totuși, verifică `truck_listings.series_id`. |
| Cererea privată se vede pe panou | `cargo_listings.visibility` este `privata`? Dacă da, este o scurgere — oprește și scrie. |
| Un neinvitat primește 403, nu 404 | Tot o scurgere: 403 confirmă că rândul există. |
| Un neinvitat a deschis un fir sau a văzut contactul | Scurgere. Oprește pilotul pe cererile private și scrie: gărzile sunt în `guard_conversation_insert()` și în `reveal_contact()`. |
| Favoriții nu se salvează | Rolul contului. Un membru obișnuit nu poate scrie în lista firmei. |
| Ajutorul nu arată nimic | Tipul contului. Un cont fără firmă vede alt set de răspunsuri. |
