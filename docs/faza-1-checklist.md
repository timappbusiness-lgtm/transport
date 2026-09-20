# Faza 1 — lista de ieșire

Scris pe `main` la commit-ul care adaugă paginile legale, 18 septembrie
2026. **Actualizat pe 20 septembrie 2026**, la commit-ul care deblochează
Faza 1: rândurile schimbate poartă data.

„Faza 1" în briefurile noastre înseamnă MVP-ul fără oferte, comenzi,
mesagerie și moderare — adică fazele 1, 2, 3, 4 și 9 din
`docs/04-roadmap.md`, plus partea de administrare care le susține. Fazele
5–8 și moderarea din faza 10 sunt Faza 2 și nu sunt evaluate aici.

Stările sunt trei și numai trei:

- **gata** — se poate folosi de un client, de la interfață până la regula din
  bază, și există un test care cade dacă se strică;
- **parțial** — există, dar îi lipsește ceva numit explicit în coloana
  următoare;
- **lipsește** — nu există.

Nimic nu este marcat gata pentru că „există tabela". Tabela nu este
funcționalitate; asta a fost concluzia auditului din 18 septembrie și rămâne
regula aici.

---

## Faza 1 — Verificare

| Element | Stare | Ce mai lipsește |
|---|---|---|
| Înscriere firmă cu `create_company()` | gata | — |
| Căutare CUI la ANAF, autocompletare, marcaj inactiv | gata | — |
| Membri prin invitație, transfer de proprietate | gata | — |
| Cont rapid persoană fizică | **parțial** *(corectat 20.09)* | Era marcat „gata, telefon confirmat prin OTP". Nu era: înscrierea individuală este e-mail + parolă, iar OTP-ul pe telefon era un pas ulterior din `/cont/profil` — și fără furnizor de SMS nu se putea face deloc, deci nimeni nu putea publica. Din 20.09 înscrierea cere nume, e-mail, telefon și parolă, iar publicarea cere e-mailul confirmat și telefonul în profil. **Ce se schimbă când apare SMS-ul:** confirmarea telefonului devine automată, se șterge unealta manuală din `/admin/pilot`, iar `staff_set_phone_verified` rămâne doar pentru cazurile în care SMS-ul nu ajunge |
| Încărcare documente, extragere AI, coadă de aprobare | gata | — |
| Stări de document: valid, expiră curând, expirat | gata | — |
| Registru vehicule: număr, VIN, tip, dimensiuni, șofer, trasee | gata | — |
| Memento-uri de expirare pe e-mail la 30/14/7/1 zile | parțial | Coada se umple și dispecerul le trimite; **nu a fost văzut niciun e-mail real ajuns în inbox**, pentru că furnizorul nu este configurat. *(20.09: drumul complet, de la rând `queued` la `sent`, este acum dovedit pentru toate cele 20 de șabloane în `dispatch_test.ts`, cu furnizorul înlocuit de un dublu. Rămâne de confirmat cu un furnizor real — pașii sunt în `docs/configurare-externa.md`.)* |
| Suspendare și reactivare automată | gata | — |
| Administrarea echipei (`set_platform_staff()`) | gata | — |

**Criteriul de ieșire al fazei**: un transportator se înscrie, invită un
dispecer, adaugă o platformă, încarcă actele și este verificat fără ca
nimeni să atingă baza de date; o RCA expirată suspendă, reînnoirea
reactivează. **Îndeplinit în cod și în teste; neconfirmat de la un capăt la
altul pe producție cu un cont real.**

## Faza 2 — Cereri

| Element | Stare | Ce mai lipsește |
|---|---|---|
| Cerere cu marcă, model, an, stare, tip serviciu | gata | — |
| Persoanele fizice publică cu contul rapid | gata | — |
| Stările de anunț din spec | gata | — |
| Panou public cu filtre | gata | — |
| Deschiderea contactului, limitată de plan | gata | — |
| Import din anunț (link sau poză) | gata | — |
| Poze urcate de client *(20.09)* | gata | Până la 6, redimensionate în browser, EXIF și GPS scoase pe server |
| Durata anunțului aleasă de client *(20.09)* | gata | 3, 7, 14 sau 30 de zile, cu memento cu două zile înainte |

## Faza 3 — Trasee tur și retur

| Element | Stare | Ce mai lipsește |
|---|---|---|
| Trasee `tur` și `retur` cu opriri, tipuri acceptate, preț orientativ | gata | — |
| Platforme cu locuri, scădere automată la confirmare | parțial | Scăderea la confirmarea comenzii ține de Faza 2 (comenzi); azi locurile se ajustează doar la rezervare |
| Rezervări care expiră în 24 de ore | gata | — |
| Clienții nu rezervă direct | gata | — |

