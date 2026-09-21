# Faza 2 — script de verificare a fluxului ofertei

Ce urmează nu este o listă de lucruri care „ar trebui să meargă". Este exact
ce trebuie apăsat, în ce ordine, și ce trebuie să apară după fiecare apăsare.
Durează în jur de zece minute cu două ferestre deschise.

Pașii marcați **[e-mail]** depind de furnizorul de e-mail (Resend) și de SMTP
în Supabase Auth. Până când astea sunt configurate — vezi
`docs/configurare-externa.md` — mesajele se adună corect în
`notification_outbox` și nu pleacă. Pasul se verifică atunci în
`/admin/notificari`, nu în inbox.

---

## Ce îți trebuie înainte să începi

Două conturi, în două ferestre separate (una normală, una incognito, ca să nu
se calce pe sesiune):

| Cont | Ce trebuie să aibă |
|---|---|
| **Client** | Un cont — firmă de expediții sau persoană fizică — cu **o cerere publicată pe panou** (stare „Pe panou"). O persoană fizică are nevoie și de **număr de telefon confirmat**, altfel acceptarea este refuzată. |
| **Transportator** | Un cont de firmă cu `company_type` `transport` sau `both`, **verificată**, **nesuspendată**, cu **cel puțin un vehicul activ cu ITP, RCA și copie conformă în termen**. |

Opțional, pentru pașii 9 și 10: un cont din `platform_staff`.

Dacă nu ai conturile astea, fă-le întâi — restul scriptului nu are sens fără
ele, iar baza de date refuză corect fiecare lipsă în parte, ceea ce este
tocmai ce vrei să nu descoperi la mijlocul testului.

---

## Scriptul

### 1. Transportatorul găsește cererea și trimite oferta — 2 min

1. În fereastra **transportatorului**, deschide `/cereri`.
2. Deschide cererea clientului („Vezi cererea").
3. În coloana din dreapta trebuie să fie butonul **„Trimite ofertă"**.
   Formularul este închis — asta e corect.
4. Apasă-l. Completează:
   - **Preț**: `2400`, moneda `RON`
   - **Ridic pe**: o dată din fereastra cererii sau după ea
   - **Livrez pe**: o zi după ridicare
   - **Vehiculul**: unul din listă (apar numai cele cu actele în termen)
   - **Ce include prețul**: „Asigurare CMR inclusă. Taxele de drum nu sunt incluse."
   - **Valabilitate**: lasă 48 de ore
5. **Trimite oferta.**

**Trebuie să vezi:** „Oferta a fost trimisă. Clientul a fost anunțat." și un
link către ofertele trimise.

**[e-mail]** Clientul primește „Ai primit o ofertă nouă". Fără furnizor
configurat: `/admin/notificari` arată un rând `offer_received` în coadă.

### 2. A doua ofertă pe aceeași cerere este refuzată — 30 sec

Reîncarcă pagina cererii, tot ca transportator.

**Trebuie să vezi:** în locul butonului, „Ai deja o ofertă în așteptare pe
cererea asta." și un link „Vezi oferta".

> Regula este un index unic parțial, nu o verificare în pagină. Dacă trimiți
> aceeași ofertă din două tab-uri deodată, a doua tot pică — asta e diferența.

### 3. Clientul o vede și o compară — 1 min

1. În fereastra **clientului**, deschide `/cont/cereri`.
2. Pe cardul cererii trebuie să fie butonul **„Oferte primite (1)"**. Apasă-l.
3. Pe pagină trebuie să vezi: numele firmei, insigna **„Firmă verificată"** cu
   data verificării, link către profilul public, tipul vehiculului, prețul,
   datele estimate, condițiile și un **timp rămas** care scade.
4. Dacă ai două oferte, apasă **„Compară"** pe un ecran lat — apare un tabel cu
   ele una lângă alta. Pe telefon butonul nu există: cinci coloane la 390px nu
   sunt o comparație.

### 4. Clientul cere lămuriri, cu un număr de telefon în mesaj — 2 min

Ăsta e pasul de care depinde toată încrederea în platformă. Fă-l încet.

1. Apasă **„Cere lămuriri"** pe ofertă.
2. Scrie exact: `Puteți ridica marți? Sunați-mă la 0722 33 44 55 sau pe ion@exemplu.ro`
3. Trimite.

**Trebuie să vezi:** textul afișat cu numărul și adresa înlocuite cu
`[contact ascuns până la confirmarea comenzii]`, și o notă care explică de ce.

Repetă cu trei variante, ca să vezi că nu e o singură expresie regulată
norocoasă:

| Ce scrii | Ce trebuie să se întâmple |
|---|---|
| `Sunați la zero șapte doi doi trei trei patru patru cinci cinci` | ascuns |
| `scrie-mi la ion [at] exemplu punct ro` | ascuns |
| `+40 722 334 455` | ascuns |
| `Puteți face 2200 lei?` | **rămâne întreg** — un preț nu e un număr de telefon |

> Mascarea se face **la inserare**. Textul nemascat nu ajunge niciodată
> într-un rând, deci nici într-un backup și nici într-o replică. Nu poate fi
> „descoperit" mai târziu, pentru că nu există.

**[e-mail]** Transportatorul primește „Întrebare nouă pe oferta ta".

### 5. Transportatorul răspunde — 1 min

1. În fereastra **transportatorului**, deschide `/cont/oferte`.
2. Sub ofertă este discuția, cu întrebarea clientului — mascată.
3. Scrie „Da, marți dimineață." și trimite.

**Trebuie să vezi:** mesajul apare. Nu există niciun buton de editare — un
mesaj trimis nu se mai schimbă, și nu pentru că ecranul nu oferă butonul, ci
pentru că politica de update nu mai există.

### 6. Clientul acceptă — 1 min

1. În fereastra **clientului**, pe pagina cu ofertele, apasă **„Acceptă"**.
2. Confirmarea trebuie să rezume prețul, datele și condițiile, și să spună
   limpede: **„Celelalte oferte vor fi refuzate automat."**
3. Apasă **„Da, accept"**.

**Trebuie să vezi:** „Ai ales transportatorul", comanda creată, pașii următori,
și — dacă mai erau oferte — celelalte trecute pe „Refuzată" fără să fi apăsat
nimic pe ele.

**[e-mail]** Transportatorul ales primește „Oferta ta a fost acceptată"; ceilalți
primesc „Oferta ta a fost refuzată".

> Dacă clientul e persoană fizică fără telefon confirmat, aici primești o
> propoziție în română care spune exact ce să faci. Nu e o eroare — e regula.

### 7. Amândoi își văd datele de contact, gratis — 1 min

1. **Clientul**: apasă **„Vezi datele de contact"**. Apare firma
   transportatorului, cu telefon și e-mail, și nota „Nu consumă din abonament:
   aveți o comandă confirmată."
2. **Transportatorul**: pe `/cont/oferte`, același buton. Apare contactul
   clientului, cu aceeași notă.
3. Verifică în `/cont/abonament` că numărul de contacte folosite luna asta
   **nu a crescut**.

> Deschiderea e înregistrată în `contact_reveals` cu motivul
> „comandă confirmată", deci întrebarea „cine mi-a văzut numărul și când"
> are în continuare răspuns. Doar că nu se taxează.

### 8. Comanda — 30 sec

Din starea de acceptare, apasă **„Vezi comanda"**.

**Trebuie să vezi:** `/cont/transporturi/<id>` cu traseul, prețul convenit,
termenul de plată, vehiculul, data confirmării și starea. Plus o secțiune care
spune limpede că încărcarea, dovada de livrare și evaluările vin în etapa
următoare — nu căsuțe goale care promit ceva ce nu există.

### 9. Ecranul echipei — 1 min *(cont de staff)*

1. Deschide `/admin/oferte`.
2. Filtrează după stare `Acceptată` — URL-ul trebuie să devină `?stare=accepted`.
3. Filtrează după firmă din lista derulantă (arată câte oferte are fiecare).
4. Apasă **„Deschide"** pe o ofertă.

**Trebuie să vezi:** termenii, ambele părți, cererea, comanda, discuția — și
propoziția „Echipa nu poate schimba o ofertă." Nu există niciun buton de
salvare, pentru că nu există nicio politică prin care echipa să scrie în
`offers`.

### 10. Ascunderea unui mesaj, cu motiv — 1 min *(cont de staff)*

1. Pe discuția ofertei, apasă **„Ascunde mesajul"**.
2. Scrie motivul: „Date de contact schimbate în afara platformei".
3. Confirmă.
4. Deschide `/admin/jurnal?actiune=message.hidden`.

**Trebuie să vezi:** rândul `message.hidden`, cu motivul și cu numele tău.
Cele două părți văd în locul mesajului „Mesaj ascuns de echipa platformei." —
textul rămâne în rând, pentru că o decizie de moderare pentru care cineva
răspunde mai târziu nu valorează nimic dacă lucrul despre care s-a decis a
dispărut.

---

## Ce nu poți verifica din browser

| Ce | De ce | Unde se verifică |
|---|---|---|
| Expirarea ofertei | Jobul rulează la :20 în fiecare oră | `/admin/notificari` → sănătatea joburilor → `hourly-offer-expiry`. Sau `select public.expire_stale_offers();` ca `service_role`. |
| Gruparea ofertelor într-un singur e-mail | Fereastra e de 15 minute | Trimite patru oferte în zece minute și numără rândurile `offer_received` din `notification_outbox`: trebuie să fie **unul**. |
| Livrarea propriu-zisă a e-mailurilor | Furnizorul nu e configurat | `docs/configurare-externa.md` |

---

## Dacă ceva nu merge

Fiecare refuz al bazei de date este o propoziție în română care spune ce să
faci mai departe, și este afișată exact așa cum a scris-o baza de date. Dacă
vezi o eroare generică în loc de o propoziție, aia e eroarea — spune-mi-o.
