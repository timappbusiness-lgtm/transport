# Stadiul platformei Coridor

Audit făcut pe `main` la commit `189b621`, 18 septembrie 2026.
Metoda și limitele verificării sunt în anexa de la final — citește-o înainte
să te bazezi pe vreun rând din tabele.

> **Ce s-a schimbat de la audit.** Documentul rămâne așa cum a fost scris, la
> data lui — un audit rescris pe măsură ce se repară nu mai e un audit. Ce a
> fost livrat între timp, cu constatarea pe care o închide:
>
> | Livrat | Constatarea din document |
> |---|---|
> | Dispecerul de notificări și joburile programate (`20260918160000`) | §3, „niciun e-mail nu pleacă" |
> | Ștergerea contului și a firmei, exportul datelor (`20260918180000`) | §5 GDPR, „nu există flux de ștergere a contului" |
> | Deblocarea Fazei 1 (`20260920100000`) | §3 „matching și alerte", §5 „cota de contacte", și constatarea că nimic nu adună numerele criteriului de ieșire |
> | Restul Fazei 1 în cod (`20260921100000`) | §3 alerte pe căutări salvate, ocolul folosit la potrivire, sesizări, jurnal, echipă |
> | Fluxul ofertei (`20260922100000`) | „Nu există ofertă în platformă" — al doilea lucru care bloca un pilot |
> | Comanda, dovada de livrare și disputele (`20260923100100`) | §3 comandă și livrare, „regulile sunt în bază, dar nu au interfață" |
> | Evaluările și reputația calculată (`20260924100000`) | §3 evaluări, „tabela există, ecranul nu"; și profilul care arăta o cifră fără nimic în spatele ei |
> | Mesageria generală și moderarea anunțurilor (`20260925100000`) | §3 mesagerie, „conversațiile există în bază, dar nu are unde să le citească nimeni"; și moderarea din Faza 10, care nu avea niciun ecran |
>
> **Cu asta, Faza 2 este încheiată în cod.** Ofertă, comandă, dovadă de
> livrare, evaluări, mesagerie, moderare — toate au ecrane, reguli în
> Postgres și verificări. Ce rămâne deschis în Faza 2 nu mai este cod: este
> configurarea din afara depozitului (furnizorul de e-mail, SMTP în Supabase
> Auth, datele legale ale operatorului, prețurile indicative, verificarea
> juridică) și cele două decizii — procesatorul de plăți și proiectul
> Supabase de producție. Lista, cu un responsabil pe fiecare rând, este în
> `docs/faza-1-checklist.md`; pașii în `docs/configurare-externa.md`.
>
> Două lucruri din document au fost între timp depășite de cod și se
> citesc greșit dacă nu se spune: livrarea notificărilor **nu** mai merge
> prin n8n (cele patru workflow-uri nu au fost construite niciodată; drena
> este funcția edge `outbox-dispatcher`, din `20260918160000`), iar
> publicarea unei cereri de către o persoană fizică **nu** mai cere un
> telefon confirmat prin SMS — cere o adresă de e-mail confirmată și un
> număr în profil, din `20260920100000`.
>
> Restul constatărilor stau în picioare, inclusiv retenția pentru
> `contact_reveals` și paginile juridice.

---

## Pentru client — o pagină

**Unde suntem.** Platforma are un schelet solid și complet funcțional pentru
prima jumătate a fluxului: o firmă se înscrie, își încarcă actele, este
verificată de noi, își adaugă mașinile cu ITP, RCA și copie conformă, și
publică trasee pe tur și pe retur. Un client — firmă sau persoană fizică —
publică o cerere de transport și o vede pe panoul public. Transportatorii văd
cererile și pot rezerva locuri pe traseele publicate.

**Ce nu merge încă.** A doua jumătate a fluxului nu există ca ecrane:
**ofertele, comanda, dovada de livrare și evaluările**. Regulile lor sunt deja
scrise în baza de date și protejate, dar nu au interfață, deci astăzi o
înțelegere se încheie tot pe telefon. La fel, **niciun e-mail și niciun SMS nu
pleacă**: mesajele se adună corect într-o coadă, dar piesa care le trimite nu e
construită încă.

