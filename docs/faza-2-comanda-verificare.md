# Faza 2 — script de verificare a comenzii și a dovezii de livrare

Ce urmează nu este o listă de lucruri care „ar trebui să meargă". Este exact
ce trebuie apăsat, în ce ordine, și ce trebuie să apară după fiecare apăsare.
Durează în jur de douăzeci de minute cu trei ferestre deschise. Dacă ai doar
zece, fă pașii 1–8 și sari peste 9–14: primele opt sunt fluxul întreg, de la
comandă la închidere.

Continuă `docs/faza-2-verificare.md`, care se oprește la oferta acceptată.
Aici începe de la comanda pe care acceptarea tocmai a creat-o.

Pașii marcați **[e-mail]** depind de furnizorul de e-mail (Resend) și de SMTP
în Supabase Auth. Până când astea sunt configurate — vezi
`docs/configurare-externa.md` — mesajele se adună corect în
`notification_outbox` și nu pleacă. Pasul se verifică atunci în
`/admin/notificari` → coada, nu în inbox. **Niciun pas din script nu depinde
de un e-mail ca să meargă mai departe**; e-mailul este întotdeauna în plus
față de ce se vede în pagină.

---

## Ce îți trebuie înainte să începi

Trei conturi, în trei ferestre separate (una normală, una incognito, una
într-un alt browser — altfel se calcă pe sesiune). Al patrulea, de staff, e
nevoie doar la pașii 11–13.

| Cont | Ce trebuie să aibă |
|---|---|
| **Client** | Contul care a publicat cererea și a acceptat oferta din `docs/faza-2-verificare.md`. Firmă de expediții sau persoană fizică — nu contează aici. |
| **Dispecer** | Un cont de firmă de transport, **verificată**, **nesuspendată**, membru cu rol `owner`, `admin` sau `dispatcher`, cu **cel puțin un vehicul activ cu ITP, RCA și copie conformă în termen**. Este firma care a trimis oferta acceptată. |
| **Șofer** | Un cont de utilizator care este membru al **aceleiași firme** cu rolul `driver` **și** are un rând în `drivers` cu `profile_id` egal cu contul lui. Fără legătura asta din `drivers`, șoferul nu vede nimic — pe bună dreptate, pentru că alocarea se face pe rândul din `drivers`, nu pe membru. |
| **Staff** *(pașii 11–13)* | Un cont din `platform_staff`. |

Îți mai trebuie **o comandă**: deschide `/cont/transporturi` cu contul
clientului și verifică-i existența înainte să începi. Dacă nu e acolo,
înseamnă că nu s-a acceptat nicio ofertă — fă întâi
`docs/faza-2-verificare.md`.

> **Fotografii.** Fă-ți rost de patru poze cu o mașină, oricare. Pe telefon
> butonul deschide camera direct; pe desktop deschide selectorul de fișiere.
> Ambele merg; scriptul e scris pentru telefon, pentru că acolo se folosește.

---

## Scriptul

### 1. Comanda există, și fiecare o vede altfel — 2 min

1. **Client** → `/cont/transporturi`. Comanda e în fila **„Active"**, cu
   starea **„Confirmată"**.
2. **Dispecer** → `/cont/transporturi`. Aceeași comandă, cu insigna
   **„Necesită acțiunea ta"**.
3. **Șofer** → `/cont/transporturi`. Pagina spune **„Niciun transport alocat."**

**Trebuie să vezi:** clientul nu are niciun buton de acțiune, ci propoziția
**„Transportatorul programează ridicarea."** Dispecerul are butonul
**„Programează ridicarea"**. Șoferul nu vede comanda deloc, pentru că nu e
încă alocat pe ea.

> Asta e cea mai importantă verificare din tot scriptul și e prima dintr-un
> motiv: un șofer care e membru al firmei **nu** vede toate comenzile firmei.
> Vede doar ce i s-a alocat. Dacă vezi comanda în lista șoferului înainte de
> pasul 3, oprește-te și spune-mi.

### 2. Dispecerul programează ridicarea — 1 min

1. **Dispecer** → deschide comanda.
2. Apasă **„Programează ridicarea"**.
3. **De la**: mâine, ora 09:00. **Până la (opțional)**: mâine, ora 13:00.
4. **Salvează.**

**Trebuie să vezi:** starea devine **„Ridicare programată"**, intervalul apare
în „Ce s-a stabilit" la rândul **Ridicare**, iar în „Unde a ajuns" apare un
rând nou cu ora și cu numele tău.

