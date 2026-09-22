# Audit de securitate — înainte de utilizatori reali și documente reale

Făcut pe `main` la comitul `83a0b4c`, pe o bază de date construită din toate
cele 48 de migrări, interogată ca `anon` și ca `authenticated`. Unde scrie
**dovedit**, există o interogare rulată, nu o citire de cod.

Metoda: ce vede cineva care are **cheia `anon`** (ea este publică, stă în
pachetul din browser al oricărui vizitator) și cine se autentifică cu un cont
obișnuit. Nu ce vede ecranul — ce răspunde API-ul. PostgREST expune fiecare
tabelă, fiecare vedere și fiecare funcție cu drept de execuție, indiferent
dacă aplicația le folosește sau nu.

---

## Rezumat

| Severitate | Câte | Pe scurt |
|---|---|---|
| **Critic** | 2 | Pozele anunțurilor sunt publice și enumerabile de oricine; `anon` putea **șterge firme** prin `v_public_companies` (găsită după audit) |
| **Ridicat** | 4 | Directorul de firme servit lui `anon`; lipsa antetelor de securitate; jurnalul de audit fără retenție și fără ștergere la anonimizare; dovezile comenzii nu pot fi șterse niciodată |
| **Mediu** | 8 | Două gărzi moarte, CORS `*`, `SELECT` **și drept de scriere** acordate lui `anon` pe tabele private (a doua jumătate găsită de garda nouă), publicația realtime trimite corpul mesajului, praguri de abuz publice, acceptare de advisor pe o premisă falsă |
| **Scăzut** | 3 | Comparație de secret în timp variabil, e-mail de operator public, `pgcrypto` în `public` |

Nimic din ce urmează nu cere un cont de staff, un token furat sau o parolă
ghicită. Tot ce e marcat **critic** sau **ridicat** se face cu cheia `anon`
sau cu un cont obișnuit, nou-făcut.

### Ce s-a reparat, și unde

| | Constatare | PR | Cum a fost dovedită |
|---|---|---|---|
| C1 | pozele publice și enumerabile | #43 | 4 verificări SEC, 3 roșii înainte |
| C2 | scriere prin vederi, pe lângă RLS | #47 | 4 verificări VUE, 3 roșii înainte, + garda 8 |
| R1 | directorul de firme la `anon` | #43 | 3 verificări SEC, 2 roșii înainte |
| R2 | niciun antet de securitate | #44 | 11 unitare + 10 Playwright |
| R3 | jurnalul fără retenție și fără ștergere | #45 | 6 verificări SEC, toate 6 roșii înainte |
| R4 | dovezile comenzii, care nu se puteau șterge | #43 | 2 verificări SEC, 1 roșie înainte |
| M1, M2 | cele două gărzi moarte | #43 | 3 verificări SEC, toate 3 roșii înainte |
| M3 | CORS `*` | #44 | 5 teste Deno |
| M4 | granturi `anon` fără politică (citire) | #43 | garda 5 și 6 din `security_test.sql` |
| M4b | granturi `anon` fără politică (scriere) | #46 | găsită **de garda nouă**, la prima rulare |
| M6 | pragurile de abuz publice | #43 | 2 verificări, una nouă |
| S1 | secret comparat în timp variabil | #44 | 3 teste Deno |

**Rămân nereparate, cu motiv:**

- **M5** (publicația realtime trimite corpul mesajului) — depinde de o
  setare a proiectului, nu de repozitoriu. Vezi §6.1. Riscul real este mic:
  clientul tratează evenimentul ca pe un semnal și recitește prin
  `conversation_messages()`, care verifică din nou cine întreabă.
- **M7** (acceptarea de advisor pe o premisă falsă) — premisa a dispărut
  odată cu R1; rândul din `docs/DEPLOYMENT.md` rămâne de rescris la
  următoarea atingere a fișierului aceluia.
- **S2** (e-mailul de facturare al operatorului, public) — adresă de firmă,
  nu de persoană. Se închide când se completează datele operatorului.
- **S3** (`pgcrypto` în `public`) — mutarea unei extensii pe un proiect viu
  cere o fereastră de mentenanță și nu are ce căuta în același PR cu o
  reparație de scurgere.

---

## 1. Critic

### C1. Pozele din `listing-photos` sunt publice și oricine le poate enumera

**Unde:** `supabase/migrations/20260916120600_storage_notifications_cron.sql:14`
(bucket) și `:76` (politica `listing_photos_read_all`).

```sql
('listing-photos', 'listing-photos', true, 5242880, …)   -- public = true

create policy "listing_photos_read_all" on storage.objects
  for select to authenticated, anon
  using (bucket_id = 'listing-photos');
```

**Cum se exploatează.** `SELECT` pe `storage.objects` este API-ul de
*listare*. Politica nu pune nicio condiție în afară de numele bucketului,
deci oricine cu cheia `anon` cere lista completă a obiectelor și o
descarcă — bucketul fiind `public = true`, descărcarea nici măcar nu cere
un token.

**Dovedit:**

```
insert into storage.objects (bucket_id, name)
values ('listing-photos', '<user-id>/cerere-privata-1.jpg');

set role anon;
select name from storage.objects where bucket_id = 'listing-photos';
-- ANON CAN LIST: <user-id>/cerere-privata-1.jpg
```

**De ce e critic, nu mediu.** Trei lucruri se adună:

1. Sunt poze încărcate de clienți: mașina lor, uneori casa lor în fundal,
   uneori numărul de înmatriculare.
2. Primul segment din cale **este id-ul utilizatorului**
   (`listing_photos_insert_own` o impune), deci pozele se pot grupa pe om.
   Cine enumeră bucketul află câți utilizatori avem și cât încarcă fiecare.
3. **Cererile private au poze.** Toată munca de la PR #42 — cererea nu apare
   pe panou, nu se numără, nu se vede pe link direct, nu se poate deschide
   un fir pe ea — se ocolește cerând poza direct din storage.

**Reparația.** Bucketul devine privat; politica de `select` cere calea
proprie sau dreptul de a vedea anunțul; pozele se servesc prin URL semnat,
nu prin `getPublicUrl`.

---

### C2. `anon` putea șterge firme prin `v_public_companies`

**Găsită după audit**, în octombrie, în timp ce se rescria nota de advisor din
`docs/DEPLOYMENT.md`. Reparată în `20261001100000`.

**Unde:** implicitul Supabase (`alter default privileges in schema public
grant all on tables`) plus `create view`. Nicio migrare nu a acordat nimic —
nu era nevoie, venea din oficiu.

**De ce a scăpat auditului.** Auditul a numărat granturile pe **tabele**:
`relkind = 'r'`, și în interogările secțiunii 3, și în migrarea
`20260930100000`, și în garda 6 din `security_test.sql`. Vederile au
`relkind = 'v'`. Au trecut pe lângă toate trei.

**Cum se exploatează.** Trei lucruri trebuie să fie adevărate deodată, și
erau:

1. Vederea este o proiecție simplă dintr-o singură tabelă, deci Postgres o
   face **scriibilă automat** (`information_schema.views.is_updatable`).
   Trei dintre vederile noastre sunt așa: `v_public_companies`,
   `v_companies_public`, `v_document_requirements_public`.