**Cât e gata.** Aproximativ **50% din MVP-ul definit în roadmap** (23,5 din 48
de elemente — calculul e în document, element cu element). Fazele 1, 2 și 3 —
verificare, cereri, tur/retur — sunt practic încheiate. Fazele 5–10 — oferte,
comandă, livrare, evaluări, plăți recurente, moderare — sunt în mare parte
nefăcute.

**Ce blochează un pilot.** Trei lucruri, în ordinea în care dor:

1. **Nu pleacă nicio notificare.** Fără asta, un transportator nu află că a
   apărut o cerere pe traseul lui, iar o firmă nu află că i-a expirat RCA-ul
   până nu intră singură în cont.
2. **Nu există ofertă în platformă.** Un transportator care vede o cerere nu
   poate răspunde decât sunând. Asta e exact lucrul pe care platforma trebuia
   să-l înlocuiască.
3. **Nu există comandă și dovadă de livrare.** Fără ele nu se poate evalua
   nimeni, deci nu se construiește reputația care e diferențiatorul nostru.

**Ce urmează, în ordine.** Livrarea notificărilor → ofertele → comanda →
dovada de livrare → evaluările. În paralel, se pot începe înscrierile reale de
transportatori: partea de verificare e gata și funcționează.

**Ce e nevoie de la voi.** Patru decizii care blochează munca și pe care nu le
putem lua noi: cine aprobă documentele și în cât timp, ce furnizor de SMS și ce
server de e-mail folosim, ce procesator de plăți, și textele juridice (termeni,
confidențialitate, contract). Detaliile sunt în secțiunea 6.

---

## 1. Rezumat

Platforma acoperă solid prima jumătate a fluxului MVP și aproape deloc a doua.
Verificarea firmelor, documentele cu expirări și suspendare automată, flota cu
acte per vehicul, cererile de transport și traseele tur/retur sunt construite,
protejate în Postgres și acoperite de teste. Ofertele, comanda, dovada de
livrare, evaluările, mesageria și moderarea există ca tabele, funcții și reguli
în baza de date, dar **nu au niciun ecran** — sunt marcate `false` în
`src/lib/features.ts`, deci nici măcar nu apar în meniu.

Estimare MVP: **≈50%** (23,5 din 48 de elemente din `docs/04-roadmap.md`,
punctate 1 / 0,5 / 0 în secțiunea 3).

Trei lucruri blochează un pilot real:

1. **Livrarea notificărilor nu există.** `notification_outbox` se umple corect
   — expirări, suspendări, alerte pe trasee, push — dar `n8n/README.md` descrie
   patru workflow-uri care **nu sunt construite**. Nimic nu golește coada.
2. **Nu există flux de ofertă.** Fără el platforma nu înlocuiește telefonul,
   ceea ce e chiar propunerea de valoare.
3. **Nu există comandă și dovadă de livrare**, deci nici evaluări, deci nu se
   formează reputația pe care se sprijină diferențierea prin verificare.

Restul — abonamente cu plată recurentă, panoul de moderare, mesageria — sunt
importante, dar un pilot cu 20 de transportatori poate porni fără ele.

---

## 2. Cele șase cerințe ale clientului

