# Analiza lipsurilor — Coridor față de planul propriu și față de concurent

Scris pe `main` la commit `8292285`, 20 septembrie 2026, pe ramura
`docs/analiza-lipsuri`. Nimic nu a fost modificat în cod pentru acest
document.

---

## Cum citești documentul

### Cele patru stări, și de ce sunt patru

Un audit care spune „există" ascunde exact diferența care contează. Aici
fiecare rând primește una dintre astea:

| Stare | Ce înseamnă exact |
|---|---|
| **construit și testat** | Are ecran, are regulă în bază, și cade un test dacă se strică |
| **construit, netestat** | Are ecran și regulă, dar niciun test nu îl acoperă cap-coadă |
| **doar în bază** | Tabelă, politică RLS, funcție — fără niciun ecran. Nu e funcționalitate |
| **lipsește** | Nu există |

O a cincea situație apare des și merită numită separat: **construit, dar
inaccesibil** — pagina există, dar nimic din navigație nu duce la ea sau nu
are date de arătat. Conform instrucțiunii din brief, acestea sunt marcate
**parțial**, nu „da". Secțiunea 6 le adună pe toate.

### Ce am putut și ce n-am putut verifica

**Am verificat în cod**, fișier cu fișier: rutele din `src/app/`, harta
`src/lib/features.ts`, navigația din `src/lib/navigation.ts` și
`src/components/layout/header-menu.tsx`, toate cele 38 de migrații,
`supabase/tests/rls_test.sql`, cele 7 funcții edge, cele 39 de fișiere de
teste unitare și cele 33 de suite Playwright.

**Am rulat**, astăzi, pe această ramură:

| Comandă | Rezultat |
|---|---|
| `pnpm test` | **767 de teste, 39 de fișiere, toate trec** |
| `pnpm db:test` | **677 de verificări RLS, 677 trecute, 0 căzute** (605 „fix", 72 „guard") |
| `pnpm typecheck`, `pnpm lint` | curat |
| `pnpm check:functions`, `pnpm test:functions` | **86 de teste Deno, toate trec** |
| `pnpm test:e2e` | **632 de verificări trecute, 284 sărite** — cele sărite sunt suitele `*-supabase.spec.ts`, care cer un Supabase local ce nu pornește în acest mediu (imaginile Docker: 429 de la Docker Hub, 403 prin proxy) |

**Nu am putut verifica nimic pe producție.** Mediul în care rulez blochează
ieșirea: `https://transport-seven-sandy.vercel.app/` răspunde `000` cu
`CONNECT tunnel failed, response 403`, la fel și Supabase. Nu am conturi de
test și nu există `.env` cu valori reale. Deci **fiecare rând marcat
„construit și testat" înseamnă „complet după cod și teste", nu „văzut
funcționând pe producție"**. Ce trebuie verificat manual și cum, este în
secțiunea 7.

**Nu am deschis site-ul concurentului.** `https://bursatractari.ro/`
răspunde tot `000` / `CONNECT tunnel failed, response 403`. Conform
instrucțiunii din brief, lucrez din note: `docs/07-competitor-analysis.md`
(captură din septembrie 2026) și lista de funcționalități primită odată cu
sarcina. **Nu am confirmat niciuna dintre ele astăzi**; coloana „are
competitorul" reproduce ce scrie în note și în listă, nu ce am văzut eu.

**Două surse numite în brief nu există în depozit:** `docs/00-cerinte-client.md`
și `docs/backlog.md`. Cele șase cerințe ale clientului sunt în
`docs/00-rezumat-ro.md` și, detaliate, în secțiunea 2 din
`docs/00-stadiu-platforma.md`. Nu există niciun backlog scris; secțiunea 8
de aici e cel mai apropiat lucru de unul.

### Despre numere

Singurele procente din document sunt cele din
`docs/00-stadiu-platforma.md` (23,5 din 48 de elemente de roadmap = 49%),
citate ca atare, cu sursa lor. **Nu am inventat niciun alt procent.**
Numerele concurentului (25.577 de anunțuri, 83% autoturisme, tarifele pe
coridor) sunt ale lor, citite de pe contoarele lor în septembrie 2026 și
copiate din `docs/07-competitor-analysis.md`. Nu le-am reverificat.

---

## 1. Tabelul de comparație

Sursa coloanei „are competitorul": lista primită în brief plus
`docs/07-competitor-analysis.md`. Sursa coloanelor despre noi: codul, citat
cu fișier, tabelă sau test.

### 1.1 Ce au ei