2. Toate vederile noastre sunt `security_invoker = off`, deci scrierea prin
   ele se face **ca proprietarul vederii** — pe lângă RLS, pe lângă politici.
3. `anon` și `authenticated` aveau `insert`, `update` și `delete` pe ele.

**Dovedit:**

```
set role anon;
delete from public.v_public_companies where cui = '...';
-- DELETE 1

reset role;
select count(*) from public.companies where cui = '...';
--  0
```

Fără cont. Politicile de pe `companies` nu au apucat să fie consultate.
Singurul lucru care a oprit un `update` în aceeași probă a fost triggerul
`guard_company_write` — și numai pe coloanele de identificare, nu pe restul.

**De ce e critic.** Este ștergere de date de la distanță, neautentificată, cu
o cheie care stă în pachetul din browser. Nu scurgere: distrugere. Firmele
vizibile sunt exact cele cu profil public, adică exact cele pe care se
sprijină directorul.

**Reparația.** `revoke insert, update, delete, truncate, references, trigger`
de la `anon` și `authenticated` pe fiecare vedere, condus din catalog; și
`alter default privileges in schema public revoke insert, update, delete,
truncate on tables from anon`, ca să nu mai vină din oficiu. Garda 8 din
`security_test.sql` cade dacă o vedere nouă apare cu drept de scriere;
patru verificări `VUE` în `rls_test.sql` fac proba de sus, trei roșii
înainte de migrare.