| # | Cerință | Ce există | Unde se vede | Ce lipsește | Status |
|---|---|---|---|---|---|
| 1 | Casele de expediții publică curse | Formular în 4 pași, publicare prin `create_cargo_request()`, panou public cu filtre, „cursele mele" | `/cerere/noua`, `/cereri`, `/cont/cereri` | Nimic pentru cerința ca atare. Cursa nu poate primi ofertă în platformă (cerință separată, faza 5) | **complet, testat** |
| 2 | Mașini pe tur | Publicare traseu cu direcție `tur`, waypoints, tipuri acceptate, preț orientativ, locuri | `/cont/trasee/nou?directie=tur`, `/trasee`, `/cont/trasee` | Nimic | **complet, testat** |
| 3 | Mașini pe retur | Aceeași masă, `direction = 'retur'`; duplicare tur→retur; persoanele fizice publică pe panoul de retur | `/cont/trasee/nou?directie=retur`, `/trasee` | Toleranța de ocolire (`max_detour_km`) există în schemă dar nu e folosită de nicio potrivire afișată | **complet, testat** |
| 4 | Licență de transport / casă de expediții încărcată la înscriere | `document_requirements` cere `licenta_comunitara` (transport) și `certificat_casa_expeditii` (expediții), ambele blocante; încărcare, citire AI cu `parse-document`, aprobare umană | `/cont/firma/documente`, `/admin/documente` | Nimic pentru cerință. Vezi riscul „aprobarea documentelor" în secțiunea 5 | **complet, testat** |
| 5 | Expirarea asigurării urmărită, cont suspendat până la reînnoire | `run_compliance_sweep()` nocturn la 02:00 + la fiecare recenzie; suspendă firma, trece anunțurile în `suspended` cu statusul anterior păstrat, reactivează automat | `/cont/firma` (banner), `/admin/firme` | **Notificarea nu ajunge la nimeni** — rândul se scrie în `notification_outbox` și rămâne acolo | **parțial** |
| 6 | ITP, asigurare și copie conformă per vehicul | Cele trei sunt cerințe de scop `vehicle`, toate blocante; un vehicul cu act expirat iese de pe panou fără să cadă toată flota | `/cont/firma/flota`, `/cont/firma/flota/[id]` | Notificarea de expirare, ca la punctul 5 | **parțial** |

Cerințele 5 și 6 sunt **parțiale dintr-un singur motiv comun**: regula se aplică
corect în bază, dar omul nu află. Se rezolvă o dată, pentru amândouă.

---

## 3. Arii funcționale

Punctajul din coloana finală e cel folosit la calculul de 50%: **1** = complet
și accesibil, **0,5** = parțial, **0** = lipsă. Punctele sunt pe elementele
numite în `docs/04-roadmap.md`, nu pe arii — o arie mare valorează mai multe
puncte.

| Arie | Status | Ce lipsește concret | Unde se lucrează | Efort | Impact |
|---|---|---|---|---|---|
| **Conturi și roluri** | complet, testat | — | `src/lib/navigation.ts`, `profiles`, `company_members` | — | — |
| **Verificare firme** | complet, testat | — | `/admin/documente`, `review_company()` | — | — |
| **Documente și expirări** | parțial | Memento-urile la 30/14/7/1 zile se scriu în coadă, nu pleacă | `n8n/`, `queue_expiry_reminders()` | mediu | **blocant** |
| **Flotă** | complet, testat | — | `/cont/firma/flota`, `vehicles`, `vehicle_routes` | — | — |
| **Cereri** | complet, testat | `carrier_selected` și `delivered` sunt în enum dar inaccesibile (depind de oferte/comandă) | `/cerere/noua`, `/cereri` | — | — |
| **Trasee tur/retur** | complet, testat | — | `/cont/trasee`, `/trasee` | — | — |
| **Rezervări** | implementat, neverificat pe producție | Expirarea rezervării e programată în `pg_cron`; nu am putut confirma că jobul rulează pe proiectul real | `confirm_departure_booking()`, `queue_booking_expiry_alerts()` | mic | important |
| **Matching și alerte** | parțial | (a) mesajul „N transportatori verificați circulă pe ruta asta" **nu e afișat nicăieri**; (b) alertele pe trasee salvate se pun la coadă și nu pleacă | `src/lib/matching.ts`, `company_matches_request()`, `n8n/` | mediu | **blocant** |
| **Oferte** | specificat doar | Tot fluxul de interfață: trimitere, acceptare, respingere, retragere, cerere de lămuriri | `offers`, `accept_offer()`, `FEATURES.offers` | mare | **blocant** |
| **Comenzi și execuție** | specificat doar | Toate tranzițiile de status prin RPC, anularea, reclamațiile (`disputed`) | `transports`, `create_order()`, `FEATURES.transports` | mare | **blocant** |
| **Dovadă de livrare** | lipsă | Tot: poze la preluare, raport de stare, documente, poze la livrare, semnătură, incidente | nou; `transports` | mare | **blocant** |
| **Evaluări** | specificat doar | Formularul de evaluare; punctualitate, rată de răspuns, reclamații rezolvate pe profil | `ratings`, `refresh_company_rating()`, `/firme/[slug]` | mediu | important |
| **Mesagerie** | specificat doar | Tot; plus mascarea numerelor de telefon și a adreselor, care **nu e implementată nicăieri** | `conversations`, `messages`, `FEATURES.messages` | mare | important |
| **Notificări** | parțial | Push funcționează cap-coadă (lipsesc doar cheile VAPID). **E-mail, SMS și WhatsApp nu pleacă deloc** | `n8n/`, `notification_outbox` | mediu | **blocant** |
| **Abonamente și cote** | parțial | Plată recurentă, card, factură automată, memento de reînnoire, suspendare pentru neplată, coduri promo, istoric. Azi: cerere → activare manuală de către echipă | `/abonamente`, `/admin/abonamente`, `subscriptions` | mare | opțional la pilot |
| **Panou admin** | parțial | Din faza 10 nu există nimic: moderarea anunțurilor, conversații raportate, reclamații, rambursări, promovări, export. Există în schimb 11 ecrane de administrare pentru zonele construite | `/admin/*` | mediu | important |
| **Jurnal de audit** | complet, testat | Nu are ecran de citire; se interoghează din bază | `audit_log`, `write_audit()` | mic | opțional |
| **Pagini publice și SEO** | complet, testat | Cele 161 de pagini SEO sunt **nepublicate** — intenționat, așteaptă aprobare redacțională | `/transport-auto`, `/admin/pagini` | mic | opțional |
| **Plăți și facturare** | lipsă | Tot. Azi: factură emisă manual, plată prin transfer bancar, scris explicit în interfață | — | mare | opțional la pilot |