| Funcție | Are competitorul | Avem noi | Unde se vede la noi | Cum o facem mai bine / de ce nu o facem | Fază |
|---|---|---|---|---|---|
| **Publicare cerere gratuit și fără cont** | da | **nu** | `/cerere/noua` — formularul se completează fără cont, dar la pasul final `AccountPanel` cere înregistrare (`src/components/requests/request-form.tsx:604`) | Ei ne bat aici și e decizia cea mai scumpă din listă. Vezi 3.1 | **1** |
| **17 tipuri de vehicule** | da, după lista din brief — **dar contoarele lor din `docs/07-competitor-analysis.md` arată 13 rânduri**, inclusiv „Alte cereri". Cele două surse nu se potrivesc și nu am putut verifica azi | **da** | `cargo_category`, 14 valori (`supabase/migrations/20260916120800_vehicle_cargo.sql:20`) | Cele 13 categorii ale lor, în ordinea volumului lor, plus `ambarcatiune`. Filtrul public expune însă doar 6 (`FILTERABLE_CATEGORIES`, `src/lib/departures.ts:102`) — restul se pot publica, dar nu se pot filtra | 1 |
| **Marcaj „avariat"** | da | **da** | `cargo_vehicle_details.is_damaged`, `damage_notes` | La noi avaria nu e o bifă decorativă: `needs_winch` e o coloană **generată** din `is_running`, `wheels_turn`, `steering_works`, deci cardul nu poate minți despre ce utilaj trebuie adus | 1 |
| **Marcaj „urgent"** | da | **nu** | — | Avem `service_type = 'expres'` (`20260916120800:41`), care e același lucru spus onest: urgența are un preț, nu e o etichetă gratuită. Ce ne lipsește e vizibilitatea ei pe card. Vezi 3.5 | 1 |
| **Număr de poziții / persoane** | da | **nu** | — | O cerere = un vehicul la noi. Pentru „3 mașini pe aceeași platformă" modelul nostru e altul și mai bun: plecări cu locuri (`platform_slots_total`, `v_departure_seats`). Nu e expus în interfață | 2 |
| **Încărcare poze de către client** | da | **parțial** | Coloana `cargo_listings.photo_paths` și bucket-ul `listing-photos` există (`20260916120600:14`); singurul `input type="file"` din fluxul de cerere e în `src/components/requests/import-panel.tsx:173` și servește importului AI | Poza care ajunge pe anunț azi e **doar** cea găsită de import în anunțul sursă. Un om cu o mașină avariată **nu își poate urca propriile poze**. Lipsă reală, vezi 3.6 | **1** |
| **Durată de valabilitate aleasă (1/3/7/15 zile)** | da | **nu** | Fix 14 zile, scris în trigger: `20260916120300:219` și `:252`, plus `20260917180000:407` și `:519` | Nimic nu justifică rigiditatea. Vezi 3.4 | 1 |
| **Abonamente care deblochează contactul** | da (național / mixt, 1/6/12 luni) | **da** | `/abonamente`, `/cont/abonament`, `plans` cu 5 rânduri (`20260916120500:36`), perioade în `plan_billing_periods` | Al nostru e mai strict și mai cinstit: `reveal_contact()` verifică în ordine firma verificată și nesuspendată, anunțul activ, cota lunii, apoi scrie în `contact_reveals`. La ei abonamentul deblochează; la noi abonamentul **plus conformitatea** deblochează | 1 |
| **Licitare în platformă (preț + dată)** | da | **doar în bază** | `offers`, `accept_offer()`, `reject_offer()`, `withdraw_offer()` (`20260916120400`, `20260916130200`); `FEATURES.offers = false` (`src/lib/features.ts`) | Regulile sunt scrise și testate; nu există niciun ecran. Este **blocantul numărul unu al produsului** | **2** |
| **Contact direct** | da | **da** | `/cereri/[id]`, `/trasee/[id]` prin `reveal_contact` | — | 1 |
| **Adăugare rapidă cu AI din poza unui anunț** | da (captură de ecran) | **da, mai mult** | `/cerere/noua` pasul 2, `src/lib/listing-import.ts`, funcția edge `extract-vehicle-listing`, `tests/unit/listing-import.test.ts`, `tests/e2e/import-anunt.spec.ts` | Noi acceptăm **și link de anunț, și poză**, și — partea care contează — orice câmp care nu trece validarea formularului e **aruncat, nu corectat**, iar fiecare câmp completat automat poartă un marcaj care dispare la prima editare. Un an greșit costă un transport cotat pentru altă mașină | 1 |
| **Urmărire în timp real în cursele la licitație** | da | **nu** | — | Decis „Later" în `docs/01-product-spec.md`; locația temporară pe durata comenzii e „After the MVP". Vezi secțiunea 4 | — |
| **Calculator de preț cu suprataxă urbană și taxă de așteptare** | da | **parțial** | `/preturi` + `src/components/prices/prices-view.tsx`; `price_settings` are `not_running_surcharge_pct` (30), `express_surcharge_pct` (40), `road_distance_factor` (1,25), `range_spread_pct` (15) | Suprataxele noastre sunt cele care contează în piața asta (nu rulează / expres), nu cele urbane. **Dar `is_published = false` implicit** (`20260917170000:91`) și tarifele din migrație sunt marcate explicit placeholder — deci azi pagina nu arată nimic unui vizitator | **1** |
| **Tabel de prețuri pe km, pe clase de greutate** | da | **parțial** | `price_rates`, 5 clase (`motocicleta` → `autoutilitara`), `/preturi` | Aceeași cauză: nepublicat, cifre placeholder, și `robots: index: false` pe pagină. Vezi 3.2 | **1** |
| **Widget cu prețul carburantului** | da | **nu** | — | Nu e o funcție de bursă, e conținut de umplutură. Vezi secțiunea 4 | — |
| **Flux live „oferte noi"** | da | **parțial** | `src/components/home/activity.tsx` + `RequestFeed`, prag reglabil din `/admin/activitate` | Al nostru arată cereri reale sau nu arată nimic — sub prag apare `Empty()`, fără carduri-exemplu. E mai onest și, pe o platformă goală, mai gol | 1 |
| **Contor total km și statistici pe categorii** | da (336.009.580 km) | **parțial** | `homepage_activity()` întoarce `total_km` agregat real (`20260917120000:92`), afișat în `StatsBand` și `Activity`, ambele sub prag | Contorul lor e mare, rotund și nefalsificabil în ambele sensuri. Al nostru e o sumă pe care un vizitator ar putea, în principiu, să o verifice. Statistici **pe categorii** nu avem | 1 |
| **Hartă cu platformele în timp real** | da | **nu** | — | Fără PostGIS și fără telematică, ar fi o hartă cu pini inventați. Vezi secțiunea 4 | — |
| **Pagini SEO pe oraș / rută / tip de vehicul** | da | **parțial** | `seo_pages` cu 4 tipuri și 161 de rânduri semănate, `/transport-auto`, `/transport-auto/[slug]`, `/transport-auto/judet/[slug]`, `/admin/pagini`, `tests/unit/seo-pages.test.ts` | Construit complet — și **nepublicat**: `is_published = false` implicit (`20260918110000:64`), iar întreg site-ul e `noindex` cât timp `NEXT_PUBLIC_SEO_INDEXABLE` nu e setat (`src/app/robots.ts`). Vezi 3.3 | **1** |
| **Director de firme cu profile și insigne** | da („Verificat", „Premium") | **parțial** | `/firme`, `/firme/[slug]`, `src/lib/directory.ts:172` („Verificat din septembrie 2026") | Insigna noastră poartă **o dată**, nu un adjectiv, și e recalculată de `run_compliance_sweep()`. **Nu vom avea „Premium"**: `docs/01-product-spec.md` interzice explicit o insignă plătită care se poate confunda cu verificarea | 1 |
| **Telefon parțial mascat ca momeală** | da | **nu** | — | La noi contactul e ori ascuns complet, ori dezvăluit prin `reveal_contact()`. Un telefon pe jumătate e o tehnică de conversie, nu o funcție. Vezi 3.8 pentru varianta pe care o putem face onest | 3 |
| **Recenzii de la clienți, moderate de operator** | da | **doar în bază** | `ratings`, `refresh_company_rating()`, guard post-livrare (`20260916130200`) | Diferența e structurală: ale lor sunt recenzii; ale noastre se pot scrie **doar după un transport livrat în platformă**. Nu se pot cumpăra. Dar fără ecran de ofertă și de comandă, nu există transport livrat, deci nu există nicio evaluare | **2** |
| **Raportarea incidentelor și mediere** | da | **doar în bază** | `reports` (`20260916120400:269`), cu `status`, `evidence_path`, `resolution`, `handled_by`; formular de raportare pe `/verificare` | Tabela e completă și nefolosită de niciun ecran de administrare. Vezi 3.10 | 2 |
| **Generator de contract de transport** | da | **nu** | — | „PDF contract with electronic acceptance" e listat „After the MVP" în `docs/01-product-spec.md`. Vezi 3.11 | 3 |
| **Alerte de accidente prin Waze / Telegram** | da | **nu** | — | Nu are legătură cu bursa. Vezi secțiunea 4 | — |
| **Grupuri Facebook / WhatsApp / Telegram** | da | **nu** | — | Nu e produs, e distribuție — și e ieftină. Vezi 3.12 | 1 (operațional) |
| **Două aplicații mobile (client și șofer)** | da | **parțial** | PWA instalabil: `public/manifest.webmanifest`, `public/sw.js`, `public/offline.html`, push cu VAPID (`20260918120000`), `tests/e2e/push-pwa.spec.ts` | Decizie luată: PWA în loc de două aplicații native. Rolul `driver` există în navigație și vede aproape nimic până când `FEATURES.transports` pornește (`driverNav`, `src/lib/navigation.ts:59`) | 3 |
| **Asistență rutieră (combustibil, baterie, deblocare)** | da | **nu** | `service_type = 'tractare'` există în schemă, ascuns în interfață | Alt business: dispecerat de intervenții, nu bursă. Vezi secțiunea 4 | — |

### 1.2 Ce avem noi și ei nu

Comparația merge în ambele sensuri, altfel e o listă de temeri.

| Funcție | Starea la noi | Unde se vede | De ce contează |
|---|---|---|---|
| **Documente cu dată de expirare, per firmă și per vehicul** | construit și testat | `/cont/firma/documente`, `/cont/firma/flota/[id]`, `documents`, `document_requirements` | „Verificat manual" la ei e un eveniment la trecut. Al nostru e o stare pe care o poți interoga azi |
| **Suspendare și reactivare automată** | construit și testat | `run_compliance_sweep()` (`20260916120200`), `account_suspensions`, banner pe `/cont/firma` | Un RCA expirat scoate firma de pe panou fără ca cineva să apese ceva |
| **Conformitate la nivel de vehicul, separat de firmă** | construit și testat | `documents` cu `scope = 'vehicle'` | Un camion cu ITP expirat iese de pe panou; restul flotei rămâne |
| **Citire AI a documentului + aprobare umană** | construit și testat | `parse-document`, `/admin/documente`, `review_document()` | AI-ul extrage, omul aprobă. Niciodată invers |
| **Verificare CUI la ANAF, cu marcaj „inactiv/radiat"** | construit și testat | `verify-cui-anaf`, `/inregistrare/firma` | Sursă oficială, gratuită, la înscriere |
| **„N transportatori verificați circulă pe această rută"** | construit și testat | `/cerere/noua` pasul 4 și după publicare, `count_matching_carriers()`, `preview_matching_carriers()` (`20260918190000`, `20260918200000`), `tests/unit/carrier-count.test.ts` | Răspunde la întrebarea reală înainte de a cere efortul: „o să mă vadă cineva?" |
| **Ștergerea contului, export de date, anonimizare** | construit și testat | `/cont/setari/date-personale`, `/admin/stergeri`, `account_deletion_requests`, `data_export_requests` | Obligație GDPR pe care ei nu o expun deloc |
| **Jurnal de audit pe fiecare schimbare de stare** | construit și testat (fără ecran) | `audit_log`, `write_audit()` | Ancheta de fraudă și răspunderea GDPR pornesc de aici |
| **Toate regulile în Postgres, verificate ca roluri API** | construit și testat | `supabase/tests/rls_test.sql`, rulat de `pnpm db:test` | Frontendul nu e graniță de securitate. Un audit poate reproduce fiecare regulă |

---

## 2. Ce ne lipsește din planul nostru

Grupat pe fazele din `docs/04-roadmap.md`, cu convenția din briefurile
noastre: **Faza 1** = MVP fără oferte, comenzi, mesagerie și moderare
(fazele 1, 2, 3, 4 și 9 din roadmap, plus administrarea care le susține);
**Faza 2** = fazele 5–8 plus moderarea din faza 10; **Faza 3** = „After the
MVP".

Efort: **mic** ≈ sub o zi, **mediu** ≈ 1–3 zile, **mare** ≈ o săptămână sau
mai mult, pentru o persoană.

### 2.1 Faza 1 — ce mai lipsește ca să putem porni un pilot

| # | Ce lipsește exact | Stare azi | Efort | Impact | Depinde de |
|---|---|---|---|---|---|
| 1.1 | **Furnizor de e-mail configurat.** `RESEND_API_KEY` și `MAIL_FROM` nu sunt setate pe Edge Functions; `supabase/functions/outbox-dispatcher/index.ts:68` răspunde 503 și numește variabila lipsă | construit, fără credențiale | mic (configurare) | **blocant** | Decizia Edi/Madalin despre furnizor |
| 1.2 | **Confirmarea contului depinde de mailerul intern Supabase.** `supabase.auth.signUp` cu `emailRedirectTo` (`src/app/auth-actions.ts:97`) folosește SMTP-ul implicit Supabase, care e limitat la câteva mesaje pe oră și vine de la o adresă care nu e a noastră | construit, nepotrivit pentru producție | mic | **blocant** | 1.1 |
| 1.3 | **Furnizor de SMS pentru OTP.** `sendPhoneOtpAction` cheamă `supabase.auth.updateUser({ phone })` (`src/app/cont/actions.ts:310`). Fără un provider configurat în Supabase Auth, codul nu pleacă — iar fără telefon confirmat, `guard_cargo_listing_publish` refuză publicarea unei persoane fizice (`20260916120300:229`) | construit, fără provider | mic (configurare) | **blocant** | Decizia clientului |
| 1.4 | **Contul „rapid" al persoanei fizice nu e rapid.** Specificația și `docs/faza-1-checklist.md` spun „telefon confirmat prin OTP"; în realitate fluxul e e-mail + parolă → confirmare pe e-mail → `/cont/profil` → telefon → SMS → abia apoi publicare. Nu există `signInWithOtp` nicăieri în `src/` | construit altfel decât e documentat | mediu | **blocant** | 1.1, 1.3 |
| 1.5 | **Tarifele orientative sunt nepublicate și placeholder.** `price_settings.is_published` e `false` implicit și migrația marchează explicit cifrele ca neconfirmate (`20260917170000:110`). `/preturi` e în meniul public (`header-menu.tsx:27`) și nu arată nimic unui vizitator | construit, fără date aprobate | mic (aprobare) + mediu (cifre reale) | **blocant** pentru SEO | Validare de la partenerul de transport |
| 1.6 | **Cele 161 de pagini SEO sunt nepublicate**, iar tot site-ul e `noindex` până se setează `NEXT_PUBLIC_SEO_INDEXABLE` (`src/app/robots.ts`) | construit, neactivat | mic (activare) + mediu (citit textele) | important | 1.5, aprobare redacțională |
| 1.7 | **Panoul public de cereri e inaccesibil pe o platformă goală.** `/cereri` nu e în constanta `PAGES` din `src/components/layout/header-menu.tsx:25-30`; singurul link din pagina principală e în interiorul blocului `withFeed` (`src/components/home/activity.tsx:79`), iar sub prag se afișează `Empty()`, care linkează spre `/cerere/noua` și `/trasee`, nu spre `/cereri` | construit, inaccesibil | mic | important | — |
| 1.8 | **Clientul nu își poate urca propriile poze.** Coloana `photo_paths` și bucket-ul `listing-photos` există; formularul oferă doar poza găsită de importul AI (§1.1, §3.6) | doar în bază | mediu | important | — |
| 1.9 | **Durata anunțului e fixă, 14 zile** | lipsește | mic | opțional | — |
| 1.10 | **`max_detour_km` nu e folosit de nicio potrivire afișată.** Coloana există din `20260916120300:161` cu valoare implicită 50; `company_matches_request()` potrivește pe acoperire, tip de vehicul și dotări, nu pe toleranța de ocolire | doar în bază | mediu | important | — |
| 1.11 | **Statistici pe categorii** pe pagina principală (ei au 13 contoare) | lipsește | mic | opțional | date reale |
| 1.12 | **Plată recurentă, factură automată, card, coduri promo, istoric.** Azi: cerere din `/abonamente` → activare manuală de echipă, scris explicit în interfață | lipsește | mare | opțional la pilot | Decizia despre procesator |
| 1.13 | **Suspendare pentru neplată** | lipsește | mediu | opțional la pilot | 1.12 |
| 1.14 | **Ecran care măsoară criteriul de ieșire** (20 de transportatori verificați, 5 case de expediții active săptămânal). Datele există în `cargo_listings.published_at`, `contact_reveals`, `departure_bookings`, `profiles.last_seen_at`, `audit_log`; nimic nu le adună | lipsește | mic | important | — |
| 1.15 | **Cele 12 suite `*-supabase.spec.ts` nu au fost văzute trecând.** Sunt scrise; rulează doar cu `E2E_SUPABASE=1` și un Supabase local, care nu pornește în acest mediu (imaginile Docker nu se pot descărca: 429 de la Docker Hub, 403 prin proxy). Ele sunt cele 284 de verificări sărite din rularea de mai sus, adică **fix fluxurile cu stare**: autentificare, publicare, verificare, export, ștergere | scrise, nerulate | mediu | important | Docker funcțional local |
| 1.16 | **Joburile programate neconfirmate pe proiectul real.** Migrația `20260918210000` programează opt joburi și `job_health` le urmărește; nimeni nu a văzut `/admin/notificari` trecând pe „la zi" | construit, neconfirmat | mic (verificare) | **blocant** | Acces la proiect |
| 1.17 | **Documentele juridice neverificate de un avocat** și fără datele operatorului (`src/config/company.ts` — toate câmpurile sunt `''` intenționat) | construit, nevalidat | mic (Edi) + extern (avocat) | **blocant legal** | `docs/09-verificare-juridica.md` |
| 1.18 | **`/contact` e un placeholder** („Pagină în lucru", `UNBUILT_ROUTES` în `src/config/routes.ts`) și e linkat din footer | lipsește | mic | important | Datele de contact ale operatorului |
| 1.19 | **Filtrul public acoperă 6 din 14 categorii** (`FILTERABLE_CATEGORIES`) | parțial | mic | opțional | — |
| 1.20 | **Rolul `driver` nu are nimic de făcut** până când `FEATURES.transports` pornește. Navigația îi arată Acasă, Profil, Notificări, Date personale | construit, gol | — | opțional | Faza 2 |

### 2.2 Faza 2 — ce lipsește ca platforma să înlocuiască telefonul

Toate au regulile scrise și testate în Postgres și **niciun ecran**. Asta e
diferența dintre „aproape gata" și „nu există": munca rămasă e integral
interfață, dar e integral nefăcută.

| # | Ce lipsește exact | Stare azi | Efort | Impact | Depinde de |
|---|---|---|---|---|---|
| 2.1 | **Fluxul de ofertă**: `/cont/oferte` pentru ambele părți, formular pe `/cereri/[id]` cu preț, dată estimată de preluare, dată estimată de livrare, condiții, link către profil; acceptare / respingere / retragere / „cere lămuriri" | doar în bază (`offers`, `accept_offer()`, `FEATURES.offers = false`) | mare | **blocant** | 1.1 pentru notificarea ofertei |
| 2.2 | **Comanda și tranzițiile ei**: `order_confirmed` → … → `order_completed`, fiecare mutabilă doar de partea îndreptățită, plus anulare și `disputed` | doar în bază (`transports`, `create_order()`) | mare | **blocant** | 2.1 |
| 2.3 | **Dovada de livrare**: poze la preluare, raport de stare, documente de transport, poze la livrare, semnătură, note de incident — cu marcaj de timp, autor, nemodificabile, bucket separat | lipsește complet | mare | **blocant** | 2.2 |
| 2.4 | **Evaluările**: formularul, plus punctualitate, rată de răspuns și reclamații rezolvate pe profilul public | doar în bază (`ratings`) | mediu | important | 2.3 |
| 2.5 | **Mesageria**, și odată cu ea **mascarea automată a numerelor de telefon și a adreselor** până la confirmarea comenzii. Mascarea **nu e implementată nicăieri** — nu există nicio funcție `mask*` în `src/lib/` | doar în bază (`conversations`, `messages`) | mare | important | 2.1 |
| 2.6 | **Scăderea locurilor la confirmarea comenzii.** Azi locurile se ajustează la rezervare (`v_departure_seats`); scăderea la confirmarea comenzii ține de 2.2 | parțial | mic | important | 2.2 |
| 2.7 | **Moderarea**: cereri și anunțuri, conversații raportate, mesaje ascunse, reclamații (`reports` nu are niciun ecran), rambursări, promovări acordate, export de rapoarte | lipsește | mediu | important | 2.5 pentru conversații |
| 2.8 | **Ecran pentru `set_platform_staff()`** — azi se apelează doar din bază | lipsește | mic | opțional | — |
| 2.9 | **Ecran de citire a `audit_log`** | lipsește | mic | opțional | — |

### 2.3 Faza 3 — ce lipsește ca să creștem

| # | Ce lipsește exact | Stare azi | Efort | Impact | Depinde de |
|---|---|---|---|---|---|
| 3.1 | **Indice de preț din transporturi încheiate**, publicat doar când un coridor are destule livrări. `price_benchmarks` și `v_corridor_prices` există deja în schemă | doar în bază | mediu | important | 2.2, 2.3 și volum real |
| 3.2 | **Locația temporară a vehiculului pe durata comenzii** | lipsește | mediu | opțional | 2.2 |
| 3.3 | **Promovarea anunțurilor.** `is_promoted`, `promoted_until` și `promoted_credits_month` în `plans` există; nimic nu le folosește | doar în bază | mediu | opțional | 1.12 |
| 3.4 | **Contract PDF cu acceptare electronică** | lipsește | mediu | opțional | 2.2 |
| 3.5 | **Alerte pe WhatsApp** pentru traseele salvate. `saved_searches.notify_whatsapp` există din faza 0; interfața nu îl oferă tocmai pentru că nimic nu îl trimite | doar în bază | mediu | opțional | 1.1, furnizor WhatsApp |
| 3.6 | **Profile publice de firmă optimizate pentru căutare** | parțial (`/firme/[slug]` există, `noindex`) | mic | important | 1.6 |
| 3.7 | **Extra pentru PWA-ul șoferului** | lipsește | mediu | opțional | 2.2 |

---

## 3. Ce au ei și ne-ar ajuta

Filtrul aplicat aici: **intră doar ce se potrivește cu poziționarea
noastră** — conformitate verificabilă, tranzacția în platformă, date
oneste. Ce nu trece filtrul e în secțiunea 4, cu motivul.

### 3.1 Publicarea fără cont

- **Problema pe care o rezolvă:** omul cu o mașină cumpărată în Germania
  tranzactionează o dată la trei ani. Nu are loialitate, nu are răbdare, și
  un zid de înregistrare îl trimite înapoi într-un grup de Facebook.
- **Cum fac ei:** „Adaugă Cerere Transport GRATUIT și FĂRĂ CONT". Fără
  e-mail, fără telefon, fără nimic înainte de formular.
- **Cum stăm noi:** mai strict decât ei pe exact latura pieței pe care nu
  ne-o permitem. Azi: e-mail + parolă → confirmare pe e-mail → telefon →
  SMS → publicare (2.1, punctele 1.2–1.4).
- **Cum o facem mai bine:** publicare fără cont, cu **telefonul confirmat
  abia când apare primul contact** — adică în momentul în care persoana are
  ceva de pierdut. Cererea se scrie cu `status = 'draft'` și un token de
  revendicare trimis pe e-mail sau SMS; devine `active` la confirmare.
  Regula din bază nu se slăbește, se mută mai târziu în flux. Pe plan asta
  e chiar decizia 1 din §10 al analizei concurentului, luată și neaplicată.
- **Efort:** mare (migrație + flux de revendicare + schimbarea
  `guard_cargo_listing_publish`). **Impact:** blocant. **Fază:** 1.
- **Riscuri:** spam și cereri false — se contrazic cu limitarea pe IP
  (`IMPORT_IP_SALT` face deja hash sărat pentru import) și cu expirarea
  rapidă a ciornelor nerevendicate; GDPR — o ciornă nerevendicată e date
  personale fără temei durabil, deci trebuie ștearsă automat (o regulă de
  retenție ca la `contact_reveals`, `20260918230000`).

### 3.2 Tabelul public de prețuri pe km și pe coridor

- **Problema:** „cât costă transport mașină din Germania" este interogarea
  care deține piața asta. Cine răspunde la ea primește traficul.
- **Cum fac ei:** două tabele publice — pe km, pe clase de greutate; și pe
  coridor, sezonier („Tarife Primăvară 2026": Germania 650 €, Italia 700 €,
  Olanda 700 €, Spania 750 €).
- **Cum stăm noi:** tabelul există (`price_rates`, 5 clase), calculatorul
  există, suprataxele există — și **nimic nu e publicat**, cifrele sunt
  marcate placeholder în migrație, pagina e `noindex`.
- **Cum o facem mai bine:** al lor e o estimare sezonieră statică. Al
  nostru poate deveni **mediana reală a ofertelor acceptate pe coridor, cu
  mărimea eșantionului afișată** — `price_benchmarks` și `v_corridor_prices`
  sunt deja în schemă pentru asta. Până la primele 30 de transporturi
  încheiate pe un coridor, rămâne estimare și e etichetată estimare.
- **Efort:** mic pentru publicare, mediu pentru cifre validate.
  **Impact:** blocant pentru SEO. **Fază:** 1 (estimări), 3 (mediane reale).
- **Riscuri:** un tabel publicat e citit ca ofertă — de aceea
  `range_spread_pct` arată un interval, nu un număr; cifre nevalidate ne
  fac să pierdem transportatori, care știu piața mai bine decât noi.

### 3.3 Paginile SEO pe oraș, rută și tip de vehicul

- **Problema:** intrarea organică în piață. Ei au pagini pe fiecare oraș și
  pe fiecare coridor.
- **Cum fac ei:** volum mare de pagini, fiecare cu tarif și formular.
- **Cum stăm noi:** 161 de pagini scrise, cu FAQ, blocuri live și ecran de
  administrare (`/admin/pagini`) — **toate nepublicate**, pe un site care
  întreg răspunde `Disallow: /`.
- **Cum o facem mai bine:** paginile noastre pot arăta ceva ce ale lor nu
  pot: **câți transportatori cu documente valabile azi circulă pe coridorul
  ăsta**. Este exact `count_matching_carriers_on_route()`, deja scrisă.
- **Efort:** mic (activare) + mediu (citit cele 161 de texte).
  **Impact:** important. **Fază:** 1.
- **Riscuri:** publicarea unor pagini fără conținut real le face „thin
  content"; de aceea pragurile există. Nu publicăm o pagină pe care numărul
  de transportatori e zero.

### 3.4 Durata anunțului, aleasă de client

- **Problema:** o cerere pentru o mașină care se ridică săptămâna asta nu
  are ce căuta pe panou peste 14 zile; una pentru o rulotă ridicată în
  primăvară, da.
- **Cum fac ei:** 1, 3, 7 sau 15 zile, la alegere.
- **Cum stăm noi:** fix 14 zile, în trigger.
- **Cum o facem mai bine:** un câmp cu patru opțiuni, plus „prelungește"
  din `/cont/cereri` — și, pentru că la noi anunțurile expiră printr-un job
  real (`expire_stale_listings`), un e-mail înainte de expirare, nu după.
- **Efort:** mic. **Impact:** opțional. **Fază:** 1.
- **Riscuri:** niciunul semnificativ.

### 3.5 „Urgent", spus ca preț, nu ca etichetă

- **Problema:** cine are nevoie mâine trebuie să poată spune asta, iar
  transportatorul trebuie să știe că se plătește.
- **Cum fac ei:** o bifă „urgent" pe anunț.
- **Cum stăm noi:** avem `service_type = 'expres'` cu o suprataxă
  configurabilă (`express_surcharge_pct`, 40% implicit) — modelul corect —
  dar nu apare vizibil pe cardul din panou.
- **Cum o facem mai bine:** insignă „Expres" pe card, filtru pe panou, și
  numărul suprataxei arătat la publicare, ca omul să vadă ce cere.
- **Efort:** mic. **Impact:** important. **Fază:** 1.
- **Riscuri:** dacă totul devine „expres", cuvântul nu mai înseamnă nimic —
  de aceea suprataxa e afișată în momentul alegerii.

### 3.6 Pozele urcate de client

- **Problema:** o mașină avariată nu se poate cota fără poze, iar la
  livrare pozele sunt singura probă în caz de dispută.
- **Cum fac ei:** încărcare de poze pe formular.
- **Cum stăm noi:** coloana, bucket-ul și politicile există
  (`listing-photos`, politici pe `auth.uid()` ca prim segment de folder);
  formularul oferă doar poza găsită de importul AI.
- **Cum o facem mai bine:** aceleași poze devin **baza de comparație la
  livrare** în dovada de livrare (2.3). La ei o poză e o ilustrație; la noi
  e prima jumătate a unui raport de stare.
- **Efort:** mediu. **Impact:** important. **Fază:** 1 pentru încărcare, 2
  pentru comparație.
- **Riscuri:** GDPR — o poză de mașină conține număr de înmatriculare și
  uneori persoane; retenția lor trebuie legată de ștergerea anunțului, cum
  face deja `account_deletion_files` pentru `listing-photos`
  (`20260918180000:996`). Cost de stocare: limita bucket-ului e 5 MB pe
  fișier.

### 3.7 Semnele că platforma e vie

- **Problema:** o bursă goală nu e utilă nimănui, iar prima impresie
  decide dacă cineva mai revine.
- **Cum fac ei:** contor total de km, „86 adăugate în ultimele 2 zile",
  „acum 2 min" pe fiecare card, contoare pe categorii, hartă cu pini.
- **Cum stăm noi:** avem contorul de km agregat real, fluxul de cereri și
  sparkline-ul pe 30 de zile — **toate sub un prag reglabil**, deci pe o
  platformă goală nu se vede nimic. Decizia e corectă și costul ei e că,
  azi, pagina principală arată goală.
- **Cum o facem mai bine:** nu falsificând numerele, ci **având numere**:
  planul de pornire la rece din `docs/04-roadmap.md` (transportatorii
  primii, gratuit 3 luni, potrivire manuală la început) e o sarcină
  operațională, nu una de cod. În plus putem arăta un număr pe care ei nu
  îl au: **câte documente au fost verificate luna asta**.
- **Efort:** mic (afișarea numărului de verificări). **Impact:** important.
  **Fază:** 1.
- **Riscuri:** orice număr afișat public trebuie să excludă conturile de
  test — vezi 7.5.

### 3.8 Telefonul parțial mascat, în varianta onestă

- **Problema:** vizitatorul trebuie să vadă că în spatele anunțului e o
  firmă reală, înainte să plătească.
- **Cum fac ei:** telefonul afișat pe jumătate, ca momeală pentru abonament.
- **Cum stăm noi:** contactul e ascuns complet până la `reveal_contact()`.
- **Cum o facem mai bine:** nu mascăm un telefon, ci arătăm ce e verificat:
  numele firmei, CUI-ul, data ultimei verificări, ce documente sunt
  valabile azi. Este informație reală, nu o jumătate de informație.
  `/firme/[slug]` arată deja o parte; ce lipsește e legătura de pe cardul
  de anunț către profil.
- **Efort:** mic. **Impact:** important. **Fază:** 1.
- **Riscuri:** GDPR — pe anunțurile persoanelor fizice nu se afișează
  nimic identificabil, iar profilul public al firmei rămâne opțional
  (`/cont/firma` are deja comutatorul).

### 3.9 Recenziile, legate de un transport real

- **Problema:** reputația e singurul lucru care înlocuiește cunoașterea
  personală într-o piață de firme mici.
- **Cum fac ei:** recenzii de la clienți, moderate de un operator.
- **Cum stăm noi:** `ratings` cu regulă „numai după livrare", fără ecran.
- **Cum o facem mai bine:** o recenzie moderată de un operator este, la
  limită, o recenzie pe care operatorul o poate alege. A noastră nu poate
  exista fără un transport livrat în platformă, și pe profil apar
  **punctualitatea calculată din datele estimate ale ofertei** și rata de
  răspuns — lucruri care nu se scriu, se măsoară.
- **Efort:** mediu. **Impact:** important. **Fază:** 2.
- **Riscuri:** cu volum mic, o singură evaluare proastă poate distruge o
  firmă; de aceea nota se afișează abia de la un număr minim de transporturi.

### 3.10 Raportarea incidentelor și medierea

- **Problema:** când o mașină ajunge zgâriată, cineva trebuie să decidă.
- **Cum fac ei:** raportare de incident și mediere de către echipa lor.
- **Cum stăm noi:** `reports` e completă — motiv, detalii, probă, stare,
  rezoluție, cine a rezolvat — și **niciun ecran de administrare** nu o
  citește. Formularul public de sesizare există pe `/verificare`.
- **Cum o facem mai bine:** medierea noastră pleacă de la dovada de
  livrare (2.3), nu de la două povești. Pozele de la preluare și de la
  livrare, cu marcaj de timp și autor, nemodificabile, sunt proba.
- **Efort:** mediu (ecranul), mare (fluxul complet cu dovada).
  **Impact:** important. **Fază:** 2.
- **Riscuri:** mediere înseamnă răspundere — termenii trebuie să spună
  explicit că platforma nu e parte în contractul de transport. E pe lista
  avocatului din `docs/09-verificare-juridica.md`.

### 3.11 Generatorul de contract de transport

- **Problema:** două firme mici care nu s-au mai întâlnit au nevoie de o
  hârtie, și cei mai mulți o improvizează.
- **Cum fac ei:** un generator de contract pe site.
- **Cum stăm noi:** nimic. `transports` are deja `cmr_number`.
- **Cum o facem mai bine:** contractul nostru se poate **completa singur**
  din datele verificate — licență comunitară, copie conformă a vehiculului
  alocat, asigurare CMR cu data de expirare — pentru că le avem structurate
  și datate. Al lor completează ce tastează omul.
- **Efort:** mediu. **Impact:** opțional. **Fază:** 3 („After the MVP" în
  spec).
- **Riscuri:** legal — un model de contract generat de noi trebuie scris de
  avocat, altfel ne asumăm o răspundere pe care nu o vrem.

### 3.12 Grupurile de WhatsApp și Telegram

- **Problema:** transportatorii auto din România sunt deja în grupuri.
  Acolo se face piața azi.
- **Cum fac ei:** grupuri proprii, ca sursă de cereri și de membri.
- **Cum stăm noi:** nimic.
- **Cum o facem mai bine:** nu e o funcție, e distribuție — și e cea mai
  ieftină de pe listă. Un grup în care intră **doar transportatori
  verificați pe platformă** este, în sine, argumentul de vânzare.
- **Efort:** mic (operațional, nu cod). **Impact:** important la pornire.
  **Fază:** 1, dar ține de Oana și Edi, nu de repo.
- **Riscuri:** GDPR — un grup unde apar numerele de telefon ale membrilor
  cere o bază legală și o informare; abuz — moderarea costă timp.

---

## 4. Ce au ei și nu facem

Fiecare are un motiv scris, ca să nu mai reapară la fiecare discuție.
Motivele sunt patru: **în afara scopului**, **necinstit**, **prea scump**,
**altă nișă**.

| Ce au ei | De ce nu facem | Categoria | Ce am face în loc |
|---|---|---|---|
| **Urmărire GPS în timp real a cursei** | Cere hardware pe camion sau o aplicație pornită permanent pe telefonul șoferului, plus acorduri cu furnizori de telematică. Nu e ce a cerut clientul, și `docs/00-stadiu-platforma.md` §7 o listează deja ca decisă | prea scump + în afara scopului | „Locația temporară a vehiculului" pe durata unei comenzi active, declarată de șofer, listată „After the MVP" |
| **Hartă cu platformele în timp real** | Fără date de poziție reale, harta e o decorațiune cu pini inventați — exact tipul de număr pe care regula noastră („niciodată cifre inventate ca date reale") îl interzice | necinstit | O hartă a **rutelor publicate**, care sunt date reale, dacă și când volumul o justifică |
| **Widget cu prețul carburantului** | Nu influențează nicio decizie din platformă. E conținut de umplutură care arată a instrument | în afara scopului | Nimic. Spațiul merge la tarifele pe coridor, care chiar schimbă o decizie |
| **Alerte de accidente prin Waze / Telegram** | Nu are nicio legătură cu bursa de transport. Ar cere un canal de distribuție întreținut permanent pentru o valoare care nu ne aparține | în afara scopului | Nimic |
| **Două aplicații native (client și șofer)** | PWA-ul instalabil acoperă nevoia la o fracțiune din cost — decizie deja luată și documentată. Două aplicații native înseamnă două magazine, două cicluri de review și două coduri de întreținut, pentru o echipă de trei oameni | prea scump | PWA instalabil, deja construit: `manifest.webmanifest`, service worker, push cu VAPID |
| **Servicii proprii de asistență rutieră** (combustibil la drum, baterie, deblocare) | E un business de dispecerat de intervenții, cu operatori, disponibilitate 24/7 și răspundere proprie. Nu e o funcție a unei burse | altă nișă | `service_type = 'tractare'` rămâne în schemă; dacă piața o cere, deschidem panoul, nu serviciul |
| **Licitație propriu-zisă** | Ambele părți au cerut ofertă directă. `price_type` are valoarea `auction` în schemă, iar „Auctions" e explicit pe lista „Later" din spec | în afara scopului (decis) | Oferte directe cu preț și date, faza 5 din roadmap |
| **Insignă „Premium"** | O insignă plătită lângă una de verificare se citește ca verificare. `docs/01-product-spec.md` interzice explicit: „No paid badge may look like verification" | necinstit | Anunțuri promovate, etichetate ca atare, cu alte culori decât verificarea |
| **Contoare mari, rotunde și neverificabile** (336.009.580 km) | Funcționează, și de asta e tentant. Dar un număr pe care nu îl poate verifica nimeni e o afirmație, nu o măsurătoare | necinstit | `homepage_activity()` agregă transporturile publicate real, iar sub prag nu se afișează nimic |
| **Interogări automate ARR / RAR / AIDA** | Nu depinde de noi: nu există API public, portalul AIDA/BAAR are CAPTCHA și e făcut pentru oameni. Roadmap-ul avertizează explicit să nu alunece în MVP | prea scump + în afara controlului | Citirea documentului încărcat cu AI + confirmare umană, care rezolvă complet cerința clientului |

---

## 5. Idei noi care nu vin de la ei

Opt idei, toate posibile **din cauza** motorului de conformitate și a
datelor structurate pe care le avem deja. Niciuna nu cere o tehnologie pe
care nu o avem; fiecare cere muncă.

### 5.1 „Documentele transportatorului, în ziua în care îl suni"

Un link public, cu token, pe care transportatorul îl dă clientului și care
arată **starea de azi** a documentelor lui: ce are valabil, până când,
când a fost verificat ultima dată. Fără nume de fișiere, fără scanuri —
doar tipul documentului, starea și data.

Avem tot: `documents` cu `valid_until`, cele trei stări derivate,
`companies.verified_at`. **Efort:** mediu. **Impact:** important.
**Fază:** 1. **Risc:** GDPR — linkul trebuie să expire și să fie revocabil
de firmă; nu conține date personale ale șoferului.

### 5.2 Indicele de preț construit din oferte acceptate

Mediana pe coridor, calculată din transporturile încheiate, publicată
**numai peste un prag de eșantion și cu eșantionul afișat**. Tabelul lor e
static și sezonier; al nostru se îmbunătățește singur cu fiecare
tranzacție, iar ei nu pot recupera pentru că nu par să înregistreze
prețurile acceptate deloc.

`price_benchmarks` și `v_corridor_prices` există deja. **Efort:** mediu.
**Impact:** important. **Fază:** 3 (are nevoie de faza 2 ca să existe
tranzacții). **Risc:** cu eșantion mic, mediana e zgomot — de aceea pragul.

### 5.3 Plecări cu locuri, la care cererea se atașează

„Mai sunt 3 locuri pe platforma care pleacă marți din München" este
simultan un preț mai bun și un termen-limită. Modelul e deja în bază:
`truck_listings.platform_slots_total`, `departure_bookings`,
`v_departure_seats` cu `slots_free` calculat, plus rezervări care expiră în
24 de ore.

Ce lipsește: cererea să se poată lega de **o plecare anume**, nu să
plutească într-un bazin. **Efort:** mediu. **Impact:** important.
**Fază:** 2. **Risc:** supra-rezervare — deja prevenită de triggerul care
refuză peste `platform_slots_total` (`20260916130200:286`).

### 5.4 Avertismentul care leagă expirarea de calendarul firmei

Nu „RCA expiră în 7 zile", ci „RCA-ul de pe B-123-ABC expiră pe 12
octombrie, iar tu ai două curse publicate care pleacă după data aia".
Nimeni nu face asta, pentru că nimeni altcineva nu are ambele seturi de
date în aceeași bază.

`documents.valid_until` + `truck_listings.available_from` +
`cargo_listings.loading_from`. **Efort:** mediu. **Impact:** important.
**Fază:** 1 (după 1.1). **Risc:** niciunul, dacă mesajul rămâne informativ.

### 5.5 Starea de conformitate a coridorului

Pe fiecare pagină SEO de coridor: „pe ruta Germania → România sunt 18
transportatori înscriși, dintre care 14 au toate documentele valabile
astăzi". Este un număr pe care numai noi îl putem produce, și e chiar
argumentul de poziționare, transformat în conținut.

`count_matching_carriers_on_route()` există. **Efort:** mic.
**Impact:** important. **Fază:** 1 (odată cu 3.3). **Risc:** cu volum mic,
numărul e mic — de aceea nu publicăm pagina sub prag.

### 5.6 Dosarul de conformitate pentru casa de expediții

O casă de expediții care subcontractează răspunde pentru cine a ales.
Un PDF generat la cerere, care arată ce documente avea transportatorul
**la data la care a fost ales**, este exact hârtia de care are nevoie la
un control — și e imposibil de produs fără date datate.

Avem `documents` cu istoricul reviziilor și `audit_log` cu fiecare
aprobare. **Efort:** mediu. **Impact:** important, și e un motiv de
abonament Business. **Fază:** 2. **Risc:** legal — documentul trebuie să
spună ce atestă și ce nu; intră pe lista avocatului.

### 5.7 Importul din link, trimis pe WhatsApp

Importul AI din anunț funcționează deja și acceptă link sau poză. Pasul
următor natural: un număr de WhatsApp la care omul trimite linkul de pe
mobile.de sau o poză, și primește înapoi un link către cererea
pre-completată. Este exact fluxul pe care îl are deja, mutat acolo unde e
omul.

`extract-vehicle-listing` există; ce lipsește e canalul. **Efort:** mediu.
**Impact:** important. **Fază:** 3. **Risc:** cost pe mesaj (API-ul
WhatsApp Business se plătește pe conversație) și GDPR — conținutul
mesajelor e date personale; `listing_extractions` păstrează deja doar
hostname-ul, nu URL-ul complet, și regula trebuie păstrată.

### 5.8 Ce s-a întâmplat cu firmele suspendate, ca număr

Nu o listă cu nume — un contor pe `/verificare`: „luna aceasta am
suspendat N conturi pentru documente expirate și am reactivat M după
reînnoire". Transformă afirmația „verificăm" în singura dovadă care
contează: că **scoatem oameni de pe platformă**.

`account_suspensions` și `audit_log` au datele. **Efort:** mic.
**Impact:** important. **Fază:** 1. **Risc:** GDPR — strict agregat,
niciodată nominal; iar dacă numărul e zero, se spune zero.

---

## 6. Ce lipsește ca produs, nu ca funcție

Aici nu e vorba de funcții nescrise, ci de lucruri scrise care nu se leagă
între ele. Fiecare rând de mai jos e cod care există și pe care un om nu îl
poate atinge, sau un drum care se termină brusc.

### 6.1 Construit, dar inaccesibil din navigație

| Ce | Dovada | Ce vede omul azi |
|---|---|---|
| **Panoul public de cereri `/cereri`** | Nu apare în constanta `PAGES` din `src/components/layout/header-menu.tsx:25-30` (meniul public are Trasee, Prețuri, Firme, Abonamente). Singurul link din pagina principală e în ramura `withFeed` din `src/components/home/activity.tsx:79` | Pe o platformă goală (sub prag) nu există **niciun** drum către panoul de cereri, în afară de scrierea adresei. Un transportator care intră pe site nu găsește cererile |
| **Cele 161 de pagini SEO** | `seo_pages.is_published = false` implicit; `/transport-auto` listează doar ce e publicat | O secțiune întreagă a site-ului, goală |
| **`/preturi`** | În meniul public, dar `price_settings.is_published = false` | Pagina se deschide și spune că tarifele nu sunt publicate. Un element de meniu care nu duce nicăieri |
| **`/contact`** | `UNBUILT_ROUTES` în `src/config/routes.ts`; linkat din footer (`site-footer.tsx:16`) | „Pagină în lucru" — pe singura pagină pe care o caută cineva care are o problemă |
| **Rutele `accountOffers`, `accountMessages`, `accountTransports`, `accountNotifications`, `accountSettings`** | Declarate în `src/config/routes.ts`, fără `page.tsx` corespunzător | Nu sunt linkuri moarte — `FEATURES` le ține în afara meniului — dar sunt cinci adrese care returnează 404 dacă cineva le ghicește sau le are salvate |

### 6.2 Accesibil, dar fără date de arătat

| Ce | De ce e gol | Ce ar trebui să spună |
|---|---|---|
| Pagina principală, secțiunea „cereri" | Sub pragul din `/admin/activitate` | Spune corect că primele cereri vor apărea aici. Dar nu oferă panoul |
| `StatsBand` | Sub prag, banda lipsește complet | Corect — „7 firme verificate" răspunde singur la întrebarea pe care o ridică |
| `/firme` | Depinde de firme verificate cu profil public activat | — |
| `/preturi` | Nepublicat | vezi 6.1 |
| `/cont/notificari` (centrul de notificări) | `FEATURES.notifications = false` | Preferințele de notificare există separat, la `/cont/setari/notificari` |

### 6.3 Fluxuri care se opresc la jumătate

1. **Persoana fizică, de la intrare la publicare.** Cinci pași (cont,
   e-mail, confirmare, telefon, SMS) înainte de a putea publica ceva, pe
   latura pieței care tranzacționează o dată la trei ani. Concurentul cere
   zero. Este cea mai mare problemă de produs din document.
2. **După publicare, nu se întâmplă nimic.** Clientul vede numărul de
   transportatori compatibili — bine — și apoi așteaptă un telefon, pentru
   că nu există ofertă în platformă. Nu există nici măcar o stare goală
   care să spună „ofertele apar aici".
3. **Transportatorul vede o cerere și nu poate răspunde** decât sunând,
   după ce consumă o dezvăluire de contact. Exact lucrul pe care platforma
   trebuia să îl înlocuiască.
4. **Documentul expiră și omul nu află.** Regula se aplică în bază și
   corect; e-mailul se scrie în `notification_outbox` și stă acolo, pentru
   că `RESEND_API_KEY` nu e configurată. Cerințele 5 și 6 ale clientului
   sunt „parțiale" din acest singur motiv comun.
5. **Rolul `driver` nu are un motiv să existe încă.** Navigația îi dă patru
   intrări, dintre care niciuna nu e despre munca lui.
6. **Sesizarea de pe `/verificare` intră în `reports` și nu o citește
   nimeni.** Nu există ecran de administrare pentru ea.
7. **`audit_log` nu are cititor.** Tot ce e cerut de GDPR și de anchetă e
   scris acolo și se interoghează doar din baza de date.

### 6.4 Ce spune documentația și nu confirmă codul

Merită corectat, pentru că un checklist greșit e mai rău decât unul lipsă:

- `docs/faza-1-checklist.md` marchează **„Cont rapid persoană fizică,
  telefon confirmat prin OTP — gata"**. Codul spune altceva: înregistrarea
  individuală e e-mail + parolă (`src/app/auth-actions.ts:97`), iar OTP-ul
  pe telefon e un pas ulterior din `/cont/profil`
  (`src/app/cont/actions.ts:310`). **Starea reală: parțial.**
- `docs/00-stadiu-platforma.md` §4 și `src/components/firma/alerts-tab.tsx`
  descriu livrarea prin **n8n**; între timp livrarea s-a mutat în funcția
  edge `outbox-dispatcher`, iar `n8n/` conține doar `README.md`. Comentariul
  din cod și documentul trimit spre o piesă care nu mai e acolo.

---

## 7. Pregătire operațională

Nimic din secțiunea asta nu e cod, și fără ea un pilot nu are sens.
Preia și extinde tabelul din `docs/faza-1-checklist.md`.

| # | Ce | Stare | Cine | De ce blochează |
|---|---|---|---|---|
| 7.1 | **Furnizor de e-mail** (`RESEND_API_KEY`, `MAIL_FROM` pe Edge Functions) | lipsește | Edi / Madalin | Fără el nu pleacă nicio notificare, și patru funcționalități construite rămân mute |
| 7.2 | **SMTP propriu pentru e-mailurile de autentificare** (confirmare cont, resetare parolă) în Supabase Auth | lipsește | Madalin | Mailerul implicit Supabase e limitat la câteva mesaje pe oră și expediază de la o adresă care nu e a noastră. La 20 de înscrieri în aceeași zi, oamenii nu primesc confirmarea |
| 7.3 | **Furnizor de SMS** pentru OTP-ul de telefon în Supabase Auth | lipsește | Decizia clientului | Fără el, o persoană fizică **nu poate publica deloc** — triggerul cere `phone_verified` |
| 7.4 | **Documentele juridice verificate de avocat** + datele operatorului în `src/config/company.ts` | lipsește | Avocat + Edi | Blocant legal. Lista completă: `docs/09-verificare-juridica.md` |
| 7.5 | **Conturile de test, marcate și excluse din orice număr public** | parțial | Madalin | Contoarele de pe pagina principală și numărul de transportatori compatibili ar include conturi de test |
| 7.6 | **Proiect Supabase de producție** — azi previzualizările și producția folosesc același proiect | de decis | Edi / Madalin | Riscul e ca o previzualizare să atingă date de client. Regiunea nu se schimbă după creare |
| 7.7 | **Secretele în Vault**: `outbox_dispatcher_url`, `account_deletion_url`, `cron_secret` | de confirmat | Madalin | Joburile programate cheamă funcțiile edge prin `net.http_post`; fără secrete, nu cheamă nimic |
| 7.8 | **Cele opt joburi confirmate ca active** pe proiectul real (`/admin/notificari` trece pe „la zi" în 24 h) | de confirmat | Madalin | Suspendarea automată este chiar diferențiatorul; dacă jobul nu rulează, nu există |
| 7.9 | **Cheile VAPID** (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` pe Supabase; `NEXT_PUBLIC_VAPID_PUBLIC_KEY` pe Vercel) și `IMPORT_IP_SALT` | lipsesc | Madalin | Push-ul nu pleacă; importul din anunț merge doar cu cont |
| 7.10 | **Cine aprobă documentele și în cât timp** — cu nume | de decis | Edi | Promisiunea de pe pagina de înscriere. Fără un nume, coborâm la 48 de ore în zile lucrătoare și scriem asta |
| 7.11 | **Prețurile finale confirmate** (`plans` are cifre de lansare neconfirmate) | de confirmat | Edi + client | `/abonamente` și prima factură |
| 7.12 | **Procesator de plăți** (Netopia / Stripe / facturare manuală) | de decis | Client | Elementul 1.12. Până atunci, fluxul manual actual e onest și scris ca atare |
| 7.13 | **Tarifele orientative validate** de un transportator real | lipsește | Edi | `/preturi` și paginile SEO nu se pot publica cu cifre placeholder |
| 7.14 | **Planul de pornire la rece**: primii 20 de transportatori invitați personal, gratuit 3 luni în scris, potrivire manuală la început | de făcut | Edi | O bursă goală nu e utilă nimănui. Roadmap-ul îl descrie; nimeni nu l-a programat |
| 7.15 | **Canal de suport** (adresa din `/contact`, cine răspunde, în cât timp) | lipsește | Edi | `/contact` e placeholder |
| 7.16 | **Test de restaurare din backup**, o dată, înainte de lansare | de făcut | Madalin | Un backup netestat nu e un backup |
| 7.17 | **Monitorizare și alertare**: cine află că a picat dispecerul de notificări | lipsește | Madalin | `job_health` și `/admin/notificari` arată starea, dar nimeni nu e anunțat automat |
| 7.18 | **GDPR, partea de hârtie**: registrul prelucrărilor, acordurile cu împuterniciții (Supabase, Vercel, Resend, furnizorul de SMS, furnizorul de AI), informarea privind transferul în afara UE | lipsește | Edi + avocat | Motorul e construit (ștergere, export, anonimizare, retenție); documentația care îl însoțește, nu |
| 7.19 | **Activarea indexării** (`NEXT_PUBLIC_SEO_INDEXABLE`) și verificarea în Search Console | de făcut | Madalin | Azi `robots.txt` spune `Disallow: /` pentru tot site-ul |
| 7.20 | **Lighthouse pe mobil** pe `/` și pe o pagină SEO publicată (ținta din brief: ≥90 performanță, ≥95 accesibilitate) | nemăsurat | Madalin | `src/app/layout.tsx` are `dynamic = 'force-dynamic'`, deci nicio pagină nu e statică, inclusiv cele SEO |

---

## 8. Următoarele 10 lucruri de făcut

Ordonate după cât deblochează raportat la cât costă, nu după cât de
interesante sunt. Fiecare e scris ca să poată fi dat direct ca prompt.

### 1. Confirmă livrarea notificărilor, cap-coadă
**Fază 1 · efort mic-mediu · impact blocant · nu depinde de nimic**

> Configurează furnizorul de e-mail (`RESEND_API_KEY`, `MAIL_FROM` pe Edge
> Functions) și SMTP propriu în Supabase Auth pentru confirmarea contului
> și resetarea parolei. Apoi demonstrează că funcționează: publică o cerere
> de test, verifică pe `/admin/notificari` că rândul din
> `notification_outbox` trece din `queued` în `sent`, și că e-mailul ajunge
> într-un inbox real. Adaugă un test care cade dacă un rând `queued` rămâne
> `queued` după ce dispecerul rulează. Confirmă pe `/admin/notificari` că
> toate cele opt joburi programate de migrația `20260918210000` sunt
> active și trec pe „la zi" în 24 de ore.

**De ce primul:** patru funcționalități deja construite — memento-uri de
expirare, suspendări, alerte pe trasee, push — sunt mute până atunci, iar
cerințele 5 și 6 ale clientului rămân „parțiale" din acest singur motiv.

### 2. Fă panoul de cereri accesibil și repară stările goale
**Fază 1 · efort mic · impact important · nu depinde de nimic**

> Adaugă `/cereri` în constanta `PAGES` din
> `src/components/layout/header-menu.tsx`, lângă Trasee. În
> `src/components/home/activity.tsx`, componenta `Empty()` trebuie să
> ofere și ea drumul către panou, nu doar către publicare și trasee.
> Scoate `/preturi` din meniul public cât timp
> `price_settings.is_published` e `false`, sau publică tarifele (punctul
> 5). Înlocuiește placeholder-ul de pe `/contact` cu datele reale de
> contact ale operatorului. Adaugă un test de navigație care cade dacă un
> element de meniu public duce la o pagină care nu are ce afișa.

### 3. Publicarea unei cereri fără cont
**Fază 1 · efort mare · impact blocant · depinde de 1**

> Permite publicarea unei cereri fără cont. Formularul de pe
> `/cerere/noua` scrie cererea ca `draft` și trimite un link de
> revendicare pe e-mail sau SMS; cererea devine `active` la confirmare.
> Telefonul se confirmă abia când apare primul contact, nu înainte de
> publicare — mută regula din `guard_cargo_listing_publish`, nu o
> slăbi. Adaugă o regulă de retenție care șterge automat ciornele
> nerevendicate, ca la `contact_reveals` în `20260918230000`, și
> limitează publicările pe IP folosind hash-ul sărat existent
> (`IMPORT_IP_SALT`). Acoperă totul în `rls_test.sql`: o ciornă
> nerevendicată nu trebuie să fie vizibilă pe panou nimănui.

**De ce:** concurentul cere zero pași pe latura pieței care
tranzacționează o dată la trei ani. Noi cerem cinci.

### 4. Pozele urcate de client
**Fază 1 · efort mediu · impact important · nu depinde de nimic**

> Adaugă încărcarea de poze proprii în pasul 2 al formularului de cerere,
> în bucket-ul `listing-photos` care există deja, cu politicile care există
> deja (primul segment de folder = `auth.uid()`). Maximum 6 poze, 5 MB
> fiecare, redimensionate la încărcare. Arată-le pe cardul din panou și pe
> `/cereri/[id]`. Șterge-le odată cu anunțul și odată cu contul —
> `account_deletion_files` acoperă deja bucket-ul, verifică să rămână
> adevărat.

### 5. Publică tarifele, paginile SEO și indexarea
**Fază 1 · efort mediu · impact important · depinde de cifre validate**

> Înlocuiește tarifele placeholder din `price_rates` cu cifre validate de
> un transportator real, pune `price_settings.is_published = true` prin
> `/admin/preturi`, citește și publică cele 161 de pagini din
> `/admin/pagini`, apoi setează `NEXT_PUBLIC_SEO_INDEXABLE` și verifică
> `robots.txt` și `sitemap.xml` pe producție. Pe fiecare pagină de coridor
> adaugă numărul de transportatori verificați care circulă pe ruta
> respectivă, folosind `count_matching_carriers_on_route()`, și nu publica
> pagina dacă numărul e sub pragul din `/admin/activitate`.

### 6. Ecranul care măsoară criteriul de ieșire
**Fază 1 · efort mic · impact important · nu depinde de nimic**

> Construiește `/admin/pilot`: numărul de transportatori verificați și
> nesuspendați, numărul de case de expediții, și câte firme au fost active
> în fiecare din ultimele 8 săptămâni — activ însemnând cel puțin una
> dintre: a publicat (`published_at`), a deschis un contact
> (`contact_reveals`), a rezervat un loc (`departure_bookings`), s-a
> autentificat (`profiles.last_seen_at`). Plus câte intervenții manuale ale
> echipei au fost în fiecare săptămână, din `audit_log` filtrat pe
> `actor_role = 'staff'`, excluzând aprobările de documente. Exclude
> conturile de test. Un criteriu de ieșire pe care nu îl poți citi într-o
> pagină e un criteriu pe care nimeni nu îl verifică.

### 7. Fluxul de ofertă
**Fază 2 · efort mare · impact blocant · depinde de 1**

> Pornește `FEATURES.offers`. Construiește `/cont/oferte` pentru ambele
> părți și formularul de ofertă pe `/cereri/[id]`: preț și monedă, dată
> estimată de preluare, dată estimată de livrare, condiții de transport,
> link către profilul transportatorului. Acceptare, respingere și
> retragere prin `accept_offer()`, `reject_offer()`, `withdraw_offer()` —
> deja scrise și testate în bază. Adaugă „cere lămuriri", care deschide o
> conversație fără să accepte. Anunțul trece în `offers_received` cât timp
> există cel puțin o ofertă în așteptare și se întoarce în `active` când
> toate sunt retrase sau respinse.

### 8. Comanda și stările ei
**Fază 2 · efort mare · impact blocant · depinde de 7**

> Pornește `FEATURES.transports`. Construiește `/cont/transporturi` și
> pagina unei comenzi. Adaugă RPC-urile de tranziție care lipsesc —
> `order_confirmed` → `pickup_scheduled` → `vehicle_picked_up` →
> `in_transit` → `delivery_scheduled` → `vehicle_delivered` →
> `order_completed` — fiecare mutabilă doar de partea îndreptățită, fiecare
> cu verificare în `rls_test.sql`. Anunțul urmează comanda:
> `carrier_selected` → `in_progress` → `delivered`. Adaugă anularea și
> reclamația care trece comanda în `disputed`. La confirmarea comenzii pe o
> plecare cu locuri, scade locurile.

### 9. Dovada de livrare
**Fază 2 · efort mare · impact blocant · depinde de 8**

> Pe pagina comenzii: poze la preluare, raport de stare a vehiculului,
> documente de transport, poze la livrare, semnătură sau confirmare de la
> primitor, note de incident. Fiecare cu marcaj de timp și autor, niciuna
> ștergibilă. Bucket separat, cu politică pe părțile comenzii. Pune pozele
> de la preluare lângă pozele urcate de client la publicare (punctul 4):
> comparația e chiar proba în caz de dispută.

### 10. Mesageria cu mascare, și ecranul de reclamații
**Fază 2 · efort mare · impact important · depinde de 7**

> Pornește `FEATURES.messages`. Conversații pe anunț și pe ofertă, prin
> aceeași poartă de contact. **Maschează automat numerele de telefon și
> adresele de e-mail până la confirmarea comenzii** — nu e construit
> nicăieri azi și e singurul lucru care împiedică ocolirea cotei de
> contacte prin chat. Raportarea unui mesaj abuziv; ascunderea de către
> echipă, cu rând în `audit_log`. În același timp, construiește ecranul de
> administrare pentru `reports`, care e completă în bază și nu o citește
> niciun ecran: motiv, probă, stare, rezoluție, cine a rezolvat.

### Mici, se pot lega de orice pull request

Fiecare e sub o oră și niciunul nu merită un PR propriu:

- Insignă „Expres" pe cardul din panou și filtru pentru ea (`service_type`
  există deja).
- Durata anunțului aleasă de client: 3, 7, 14 sau 30 de zile, în locul
  celor 14 fixe din trigger.
- Extinde `FILTERABLE_CATEGORIES` de la 6 la toate cele 14 categorii.
- Link de pe cardul de anunț către profilul public al firmei
  (`/firme/[slug]`), acolo unde firma l-a activat.
- Corectează `docs/faza-1-checklist.md`: contul rapid al persoanei fizice
  este **parțial**, nu gata.
- Corectează comentariile care mai trimit la n8n pentru livrarea
  notificărilor (`src/components/firma/alerts-tab.tsx:19`,
  `docs/00-stadiu-platforma.md` §4) — livrarea e în funcția edge
  `outbox-dispatcher`.

---

## Anexă: ce nu am putut verifica și cum verifici tu

Instrucțiunea din brief cerea verificare pe producție cu conturile de
test. **Nu am făcut-o, pentru că din acest mediu nu se poate.** Mai jos,
pașii exacți.

| # | De verificat | Cum |
|---|---|---|
| 1 | **Persoana fizică poate publica?** Cea mai importantă. | Creează un cont pe `/inregistrare/persoana-fizica` cu o adresă reală. Ajunge e-mailul de confirmare? Apoi `/cont/profil` → telefon → primești SMS? Dacă nu, o persoană fizică **nu poate publica nimic** pe producție azi |
| 2 | **Joburile programate rulează?** | Supabase → SQL Editor: `select jobname, schedule, active from cron.job;` — trebuie să vezi opt. Apoi `/admin/notificari`: trec pe „la zi" în 24 de ore? |
| 3 | **Coada de notificări se golește?** | `select status, count(*) from notification_outbox group by status;` — dacă `queued` crește și `sent` e zero, punctul 1 din secțiunea 8 nu e făcut |
| 4 | **Date de test în producție?** | `select count(*) from companies;`, `select email from auth.users limit 20;` — caută `@test.ro`, `@example.com` |
| 5 | **Tarifele și paginile SEO** | `select is_published from price_settings;` și `select count(*) from seo_pages where is_published;` — aștept `false` și `0` |
| 6 | **Indexarea** | Deschide `https://<domeniu>/robots.txt`. Dacă scrie `Disallow: /`, `NEXT_PUBLIC_SEO_INDEXABLE` nu e setat |
| 7 | **Panoul de cereri e găsibil?** | Intră pe pagina principală într-o fereastră privată și încearcă să ajungi la `/cereri` fără să scrii adresa |
| 8 | **Cele patru tipuri de cont** | Parcurge `/inregistrare` pentru transportator, casă de expediții, ambele și persoană fizică. Până atunci, tot ce scrie „construit și testat" înseamnă „complet după cod și teste" |
| 9 | **Performanță** | Lighthouse pe mobil, pe `/` și pe o pagină SEO publicată |
| 10 | **Suitele `*-supabase.spec.ts`** | `supabase start` local, apoi `E2E_SUPABASE=1 pnpm test:e2e`. În acest mediu imaginile Docker nu se pot descărca |
