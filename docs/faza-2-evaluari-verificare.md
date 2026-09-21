# Faza 2 — script de verificare a evaluărilor și a reputației

Ce urmează nu este o listă de lucruri care „ar trebui să meargă". Este exact
ce trebuie apăsat, în ce ordine, și ce trebuie să apară după fiecare apăsare.
Durează în jur de cincisprezece minute cu două ferestre deschise.

Continuă `docs/faza-2-comanda-verificare.md`, care se oprește la comanda
finalizată. Aici începe de la ea.

Pașii marcați **[e-mail]** depind de furnizorul de e-mail (Resend). Până când
este configurat — vezi `docs/configurare-externa.md` — mesajele se adună
corect în `notification_outbox` și nu pleacă. Pasul se verifică atunci în
`/admin/notificari` → coada, nu în inbox. **Niciun pas nu depinde de un e-mail
ca să meargă mai departe.**

---

## Ce îți trebuie înainte să începi

| Cont | Ce trebuie să aibă |
|---|---|
| **Client** | Contul care a dus o comandă până la „Finalizată" în scriptul comenzii. Firmă sau persoană fizică — ambele evaluează. |
| **Transportator** | Firma care a făcut transportul, cu **profil public activat** (`/cont/firma` → Profil public). Fără el, profilul este 404 și pașii 6–8 nu au unde să se vadă. |
| **Staff** *(pașii 9–11)* | Un cont din `platform_staff`. |

Îți mai trebuie **o comandă finalizată în ultimele 14 zile**. Deschide
`/cont/evaluari` cu contul clientului: dacă fila **„De dat"** este goală, nu ai
ce verifica — fă întâi scriptul comenzii.

> **Despre numere.** Media nu apare pe profil sub trei evaluări. Dacă vrei să
> vezi blocul complet, ai nevoie de trei comenzi finalizate și evaluate, nu de
> una. Pasul 7 spune exact ce se vede până atunci.

---

## Scriptul

### 1. Ce așteaptă de la tine — 1 min

1. **Client** → `/cont/evaluari`.
2. Fila **„De dat"** are comanda, cu numărul ei în dreptul filei.

**Trebuie să vezi:** traseul, firma, și rândul **„Poți evalua până la [dată] —
mai ai [n] zile"**. Data este la 14 zile de la finalizarea comenzii.

**Verifică și pe pagina principală:** `/cont` are widgetul **„Evaluări"** cu
aceeași comandă și cu termenul cel mai apropiat. Dacă nu ai nimic de evaluat,
widgetul **nu apare deloc** — asta e intenționat, nu o lipsă.

### 2. Nota, cu tot ce ține de ea — 3 min

1. Apasă **„Evaluează"**. Ajungi pe pagina comenzii, la cardul de evaluare.
2. **Nota generală**: apasă a patra stea. Sub rândul de stele trebuie să
   apară cuvântul **„Bine"**.
3. Încearcă cu tastatura: dă Tab până pe stele, apoi săgeți stânga-dreapta.
   Nota se schimbă, iar cuvântul de lângă ea la fel.
4. Sub **„Pe puncte"**, dă note la **Punctualitate**, **Comunicare** și
   **Grija față de vehicul**. Lasă una goală intenționat — este opțională.
5. Scrie câteva cuvinte. Sub casetă scade contorul de caractere.
6. Apasă **„Vezi cum arată"**.

**Trebuie să vezi:** panoul **„Așa va apărea pe profil"**, cu stelele și
textul tău, exact cum le va citi altcineva.

7. Apasă **„Trimite evaluarea"**.

**Trebuie să vezi:** **„Evaluarea a fost trimisă. Mulțumim."**

**[e-mail]** Transportatorul primește „Ați primit o evaluare după un
transport". În coadă: `rating_received`.

> **Ce întreabă fiecare parte.** Clientul este întrebat despre *grija față de
> vehicul*. Transportatorul, când evaluează un client firmă, este întrebat
> despre *corectitudinea informațiilor* și *disponibilitatea la predare*.
> Nimeni nu este întrebat despre sine.

### 3. Numărul de telefon care nu trece — 1 min

Pe altă comandă de evaluat, scrie în comentariu: `Sunați-mă la 0722123456`.
Trimite.

**Trebuie să vezi:** în `/cont/evaluari` → **„Date"**, comentariul are în
locul numărului **„[contact ascuns până la confirmarea comenzii]"**. Numărul
nu este ascuns la afișare — nu a fost niciodată scris în rând.

### 4. O singură corectură — 2 min

1. **Client** → `/cont/evaluari?cutie=date`.
2. Pe evaluarea de la pasul 2, apasă **„Corectează evaluarea"**.
3. Schimbă nota și salvează.

**Trebuie să vezi:** **„Evaluarea a fost corectată."**, iar pe evaluare apare
**„Corectată"**.

4. Reîncarcă pagina și caută din nou butonul.

**Trebuie să vezi:** nu mai există. O singură corectură, și doar în primele
48 de ore.

> Dacă vrei să verifici și capătul celălalt al ferestrei, e nevoie de SQL:
> `update public.ratings set created_at = now() - interval '49 hours' where id = '…';`
> Butonul dispare la reîncărcare.

### 5. Răspunsul firmei — 2 min

1. **Transportator** → `/cont/evaluari?cutie=primite`.
2. Evaluarea este acolo, cu numele clientului și cu data.
3. Apasă **„Răspunde public"**, scrie două rânduri, publică.

**Trebuie să vezi:** **„Răspunsul a fost publicat."**, iar răspunsul apare sub
evaluare, cu o linie verticală lângă el.

4. Reîncarcă. Butonul nu mai există.

