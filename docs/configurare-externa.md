# Configurare externă — ce trebuie făcut în afara codului

Singurul loc unde stau pașii ăștia. Dacă găsești aceeași instrucțiune în
alt fișier, aici e cea corectă și cealaltă trebuie ștearsă.

Scris pe 20 septembrie 2026, odată cu deblocarea Fazei 1.

---

## Cum e organizat

Fiecare pas are patru lucruri: **ce**, **unde se pune exact**, **cine**
poate să o facă, și **cum verifici că a mers**. Ultimul e partea care
lipsea până acum — un pas fără o verificare este un pas despre care nimeni
nu poate spune dacă a fost făcut.

**Nimic din ce urmează nu blochează codul.** Tot ce depinde de aceste
valori se degradează curat și spune ce îi lipsește: dispecerul de
notificări răspunde 503 cu numele variabilei, `/admin/notificari` o arată
ca „neconfigurat", paginile juridice scriu „[de completat]" acolo unde nu
știu, iar tarifele rămân nepublicate. Se pot pune una câte una, în orice
ordine.

| # | Ce | Cine | Blochează |
|---|---|---|---|
| 1 | Cont Resend și domeniu verificat | Madalin | Orice e-mail din platformă |
| 2 | `RESEND_API_KEY`, `MAIL_FROM` și prietenii, pe Edge Functions | Madalin | Același lucru |
| 3 | SMTP propriu în Supabase Auth | Madalin | Confirmarea contului la înscriere |
| 4 | `CRON_SECRET` și secretele din Vault | Madalin | Joburile programate |
| 5 | Cheile VAPID și `IMPORT_IP_SALT` | Madalin | Push-ul; importul fără cont |
| 6 | Datele firmei în `src/config/company.ts` | Edi | Paginile juridice și `/contact` |
| 7 | Tarifele orientative validate și publicate | Edi + un transportator | `/preturi` și paginile SEO |
| 8 | Verificarea juridică | Avocat | Lansarea |
| 9 | Publicarea paginilor SEO și indexarea | Madalin | Traficul organic |
| 10 | Furnizor de SMS (opțional la pilot) | Decizie client | Confirmarea telefonului |
| 11 | Cele două rotițe de potrivire, verificate | Madalin | Nimic — au valori implicite care funcționează |
| 12 | Pictograma oficială ANPC SAL, descărcată și pusă în subsol | Madalin | Nimic tehnic; cerința legală, de la prima vânzare online către consumatori |
| 13 | Domeniul propriu și tot ce se mută pe el | Edi + Madalin | Orice e-mail (pasul 1), adresa canonică, indexarea |

---

## 1. Cont Resend și domeniu verificat