### Cum am calculat cele 50%

Pe cele 10 faze din `docs/04-roadmap.md`, element cu element:

| Faza | Punctaj | Din |
|---|---|---|
| 1. Verificare | 8,0 | 9 |
| 2. Cereri | 4,5 | 5 |
| 3. Tur/retur | 4,0 | 4 |
| 4. Matching | 1,5 | 3 |
| 5. Oferte | 0,75 | 5 |
| 6. Comandă | 1,5 | 4 |
| 7. Dovadă de livrare | 0 | 3 |
| 8. Evaluări | 1,75 | 3 |
| 9. Abonamente | 1,5 | 7 |
| 10. Admin | 0 | 5 |
| **Total** | **23,5** | **48** |

**23,5 / 48 = 49%.** Nu e o măsură de efort rămas — fazele 5–7 sunt mai grele
decât cele terminate, deci jumătatea care lipsește costă mai mult decât cea
făcută.

---

## 4. Ce mai avem de implementat, în ordinea lansării

Fiecare element e scris ca sarcină gata de dat ca prompt. Dependențele sunt
explicite: nimic din listă nu poate începe înaintea a ceea ce îi precede în
propriul lanț.

### 1. Livrarea notificărilor *(nicio dependență — începe primul)*
> Construiește cele patru workflow-uri n8n descrise în `n8n/README.md`, în
> primul rând `outbox-dispatcher`: revendică loturi din `notification_outbox`
> cu `for update skip locked`, trimite pe canalul rândului, marchează
> `sent`/`failed` cu backoff, și apelează funcția `push-dispatcher` pentru
> canalul `push`. Exportă workflow-urile ca JSON în `n8n/` ca să fie
> versionate. Adaugă un ecran de stare în `/admin` care arată câte rânduri sunt
> `queued`, `failed` și cel mai vechi `queued`.

**De ce primul:** patru funcționalități deja construite (expirări, suspendări,
alerte pe trasee, push) sunt mute până când există. E singurul element din
listă care face mai multe lucruri gata să funcționeze fără să scrie o linie de
produs nou.

### 2. Mesajul „transportatori compatibili" *(depinde de nimic; folosește `company_matches_request()`, deja scris)*
> După publicarea unei cereri, arată clientului câți transportatori verificați
> au acoperire compatibilă cu ruta, datele și tipul de vehicul, folosind
> `company_matches_request()`. Fără nume, doar numărul. Dacă numărul e zero,
> spune asta cinstit și propune publicarea oricum.

### 3. Fluxul de ofertă *(depinde de 1, pentru notificarea ofertei)*
> Pornește `FEATURES.offers`. Construiește `/cont/oferte` pentru ambele părți și
> formularul de ofertă pe `/cereri/[id]`: preț, dată estimată de preluare, dată
> estimată de livrare, condiții, link către profilul transportatorului.
> Acceptare, respingere și retragere prin `accept_offer()`, `reject_offer()`,
> `withdraw_offer()` — deja scrise și testate în bază. Adaugă „cere lămuriri",
> care deschide o conversație fără să accepte.