## Faza 4 — Potrivire

| Element | Stare | Ce mai lipsește |
|---|---|---|
| Mesajul „N transportatori verificați circulă pe această rută" | gata | — *(20.09: conturile de test nu mai intră în număr)* |
| Alerte pe e-mail pentru căutările salvate | **gata în cod** *(21.09)* | `/cont/alerte`: căutări salvate cu nume, criterii în română, imediat sau zilnic grupat, limită pe plan și motivul fiecărei potriviri, atât în aplicație cât și în e-mail. Se creează de pe panoul de cereri, din cele două stări goale și din `/cont/firma`. **Livrarea așteaptă furnizorul de e-mail** — vezi `docs/configurare-externa.md` |
| `max_detour_km` folosit în potrivire | **gata în cod** *(21.09)* | Ocolul e costul de inserție — câți kilometri în plus face camionul ca să ia și să lase vehiculul — calculat cu `distance_km()` și factorul rutier. Se aplică la potrivirile de pe panoul transportatorului, la filtrul „potrivite cu firma mea”, la alertele căutărilor salvate și la numărul de transportatori arătat clientului. Toleranța implicită stă în `matching_settings.default_detour_km` |
| Homepage: „alerte pe e-mail", nu „pe WhatsApp" | gata | — |

## Faza 9 — Abonamente

| Element | Stare | Ce mai lipsește |
|---|---|---|
| Perioadă gratuită de la verificare | gata | — |
| Plată recurentă, schimbare card, anulare | lipsește | Nu există procesator de plăți. Abonamentele se activează manual de echipă |
| Factură pentru fiecare plată | lipsește | Aceeași cauză |
| Memento de reînnoire, suspendare pentru neplată | parțial · **amânat** *(21.09)* | Memento-ul există ca șablon. Suspendarea pentru neplată rămâne neimplementată până se decide procesatorul de plăți: fără el nu există un eveniment „nu a plătit” pe care să ne bazăm, iar o suspendare pornită dintr-un marcaj pus manual e o suspendare pe care nimeni nu o poate contesta. Când există procesator, regula se scrie ca trigger pe `company_subscriptions`, cu motiv în `audit_log`, ca toate celelalte suspendări |
| Coduri promo, istoric de plăți | lipsește | — |

## Administrare (partea din faza 10 care ține de Faza 1)

| Element | Stare | Ce mai lipsește |
|---|---|---|
| Coadă de verificare documente și firme | gata | — |
| `/admin/notificari`: starea joburilor și coada | gata | — |
| `/admin/stergeri`: cereri de ștergere și anonimizare | gata | — |
| `/admin/setari`: praguri, grație, retenție | gata | — |
| `/admin/pilot`: criteriile de ieșire, măsurate *(20.09)* | gata | Închide constatarea „nimic nu adună numerele" de mai jos |
| `/admin/import`, `/admin/pagini`, `/admin/optiuni`, `/admin/preturi` | gata | — |
| `/admin/sesizari`: coada de sesizări, cu răspuns pe e-mail *(21.09)* | gata | Închiderea cere un text scris, care se trimite exact așa cum e scris celui care a sesizat |
| `/admin/jurnal`: jurnalul de acțiuni, filtrabil, cu export CSV *(21.09)* | gata | Doar citire. Nimeni nu are drept de scriere pe `audit_log`, nici noi |
| `/admin/echipa`: cine are drepturi, de când, pe baza cui *(21.09)* | gata | Un singur rol, `admin` — `staff_role` are o singură valoare, deci un al doilea rol ar fi o etichetă pe care nimic nu o aplică |
| Export de rapoarte | lipsește | Faza 2 |

## GDPR și documente legale

| Element | Stare | Ce mai lipsește |
|---|---|---|
| Ștergerea contului și a firmei, cu perioadă de grație | gata | — |
| Export „Descarcă datele mele" | gata | — |
| Anonimizare din partea echipei, cu motiv, auditată | gata | — |
| Retenție 24 de luni pentru jurnalul de contacte | gata | — |
| `/termeni`, `/confidentialitate`, `/cookies` | parțial | **Neverificate de un avocat** și fără datele operatorului. Vezi `docs/09-verificare-juridica.md` |
| Înregistrarea versiunii acceptate, re-acceptare la schimbare | gata | — |

---