**Ce de învățat.** Regula 3 („un grant și o politică sunt două lucruri") și
regula 5 („o vedere `security_invoker = off` citește pe lângă RLS") se
citeau amândouă ca fiind despre citire. Sunt și despre scriere. Iar o gardă
scrisă cu `relkind = 'r'` are o margine care nu se vede din text —
`CLAUDE.md` a primit rândul despre vederi.

---

## 2. Ridicat

### R1. `v_companies_public` servește lui `anon` firmele care au refuzat profilul public

**Unde:** `supabase/migrations/20260916120000_core_identity.sql:336-354`.

Comentariul de deasupra vederii spune *„what any **logged-in** user may see"*,
iar pagina care o folosește (`src/app/trasee/[id]/page.tsx:256`) o citește
numai pentru vizitatori autentificați. Dar linia 354 spune:

```sql
grant select on public.v_companies_public to authenticated, anon;
```

**Cum se exploatează.** `GET /rest/v1/v_companies_public?select=*` cu cheia
`anon`. Vederea este `security_invoker = off`, deci citește pe lângă RLS, iar
filtrul ei este doar `verification_status in ('verified','suspended')`. Nu
are `public_profile_enabled`. Nu are `is_suspended = false`. Nu respectă
`base_address_hidden`.

**Dovedit** — o firmă cu `public_profile_enabled = false`:

```
ANON SEES: Firma Discretă SRL | cui=RO99887766 | city=Cluj-Napoca
           | trust_score=77 | is_suspended=false
v_public_companies rows: 0      ← vederea corectă o ascunde
```

Adică: întregul director de firme verificate, cu CUI și oraș, plus două
coloane care sunt semnale interne de moderare — `trust_score` și
`is_suspended` — descărcabil de oricine, inclusiv pentru firmele care au bifat
explicit „nu vreau profil public".

**Reparația.** `revoke ... from anon`; scoaterea lui `trust_score` și
`is_suspended` din vedere; filtrul de profil public adăugat.

### R2. Nicio antetă de securitate

**Unde:** `next.config.ts` — `headers()` întoarce doar `x-coridor-commit`.

Lipsesc: `Content-Security-Policy`, `Strict-Transport-Security`,
`X-Frame-Options` / `frame-ancestors`, `Referrer-Policy`,
`Permissions-Policy`, `X-Content-Type-Options`.

**Cum se exploatează.** Fără `frame-ancestors`, `/cont/*` se pune într-un
`<iframe>` pe un site oarecare și se face clickjacking pe butoanele care
contează (acceptă oferta, șterge contul). Fără `Referrer-Policy`, fiecare
navigare către un domeniu extern trimite URL-ul întreg — iar URL-urile
noastre conțin id-uri de cereri, comenzi și conversații. Fără CSP, orice
XSS care apare vreodată are acces nelimitat.

**Reparația.** Antetele în `next.config.ts`, aplicate la `/:path*`.

### R3. `audit_log` nu se șterge niciodată și nu se curăță la anonimizare

**Unde:** `purge_audit_log(interval)` există în
`20260916130000_staff_audit.sql`, dar **nu este programată**: cele 18 joburi
`pg_cron` nu o cheamă. `anonymise_company()` și `staff_anonymise_account()`
nu ating tabela.

**Cum se exploatează.** Nu se exploatează — este o problemă de conformitate,
nu de atac. `audit_log.before` și `audit_log.after` sunt instantanee `jsonb`
ale rândurilor: nume, telefon, e-mail, CUI, textul unei evaluări. Un om care
cere ștergerea contului rămâne în jurnal, integral, pentru totdeauna.

**Reparația.** Jobul de retenție programat cu o fereastră scrisă în
`deletion_settings`; anonimizarea să treacă și prin `audit_log`.

### R4. Dovezile comenzii nu pot fi șterse de nimeni, niciodată

**Unde:** `guard_order_evidence_immutable()`, în
`20260923100100_faza2_comanda.sql`.

```sql
if current_user = 'service_role' then          -- SECURITY DEFINER
  return case when tg_op = 'DELETE' then old else new end;
end if;
```

Funcția este `SECURITY DEFINER`, deci `current_user` este **proprietarul
funcției**, niciodată apelantul. Portița pentru `service_role` nu se deschide
niciodată, deci garda se aplică inclusiv joburilor.

**Consecința.** `order-evidence` ține poze de la predare-primire: mașina,
numărul, uneori oameni. Nu există niciun drum prin care un job de retenție
sau de ștergere la cerere să le poată șterge. Direcția greșelii este cea
sigură (garda se aplică prea mult, nu prea puțin), dar rezultatul este că
ștergerea la cerere nu poate fi dusă până la capăt.

**Reparația.** Testul corect al apelantului — un flag de sesiune pus de job,
ca `app.audit_retention` — în locul lui `current_user`.

---

## 3. Mediu

### M1 și M2. Două gărzi care nu rulează niciodată

`guard_rating_update()` și `guard_rating_reply_write()`, amândouă
`SECURITY DEFINER`, amândouă încep cu:

```sql
if current_user not in ('authenticated', 'anon') then
  return new;            -- „sari peste verificare pentru joburi"
end if;
```

**Dovedit** — aceeași interogare, două funcții identice în afară de modul de
securitate:

```
caller role is authenticated. Inside SECURITY DEFINER, current_user = root
Inside SECURITY INVOKER,  current_user = authenticated
```

`current_user` nu este niciodată `authenticated` înăuntru, deci condiția este
**întotdeauna adevărată** și funcția se întoarce imediat. Regula „la o
evaluare se pot schimba doar câmpurile de moderare" și regula „un răspuns
publicat nu se șterge" nu există în practică.

**De ce mediu și nu ridicat.** `ratings` și `rating_replies` nu au politică de
`INSERT` sau `UPDATE` pentru `authenticated`, deci scrierea directă este deja
refuzată de RLS. Gărzile erau a doua plasă. Dar a doua plasă care nu există
este exact felul în care o migrare viitoare, care adaugă o politică de
update, deschide gaura în tăcere — și este **a treia oară** când clasa asta
de bug apare în proiect.

*(Cele unsprezece gărzi `SECURITY INVOKER` care folosesc `current_user` —
`guard_vehicle_write`, `guard_message_rate` și restul — sunt corecte: acolo
`current_user` chiar este apelantul.)*

### M3. CORS `*` pe cele trei funcții edge apelate din browser

`extract-vehicle-listing`, `parse-document` și `verify-cui-anaf` au
`"Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*"`, iar
`ALLOWED_ORIGIN` **nu este setat nicăieri** — nici în `scripts/ci/`, nici în
workflow-uri. Deci în producție rulează cu `*`.

Nu este o scurgere directă (nu se trimit credențiale), dar un site terț poate
chema funcțiile cu un token pe care îl are deja și poate consuma bugetul de
extragere al utilizatorului.

### M4. `SELECT` acordat lui `anon` pe tabele fără nicio politică pentru `anon`

`documents`, `profiles`, `messages`, `contact_reveals`, `audit_log`,
`transports` și încă ~40 au **dreptul** `SELECT` pentru `anon` (implicitul
Supabase). Astăzi RLS întoarce zero rânduri, deci nu curge nimic — **dovedit**,
probă pe toate cele 68 de tabele.

Problema este că ține de un singur lucru. Dacă RLS este vreodată oprită pe
una dintre ele — o migrare, un `alter table ... disable row level security`
într-o depanare — `anon` citește tot, instantaneu. Două lucruri ar trebui să
meargă prost, nu unul.

### M5. Publicația realtime trimite corpul mesajului

`20260925100000_faza2_mesagerie.sql:1886` adaugă `public.messages` în
`supabase_realtime`, cu toate coloanele. Clientul
(`src/lib/message-realtime.ts`) este scris corect — tratează evenimentul ca
pe un simplu „uită-te din nou" și recitește prin `conversation_messages()`,
care verifică din nou cine întreabă. Deci prin ecran nu curge nimic.

Rămâne însă că prin WebSocket pleacă `body`-ul, iar cine primește depinde de
aplicarea RLS pe `postgres_changes` **la nivelul proiectului**, nu al
repozitoriului. De verificat pe proiect, și de restrâns publicația la
coloanele de care clientul chiar are nevoie (`id`, `conversation_id`).

### M6. Pragurile de abuz sunt publice

`import_settings` este citibilă de `anon` (`using (true)`) și conține
`daily_limit_per_user`, `daily_limit_per_ip`, `monthly_budget_usd`,
`alert_at_pct`. Cine vrea să ne consume bugetul de extragere citește întâi
exact cât are voie și de la ce prag sunăm.

### M7. O acceptare de advisor pe o premisă care nu ține

`docs/DEPLOYMENT.md:168` acceptă `security_definer_view` pentru
`v_companies_public` pe motiv că „each exposes a filtered public subset on
purpose". Pentru `v_corridor_prices` și `v_departures` este adevărat. Pentru
`v_companies_public` nu este — vezi R1. Acceptarea a fost scrisă corect
pentru două vederi din trei și aplicată la toate.

---

## 4. Scăzut

### S1. Secretul de cron se compară în timp variabil

`req.headers.get("x-cron-secret") !== CRON_SECRET` în `compliance-sweep`,
`push-dispatcher`, `outbox-dispatcher`, `account-deletion`. Peste HTTP, cu
jitter de rețea, atacul de temporizare este teoretic. Se repară cu o
comparație constantă, costă trei linii.

### S2. E-mailul de facturare al operatorului este public

`pricing_settings.billing_contact_email`, citibil de `anon`. Adresă de firmă,
nu de persoană — dar ajunge la orice robot de spam.

### S3. `pgcrypto` și `pg_trgm` în schema `public`

`crypt()`, `gen_salt()`, `pgp_sym_*` sunt executabile de `anon`. Nu dezvăluie
nimic (nu avem chei acolo), dar `gen_salt('bf', 12)` este o funcție scumpă
chemabilă la nesfârșit — o pârghie ieftină de consum CPU. Advisorul
`extension_in_public` este deja acceptat pentru `pg_trgm`; `pgcrypto` merită
mutată în `extensions`.

---

## 5. Ce am verificat și este în regulă

Nu tot ce s-a căutat a produs o constatare. Pentru ca lista de mai sus să se
poată citi ca o listă scurtă, iată ce a trecut:

- **RLS este pornită pe toate cele 68 de tabele publice.** Niciuna fără.
- **Nicio politică `using (true)` pe date private.** Cele 13 care există sunt
  pe tabele de setări și de nomenclator.
- **Nicio politică permisivă care să anuleze una mai strictă.** Singura tabelă
  cu două politici `SELECT` este `listing_extractions`, iar cele două sunt o
  reuniune legitimă (staff sau proprietar).
- **Toate cele 286 de funcții `SECURITY DEFINER` au `search_path` fixat.**
  Zero excepții.
- **Granturile sunt explicite peste tot.** 10 funcții pentru `anon`, 172
  pentru `authenticated`, 39 pentru `service_role`, 65 pentru nimeni
  (triggere și funcții interne). Migrarea `20260916130300` a scos implicitul.
- **`carrier_count_probes` are RLS fără nicio politică** — deci refuză tot.
  Intenționat, și corect.
- **Linkul de revendicare** (`assisted_onboarding_preview`) e bine construit:
  token de 256 de biți, păstrat ca SHA-256, același mesaj de eroare pentru
  „nu există" și „a fost folosit", e-mail mascat.
- **Ruta de descărcare a exportului** verifică sesiunea, apoi tokenul, apoi
  semnează URL-ul; nu spune care dintre ele a eșuat.
- **Exportul de jurnal** (`/admin/jurnal/export`) este verificat de două ori:
  404 în handler și `audit_entries` refuzând în bază. Comentariul din fișier
  numește exact capcana: un route handler nu moștenește garda layout-ului.
- **Toate cele 40 de fișiere cu `'use server'`** verifică sesiunea pe server.
  Singura excepție, `home-actions.ts`, întoarce doar date deja publice și
  spune asta.
- **Niciun secret în pachetul din browser.** Căutat în cele 71 de chunk-uri
  pentru `SERVICE_ROLE`, `RESEND_API`, `VAPID_PRIVATE`, `CRON_SECRET`,
  `sk_live`, chei de model. Curat. Niciun `process.env` non-public într-un
  fișier `'use client'`.
- **`pnpm audit`: 0 vulnerabilități**, la toate severitățile.
- **Cele patru funcții edge cu rol de serviciu** refuză fără `x-cron-secret`,
  iar lipsa secretului este 503 care îl numește — nu un no-op tăcut.
- **Anonimizarea** trece prin anunțuri, documente, vehicule, șoferi, membri
  și invitații. Golurile sunt cele de la R3 și R4.

---

## 6. Ce trebuie făcut în afara codului

Astea nu se repară cu un commit:

1. **Verifică pe proiect că Realtime aplică RLS** pentru `postgres_changes`
   (Dashboard → Database → Replication). Dacă nu, `messages` trebuie scoasă
   din publicație până se activează.
2. **Setează `ALLOWED_ORIGIN`** ca secret al funcțiilor edge, la domeniul de
   producție: `supabase secrets set ALLOWED_ORIGIN=https://…`.
3. **Rotește `CRON_SECRET`** dacă a fost vreodată pus într-un log, un chat sau
   un istoric de shell. Nu am găsit urme, dar rotirea e ieftină.
4. **Pornește Leaked Password Protection** și pragul minim de parolă în
   Supabase Auth (Dashboard → Authentication → Policies).
5. **Verifică limitele de rată ale Auth** (înregistrare, autentificare,
   resetare parolă). Sunt ale GoTrue, cu valorile implicite — noi nu avem
   nimic deasupra lor.

---

## 7. Gărzile care le țin să nu se întoarcă

`supabase/tests/security_test.sql` rulează la fiecare `pnpm db:test` și în
CI. Nu verifică reguli de business, verifică **forma** schemei — opt gărzi,
una pentru fiecare clasă de bug de mai sus:

| Garda | Ce oprește |
|---|---|
| RLS pe fiecare tabelă publică | o tabelă nouă fără RLS |
| cel puțin o politică pe fiecare | o tabelă care refuză tot din scăpare, nu din intenție |
| `search_path` fixat pe fiecare `SECURITY DEFINER` | deturnarea unui apel din interiorul funcției |
| `current_user` interzis în `SECURITY DEFINER` | clasa de bug găsită de cinci ori |
| listă de funcții executabile de `anon` | un `grant ... to anon` din reflex |
| `anon` fără `SELECT` fără politică | RLS ca singură linie de apărare |
| `anon` fără drept de scriere nicăieri | aceeași, pentru scriere |
| nicio vedere cu drept de scriere pentru `anon` sau `authenticated` | o vedere scriibilă automat, care scrie pe lângă RLS |

A șaptea a găsit ceva la prima rulare: `anon` avea `insert`, `update` și
`delete` pe patruzeci de tabele. Nimic nu curgea — nicio politică de scriere
pentru `anon` nu există — dar dreptul aștepta acolo. Retras în
`20260930100000`.

### Secțiunea 4, dusă până la capăt

Auditul a numărat **116 funcții** apelabile de un cont autentificat care iau
un `uuid` — acelea sunt cele pentru care „id-ul altcuiva" este o întrebare.
Suita atingea 91. Din restul de 25, optsprezece sunt ajutători de politică
(`is_company_member`, `can_see_listing`), verificați indirect de fiecare
verificare de politică. **Șapte întorc date sau scriu**, și pentru ele
citirea codului nu este o dovadă:

`conversation_messages`, `offer_thread`, `order_evidence_list`,
`order_timeline`, `order_crew_options`, `route_series_upcoming`,
`mark_subscription_request_contacted`.

Toate șapte s-au dovedit corecte. Au acum verificări cu id-ul altcuiva, ca a
doua oară să nu mai fie nevoie de citit.

> Prima scriere a verificării pe `route_series_upcoming` **trecea degeaba**:
> lua id-ul cu un subselect pe `route_series`, iar sub RLS celălalt cont nu
> vede seria deloc, deci subselectul dădea `null` și funcția întorcea
> liniștită mulțimea goală. Id-ul trece acum prin `pg_temp.asi_ctx`. O
> verificare care nu cere niciodată ce spune că cere este mai rea decât
> niciuna.

Nuanța care rămăsese — `route_series_upcoming` ridica „Seria nu este a
firmei tale" pentru o serie care există și nu este a ta, dar tăcea pentru
una inexistentă, deci confirma existența — s-a închis în `20261001100000`.
Amândouă cazurile întorc acum mulțimea goală, și trei verificări o spun,
una dintre ele ca egalitate între cele două răspunsuri.

Și cei optsprezece ajutători de politică au acum verificări directe, câte
două fiecare: o dată cu id-ul altcuiva de un cont autentificat, o dată fără
cont deloc (blocul `HLP` din `rls_test.sql`). Șaptesprezece erau deja
corecți. Al optsprezecelea, `is_assisted_company()`, întorcea oricui starea
de înscriere a oricărei firme; toate cele trei politici care îl folosesc îl
scriu ca `is_platform_admin() and is_assisted_company(...)`, deci condiția a
intrat în funcție.

`scripts/ci/smoke-deployment.sh` verifică antetele **pe răspunsul
deployment-ului**, nu pe configurația noastră. Testul unitar și cel
Playwright se uită la partea noastră de sârmă; un antet pierdut într-o
setare de platformă, într-o regulă de CDN sau într-un merge prost ar trece
de amândouă și ar lipsi din producție.

`tests/unit/bundle-secrets.test.ts` face cealaltă jumătate: niciun fișier
`'use client'` nu citește o variabilă care nu este `NEXT_PUBLIC_*`, și
chunk-urile construite nu conțin nimic în formă de cheie.

Regulile în cuvinte sunt în secțiunea **Securitate** din `CLAUDE.md`, cu
bug-ul din care vine fiecare.

---

## Anexa A — politici, pe tabelă și comandă

Ce comandă are politică. O celulă goală înseamnă că nimeni nu poate face
acțiunea prin API — RLS refuză implicit, ceea ce este poziția sigură.

| Tabelă | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `account_deletion_requests` | da | — | — | — |
| `account_suspensions` | da | da | da | da |
| `assisted_onboardings` | da | — | — | — |
| `audit_log` | da | — | — | — |
| `cargo_freight_details` | da | da | da | da |
| `cargo_listing_invites` | da | — | — | — |
| `cargo_listings` | da | da | da | da |
| `cargo_vehicle_details` | da | da | da | da |
| `carrier_count_probes` | — | — | — | — |
| `companies` | da | — | da | da |
| `company_invitations` | da | — | — | — |
| `company_members` | da | — | da | da |
| `contact_reveals` | da | da | da | da |
| `conversations` | da | da | — | da |
| `data_export_requests` | da | — | — | — |
| `deletion_settings` | da | — | — | — |
| `departure_bookings` | da | da | da | da |
| `document_requirements` | da | da | da | da |
| `documents` | da | da | — | da |
| `drivers` | da | da | da | da |
| `equipment_options` | da | — | — | — |
| `favourite_carriers` | da | — | — | — |
| `homepage_settings` | da | — | — | — |
| `import_settings` | da | — | — | — |
| `job_run_log` | da | — | — | — |
| `listing_contacts` | da | da | da | da |
| `listing_extractions` | da | — | — | — |
| `matching_settings` | da | — | — | — |
| `message_attachments` | da | da | — | — |
| `message_blocks` | da | — | — | — |
| `messages` | da | da | da | — |
| `messaging_settings` | da | — | — | — |
| `notification_outbox` | da | da | da | da |
| `notification_preferences` | da | da | da | da |
| `notification_settings` | da | da | da | da |
| `notification_types` | da | — | — | — |
| `offer_settings` | da | — | — | — |
| `offers` | da | da | — | da |
| `order_dispute_reasons` | da | — | — | — |
| `order_events` | da | — | — | — |
| `order_evidence` | da | da | — | — |
| `order_settings` | da | — | — | — |
| `plan_billing_periods` | da | — | — | — |
| `plans` | da | da | — | da |
| `platform_staff` | da | — | — | — |
| `price_benchmarks` | da | da | da | da |
| `price_rates` | da | — | — | — |
| `price_settings` | da | — | — | — |
| `pricing_settings` | da | — | — | — |
| `profiles` | da | — | da | da |
| `push_subscriptions` | da | da | da | da |
| `rating_replies` | da | — | — | — |
| `rating_settings` | da | — | — | — |
| `ratings` | da | — | — | da |
| `recurrence_settings` | da | — | — | — |
| `reports` | da | da | da | da |
| `route_series` | da | — | — | — |
| `saved_search_matches` | da | — | — | — |
| `saved_searches` | da | da | da | da |
| `seo_pages` | da | — | — | — |
| `service_options` | da | — | — | — |
| `subscription_requests` | da | — | — | — |
| `subscriptions` | da | da | da | da |
| `terms_acceptances` | da | — | — | — |
| `transports` | da | — | da | da |
| `truck_listings` | da | da | da | da |
| `vehicle_routes` | da | da | da | da |
| `vehicles` | da | da | da | da |

### Fiecare politică, cu rolul ei

| Tabelă | Comandă | Roluri | Politica |
|---|---|---|---|
| `account_deletion_requests` | SELECT | authenticated | `account_deletion_select_own_or_staff` |
| `account_suspensions` | INSERT | authenticated | `account_suspensions_insert_admin` |
| `account_suspensions` | DELETE | authenticated | `account_suspensions_delete_admin` |
| `account_suspensions` | SELECT | authenticated | `account_suspensions_select_own_or_admin` |
| `account_suspensions` | UPDATE | authenticated | `account_suspensions_update_admin` |
| `assisted_onboardings` | SELECT | authenticated | `assisted_onboardings_select_staff` |
| `audit_log` | SELECT | authenticated | `audit_log_select_staff` |
| `cargo_freight_details` | INSERT | authenticated | `cargo_freight_details_insert` |
| `cargo_freight_details` | DELETE | authenticated | `cargo_freight_details_delete` |
| `cargo_freight_details` | SELECT | authenticated | `cargo_freight_details_select` |
| `cargo_freight_details` | UPDATE | authenticated | `cargo_freight_details_update` |
| `cargo_listing_invites` | SELECT | authenticated | `cargo_listing_invites_select_involved` |
| `cargo_listings` | INSERT | authenticated | `cargo_listings_insert_own` |
| `cargo_listings` | DELETE | authenticated | `cargo_listings_delete_own` |
| `cargo_listings` | SELECT | authenticated | `cargo_listings_select_visible` |
| `cargo_listings` | UPDATE | authenticated | `cargo_listings_update_own` |
| `cargo_vehicle_details` | INSERT | authenticated | `cargo_vehicle_details_insert` |
| `cargo_vehicle_details` | DELETE | authenticated | `cargo_vehicle_details_delete` |
| `cargo_vehicle_details` | SELECT | authenticated | `cargo_vehicle_details_select` |
| `cargo_vehicle_details` | UPDATE | authenticated | `cargo_vehicle_details_update` |
| `companies` | DELETE | authenticated | `companies_delete_admin_only` |
| `companies` | SELECT | authenticated | `companies_select_members_or_admin` |
| `companies` | UPDATE | authenticated | `companies_update_managers_or_admin` |
| `company_invitations` | SELECT | authenticated | `company_invitations_select` |
| `company_members` | DELETE | authenticated | `company_members_delete_manager_or_self` |
| `company_members` | SELECT | authenticated | `company_members_select_same_company` |
| `company_members` | UPDATE | authenticated | `company_members_update_manager` |
| `contact_reveals` | INSERT | authenticated | `contact_reveals_insert_admin` |
| `contact_reveals` | DELETE | authenticated | `contact_reveals_delete_admin` |
| `contact_reveals` | SELECT | authenticated | `contact_reveals_select_own` |
| `contact_reveals` | UPDATE | authenticated | `contact_reveals_update_admin` |
| `conversations` | INSERT | authenticated | `conversations_insert_initiator` |
| `conversations` | DELETE | authenticated | `conversations_delete_admin` |
| `conversations` | SELECT | authenticated | `conversations_select_participant` |
| `data_export_requests` | SELECT | authenticated | `data_export_select_own_or_staff` |
| `deletion_settings` | SELECT | authenticated | `deletion_settings_read` |
| `departure_bookings` | INSERT | authenticated | `departure_bookings_insert` |
| `departure_bookings` | DELETE | authenticated | `departure_bookings_delete_staff` |
| `departure_bookings` | SELECT | authenticated | `departure_bookings_select` |
| `departure_bookings` | UPDATE | authenticated | `departure_bookings_update` |
| `document_requirements` | INSERT | authenticated | `document_requirements_insert_admin` |
| `document_requirements` | DELETE | authenticated | `document_requirements_delete_admin` |
| `document_requirements` | SELECT | authenticated | `document_requirements_select_all` |
| `document_requirements` | UPDATE | authenticated | `document_requirements_update_admin` |
| `documents` | INSERT | authenticated | `documents_insert_own_or_assisting` |
| `documents` | DELETE | authenticated | `documents_delete_staff` |
| `documents` | SELECT | authenticated | `documents_select_own_or_admin` |
| `drivers` | INSERT | authenticated | `drivers_insert_own` |
| `drivers` | DELETE | authenticated | `drivers_delete_manager` |
| `drivers` | SELECT | authenticated | `drivers_select_own_or_admin` |
| `drivers` | UPDATE | authenticated | `drivers_update_own` |
| `equipment_options` | SELECT | anon, authenticated | `equipment_options_read_all` |
| `favourite_carriers` | SELECT | authenticated | `favourite_carriers_select_own` |
| `homepage_settings` | SELECT | anon, authenticated | `homepage_settings_select_all` |
| `import_settings` | SELECT | anon, authenticated | `import_settings_select_all` |
| `job_run_log` | SELECT | authenticated | `job_run_log_select_staff` |
| `listing_contacts` | INSERT | authenticated | `listing_contacts_insert_owner` |
| `listing_contacts` | DELETE | authenticated | `listing_contacts_delete_owner` |
| `listing_contacts` | SELECT | authenticated | `listing_contacts_select_owner_or_admin` |
| `listing_contacts` | UPDATE | authenticated | `listing_contacts_update_owner` |
| `listing_extractions` | SELECT | authenticated | `listing_extractions_select_staff` |
| `listing_extractions` | SELECT | authenticated | `listing_extractions_select_own` |
| `matching_settings` | SELECT | anon, authenticated | `matching_settings_select_all` |
| `message_attachments` | INSERT | authenticated | `message_attachments_insert_sender` |
| `message_attachments` | SELECT | authenticated | `message_attachments_select_participant` |
| `message_blocks` | SELECT | authenticated | `message_blocks_select_own` |
| `messages` | INSERT | authenticated | `messages_insert_participant` |
| `messages` | SELECT | authenticated | `messages_select_participant` |
| `messages` | UPDATE | authenticated | `messages_update_staff` |
| `messaging_settings` | SELECT | authenticated | `messaging_settings_read` |
| `notification_outbox` | INSERT | authenticated | `outbox_insert_admin` |
| `notification_outbox` | DELETE | authenticated | `outbox_delete_admin` |
| `notification_outbox` | SELECT | authenticated | `outbox_select_own_or_admin` |
| `notification_outbox` | UPDATE | authenticated | `outbox_update_admin` |
| `notification_preferences` | ALL | authenticated | `notification_preferences_own` |
| `notification_settings` | ALL | authenticated | `notification_settings_own` |
| `notification_types` | SELECT | authenticated | `notification_types_read_all` |
| `offer_settings` | SELECT | authenticated | `offer_settings_select_all` |
| `offers` | INSERT | authenticated | `offers_insert_self` |
| `offers` | DELETE | authenticated | `offers_delete_staff` |
| `offers` | SELECT | authenticated | `offers_select_parties` |
| `order_dispute_reasons` | SELECT | authenticated | `order_dispute_reasons_read` |
| `order_events` | SELECT | authenticated | `order_events_select_parties` |
| `order_evidence` | INSERT | authenticated | `order_evidence_insert_carrier` |
| `order_evidence` | SELECT | authenticated | `order_evidence_select_parties` |
| `order_settings` | SELECT | authenticated | `order_settings_read` |
| `plan_billing_periods` | SELECT | anon, authenticated | `plan_periods_select_public` |
| `plans` | INSERT | authenticated | `plans_insert_admin` |
| `plans` | DELETE | authenticated | `plans_delete_admin` |
| `plans` | SELECT | anon, authenticated | `plans_select_public` |
| `platform_staff` | SELECT | authenticated | `platform_staff_select_staff_or_self` |
| `price_benchmarks` | INSERT | authenticated | `price_benchmarks_insert` |
| `price_benchmarks` | DELETE | authenticated | `price_benchmarks_delete` |
| `price_benchmarks` | SELECT | anon, authenticated | `price_benchmarks_select` |
| `price_benchmarks` | UPDATE | authenticated | `price_benchmarks_update` |
| `price_rates` | SELECT | anon, authenticated | `price_rates_select_published` |
| `price_settings` | SELECT | anon, authenticated | `price_settings_select_published` |
| `pricing_settings` | SELECT | anon, authenticated | `pricing_settings_select_all` |
| `profiles` | DELETE | authenticated | `profiles_delete_admin_only` |
| `profiles` | SELECT | authenticated | `profiles_select_self_or_admin` |
| `profiles` | UPDATE | authenticated | `profiles_update_self_or_admin` |
| `push_subscriptions` | ALL | authenticated | `push_subscriptions_own` |
| `rating_replies` | SELECT | authenticated | `rating_replies_select_visible` |
| `rating_settings` | SELECT | authenticated | `rating_settings_read` |
| `ratings` | DELETE | authenticated | `ratings_delete_admin` |
| `ratings` | SELECT | authenticated | `ratings_select_visible` |
| `recurrence_settings` | SELECT | anon, authenticated | `recurrence_settings_read_all` |
| `reports` | INSERT | authenticated | `reports_insert_self` |
| `reports` | DELETE | authenticated | `reports_delete_admin` |
| `reports` | SELECT | authenticated | `reports_select_own_or_admin` |
| `reports` | UPDATE | authenticated | `reports_update_admin` |
| `route_series` | SELECT | authenticated | `route_series_select_own_or_staff` |
| `saved_search_matches` | SELECT | authenticated | `saved_search_matches_select_own` |
| `saved_searches` | INSERT | authenticated | `saved_searches_insert_own` |
| `saved_searches` | DELETE | authenticated | `saved_searches_delete_own` |
| `saved_searches` | SELECT | authenticated | `saved_searches_select_own` |
| `saved_searches` | UPDATE | authenticated | `saved_searches_update_own` |
| `seo_pages` | SELECT | anon, authenticated | `seo_pages_read_published` |
| `service_options` | SELECT | anon, authenticated | `service_options_read_all` |
| `subscription_requests` | SELECT | authenticated | `subscription_requests_select_own` |
| `subscriptions` | INSERT | authenticated | `subscriptions_insert_admin` |
| `subscriptions` | DELETE | authenticated | `subscriptions_delete_admin` |
| `subscriptions` | SELECT | authenticated | `subscriptions_select_own` |
| `subscriptions` | UPDATE | authenticated | `subscriptions_update_admin` |
| `terms_acceptances` | SELECT | authenticated | `terms_acceptances_select_own_or_staff` |
| `transports` | DELETE | authenticated | `transports_delete_admin` |
| `transports` | SELECT | authenticated | `transports_select_parties` |
| `transports` | UPDATE | authenticated | `transports_update_staff` |
| `truck_listings` | INSERT | authenticated | `truck_listings_insert_own` |
| `truck_listings` | DELETE | authenticated | `truck_listings_delete_own` |
| `truck_listings` | SELECT | authenticated | `truck_listings_select_active_or_own` |
| `truck_listings` | UPDATE | authenticated | `truck_listings_update_own` |
| `vehicle_routes` | INSERT | authenticated | `vehicle_routes_insert` |
| `vehicle_routes` | DELETE | authenticated | `vehicle_routes_delete` |
| `vehicle_routes` | SELECT | authenticated | `vehicle_routes_select` |
| `vehicle_routes` | UPDATE | authenticated | `vehicle_routes_update` |
| `vehicles` | INSERT | authenticated | `vehicles_insert_own_or_assisting` |
| `vehicles` | DELETE | authenticated | `vehicles_delete_manager` |
| `vehicles` | SELECT | authenticated | `vehicles_select_own_or_admin` |
| `vehicles` | UPDATE | authenticated | `vehicles_update_own` |

---

## Anexa B — funcțiile `SECURITY DEFINER`, cu granturile finale

Toate 286, grupate după cine le poate executa. Coloana a treia este
`search_path` fixat.

| Funcție | Execută | search_path |
|---|---|---|
| `assisted_onboarding_preview` | anon + authenticated | da |
| `cancel_account_deletion_by_token` | anon + authenticated | da |
| `category_counts` | anon + authenticated | da |
| `company_ratings` | anon + authenticated | da |
| `detour_km` | anon + authenticated | da |
| `directory_stats` | anon + authenticated | da |
| `homepage_activity` | anon + authenticated | da |
| `is_platform_admin` | anon + authenticated | da |
| `prices_are_published` | anon + authenticated | da |
| `verified_carriers_count` | anon + authenticated | da |
| `accept_company_invitation` | authenticated | da |
| `accept_offer` | authenticated | da |
| `accept_terms` | authenticated | da |
| `activate_subscription_request` | authenticated | da |
| `add_favourite_carrier` | authenticated | da |
| `admin_assisted_onboardings` | authenticated | da |
| `admin_conversations` | authenticated | da |
| `admin_listings` | authenticated | da |
| `admin_offer` | authenticated | da |
| `admin_offer_companies` | authenticated | da |
| `admin_offers` | authenticated | da |
| `admin_order_companies` | authenticated | da |
| `admin_orders` | authenticated | da |
| `admin_ratings` | authenticated | da |
| `assign_order_crew` | authenticated | da |
| `assisted_create_company` | authenticated | da |
| `assisted_handover_summary` | authenticated | da |
| `audit_entries` | authenticated | da |
| `audit_facets` | authenticated | da |
| `best_route_detour` | authenticated | da |
| `block_sender` | authenticated | da |
| `can_edit_cargo_listing` | authenticated | da |
| `can_see_cargo_listing` | authenticated | da |
| `can_see_listing` | authenticated | da |
| `can_see_order` | authenticated | da |
| `cancel_account_deletion` | authenticated | da |
| `cancel_cargo_request` | authenticated | da |
| `cancel_order` | authenticated | da |
| `claim_assisted_onboarding` | authenticated | da |
| `claim_data_export` | authenticated | da |
| `company_detour_ok` | authenticated | da |
| `company_review_readiness` | authenticated | da |
| `company_slug` | authenticated | da |
| `confirm_departure_booking` | authenticated | da |
| `conversation_messages` | authenticated | da |
| `count_matching_carriers` | authenticated | da |
| `create_cargo_request` | authenticated | da |
| `create_company` | authenticated | da |
| `create_route_series` | authenticated | da |
| `current_plan` | authenticated | da |
| `decline_company_invitation` | authenticated | da |
| `edit_rating` | authenticated | da |
| `eligible_vehicles` | authenticated | da |
| `enqueue_test_notification` | authenticated | da |
| `export_moderation_csv` | authenticated | da |
| `find_account_by_email` | authenticated | da |
| `finish_data_export` | authenticated | da |
| `handle_report` | authenticated | da |
| `has_agreed_order` | authenticated | da |
| `import_budget_status` | authenticated | da |
| `import_quota` | authenticated | da |
| `invite_company_member` | authenticated | da |
| `is_assisted_company` | authenticated | da |
| `is_company_driver_only` | authenticated | da |
| `is_company_manager` | authenticated | da |
| `is_company_member` | authenticated | da |
| `is_company_operator` | authenticated | da |
| `is_conversation_participant` | authenticated | da |
| `is_invited_to_listing` | authenticated | da |
| `is_order_driver` | authenticated | da |
| `is_transport_party` | authenticated | da |
| `issue_assisted_claim` | authenticated | da |
| `job_health` | authenticated | da |
| `list_company_members` | authenticated | da |
| `mail_provider_state` | authenticated | da |
| `mark_conversation_read` | authenticated | da |
| `mark_subscription_request_contacted` | authenticated | da |
| `my_confirmed_email` | authenticated | da |
| `my_conversations` | authenticated | da |
| `my_data_export` | authenticated | da |
| `my_deletion_blockers` | authenticated | da |
| `my_favourite_carriers` | authenticated | da |
| `my_invitations` | authenticated | da |
| `my_offers` | authenticated | da |
| `my_orders` | authenticated | da |
| `my_ratings` | authenticated | da |
| `notification_channel_enabled` | authenticated | da |
| `offer_quota` | authenticated | da |
| `offer_thread` | authenticated | da |
| `offers_for_request` | authenticated | da |
| `open_listing_to_public` | authenticated | da |
| `open_offer_thread` | authenticated | da |
| `open_order_dispute` | authenticated | da |
| `order_actor_side` | authenticated | da |
| `order_contacts` | authenticated | da |
| `order_crew_options` | authenticated | da |
| `order_detail` | authenticated | da |
| `order_evidence_count` | authenticated | da |
| `order_evidence_list` | authenticated | da |
| `order_rating_state` | authenticated | da |
| `order_timeline` | authenticated | da |
| `outbox_stats` | authenticated | da |
| `owns_listing` | authenticated | da |
| `pending_rating_count` | authenticated | da |
| `pilot_assisted` | authenticated | da |
| `pilot_overview` | authenticated | da |
| `pilot_weekly_activity` | authenticated | da |
| `post_rating` | authenticated | da |
| `preview_matching_carriers` | authenticated | da |
| `private_request_for_viewer` | authenticated | da |
| `publish_cargo_request` | authenticated | da |
| `push_subscription_stats` | authenticated | da |
| `reject_offer` | authenticated | da |
| `reject_subscription_request` | authenticated | da |
| `remove_favourite_carrier` | authenticated | da |
| `reopen_cargo_request` | authenticated | da |
| `reply_to_rating` | authenticated | da |
| `report_message` | authenticated | da |
| `report_rating` | authenticated | da |
| `request_account_deletion` | authenticated | da |
| `request_data_export` | authenticated | da |
| `request_subscription` | authenticated | da |
| `resolve_order_dispute` | authenticated | da |
| `retry_outbox_row` | authenticated | da |
| `reveal_contact` | authenticated | da |
| `review_company` | authenticated | da |
| `review_document` | authenticated | da |
| `review_document_assisted` | authenticated | da |
| `revoke_company_invitation` | authenticated | da |
| `route_series_upcoming` | authenticated | da |
| `save_search` | authenticated | da |
| `saved_search_activity` | authenticated | da |
| `saved_search_match` | authenticated | da |
| `saved_search_quota` | authenticated | da |
| `send_test_push` | authenticated | da |
| `set_company_public_profile` | authenticated | da |
| `set_deletion_settings` | authenticated | da |
| `set_directory_settings` | authenticated | da |
| `set_equipment_option` | authenticated | da |
| `set_homepage_settings` | authenticated | da |
| `set_import_settings` | authenticated | da |
| `set_listing_invites` | authenticated | da |
| `set_listing_private` | authenticated | da |
| `set_matching_settings` | authenticated | da |
| `set_messaging_settings` | authenticated | da |
| `set_offer_settings` | authenticated | da |
| `set_order_settings` | authenticated | da |
| `set_plan` | authenticated | da |
| `set_plan_period` | authenticated | da |
| `set_platform_staff` | authenticated | da |
| `set_price_rate` | authenticated | da |
| `set_price_settings` | authenticated | da |
| `set_prices_published` | authenticated | da |
| `set_pricing_settings` | authenticated | da |
| `set_rating_settings` | authenticated | da |
| `set_recurrence_settings` | authenticated | da |
| `set_route_series_state` | authenticated | da |
| `set_seo_page` | authenticated | da |
| `set_seo_page_published` | authenticated | da |
| `set_seo_pages_published_by_type` | authenticated | da |
| `set_service_option` | authenticated | da |
| `staff_anonymise_account` | authenticated | da |
| `staff_clear_email_undeliverable` | authenticated | da |
| `staff_hide_listing` | authenticated | da |
| `staff_hide_message` | authenticated | da |
| `staff_hide_order_evidence` | authenticated | da |
| `staff_hide_rating` | authenticated | da |
| `staff_hide_rating_reply` | authenticated | da |
| `staff_may_read_conversation` | authenticated | da |
| `staff_members` | authenticated | da |
| `staff_restore_listing` | authenticated | da |
| `staff_set_phone_verified` | authenticated | da |
| `staff_set_test_account` | authenticated | da |
| `staff_unhide_rating` | authenticated | da |
| `start_assisted_onboarding` | authenticated | da |
| `submit_company_for_review` | authenticated | da |
| `transfer_company_ownership` | authenticated | da |
| `transition_order` | authenticated | da |
| `unblock_sender` | authenticated | da |
| `unread_message_count` | authenticated | da |
| `update_route_series` | authenticated | da |
| `withdraw_offer` | authenticated | da |
| `account_deletion_files` | service_role | da |
| `claim_account_deletions` | service_role | da |
| `claim_import_slot` | service_role | da |
| `claim_outbox_batch` | service_role | da |
| `claim_push_batch` | service_role | da |
| `complete_account_deletion` | service_role | da |
| `complete_stale_orders` | service_role | da |
| `dispatch_account_deletions_http` | service_role | da |
| `expire_stale_listings` | service_role | da |
| `expire_stale_offers` | service_role | da |
| `expire_stale_push` | service_role | da |
| `expired_data_exports` | service_role | da |
| `finish_import` | service_role | da |
| `finish_outbox` | service_role | da |
| `finish_push` | service_role | da |
| `flag_email_undeliverable` | service_role | da |
| `flag_noncompliant_order_vehicles` | service_role | da |
| `forget_data_export` | service_role | da |
| `generate_route_departures` | service_role | da |
| `import_month_spend` | service_role | da |
| `log_job_run` | service_role | da |
| `purge_audit_log` | service_role | da |
| `purge_contact_reveals` | service_role | da |
| `purge_old_conversations` | service_role | da |
| `push_send_after` | service_role | da |
| `push_sent_last_hour` | service_role | da |
| `queue_booking_expiry_alerts` | service_role | da |
| `queue_expiry_reminders` | service_role | da |
| `queue_import_budget_alert` | service_role | da |
| `queue_listing_expiry_reminders` | service_role | da |
| `queue_push` | service_role | da |
| `queue_push_for_company` | service_role | da |
| `queue_saved_search_digests` | service_role | da |
| `recompute_all_reputations` | service_role | da |
| `recompute_company_reputation` | service_role | da |
| `remind_pending_ratings` | service_role | da |
| `retry_push` | service_role | da |
| `run_compliance_sweep` | service_role | da |
| `sweep_unclaimed_onboardings` | service_role | da |
| `account_deletion_blockers` | — (trigger / intern) | da |
| `account_is_held_for_deletion` | — (trigger / intern) | da |
| `anonymise_company` | — (trigger / intern) | da |
| `audit_company_changes` | — (trigger / intern) | da |
| `audit_document_delete` | — (trigger / intern) | da |
| `audit_member_changes` | — (trigger / intern) | da |
| `audit_transport_changes` | — (trigger / intern) | da |
| `bump_conversation` | — (trigger / intern) | da |
| `companies_erased_with_user` | — (trigger / intern) | da |
| `company_can_act` | — (trigger / intern) | da |
| `company_matches_request` | — (trigger / intern) | da |
| `company_matches_route` | — (trigger / intern) | da |
| `consume_contact_access` | — (trigger / intern) | da |
| `count_matching_carriers_on_route` | — (trigger / intern) | da |
| `create_order` | — (trigger / intern) | da |
| `create_order_conversation` | — (trigger / intern) | da |
| `departure_seats_taken` | — (trigger / intern) | da |
| `dispatch_outbox_http` | — (trigger / intern) | da |
| `documents_after_review` | — (trigger / intern) | da |
| `drop_listing_photos` | — (trigger / intern) | da |
| `email_is_confirmed` | — (trigger / intern) | da |
| `flag_suspicious_rating` | — (trigger / intern) | da |
| `guard_attachment_count` | — (trigger / intern) | da |
| `guard_cargo_details_present` | — (trigger / intern) | da |
| `guard_cargo_listing_publish` | — (trigger / intern) | da |
| `guard_conversation_insert` | — (trigger / intern) | da |
| `guard_departure_capacity` | — (trigger / intern) | da |
| `guard_listing_deletion_hold` | — (trigger / intern) | da |
| `guard_listing_quota` | — (trigger / intern) | da |
| `guard_message_contacts` | — (trigger / intern) | da |
| `guard_offer_insert` | — (trigger / intern) | da |
| `guard_offer_terms` | — (trigger / intern) | da |
| `guard_order_evidence_immutable` | — (trigger / intern) | da |
| `guard_rating_insert` | — (trigger / intern) | da |
| `guard_rating_reply_write` | — (trigger / intern) | da |
| `guard_rating_update` | — (trigger / intern) | da |
| `guard_truck_listing_publish` | — (trigger / intern) | da |
| `handle_new_user` | — (trigger / intern) | da |
| `hold_account_for_deletion` | — (trigger / intern) | da |
| `is_blocked` | — (trigger / intern) | da |
| `my_company_ids` | — (trigger / intern) | da |
| `notify_listing_invites` | — (trigger / intern) | da |
| `notify_new_booking` | — (trigger / intern) | da |
| `notify_on_suspension` | — (trigger / intern) | da |
| `order_rating_side` | — (trigger / intern) | da |
| `owns_offer_listing` | — (trigger / intern) | da |
| `phone_is_on_file` | — (trigger / intern) | da |
| `queue_listing_moderation_notification` | — (trigger / intern) | da |
| `queue_message_notification` | — (trigger / intern) | da |
| `queue_offer_notifications` | — (trigger / intern) | da |
| `queue_offer_outcome` | — (trigger / intern) | da |
| `queue_order_notification` | — (trigger / intern) | da |
| `queue_order_side_notification` | — (trigger / intern) | da |
| `queue_rating_notification` | — (trigger / intern) | da |
| `queue_request_alerts` | — (trigger / intern) | da |
| `queue_saved_search_alerts` | — (trigger / intern) | da |
| `refresh_company_rating` | — (trigger / intern) | da |
| `release_account_from_deletion` | — (trigger / intern) | da |
| `retire_previous_document` | — (trigger / intern) | da |
| `set_company_slug` | — (trigger / intern) | da |
| `sync_offers_count` | — (trigger / intern) | da |
| `sync_profile_from_auth` | — (trigger / intern) | da |
| `sync_request_to_order` | — (trigger / intern) | da |
| `write_audit` | — (trigger / intern) | da |
| `write_audit_for` | — (trigger / intern) | da |

---

## Anexa C — vederi

| Vedere | `security_invoker` | anon | authenticated |
|---|---|---|---|
| `v_companies_public` | off | **da (R1)** | da |
| `v_company_compliance` | **true** | — | da |
| `v_company_missing_documents` | **true** | — | da |
| `v_corridor_prices` | off | da | da |
| `v_departures` | off | — | da |
| `v_departures_public` | off | da | da |
| `v_document_requirements_public` | off | da | da |
| `v_public_companies` | off | da | da |
| `v_public_company_documents` | off | da | da |
| `v_public_company_routes` | off | da | da |
| `v_requests_private` | off | — | — |
| `v_requests_public` | off | da | da |
| `v_vehicle_missing_documents` | **true** | — | da |

`v_requests_private` nu se dă nimănui: se citește numai prin
`private_request_for_viewer()`, care verifică dreptul. Modelul corect pentru
o vedere care trebuie să citească pe lângă RLS.