**Ce:** un cont la [resend.com](https://resend.com) și domeniul de pe care
trimitem, verificat prin DNS.

**Unde exact:**
1. Resend → Domains → Add Domain → domeniul nostru (ex. `domeniul-vostru.ro`; încă nu îl avem, vezi pasul 13).
2. Resend arată trei înregistrări DNS: un TXT pentru SPF, un CNAME (sau
   TXT) pentru DKIM, și opțional un TXT pentru DMARC. Se pun la
   registratorul domeniului.
3. Se așteaptă propagarea și se apasă „Verify".

**De ce contează mai mult decât pare:** fără SPF și DKIM, mesajele de la
o platformă necunoscută ajung în Spam la majoritatea destinatarilor. O
platformă care se prezintă ca fiind despre încredere și ale cărei
e-mailuri ajung în Spam își pierde argumentul din prima zi.

**Cum verifici:** în Resend, domeniul trebuie să apară „Verified". Apoi,
după pasul 2, folosește butonul de la pasul 2.

## 2. Variabilele de mail pe Edge Functions

**Ce:** cinci variabile, dintre care trei obligatorii.

| Variabila | Obligatorie | Exemplu | Ce face |
|---|---|---|---|
| `RESEND_API_KEY` | **da** | `re_xxx` | Cheia de API. Fără ea nu pleacă nimic |
| `MAIL_FROM` | **da** | `nu-raspunde@domeniul-vostru.ro` | Adresa de pe care pleacă. Trebuie să fie pe domeniul verificat la pasul 1 |
| `SITE_URL` | **da** | `https://domeniul-vostru.ro` | Adresa site-ului. Fiecare e-mail are un link spre o pagină și sigla de sus se ia de aici (`/brand/mark-email.png`). Fără ea dispecerul se oprește și o numește, în loc să trimită linkuri spre un domeniu ghicit |
| `MAIL_SENDER_NAME` | nu | numele platformei | Numele afișat înaintea adresei. Lipsă, se folosește `BRAND_NAME` din `src/config/brand.ts` |
| `MAIL_REPLY_TO` | nu | `contact@domeniul-vostru.ro` | Unde ajunge un răspuns. Fără el, răspunsurile se duc la `MAIL_FROM`, adică nicăieri |

**Unde exact:** Supabase Dashboard → Project Settings → Edge Functions →
Secrets → Add new secret, pentru fiecare. Sau:

```bash
supabase secrets set RESEND_API_KEY=re_xxx MAIL_FROM=nu-raspunde@domeniul-vostru.ro \
  SITE_URL=https://domeniul-vostru.ro MAIL_REPLY_TO=contact@domeniul-vostru.ro
```

**Cum verifici:** intră pe `/admin/notificari`. Secțiunea „Furnizorul de
e-mail" trebuie să treacă de la **neconfigurat** (care numește variabila
lipsă) la **configurat**, în cel mult cinci minute — atât durează până
rulează dispecerul din nou. Apoi folosește „Trimite un e-mail de test" cu
adresa ta și un șablon oarecare: dacă ajunge, ajung toate, pentru că merge
pe exact același drum.

## 3. SMTP propriu în Supabase Auth

**Ce:** e-mailurile de autentificare — confirmarea contului, resetarea
parolei — pleacă altfel prin serverul intern Supabase, care e **limitat la
câteva mesaje pe oră** și expediază de la o adresă care nu e a noastră.

Asta nu e o subtilitate: la o zi cu douăzeci de înscrieri, oamenii nu
primesc confirmarea, iar fără confirmare **nu pot publica** — regula din
`guard_cargo_listing_publish` cere o adresă confirmată.

**Unde exact:** Supabase Dashboard → Authentication → Emails → SMTP
Settings → Enable Custom SMTP. Cu Resend:

| Câmp | Valoare |
|---|---|
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | aceeași cheie ca `RESEND_API_KEY` |
| Sender email | aceeași ca `MAIL_FROM` |
| Sender name | valoarea `BRAND_NAME` din `src/config/brand.ts` |

Tot acolo, la „Rate Limits", ridică limita de e-mailuri pe oră.

**Cum verifici:** înscrie-te pe `/inregistrare/persoana-fizica` cu o
adresă reală pe care o poți deschide. E-mailul de confirmare trebuie să
ajungă în mai puțin de un minut și să vină de la adresa noastră, nu de la
una `@supabase.io`.

## 3b. `ALLOWED_ORIGIN` pentru funcțiile edge

**Ce:** trei funcții sunt chemate din browser — `extract-vehicle-listing`,
`parse-document`, `verify-cui-anaf`. Până la auditul de securitate rulau cu
`Access-Control-Allow-Origin: *`, pentru că variabila nu era pusă nicăieri și
codul cădea înapoi pe `*`. Acum **nu mai cade înapoi pe nimic**: fără
variabilă, funcțiile nu întorc nicio origine și browserul oprește răspunsul.

O funcție care refuză vizibil se repară; un `*` nu se observă niciodată.

**Unde exact:** Edge Functions → Secrets:

```
ALLOWED_ORIGIN = https://transport-seven-sandy.vercel.app
```

Mai multe origini se separă prin virgulă — util cât timp există și un domeniu
propriu pe lângă cel de pe Vercel:

```
ALLOWED_ORIGIN = https://domeniul-vostru.ro,https://www.domeniul-vostru.ro
```

Dacă `ALLOWED_ORIGIN` lipsește, se folosește `SITE_URL`, dacă acela există.

**Cum verifici:** din consola browserului, pe site-ul nostru, o cerere către
o funcție trebuie să meargă; aceeași cerere de pe alt domeniu trebuie oprită
de browser cu o eroare de CORS.

## 4. `CRON_SECRET` și secretele din Vault

**Ce:** joburile programate în baza de date cheamă funcțiile edge prin
HTTP. Au nevoie de o parolă comună și de adresele funcțiilor.

**Unde exact:**
- Edge Functions → Secrets: `CRON_SECRET` (orice șir lung și aleator).
- SQL Editor, pentru Vault:

```sql
select vault.create_secret('<acelasi CRON_SECRET>', 'cron_secret');
select vault.create_secret('https://<proiect>.supabase.co/functions/v1/outbox-dispatcher',
                           'outbox_dispatcher_url');
select vault.create_secret('https://<proiect>.supabase.co/functions/v1/account-deletion',
                           'account_deletion_url');
```

**Cum verifici:** SQL Editor:

```sql
select jobname, schedule, active from cron.job order by jobname;
```

Trebuie să vezi **douăzeci** de joburi, toate `active`:
`account-deletion`, `hourly-booking-expiry-alerts`, `hourly-listing-cleanup`,
`hourly-offer-expiry`, `hourly-order-autocomplete`, `hourly-push-cleanup`,
`nightly-assisted-sweep`, `nightly-audit-retention`, `nightly-compliance-sweep`,
`nightly-conversation-retention`, `nightly-expiry-reminders`,
`nightly-listing-expiry-reminders`, `nightly-order-vehicle-check`,
`nightly-phone-verifications`, `nightly-rating-reminders`, `nightly-reputation`,
`nightly-retention`, `nightly-route-series`, `nightly-saved-search-digest`,
`outbox-dispatcher`.

> Lista de mai sus era rămasă la nouă, de pe vremea când atâtea erau. Ea și
> cele două din `job_health()` și cele două din `rls_test.sql` trebuie să
> meargă împreună — un job care lipsește dintr-una dintre ele arată sănătos
> fără să ruleze vreodată.

**`nightly-audit-retention`** taie din `audit_log` după fereastra din
`deletion_settings.audit_retention_months` (pornire: 24 de luni). Până la el,
jurnalul creștea la nesfârșit, cu nume, telefoane și e-mailuri în
`before`/`after`.

**`nightly-phone-verifications`** șterge provocările SMS mai vechi de șapte
zile. Ele poartă numere de telefon, iar fereastra de limitare este de o oră —
după ea rândul nu mai are ce spune.

Apoi `/admin/notificari` → „Joburi programate": în 24 de ore toate trebuie
să treacă pe „la zi". Dacă lista din `cron.job` e goală, extensia `pg_cron`
nu e activată — Database → Extensions → caută `pg_cron` și `pg_net`.

## 5. Cheile VAPID și `IMPORT_IP_SALT`

**Ce:** notificările push și importul din anunț pentru vizitatori fără cont.

**Unde exact:** generează perechea o dată:

```bash
npx web-push generate-vapid-keys
```

| Variabila | Unde | Fără ea |
|---|---|---|
| `VAPID_PUBLIC_KEY` | Supabase → Edge Functions | Push-ul nu pleacă; dispecerul răspunde 503 numind variabila |
| `VAPID_PRIVATE_KEY` | Supabase → Edge Functions | Același lucru |
| `VAPID_SUBJECT` | Supabase → Edge Functions (`mailto:` + adresa de contact din `src/config/company.ts`) | Același lucru |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Vercel → Production (aceeași valoare ca publică) | Browserul nu se poate abona |
| `IMPORT_IP_SALT` | Supabase → Edge Functions (șir aleator) | Importul din anunț merge doar cu cont |