**[e-mail]** Clientul primește „Ridicarea a fost programată". În coadă:
`order_pickup_scheduled`.

### 3. Dispecerul alocă șoferul și vehiculul — 1 min

1. Tot pe pagina comenzii, apasă **„Alege șoferul și vehiculul"**.
2. Alege șoferul din listă și un vehicul din listă.
3. **Salvează.**

**Trebuie să vezi:** „Șofer și vehicul" în coloana din dreapta arată numele și
numărul de înmatriculare în locul lui **„Nealocat"**.

**Apoi, în fereastra șoferului:** reîncarcă `/cont/transporturi`. Comanda
apare acum, sub **„Astăzi"** sau **„Urmează"**, după intervalul ales la
pasul 2.

**[e-mail]** Șoferul primește „Ai fost alocat pe o comandă". În coadă:
`order_driver_assigned`.

> În lista derulantă apar doar vehiculele cu actele în termen. Dacă un vehicul
> lipsește din listă, uită-te la ITP, RCA și copia conformă în `/cont/firma`
> — nu e un bug în ecranul ăsta.

### 4. Șoferul încearcă să sară peste fotografii — 1 min *(pe telefon)*

1. **Șofer** → deschide comanda din listă.
2. Butonul mare de sus este **„Am ridicat vehiculul"**. Încearcă să-l apeși.

**Trebuie să vezi:** butonul este inactiv, iar sub el scrie **„Mai ai nevoie
de: fotografii la ridicare, fișa de stare."** Nu un buton care merge și apoi
dă eroare — unul care spune dinainte ce lipsește.

> Numărătoarea asta o face și pagina, și baza. Pagina o face ca să nu apeși
> degeaba; baza o face ca să nu se poată ocoli. Dacă trimiți `transition_order`
> direct din consolă, primești același refuz, în aceeași română.

### 5. Șoferul fotografiază mașina și completează fișa — 4 min *(pe telefon)*

1. Sub **„Fotografii"**, scrie **„Fotografia 1 din 4 — Fața"**.
2. Apasă **„Adaugă fotografie"** și fă poza. Se încarcă, apoi trece la
   **„Spatele"**, **„Lateral stânga"**, **„Lateral dreapta"**.
3. *(Opțional)* Bifează **„Atașează locația la aceste fotografii"** înainte de
   prima poză. Browserul cere permisiunea o singură dată.
4. Sub **„Fișa de stare a vehiculului"**, completează toate cele nouă rânduri:
   zgârieturi, lovituri, geamuri, jante, interior (Fără / Ușoare / Vizibile),
   kilometraj, nivel combustibil, chei predate, acte predate (Da / Nu).
   Lasă un rând gol intenționat și apasă **„Salvează fișa"** — trebuie să
   scrie **„Completează."** sub rândul lipsă.
5. Completează-l și salvează.
6. Apasă acum **„Am ridicat vehiculul"**.

**Trebuie să vezi:** starea devine **„Vehicul ridicat"**, cele patru
fotografii apar sub „Dovezi" → „Fotografii la ridicare", fiecare cu ora și cu
numele tău, iar fișa apare ca „Fișa de stare".

**Verifică și la client:** cererea din `/cont/cereri` este acum **„În curs"**.
Starea cererii se schimbă din tranziție, nu din pagină.

**[e-mail]** Clientul primește „Vehiculul a fost ridicat". În coadă:
`order_picked_up`.

### 6. Dovezile nu se mai modifică — 1 min

1. Tot ca **șofer**, încearcă să ștergi una dintre fotografii.

**Trebuie să vezi:** nu există niciun buton care să facă asta. Nici la
dispecer, nici la client, nici la staff. Sub „Dovezi" scrie **„Fotografiile și
fișele rămân neschimbate. Nimeni nu le poate modifica sau șterge, nici noi."**

> Este un trigger pe `order_evidence`, nu o politică. O politică de UPDATE se
> poate schimba; triggerul refuză și `service_role`-ul unei funcții scrise
> greșit mâine. Singura excepție este jobul de anonimizare, care șterge
> odată cu restul datelor persoanei.

### 7. Drumul, și livrarea cu cod — 4 min

1. **Șofer** → **„Am pornit la drum"**. Starea devine **„Pe drum"**.
   **[e-mail]** `order_in_transit`.
2. **Dispecer** → **„Programează livrarea"**, cu un interval ca la pasul 2.
   Starea devine **„Livrare programată"**. **[e-mail]**
   `order_delivery_scheduled`.