**Încearcă și ce nu se poate:** pe aceeași pagină nu există niciun buton
„Ascunde evaluarea". O firmă nu își ascunde singură evaluările.

**[e-mail]** Clientul primește „S-a răspuns la evaluarea dumneavoastră". În
coadă: `rating_reply`.

### 6. Profilul public, cu o evaluare — 1 min

Deschide `/firme/[slug-ul-firmei]`, fără să fii autentificat (fereastră
incognito).

**Trebuie să vezi:** secțiunea **„Reputație"**, și în ea **„Evaluări
insuficiente"** cu propoziția care spune de ce: o singură evaluare nu este o
medie. **Nu** o cifră mică.

Mai jos, sub **„Ultimele evaluări"**, evaluarea ta, cu răspunsul firmei.

### 7. Ce se vede până la a treia evaluare — 1 min

Pe același profil, uită-te la celelalte rânduri:

| Rând | Ce scrie acum | De ce |
|---|---|---|
| Transporturi duse la capăt | un număr | se numără de la prima comandă |
| Punctualitate | **„Prea puține date"** | trebuie 3 comenzi cu date estimate în ofertă |
| Rată de răspuns | **„Prea puține date"** | trebuie 5 cereri potrivite în ultimele 90 de zile |
| Dispute | „niciuna în ultimul an" | sau numărul lor |
| Verificată din | data verificării | există de la Faza 1 |

Apasă **„Cum calculăm"**.

**Trebuie să vezi:** cinci propoziții, câte una pentru fiecare număr, și
ultima care spune limpede că nimic nu se completează de mână și nimic nu se
poate cumpăra.

### 8. Media apare de la a treia — 3 min *(cere trei comenzi)*

Repetă pașii 1–2 pentru încă două comenzi finalizate ale aceleiași firme.

**Trebuie să vezi:** pe profil, în locul propoziției, cifra mare cu stelele
lângă ea și **„din 3 evaluări"**.

**Verifică și pe cardul de ofertă:** ca **client**, pe o cerere cu oferte
primite, sub numele firmei apare media, numărul de transporturi și, dacă
există, procentul de punctualitate. În lista derulantă de sortare apare
**„Cea mai bună evaluare"**. Firmele fără destule evaluări nu ajung nici prima,
nici ultima — rămân după cele evaluate, în ordinea prețului.

### 9. Echipa ascunde una, cu motiv — 2 min *(cont de staff)*

1. **Staff** → `/admin/evaluari`.
2. Filtrează după nota 1, sau după firmă. URL-ul poartă filtrul.
3. Pe o evaluare, apasă **„Ascunde evaluarea"**.
4. Trimite fără motiv: formularul refuză.
5. Scrie „Limbaj injurios" și confirmă.

**Trebuie să vezi:** **„Evaluarea a fost ascunsă."**, insigna **„Ascunsă"** pe
rând, și motivul dedesubt.

**Verifică imediat pe profilul public:** evaluarea nu mai apare, iar media
s-a recalculat fără ea. Dacă firma avea exact trei, acum scrie din nou
„Evaluări insuficiente".

**Verifică și în jurnal:** `/admin/jurnal?actiune=rating.hidden` are rândul cu
motivul și cu numele tău.

**Și ce nu se poate:** pe ecranul echipei nu există niciun câmp în care să
scrii peste ce a scris clientul. Echipa ascunde; nu rescrie.

### 10. Și o repune — 1 min *(cont de staff)*

1. Bifează **„Doar ascunse"**, filtrează.
2. **„Repune evaluarea"**, cu motiv.

**Trebuie să vezi:** evaluarea înapoi pe profil, media la loc.

### 11. Sesizarea unei evaluări — 1 min

Ca **transportator**, pe `/cont/evaluari?cutie=primite`, apasă **„Sesizează
evaluarea"**, scrie de ce, trimite.

**Trebuie să vezi:** **„Am primit sesizarea. Ne uităm peste ea."** și, în
`/admin/sesizari`, un rând nou de tip **evaluare**, legat de evaluare și de
comandă.

Textul de deasupra casetei spune că nu ascundem o evaluare pentru că este
mică. Este acolo intenționat.

---

## Ce nu poți verifica din browser

| Ce | De ce | Unde se verifică |
|---|---|---|
| Mementoul cu două zile înainte de termen | Jobul rulează la 08:20 | `/admin/notificari` → `nightly-rating-reminders`. Sau, ca `service_role`: `select public.remind_pending_ratings();` pe o comandă închisă acum 12 zile. |
| Recalcularea nocturnă | Rulează la 03:10 | Același ecran → `nightly-reputation`. Sau `select public.recompute_company_reputation('…');` |
| Rata de răspuns | Are nevoie de 5 cereri potrivite în 90 de zile | `supabase/tests/rls_test.sql`, blocul `ERV`. `pnpm db:test`. |
| Punctualitatea, cu toleranța ei | Are nevoie de 3 comenzi cu date estimate | Același bloc: șase verificări, inclusiv ce se întâmplă la toleranță zero. |
| Că fereastra de 14 zile chiar se închide | Nu poți aștepta 15 zile | Același bloc, cu `closed_at` mutat. |
| Livrarea propriu-zisă a e-mailurilor | Furnizorul nu e configurat | `docs/configurare-externa.md` |

---

## Dacă ceva nu merge

Fiecare refuz al bazei de date este o propoziție în română care spune ce să
faci mai departe, și este afișată exact așa cum a scris-o baza. Dacă vezi o
eroare generică în loc de o propoziție, aia e eroarea — spune-mi-o.

Trei lucruri sunt mai grave decât un buton care nu merge:

1. **O medie afișată sub trei evaluări.**
2. **Un număr de telefon rămas într-un comentariu public.**
3. **O firmă care poate ascunde o evaluare despre ea.**