## Pregătirea operațională

Astea nu sunt funcționalități și nu apar în roadmap, dar fără ele lansarea
nu are sens.

| Element | Stare | Cine |
|---|---|---|
| **Furnizor de e-mail configurat** (`RESEND_API_KEY`, `MAIL_FROM`) | lipsește | Madalin / Edi. Pașii exacți: `docs/configurare-externa.md` §1–2. Fără el dispecerul răspunde 503, numește variabila lipsă și o scrie în `job_run_log`, iar `/admin/notificari` o arată ca „neconfigurat" |
| **SMTP propriu în Supabase Auth** *(20.09)* | lipsește | Madalin. `docs/configurare-externa.md` §3. Mailerul implicit e limitat la câteva mesaje pe oră, iar fără e-mail confirmat nimeni nu poate publica |
| **Joburile programate rulează** | de confirmat | Migrația `20260918210000` le programează pe toate opt. De verificat pe `/admin/notificari` că trec pe „la zi" în 24 de ore |
| **Documentele legale verificate** | lipsește | Avocat. Lista este în `docs/09-verificare-juridica.md` |
| **Datele operatorului completate** | lipsește | Edi, în `src/config/company.ts` |
| **Conturile de test separate de cele reale** | **gata în cod** *(20.09)* | `is_test` pe conturi și firme, marcat de echipă din `/admin/pilot` și auditat; exclus din ambele panouri, din lista de firme, din numerele de pe prima pagină, din numărul de transportatori de pe rută și din tot ce arată `/admin/pilot`. Un cont de test vede o insignă pe fiecare ecran. **De făcut pe producție:** de marcat conturile existente — migrația le prinde pe cele de pe `@test.ro` și `@example.com`, restul manual |
| **Decizia despre proiectul Supabase de producție** | de luat | Proiectul actual a fost creat pentru dezvoltare. De decis dacă lansăm pe el sau creăm unul nou în `eu-central-1`, cu datele migrate. Regiunea nu se schimbă după creare |
| **Secretele în Vault** | parțial | `outbox_dispatcher_url`, `account_deletion_url`, `cron_secret`. De confirmat că toate trei există |
| **Backup și restaurare** | de confirmat | Supabase face backup automat pe planul plătit. De testat o restaurare o dată, înainte de lansare, nu după |

---

## Cum măsurăm criteriul de ieșire

Criteriul din roadmap este: **20 de transportatori verificați și 5 case de
expediții care folosesc platforma săptămânal, fără noi în buclă**.

„Verificat" se numără exact:

```sql
select count(*) from public.companies
where verification_status = 'verified' and not is_suspended
  and company_type in ('transport', 'both');
```

„Casă de expediții" este același lucru cu `company_type in ('expeditie',
'both')`.

„Săptămânal" are nevoie de o definiție care nu există încă în cod. Propunem:
o firmă este activă într-o săptămână dacă a făcut cel puțin una dintre
acțiunile de mai jos în acea săptămână. Toate sunt deja înregistrate.

| Acțiune | Unde se vede |
|---|---|
| A publicat un traseu sau o cerere | `cargo_listings.published_at`, `truck_listings.published_at` |
| A deschis datele de contact ale cuiva | `contact_reveals.created_at` |
| A rezervat sau a confirmat un loc | `departure_bookings.created_at` |
| Un membru s-a autentificat | `profiles.last_seen_at` |

„Fără noi în buclă" înseamnă: nicio intervenție manuală a echipei în
săptămâna respectivă, în afara aprobării documentelor. Se citește din
`audit_log`, filtrat pe `actor_role = 'staff'`.

**Ce lipsea ca să putem măsura**: un ecran care pune numerele astea
împreună. `audit_log` și tabelele de mai sus aveau datele; nimic nu le
aduna.

**Rezolvat pe 20 septembrie:** `/admin/pilot`. Definiția de mai sus a
„activ" e implementată exact așa cum e scrisă, în
`pilot_weekly_activity()`, iar conturile noastre de test sunt scoase din
toate cifrele. Pagina arată și cât așteaptă un client de la publicare
până îi deschide cineva contactul, și câte intervenții manuale a făcut
echipa — adică jumătatea „fără noi în buclă" a criteriului.

Al doilea criteriu — **peste jumătate din înțelegeri pornite de la o ofertă
în platformă, nu de la un telefon** — nu se poate măsura deloc în Faza 1,
pentru că ofertele sunt Faza 2. Până atunci, toate înțelegerile pornesc de la
un telefon, prin construcție.