### 4. Comanda și stările ei *(depinde de 3)*
> Pornește `FEATURES.transports`. Construiește `/cont/transporturi` și pagina
> unei comenzi. Adaugă RPC-urile de tranziție care lipsesc — `order_confirmed` →
> `pickup_scheduled` → `vehicle_picked_up` → `in_transit` → `delivery_scheduled`
> → `vehicle_delivered` → `order_completed` — fiecare mutabilă doar de partea
> îndreptățită, fiecare cu verificare RLS. Anunțul urmează comanda:
> `carrier_selected` → `in_progress` → `delivered`.

### 5. Dovada de livrare *(depinde de 4)*
> Pe pagina comenzii: încărcare de poze la preluare, raport de stare a
> vehiculului, documente de transport, poze la livrare, semnătură sau
> confirmare de la primitor, note de incident. Fiecare cu marcaj de timp și
> autor, niciuna ștergibilă. Bucket separat, cu politică pe părțile comenzii.

### 6. Evaluările *(depinde de 5)*
> După `vehicle_delivered`, fiecare parte-firmă evaluează cealaltă parte-firmă,
> o singură dată. Persoanele fizice nu sunt evaluate — decizie luată în faza 0.
> Pe profilul public adaugă punctualitatea (față de datele estimate din ofertă),
> rata de răspuns și reclamațiile rezolvate, toate calculate, niciuna introdusă.

### 7. Mesageria *(depinde de 3; poate merge în paralel cu 4–6)*
> Pornește `FEATURES.messages`. Conversații pe anunț și pe ofertă, prin aceeași
> poartă de contact. **Maschează automat numerele de telefon și adresele de
> e-mail până la confirmarea comenzii** — nu e construit nicăieri azi și e
> singurul lucru care împiedică ocolirea cotei de contacte prin chat.
> Raportarea unui mesaj abuziv; ascunderea de către echipă, cu rând în audit.

### 8. Panoul de moderare *(depinde de 7 pentru conversațiile raportate)*
> Moderarea cererilor și anunțurilor, conversațiile raportate și mesajele
> ascunse, reclamațiile, promovările acordate, exportul de rapoarte. Plus un
> ecran pentru `set_platform_staff()`, care azi se apelează doar din bază.

### 9. Abonamente cu plată *(independent; se poate amâna după pilot)*
> Plată recurentă cu procesatorul ales, actualizarea cardului, anularea,
> factură pentru fiecare plată, memento înainte de fiecare debitare, suspendare
> pentru neplată, coduri promo, istoric. Până atunci, fluxul manual actual e
> onest și scris ca atare în interfață.

---

## 5. Probleme și riscuri

### Reguli care se pot ocoli

- **Cota de contacte se poate ocoli prin telefon, și asta e în regulă** — dar se
  va putea ocoli și prin chat în clipa în care mesageria pornește, dacă
  mascarea numerelor nu e construită odată cu ea. E scrisă în spec, nu în cod.
  Riscul e că mesageria se livrează fără ea, „temporar".
- **`max_detour_km` există și nu e folosit.** O potrivire pe retur care ignoră
  toleranța de ocolire e o potrivire care ratează exact cazul pentru care a fost
  inventată.

### Teste care lipsesc pe lucruri critice

- **Nimic nu testează că `notification_outbox` se golește**, pentru că nimic
  nu-l golește. Când se construiește dispecerul, primul test ar trebui să fie
  că un rând `queued` ajunge `sent`.
- **Cele 12 suite `*-supabase.spec.ts` sunt sărite** fără `E2E_SUPABASE=1`.
  Acoperă exact fluxurile cu stare — autentificare, publicare, verificare — și
  nu rulează nici local, nici în CI. Sunt scrise, dar nimeni nu le vede trecând.
- **`pg_cron` nu e verificat.** Migrația `20260916120600` programează trei
  joburi, dar dacă extensia nu e activată pe proiect, migrația **doar scrie o
  notiță** și continuă. Nimic nu eșuează, nimic nu rulează. **De verificat
  manual.**