3. **Client** → deschide comanda. Sub **„Codul de confirmare"** este un cod de
   șase cifre, cu propoziția **„Dă acest cod șoferului la predare."**
4. **Dispecer**, pe aceeași comandă: **codul nu este nicăieri în pagină.**
   Caută-l cu Ctrl+F. Nu e.
5. **Șofer** → fă patru fotografii la livrare, la fel ca la pasul 5.
6. Sub **„Codul de la client"**, scrie numele persoanei care primește
   vehiculul și tastează codul de la client. *(Sau apasă „sau cere semnătura"
   și semnează cu degetul — merge oricare dintre cele două, niciodată
   niciuna.)*
7. Apasă **„Confirm livrarea vehiculului"**.

**Trebuie să vezi:** starea devine **„Livrat"**. Încearcă întâi cu un cod
greșit: refuzul este o propoziție în română, iar starea nu se schimbă.

**Verifică și la client:** cererea este acum **„Livrată"**.

**[e-mail]** Clientul primește „Vehiculul a fost livrat", cu termenul de
confirmare. În coadă: `order_delivered`.

### 8. Clientul confirmă — 2 min

1. **Client** → deschide comanda.
2. Sus scrie **„Confirmi livrarea?"** și, sub el, de cât timp mai dispune:
   *„Dacă nu spui nimic, comanda se închide singură peste 48 de ore."*
3. Uită-te la **„La livrare, față de cele de la ridicare"** — fotografiile
   stau două câte două, cu ora și autorul fiecăreia.
4. Apasă **„Da, am primit vehiculul"**.

**Trebuie să vezi:** starea devine **„Finalizată"**, comanda trece în fila
**„Finalizate"** la ambele părți, iar „Unde a ajuns" are toți cei șapte pași
cu ora și cu cine i-a făcut.

**[e-mail]** Ambele părți primesc „Comanda a fost finalizată". În coadă:
`order_completed`.

> **Aici se termină fluxul principal.** Restul scriptului verifică ce se
> întâmplă când lucrurile *nu* merg drept: închiderea automată, anularea și
> disputa. Fiecare are nevoie de o comandă nouă.

---

### 9. Închiderea automată, fără răspuns de la client — 2 min *(cere SQL)*

Jobul rulează la :40 în fiecare oră și închide comenzile lăsate în „Livrat"
mai mult de `order_settings.auto_complete_hours` (48 în mod implicit). Nu poți
aștepta 48 de ore, deci simulezi ora:

```sql
-- ca service_role, pe o comandă rămasă în „Livrat"
select public.complete_stale_orders(now() + interval '49 hours');
```

**Trebuie să vezi:** comanda este **„Finalizată"**, iar în „Unde a ajuns"
ultimul rând spune **„Închisă automat, fără răspuns de la client."** În
`/admin/jurnal`, acțiunea este trecută cu autorul `system`, nu cu un nume.

**[e-mail]** Ambele părți primesc „Comanda s-a închis automat". În coadă:
`order_auto_completed`.

### 10. Anularea înainte de ridicare, și locurile eliberate — 3 min

Pe o comandă **nouă**, oprită la „Confirmată" sau „Ridicare programată":

1. **Client** → **„Anulează comanda"**.
2. Motivul este obligatoriu; încearcă întâi să trimiți formularul gol.
3. Lasă bifat **„Pune cererea înapoi pe panou"** și confirmă.

> Bifa apare numai la client. Un transportator care anulează vede formularul
> fără ea: nu poate decide în locul altcuiva dacă mașina lui mai trebuie
> mutată. Cererea se repune pe panou, iar clientul o retrage dacă nu mai
> vrea.

**Trebuie să vezi:** starea **„Anulată"**, comanda în fila
**„Anulate și dispute"**, iar cererea din `/cont/cereri` este din nou **„Pe
panou"** — dacă intervalul de încărcare nu a trecut. Dacă a trecut, cererea
este **„Expirată"**, și asta e regula, nu o scăpare: nu punem înapoi pe panou
o cerere pentru o dată care a trecut.

**Dacă rezervarea era pe un loc de platformă:** locul este liber la loc. Vezi
numărul în `/cont/trasee` pe plecarea respectivă.

**Apoi încearcă să anulezi o comandă deja ridicată:** butonul nu mai există,
iar în locul lui scrie **„Vehiculul este deja ridicat, așa că nu mai poate fi
anulată din cont. Scrie-ne și rezolvăm împreună."**

**[e-mail]** Cealaltă parte primește „Comanda a fost anulată", cu motivul. În
coadă: `order_cancelled`.

