# Faza 2 — script de verificare a mesageriei și a moderării

Ce urmează nu este o listă de lucruri care „ar trebui să meargă". Este exact
ce trebuie apăsat, în ce ordine, și ce trebuie să apară după fiecare apăsare.
Durează în jur de douăzeci de minute cu trei ferestre deschise.

Închide seria: `docs/faza-2-verificare.md` (oferte), apoi
`docs/faza-2-comanda-verificare.md` (comanda), apoi
`docs/faza-2-evaluari-verificare.md` (evaluări), apoi acesta.

Pașii marcați **[e-mail]** depind de furnizorul de e-mail (Resend). Până când
este configurat — vezi `docs/configurare-externa.md` — mesajele se adună
corect în `notification_outbox` și nu pleacă. Pasul se verifică atunci în
`/admin/notificari` → coada, nu în inbox. **Niciun pas nu depinde de un e-mail
ca să meargă mai departe.**

---

## Ce îți trebuie înainte să începi

| Cont | Ce trebuie să aibă |
|---|---|
| **Client** | O cerere publicată pe panou (`/cont/cereri` → cel puțin una „Pe panou"). |
| **Transportator** | Abonament activ **cu contacte rămase pe luna asta** (`/cont/abonament`). Fără ele, pasul 1 se oprește la limita de contacte — ceea ce este, la rândul lui, un lucru care trebuie să meargă. |
| **Șofer** *(pașii 9–10)* | Un cont de șofer **repartizat pe o comandă** din scriptul comenzii. |
| **Staff** *(pașii 11–16)* | Un cont din `platform_staff`. |

Folosește **conturile de test** pentru toate. Ce fac ele nu intră în niciun
număr public: `is_test` le scoate din statistici, din `/admin/pilot` și de pe
panoul public pentru ceilalți. Nu le scoate însă din mesagerie — un cont de
test scrie, primește și este moderat exact ca oricare altul, altfel scriptul
nu ar verifica nimic.

> **Despre poartă.** Deschiderea unei conversații de pe un anunț costă **un
> contact din abonament**, exact ca „Vezi datele de contact". Se numără **o
> singură dată pe anunț**: a doua conversație pe aceeași cerere este gratis,
> și la fel este dacă ai deschis deja contactul de pe butonul celălalt.

---

## Scriptul

### 1. Poarta, spusă înainte de apăsare — 2 min *(transportator)*

1. **Transportator** → `/cereri` → deschide cererea clientului.
2. Apasă **„Trimite mesaj"**.

**Trebuie să vezi**, *înainte* să se întâmple ceva: **„Deschiderea unei
conversații consumă un contact din abonament, o singură dată pe anunț. Dacă
ai scris deja aici, nu se mai numără."** și două butoane — „Trimite mesaj" și
„Renunță".

Asta este tot rostul pasului. Un buton care consumă din abonament fără să
spună este un buton pe care oamenii îl apasă o dată și apoi nu mai au
încredere în niciunul. Dacă textul nu apare, **oprește-te aici**.

3. Notează câte contacte îți arată `/cont/abonament` acum.
4. Apasă **„Trimite mesaj"** a doua oară, ca să confirmi.

**Trebuie să vezi:** ajungi direct în fir, la `/cont/mesaje/…`, cu numele
clientului în antet și eticheta **„Cerere"** lângă el.

5. Deschide `/cont/abonament` într-o filă nouă.

**Trebuie să vezi:** contactele rămase au scăzut cu **unu**.

### 2. Și a doua oară nu se mai numără — 1 min *(transportator)*

1. Înapoi pe aceeași cerere, `/cereri/…`.
2. Apasă **„Trimite mesaj"**.

**Trebuie să vezi:** **„Ai deschis deja contactul pentru anunțul acesta. Nu se
mai numără."** — alt text decât la pasul 1.

3. Confirmă, apoi verifică `/cont/abonament`.

**Trebuie să vezi:** contactele rămase **nu** au mai scăzut.

### 3. Masca — 3 min *(client)*

1. **Client** → `/cont/mesaje`. Firul este acolo, cu eticheta **„Cerere"**, cu
   traseul sub nume și cu o bulină de necitit.
2. Deschide-l. Bulina dispare.
3. Scrie în casetă: **„Sunați-mă la 0722 123 456 sau pe office@exemplu.ro."**
   Apasă **Enter** — nu butonul.

**Trebuie să vezi:** mesajul apare în fir **fără** numărul și **fără**
e-mail, iar deasupra firului scrie: **„Numerele de telefon și adresele de
e-mail se afișează după confirmarea comenzii. Mesajele scrise înainte rămân
așa cum au fost trimise."**

Linia aceea apare **numai** când chiar s-a mascat ceva. Dacă o vezi pe un fir
în care nimeni nu a scris un număr, e un defect.

4. Apasă **Shift+Enter** în casetă.

**Trebuie să vezi:** trece pe rând nou, nu trimite.

5. Încearcă să trimiți o casetă goală.

**Trebuie să vezi:** un refuz scurt. Un mesaj gol nu este un mesaj — nici cu
imagini alături; textul este obligatoriu, și indicația de sub casetă o spune
dinainte.

### 4. Imaginile — 3 min *(client)*

1. În același fir, apasă **„Adaugă imagini"** și alege o poză.

**Trebuie să vezi:** numele fișierului apare ca o pastilă deasupra casetei.

2. Încearcă un **PDF**.

**Trebuie să vezi:** un refuz pe loc, în browser, fără să plece nimic:
**„Cel mult 5 imagini, JPG, PNG, WebP sau HEIC, maximum 10 MB fiecare."**
Bucketul refuză și el, dar refuzul ăsta trebuie să vină înainte de urcare.

3. Încearcă **șase** imagini deodată.

**Trebuie să vezi:** se rețin primele cinci.

4. Scrie câteva cuvinte și trimite cu imaginile.

**Trebuie să vezi:** miniaturile în bula ta, deschise într-o filă nouă la
click. Legăturile sunt semnate și expiră într-o oră: dacă reîncarci pagina
mâine cu aceeași adresă copiată, nu mai merge. Asta e intenționat.

### 5. Duplicatul și ritmul — 2 min *(client)*

1. Trimite exact același text de două ori la rând.

**Trebuie să vezi:** al doilea este refuzat. Un dublu-click pe „Trimite" nu
are voie să scrie de două ori.

2. *(opțional)* Trimite douăzeci de mesaje scurte, repede.

**Trebuie să vezi:** la un moment dat, un refuz despre limita pe oră.
Pragurile sunt în `messaging_settings` (60 pe oră pe om, 30 pe conversație) și
se schimbă de acolo, nu din cod.

### 6. Notificarea, grupată — 2 min **[e-mail]**

1. **Transportator** → reîncarcă `/cont/mesaje`.

**Trebuie să vezi:** firul are bulină de necitit, iar **„Mesaje"** din meniu
are numărul lângă el. Peste nouă scrie **„9+"**.

2. **Staff** → `/admin/notificari` → coada.

**Trebuie să vezi:** un rând `message_received` către transportator. Dacă
clientul a scris trei mesaje la rând, **tot un singur rând** este: e-mailul se
grupează la cincisprezece minute pe conversație. Al doilea mesaj din aceeași
fereastră nu mai pune nimic în coadă.

3. Firul unei **oferte** folosește în continuare șablonul `offer_question`, nu
   `message_received`. Dacă vezi altceva, spune-mi.

### 7. Oferta acceptată, și comanda care își face firul — 3 min

1. Fă drumul din `docs/faza-2-verificare.md`: transportatorul trimite ofertă,
   clientul o acceptă. (Sau folosește o comandă deja creată.)
2. **Client** → `/cont/mesaje?cutie=comenzi`.

**Trebuie să vezi:** un fir nou, cu eticheta **„Comandă"**, pe care nu l-a
deschis nimeni cu mâna. Se face singur, la crearea comenzii.

3. Deschide-l.

**Trebuie să vezi:** în antet, legătura **„Discuția de dinainte de comandă"**.
Firul vechi nu s-a mutat și nu s-a copiat — este legat.

4. Deschide `/cont/transporturi/…` pentru aceeași comandă.

**Trebuie să vezi:** fila **„Mesaje"**, care duce în același fir.

### 8. Contactele, după comandă — 2 min

1. În **firul comenzii**, scrie: **„Vă sun la 0722 123 456 când ajung."**

**Trebuie să vezi:** numărul **se vede**. Pe firul unei comenzi nu se
maschează nimic — contactele sunt deja schimbate legal.

2. Apasă **„Discuția de dinainte de comandă"** și uită-te la mesajul de la
   pasul 3.

**Trebuie să vezi:** numărul de atunci este **tot mascat**. Istoria nu se
dezmaschează niciodată, nici după comandă. Mascarea s-a făcut la scriere, în
baza de date; nu există nicăieri o copie nemascată a acelui mesaj.

### 9. Șoferul — 2 min *(cont de șofer)*

1. **Șofer** → autentificare → `/cont`.

**Trebuie să vezi:** **„Mesaje"** în meniu, cu bulină dacă are ceva necitit.

2. `/cont/mesaje`.

**Trebuie să vezi:** **numai** firele comenzilor pe care este repartizat.
Nicio cerere, niciun traseu, nicio ofertă — nici măcar ale firmei lui.

3. Deschide firul și scrie un mesaj.

**Trebuie să vezi:** mesajul ajunge la amândouă părțile. Șoferul citește **și**
scrie, dar numai pe comanda lui.

### 10. Șoferul, ce nu poate — 1 min *(cont de șofer)*

1. Ia din bara de adrese id-ul unui fir de **cerere** al firmei (de la pasul 1)
   și deschide `/cont/mesaje/<id>` cu contul de șofer.

**Trebuie să vezi:** **404**. Nu „nu ai voie" — pur și simplu nu există pentru
el.

### 11. Sesizarea unui mesaj — 2 min *(client)*

1. **Client** → firul cu transportatorul → apasă **„Sesizează mesajul"**.

**Trebuie să vezi:** **„Ne uităm peste conversație. O sesizare este singurul
motiv pentru care o citim."** și o listă cu mesajele **celuilalt** — ale tale
nu se sesizează.

2. Alege unul, scrie de ce, trimite.

**Trebuie să vezi:** **„Am primit sesizarea. Ne uităm peste ea."**

3. **Staff** → `/admin/sesizari`.

**Trebuie să vezi:** un rând nou de tip **„Mesaj"**, cu legătură către
conversație.

### 12. Ce poate echipa să citească — 3 min *(cont de staff)*

1. **Staff** → `/admin/conversatii`.

**Trebuie să vezi**, sus: **„Doar conversațiile sesizate și cele de pe o
comandă în dispută. Restul rămân între cele două părți — nu le putem deschide,
și pagina de confidențialitate spune asta."**

2. **Trebuie să vezi** în listă: firul sesizat la pasul 11. **Și nimic
   altceva.** Firul de comandă de la pasul 7, nesesizat și fără dispută, **nu**
   are voie să apară.

3. Ia id-ul firului de comandă și deschide `/admin/conversatii/<id>` direct.

**Trebuie să vezi:** **404**. Regula nu este un filtru pe listă, este în
`staff_may_read_conversation()`: lista *este* mulțimea aceea, nu o vedere
filtrată peste tot.

4. Deschide `/confidentialitate` și caută în text.

**Trebuie să vezi** scris acolo: că **nu** citim conversațiile private, cele
două excepții (cineva a sesizat un mesaj din ea; comanda a intrat în dispută)
și termenul de **24 de luni** după care o conversație fără comandă se șterge.

### 13. Echipa ascunde un mesaj — 1 min *(cont de staff)*

1. În firul sesizat, apasă **„Ascunde mesajul"**, scrie motivul, confirmă.

**Trebuie să vezi:** **„Mesajul a fost ascuns."**

2. **Client** → reîncarcă firul.

**Trebuie să vezi:** în locul mesajului, **„Mesaj ascuns de echipa
platformei."** Părțile văd **că** a fost ascuns, nu **de ce** — motivul rămâne
în `audit_log`, la `/admin/jurnal`.

### 14. Blocarea — 3 min *(client)*

1. **Client** → firul cu transportatorul → **„Blochează expeditorul"**.

**Trebuie să vezi**, înainte de confirmare: **„Nu mai poate deschide
conversații noi cu tine de pe anunțuri. Firele comenzilor în curs rămân
deschise — transportul tot trebuie făcut."**

Propoziția a doua contează la fel de mult ca prima. Cine blochează crede de
obicei că a tăiat tot; dacă află abia din primul mesaj de pe o comandă că nu e
așa, crede că blocarea nu a funcționat.

2. Confirmă. **Trebuie să vezi:** **„Contul a fost blocat."**
3. **Transportator** → altă cerere a aceluiași client → **„Trimite mesaj"** →
   confirmă.

**Trebuie să vezi:** **„Nu poți trimite mesaje acestui cont"**, venit din baza
de date.

4. **Transportator** → firul **comenzii** cu același client → scrie ceva.

**Trebuie să vezi:** merge. Comanda în curs nu se oprește.

5. **Client** → înapoi în fir → **„Deblochează"**.

**Trebuie să vezi:** **„Blocarea a fost ridicată."**, iar transportatorul poate
deschide din nou.

6. **Staff** → `/admin/jurnal`.

**Trebuie să vezi:** și blocarea, și deblocarea, fiecare cu cine și când.

### 15. Moderarea anunțurilor — 3 min *(cont de staff)*

1. **Staff** → `/admin/anunturi`.

**Trebuie să vezi:** două file — **Cereri** și **Trasee** — și filtre pe stare,
firmă, „doar ascunse", „doar sesizate" și interval de date.

2. Deschide un anunț din listă.

**Trebuie să vezi:** fotografiile, istoricul și numărul de sesizări, dacă are.

3. Apasă **„Ascunde de pe panou"**.

**Trebuie să vezi**, deasupra casetei: **„Motivul îl vede și proprietarul, în
contul lui. Scrie-l ca pentru el, nu ca pentru noi."**

Este cea mai utilă propoziție de pe ecranul ăsta. Schimbă complet cum se scrie
motivul, de la „poze proaste" la „fotografiile nu par ale vehiculului din
anunț".

4. Încearcă să confirmi **fără motiv**.

**Trebuie să vezi:** un refuz. Nu se ascunde nimic fără motiv.

5. Scrie motivul și confirmă. **Trebuie să vezi:** **„Anunțul a fost ascuns."**

### 16. Ce vede proprietarul — 2 min *(client)*

1. **Deconectat** sau cu alt cont → `/cereri`.

**Trebuie să vezi:** anunțul **nu mai este** pe panou.

2. **Client** (proprietarul) → `/cont/cereri`.

**Trebuie să vezi:** anunțul **este acolo**, cu o casetă galbenă: **„Scos de
panou de echipa platformei"**, **„Motivul: …"** exact cum l-a scris echipa, și
**„Anunțul nu mai apare pe panoul public. Corectează ce este de corectat și
scrie-ne — îl punem la loc."**

Dacă anunțul ar dispărea din contul lui, omul ar crede că a greșit la
publicare și l-ar publica din nou, identic. De asta rămâne.

3. **[e-mail]** **Staff** → `/admin/notificari` → coada.

**Trebuie să vezi:** un rând `listing_hidden` către proprietar, cu text neutru.

4. **Staff** → `/admin/anunturi`, bifează **„Doar ascunse"**, apasă **„Repune
   pe panou"** cu motiv.

**Trebuie să vezi:** **„Anunțul a fost repus."**, caseta galbenă dispărută din
contul clientului, anunțul înapoi pe panou, și un rând `listing_restored` în
coadă.

### 17. Exportul — 1 min *(cont de staff)*

1. **Staff** → `/admin/anunturi`, jos de tot, **„Export sesizări și moderare"**.
2. Alege un interval care acoperă ziua de azi, apasă **„Descarcă CSV"**.

**Trebuie să vezi:** un fișier `.csv` cu un rând de antet și, în el,
sesizările și deciziile de moderare de azi. Îl deschizi în Excel fără să se
strice diacriticele.

---

## Ce nu poți verifica din browser

| Ce | De ce | Unde se verifică |
|---|---|---|
| Ștergerea conversațiilor fără comandă după 24 de luni | Nu poți aștepta doi ani | `supabase/tests/rls_test.sql`, blocul `MSG`, cu data mutată înapoi. `pnpm db:test`. Sau, ca `service_role`: `select public.purge_old_conversations();` |
| Că firele de comandă **nu** se șterg cu jobul ăla | Același motiv | Același bloc, verificarea vecină. |
| Jobul de noapte în sine | Rulează la 03:50 | `/admin/notificari` → `nightly-conversation-retention`. |
| Politicile bucketului de atașamente | Nu se văd din UI | Blocul `MSG`: cine poate citi, cine poate scrie, și că bucketul nu ia PDF-uri. |
| Gruparea e-mailurilor la 15 minute | Ai nevoie de ceas | `tests/unit/messages.test.ts` — aceeași formulă, comparată cu textul migrării. |
| Realtime | Are nevoie de WebSocket către Supabase | Se vede că merge dacă un mesaj apare **fără** să reîncarci și **fără** să aștepți cincisprezece secunde. Dacă apare abia după cincisprezece secunde, realtime nu a prins, dar nimic nu e stricat — polling-ul este garanția, realtime doar îl scurtează. Publicația: `select * from pg_publication_tables where tablename = 'messages';` |
| Livrarea propriu-zisă a e-mailurilor | Furnizorul nu e configurat | `docs/configurare-externa.md` |

---

## Dacă ceva nu merge

Fiecare refuz al bazei de date este o propoziție în română care spune ce să
faci mai departe, și este afișată exact așa cum a scris-o baza. Dacă vezi o
eroare generică în loc de o propoziție, aia e eroarea — spune-mi-o.

Patru lucruri sunt mai grave decât un buton care nu merge:

1. **Un număr de telefon vizibil într-un fir dinainte de comandă**, sau o
   istorie care s-a dezmascat după comandă.
2. **O conversație nesesizată deschisă de echipă** — inclusiv prin adresă
   directă. Pagina de confidențialitate promite că nu se poate.
3. **Un șofer care vede un fir care nu este al comenzii lui.**
4. **Un contact consumat de două ori pe același anunț**, sau consumat fără ca
   textul să fi spus dinainte că se consumă.