### Texte care promit ce nu facem

Am căutat sistematic; **nu am găsit niciunul.** Linia cu alertele pe WhatsApp,
semnalată în roadmap ca nerezolvată, a fost între timp corectată — nu mai există
nicio mențiune de WhatsApp sau SMS în interfață. Ecranul de abonamente spune
explicit că factura se emite manual și plata se face prin transfer. Cardurile de
pe prima pagină sunt etichetate „Exemplu". Un test (`copy-romanian.test.ts`) și
verificările de conținut păzesc asta mai departe.

### Date de test în producție

**Nu am putut verifica.** Nu am acces la baza de producție din acest mediu.
**De verificat manual** — vezi anexa.

### Variabile de mediu lipsă

| Variabilă | Unde | Fără ea |
|---|---|---|
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Supabase | Push-ul nu pleacă; dispecerul răspunde 503 cu numele variabilei lipsă |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Vercel, Production | Browserul nu se poate abona |
| `IMPORT_IP_SALT` | Supabase | Importul din anunț merge doar cu cont |

Niciuna nu strică nimic prin absență — fiecare degradează curat și spune de ce.

### Performanță

Nemăsurată. Lighthouse nu există în mediul de lucru și nu am putut deschide
producția. `src/app/layout.tsx` are `export const dynamic = 'force-dynamic'`,
ceea ce înseamnă că **nicio pagină nu e statică**, inclusiv cele SEO. E o
decizie amânată intenționat, cu un comentariu în fișier. **De verificat
manual**, și de reevaluat înainte de a publica paginile SEO.

### GDPR

- `contact_reveals` jurnalizează cine a văzut ce contact — bun pentru
  răspundere, dar **nu există nicio politică de retenție**. `purge_audit_log()`
  există pentru `audit_log`; pentru dezvăluiri, nu.
- `listing_extractions` păstrează doar hostname-ul, intenționat.
- Adresele IP anonime se păstrează ca hash sărat, nu ca adrese.
- **Nu există flux de ștergere a contului** — nici ecran, nici funcție. E o
  cerință GDPR, nu o funcționalitate opțională.
- Textele juridice (`/termeni`, `/confidentialitate`) sunt pagini-placeholder
  cu „Pagină în lucru". Nu se poate lansa așa.

---

## 6. Decizii care ne blochează și pe care le luați voi

| Decizie | De ce blochează | Ce blochează concret |
|---|---|---|
| **Procesator de plăți și facturare** | Determină schema de abonamente, webhook-urile și textele legale | Elementul 9 din listă |
| **Furnizor SMS** | `notification_outbox` are canalul `sms`; nimeni nu l-a ales | OTP-ul pe telefon merge azi prin Supabase; alertele pe SMS nu au furnizor |
| **SMTP propriu sau serviciu** | Dispecerul de notificări are nevoie de credențiale la construcție | **Elementul 1 — primul din listă.** Fără asta nu putem începe |
| **Cine aprobă documentele și în cât timp** | Roadmap-ul avertizează explicit: e un angajament de personal, nu o funcționalitate | Promisiunea de pe pagina de înscriere. Dacă nu are nume, coborâm la 48 de ore în zile lucrătoare și scriem asta |
| **Prețuri finale** | `plans` are date de lansare; nu sunt confirmate | Pagina `/abonamente` și prima factură |
| **Proiect Supabase separat pentru producție** | Azi previzualizările și producția folosesc același proiect | Orice test cu date reale; riscul e ca o previzualizare să atingă date de client |
| **Texte juridice** | Termeni, confidențialitate, contract-cadru | `/termeni` și `/confidentialitate` sunt goale. Blocant legal la lansare |

---

## 7. Ce nu construim, și de ce

Din `docs/01-product-spec.md` § *Later* și din brief-ul acestui audit. Fiecare a
fost decis, nu uitat:

| Nu construim | Motivul |
|---|---|
| **Escrow** | Proiect financiar de sine stătător, cu obligații de licențiere |
| **Comision pe transport** | Schimbă modelul de business; azi vindem abonamente |
| **Aplicații native** | PWA-ul instalabil acoperă nevoia la o fracțiune din cost |
| **GPS permanent / telematică** | Necesită hardware și acorduri cu furnizori; nu e ce a cerut clientul |
| **Interogări automate ARR / RAR / AIDA** | Depind de un acord comercial în afara controlului nostru. Roadmap-ul avertizează explicit să nu alunece în MVP |
| **Prețuri cu AI** | Fără suficiente transporturi încheiate, orice preț sugerat e o invenție |
| **API public** | Nu există încă cerere; adaugă o suprafață de întreținut permanent |
| **Licitații** | Modelul de ofertă directă e ce au cerut ambele părți |
| **Interfață pentru marfă generală** | Schema o suportă (`cargo_freight_details`), lansarea e pe transport auto. Se deschide când piața o cere |

---

## 8. Anexă: cum am verificat

### Limita principală, citește-o întâi

**Nu am putut deschide producția și nu am folosit niciun cont de test.** Mediul
în care rulez blochează atât `transport-seven-sandy.vercel.app`, cât și
Supabase — 403 la tunelul CONNECT, verificat de trei ori în ziua auditului. Nu
există `.env` cu valori reale și nu mi-a fost dat niciun cont.

Brief-ul cerea explicit verificarea pe producție, ca fiecare tip de cont. **Nu
am făcut asta.** Tot ce scrie mai sus despre ce e „accesibil în interfață"
provine din:

- structura rutelor din `src/app/` comparată cu `src/config/routes.ts` și cu
  harta `src/lib/features.ts`;
- ce apeluri fac paginile și acțiunile către bază (`.from(...)`, `.rpc(...)`);
- 534 de verificări Playwright pe un build de producție local, **fără bază de
  date**;
- jurnalele pipeline-ului pe commit-ul exact.

### Ce am citit

`docs/00`–`07`, `DEPLOYMENT.md`, `CLAUDE.md`, `prompts/` (arhivă), toate cele 32
de migrații, cele 4 funcții edge, `n8n/README.md`, întreaga aplicație Next.js
(54 de pagini), și cele 27 de pull request-uri, toate închise.

### Ce am rulat

| Comandă | Rezultat |
|---|---|
| `pnpm typecheck`, `pnpm lint` | curat |
| `pnpm test` | 714 teste |
| `pnpm db:test` | 545/545 verificări RLS |
| `pnpm test:e2e` | 534 verificări (272 sărite — cele care cer bază) |
| `pnpm test:functions` | 57 teste Deno |

Nu am rulat nimic împotriva bazei de producție. Nu am schimbat niciun fișier în
afară de acesta.

### De verificat manual — pașii exacți

1. **`pg_cron` este activat?** Supabase → Database → Extensions → caută
   `pg_cron`. Apoi SQL Editor: `select jobname, schedule, active from
   cron.job;` — trebuie să vezi `nightly-compliance-sweep`,
   `nightly-expiry-reminders`, `hourly-listing-cleanup`. **Dacă lista e goală,
   suspendarea automată nu rulează** și cerințele 5 și 6 ale clientului nu sunt
   aplicate în practică.
2. **Date de test în producție?** SQL Editor: `select count(*) from companies;`
   `select count(*) from cargo_listings;` `select email from auth.users limit
   20;` — caută adrese `@test.ro` sau `@example.com`.
3. **Coada de notificări.** `select status, count(*) from notification_outbox
   group by status;` — dacă `queued` crește și `sent` e zero, confirmă ce scrie
   la punctul 1 din secțiunea 4.
4. **Findings noi de la advisors.** Deschide ultima rulare a pipeline-ului
   `Main` → etapa „5. Security advisors" → sumarul rulării. Jobul raportează,
   nu blochează, deci nimeni nu e anunțat automat.
5. **Cele patru tipuri de cont.** Creează-le prin `/inregistrare` și parcurge
   scriptul de 10 minute din raportul anterior. Până atunci, tot ce e marcat
   „complet, testat" înseamnă „complet după cod și teste", nu „văzut funcționând
   în producție".
6. **Performanță.** Rulează Lighthouse pe `/` și pe o pagină SEO publicată, pe
   mobil. Ținta din brief-ul SEO era ≥90 performanță și ≥95 accesibilitate;
   nimeni nu a măsurat-o încă.