### 11. Clientul deschide o dispută — 2 min

Pe o comandă în **„Livrat"**:

1. **Client** → **„Ceva nu este în regulă"**.
2. Alege o categorie, scrie ce s-a întâmplat, adaugă o fotografie.
3. **„Deschide disputa"**.

**Trebuie să vezi:** starea **„În dispută"**, un panou galben cu ce ai scris,
și nicio acțiune disponibilă pentru niciuna dintre părți. Comanda este
blocată.

**[e-mail]** Ambele părți primesc „S-a deschis o dispută". În coadă:
`order_dispute_opened`.

### 12. Echipa o închide — 2 min *(cont de staff)*

1. **Staff** → `/admin/transporturi`.
2. Bifează **„Doar disputele"** și apasă **„Filtrează"** — URL-ul poartă
   filtrul, deci poate fi trimis mai departe.
3. **„Deschide"** pe comanda în dispută.
4. Citește istoricul și fotografiile, apoi, sub **„Închide disputa"**, alege
   **Finalizată** sau **Anulată**, scrie decizia și trimite. Încearcă întâi
   fără text: motivul este obligatoriu.

**Trebuie să vezi:** starea comenzii devine ce ai ales, decizia apare la
ambele părți sub **„Decizia echipei"**, iar în `/admin/jurnal` este rândul cu
numele tău.

Pe pagina comenzii, la ambele părți, sub panoul disputei scrie **„Nu decidem
despre bani: platforma nu încasează și nu ține plăți."** — asta e limita,
scrisă acolo unde o citesc cei care ar putea aștepta altceva.

**[e-mail]** Ambele părți primesc „Disputa a fost închisă". În coadă:
`order_dispute_resolved`.

### 13. Echipa ascunde o dovadă, cu motiv — 1 min *(cont de staff)*

1. Pe pagina comenzii din administrare, sub o fotografie, apasă
   **„Ascunde dovada"**.
2. Scrie motivul și confirmă.

**Trebuie să vezi:** la cele două părți, în locul fotografiei scrie
**„Ascunsă de echipa platformei."** Rândul și fișierul rămân. În
`/admin/jurnal` este motivul, cu numele tău.

### 14. Vehiculul căruia i-au expirat actele — 1 min *(cere SQL)*

Jobul rulează la 02:30 în fiecare noapte și marchează comenzile neridicate
al căror vehicul alocat nu mai are actele în termen.

```sql
-- ca service_role
select public.flag_noncompliant_order_vehicles(now());
```

**Trebuie să vezi:** pe comandă, la dispecer și la staff, un avertisment
**„Vehiculul nu mai are actele în termen"**. Comanda **nu** este anulată și
nicio stare nu se schimbă — alocă alt vehicul și avertismentul dispare.

**[e-mail]** Transportatorul primește „Vehiculul alocat nu mai are actele în
termen". În coadă: `order_vehicle_noncompliant`.

---

## Ce nu poți verifica din browser

| Ce | De ce | Unde se verifică |
|---|---|---|
| Închiderea automată la 48 de ore | Jobul rulează la :40 în fiecare oră | `/admin/notificari` → sănătatea joburilor → `hourly-order-autocomplete`. Sau pasul 9. |
| Verificarea nocturnă a vehiculelor | Rulează la 02:30 | Același ecran → `nightly-order-vehicle-check`. Sau pasul 14. |
| Că baza refuză o tranziție, nu doar pagina | Pagina ascunde butonul înainte să apuci | `supabase/tests/rls_test.sql`, blocul `ORD`: fiecare tranziție permisă și fiecare refuzată, pe fiecare rol. `pnpm db:test`. |
| Că dovezile sunt cu adevărat imuabile | Nu există buton care să încerce | Același bloc: UPDATE și DELETE pe `order_evidence`, ca fiecare rol. |
| Livrarea propriu-zisă a e-mailurilor | Furnizorul nu e configurat | `docs/configurare-externa.md` |

---

## Dacă ceva nu merge

Fiecare refuz al bazei de date este o propoziție în română care spune ce să
faci mai departe, și este afișată exact așa cum a scris-o baza de date. Dacă
vezi o eroare generică în loc de o propoziție, aia e eroarea — spune-mi-o.

Două lucruri sunt mai grave decât un buton care nu merge, și dacă le vezi
oprește-te la ele:

1. **Un șofer care vede o comandă pe care nu i-ai alocat-o.**
2. **Codul de confirmare vizibil altcuiva decât clientului.**