**Cum verifici:** intră în cont pe telefon, `/cont/setari/notificari`,
activează notificările și acceptă permisiunea. Trebuie să primești una de
test.

## 6. Datele firmei în cod

**Starea pe 25 septembrie 2026: completate.** Platforma este operată de
MRO WEMAX SRL; toate câmpurile din `OPERATOR`, în
`src/config/company.ts`, au valori reale: denumire, CUI (plătitoare de
TVA, deci scris cu „RO"), număr de registrul comerțului, EUID, sediu,
telefon și cele două adrese de e-mail.

**Provizoriu:** ambele adrese de e-mail sunt o căsuță Gmail, până avem
domeniul propriu. În cod stă un comentariu `TEMPORARY` chiar deasupra
lor. Când există domeniul, se schimbă acolo (de exemplu `contact@` și
`date-personale@`) și se pune aceeași adresă și în `MAIL_REPLY_TO`
(pasul 2). Până atunci `MAIL_REPLY_TO` poate fi chiar adresa Gmail: un
răspuns poate ajunge oriunde, doar expeditorul trebuie să fie pe domeniul
verificat.

**Cine le citește:** `/contact` (inclusiv EUID și TVA), `/termeni`,
`/confidentialitate`, subsolul fiecărei pagini („Operat de …"), subsolul
fiecărui e-mail (prin copia generată de `pnpm brand` în
`supabase/functions/_shared/brand.ts`), `/cont/ajutor` și punctul 2 al
contractului de transport.

**De știut:**
- Contractul de transport, versiunea 1.0 a textului, nu scrie EUID-ul:
  textul unei versiuni de contract nu se schimbă, iar blocul operatorului
  din baza de date nu are câmpul. Intră în versiunea următoare a textului,
  după ce îl citește avocatul.
- Contractele generate *înainte* de 25 septembrie păstrează
  `[de completat]` la punctul 2 pentru totdeauna. Pentru o comandă în
  curs se generează o versiune nouă.
- CI-ul verifică CUI-ul la ANAF la fiecare pull request (jobul „Company
  lookup (ANAF), live", `scripts/ci/check-anaf.sh`) și scrie în rezumat
  ce spune ANAF, câmp cu câmp. Nu schimbă nimic în cod.

**Cum verifici:** `/contact`, `/termeni`, `/confidentialitate` și
`/cookies` nu conțin nicăieri `[de completat]`, iar banda galbenă de sus
de pe `/contact` nu mai apare. `tests/e2e/date-operator.spec.ts` verifică
exact asta.

## 7. Tarifele orientative

**Ce:** cifrele din `price_rates` sunt **placeholder**, marcate ca atare
în migrația care le-a semănat, și nu sunt copiate de la nimeni. Trebuie
înlocuite cu numere pe care un transportator real le confirmă, altfel
publicăm o listă de prețuri pe care piața o va corecta public.

**Unde exact:** `/admin/preturi`, ca staff. Se schimbă rândurile, apoi se
apasă publicarea. Ambele operațiuni scriu în `audit_log`.

**TVA:** tarifele de azi nu au fost stabilite nici cu TVA, nici fără,
așa că paginile spun exact asta: „nu precizează dacă includ TVA" (tabelul,
calculatorul, banda de pe prima pagină, paginile `/transport-auto` și
estimarea din formularul de ofertă). Când se publică tarifele reale, se
alege o bază, se scriu toate pe ea și se schimbă propozițiile `vat` și
`disclaimer` din `src/content/preturi.ts`, plus nota din
`src/content/transport-auto.ts`. Nu se calculează nicio sumă de TVA.

**Abonamentele** sunt altceva: sunt prețurile noastre, iar firma este
plătitoare de TVA. Propoziția despre TVA de lângă fiecare preț de
abonament este setarea „Mențiune despre TVA" din `/admin/planuri`
(`pricing_settings.vat_label`). Migrația a pus „Prețurile nu includ TVA",
pe care nu a confirmat-o nimeni: o confirmă sau o schimbă Edi, cu
contabilul. Goală, prețurile nu spun nimic despre TVA.

**Cum verifici:** `/preturi` trebuie să arate tabelul unui vizitator
neautentificat (fereastră privată). Apoi pune înapoi „Prețuri" în meniul
public — vezi comentariul din `src/components/layout/header-menu.tsx`,
constanta `PAGES`.

## 8. Verificarea juridică

**Ce:** `/termeni`, `/confidentialitate` și `/cookies` sunt scrise, dar
sunt **ciorne**. Lista exactă a ce trebuie să citească avocatul e în
`docs/09-verificare-juridica.md`.

**Unde exact:** după verificare, `LEGAL_REVIEWED` din
`src/content/legal/document.ts` trece pe `true` și dispare banda de ciornă
de pe toate trei.

**Cum verifici:** paginile nu mai afișează avertismentul de ciornă.

## 9. Publicarea paginilor SEO și indexarea

**Ce:** 161 de pagini scrise și nepublicate, pe un site care în întregime
răspunde `Disallow: /`.

**Unde exact:**
1. `/admin/pagini`: se citesc și se publică. Nu publica una unde numărul
   de transportatori pe coridorul respectiv e sub prag — o pagină goală
   e „thin content" și strică domeniul.
2. Vercel → Environment Variables → Production:
   `NEXT_PUBLIC_SEO_INDEXABLE=1`.

**Cum verifici:** `https://<domeniu>/robots.txt` nu mai spune
`Disallow: /`, iar `https://<domeniu>/sitemap.xml` conține paginile
publicate. Apoi trimite sitemap-ul în Google Search Console.

## 10. Furnizor de SMS — opțional la pilot

**Ce:** contul de furnizor care chiar trimite SMS-ul cu codul.

**De ce e opțional acum:** publicarea unei cereri cere o adresă de e-mail
confirmată și un număr de telefon **în profil**, nu unul confirmat prin SMS.
Numărul confirmat e cerut mai târziu — la dezvăluirea unui contact, la
acceptarea unei oferte — iar până există furnizor, echipa îl confirmă manual
din `/admin/pilot`, cu motiv scris și rând în `audit_log`. Drumul acela
rămâne, configurat sau nu.

**Nu prin Supabase Auth → Providers → Phone.** Codul este al nostru: îl
generează funcția `sms-verify`, iar cât ține, câte încercări are și cât de
des se poate cere se citesc din `phone_verification_settings` și se verifică
în `supabase/tests/rls_test.sql`. Un furnizor care ar ține el codul ar ține
și regulile — invizibil de aici, și diferit de la un furnizor la altul.

**Unde exact:** cont Twilio → Console → Account Info pentru primele două,
apoi un număr sau un Messaging Service:

```bash
supabase secrets set \
  TWILIO_ACCOUNT_SID=AC... \
  TWILIO_AUTH_TOKEN=... \
  TWILIO_FROM_NUMBER=+40...
# sau, în locul numărului:
#  TWILIO_MESSAGING_SERVICE_SID=MG...
```

Pentru România cere numărul (sau Messaging Service-ul) la Twilio cu
**Alphanumeric Sender ID** unde se poate: operatorii români livrează mai
sigur un expeditor cu nume decât un număr străin.

**Cum verifici, fără furnizor:** `/admin/notificari` → „Furnizorul de SMS"
spune **Necunoscut** până când cineva cere un cod, apoi **Neconfigurat** cu
numele variabilei care lipsește. Un cont care cere codul din `/cont/profil`
primește „Trimiterea prin SMS nu este configurată" — nu o rotiță care se
învârte. Numărul se confirmă în continuare din `/admin/pilot`.

**Cum verifici, cu furnizor:**

1. `/cont/profil` → adaugi numărul → „Trimite codul".
2. Codul ajunge prin SMS în câteva secunde. Are șase cifre și expiră în zece
   minute.
3. Îl introduci → `profiles.phone_verified` devine `true`,
   `phone_verified_by_staff` rămâne `false`, iar în `audit_log` apare
   `profile.phone_verified` cu motivul `cod SMS`.
4. `/admin/notificari` → „Furnizorul de SMS" trece pe **Configurat**, iar
   „Coduri trimise în 24 h" crește.
5. Cere un al doilea cod imediat: trebuie să fii refuzat cu numărul de
   secunde rămase. Greșește codul de cinci ori: al șaselea trebuie refuzat
   chiar dacă este corect.

**Pragurile** (cât ține codul, câte încercări, câte coduri pe oră și pe
număr) sunt în `phone_verification_settings` și se schimbă cu un `update`
din SQL Editor, nu printr-o migrare.

---

## 11. Cele două rotițe de potrivire

**Ce:** toleranța implicită de ocol și fereastra pentru contoarele de
categorii de pe prima pagină. Amândouă au valori implicite care
funcționează — 50 km și 90 de zile — deci **nu blochează nimic**. Sunt
aici pentru că sunt numere pe care le vede lumea și pe care ar trebui să
le fi văzut cineva din echipă măcar o dată.

**Unde exact:** `/admin/activitate` → „Potrivire și categorii".

**Cum verifici:** schimbi fereastra la 30, salvezi, deschizi prima
pagină: sub blocul de categorii trebuie să scrie „Cereri publicate în
ultimele 30 de zile." Schimbi înapoi la 90. Ambele schimbări apar în
`/admin/jurnal`, filtrate pe acțiunea `settings`.

**De reținut:** toleranța implicită se aplică doar traseelor care nu
și-au spus propria toleranță. Un traseu publicat cu `max_detour_km`
completat rămâne cu al lui.

---

## 12. Pictograma oficială ANPC (SAL)

**Ce:** în subsolul fiecărei pagini există un rând „Protecția
consumatorilor" cu legătura spre platforma ANPC de soluționare alternativă
a litigiilor (`https://reclamatiisal.anpc.ro/`). Până acum e un buton
simplu, cu formularea oficială: pictograma oficială (250×50) nu a putut fi
descărcată din mediul în care s-a lucrat, iar o copie desenată de noi ar fi
imitat un semn oficial. SOL (platforma europeană) nu apare: s-a închis pe
20 iulie 2025, iar Ordinul ANPC 270/2026 a scos-o din Ordinul 449/2022.

**Unde exact:**

1. Descarcă pictograma SAL de pe `anpc.ro` și salveaz-o ca
   `public/anpc/sal.png` (sau `.svg`).
2. În `src/config/consumer-redress.ts`, la intrarea `sal`, pune
   `badge: { src: '/anpc/sal.png', width: 250, height: 50 }`.

**Cum verifici:** subsolul arată pictograma în locul butonului, pe `/`, pe
`/cont` și pe `/admin`; un clic deschide `reclamatiisal.anpc.ro` într-o filă
nouă. Avocatul confirmă legătura și formularea — punctul 13 din
`docs/09-verificare-juridica.md`.

## 13. Domeniul propriu

**Ce:** platforma rulează azi pe adresa Vercel
(`transport-seven-sandy.vercel.app`) și are adrese de e-mail Gmail. Tot ce
urmează așteaptă un domeniu înregistrat. Numele se verifică întâi la OSIM
și EUIPO, ca marcă (`docs/21-sigla.md`), apoi se cumpără domeniul.

| Ce | Unde | Ce se întâmplă până atunci |
|---|---|---|
| Domeniul verificat în Resend (SPF, DKIM, DMARC) | Resend + DNS la registrator (pasul 1) | **Nu pleacă niciun e-mail.** Resend nu trimite de pe o adresă Gmail |
| `MAIL_FROM` | Supabase → Edge Functions (pasul 2) | Dispecerul răspunde 503 și numește variabila |
| Adresa expeditorului în Supabase Auth → SMTP | Pasul 3 | Confirmarea contului pleacă de pe serverul Supabase, câteva pe oră |
| `SITE_URL` | Supabase → Edge Functions | Merge și cu adresa Vercel. Linkurile din e-mailuri și sigla din antetul lor se iau de aici; după mutare, e-mailurile vechi duc la adresa veche |
| `NEXT_PUBLIC_SITE_URL` | Vercel → Production | Adresa canonică, `og:url`, imaginile de distribuire, `sitemap.xml`, `robots.txt` și linkurile din e-mailurile de autentificare |
| Site URL și Redirect URLs | Supabase → Authentication → URL Configuration | Linkurile de confirmare și de resetare a parolei trimit la adresa veche |
| `ALLOWED_ORIGIN` | Supabase → Edge Functions (pasul 3b) | Cele trei funcții chemate din browser refuză orice altă origine |
| `NEXT_PUBLIC_SEO_INDEXABLE=1` | Vercel (pasul 9) | **Nu se pornește înainte de domeniu.** Ce indexează Google pe adresa Vercel se pierde la mutare |
| Adresele din `src/config/company.ts` | Cod, marcate `TEMPORARY` | Gmail, pe paginile juridice, pe `/contact`, în subsolul fiecărui e-mail |
| `MAIL_REPLY_TO`, `VAPID_SUBJECT`, `NEXT_PUBLIC_SUPPORT_EMAIL` | Edge Functions; Vercel | Pot fi adresa Gmail până atunci. Fără `NEXT_PUBLIC_SUPPORT_EMAIL`, linkurile „scrie-ne" duc la `/contact`, care arată adresa reală |
| Adresa de asistență pentru ștergeri și cea de facturare | `/admin/setari`, `/admin/planuri` | Se pun pe domeniu odată cu restul |
| Domeniul în Vercel și în Google Search Console | Vercel → Domains; Search Console | — |

**Ce se pierde la mutare, oricând s-ar face:** sesiunile (cookie-ul e
legat de domeniu, deci toată lumea se autentifică din nou), abonările la
push și aplicația instalată pe ecranul telefonului (sunt legate de
origine) și ciornele păstrate doar în browser (cele din cont rămân). Cu
cât mai devreme, cu atât mai puțini oameni.

**Ce nu depinde de domeniu:** rândul ANPC din subsol duce la
`reclamatiisal.anpc.ro` indiferent de adresa noastră; pictograma oficială
(pasul 12) lipsește din alt motiv. Datele firmei, contractul PDF și
sigla nu depind nici ele de domeniu.

**Cum verifici:** după mutare, `https://<domeniu>/robots.txt` numește
sitemap-ul de pe domeniu, un e-mail de test de pe `/admin/notificari`
vine de pe adresa domeniului, iar un link de resetare a parolei deschide
domeniul.

## Ce rămâne de decis, nu de configurat

Astea nu sunt variabile de mediu, sunt decizii. Sunt aici pentru că
blochează la fel de tare.

| Decizie | Cine | Ce blochează |
|---|---|---|
| **Cine aprobă documentele și în cât timp**, cu nume | Edi | Promisiunea de pe pagina de înscriere. Fără un nume, coborâm la 48 de ore în zile lucrătoare și scriem asta |
| **Procesator de plăți** (Netopia / Stripe / facturare manuală) | Client | Abonamentele cu plată recurentă. Până atunci, fluxul manual actual e onest și scris ca atare în interfață |
| **Proiect Supabase separat pentru producție** | Edi + Madalin | Azi previzualizările și producția folosesc același proiect. Regiunea nu se schimbă după creare |
| **Test de restaurare din backup**, o dată | Madalin | Un backup netestat nu e un backup |
| **Cine primește alertele** când pică dispecerul | Madalin | `job_health` arată starea, dar nu anunță pe nimeni |
| **Suspendarea pentru neplată** | Client, odată cu procesatorul | Fără procesator nu există un eveniment „nu a plătit" pe care să o pornim. O suspendare declanșată dintr-un marcaj pus manual e o suspendare pe care nimeni nu o poate contesta. Când există procesator, regula se scrie ca trigger pe `company_subscriptions`, cu motiv în `audit_log`, ca toate celelalte suspendări |
