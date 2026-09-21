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

---

## 1. Cont Resend și domeniu verificat

**Ce:** un cont la [resend.com](https://resend.com) și domeniul de pe care
trimitem, verificat prin DNS.

**Unde exact:**
1. Resend → Domains → Add Domain → domeniul nostru (ex. `coridor.ro`).
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

**Ce:** patru variabile, dintre care două obligatorii.

| Variabila | Obligatorie | Exemplu | Ce face |
|---|---|---|---|
| `RESEND_API_KEY` | **da** | `re_xxx` | Cheia de API. Fără ea nu pleacă nimic |
| `MAIL_FROM` | **da** | `nu-raspunde@coridor.ro` | Adresa de pe care pleacă. Trebuie să fie pe domeniul verificat la pasul 1 |
| `MAIL_SENDER_NAME` | nu | `Coridor` | Numele afișat înaintea adresei |
| `MAIL_REPLY_TO` | nu | `contact@coridor.ro` | Unde ajunge un răspuns. Fără el, răspunsurile se duc la `MAIL_FROM`, adică nicăieri |

**Unde exact:** Supabase Dashboard → Project Settings → Edge Functions →
Secrets → Add new secret, pentru fiecare. Sau:

```bash
supabase secrets set RESEND_API_KEY=re_xxx MAIL_FROM=nu-raspunde@coridor.ro \
  MAIL_SENDER_NAME=Coridor MAIL_REPLY_TO=contact@coridor.ro
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
| Sender name | `Coridor` |

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
ALLOWED_ORIGIN = https://coridor.ro,https://www.coridor.ro
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

Trebuie să vezi **nouă** joburi, toate `active`:
`account-deletion`, `hourly-booking-expiry-alerts`, `hourly-listing-cleanup`,
`hourly-push-cleanup`, `nightly-compliance-sweep`, `nightly-expiry-reminders`,
`nightly-listing-expiry-reminders`, `nightly-retention`, `outbox-dispatcher`.

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
| `VAPID_SUBJECT` | Supabase → Edge Functions (`mailto:contact@coridor.ro`) | Același lucru |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Vercel → Production (aceeași valoare ca publică) | Browserul nu se poate abona |
| `IMPORT_IP_SALT` | Supabase → Edge Functions (șir aleator) | Importul din anunț merge doar cu cont |

**Cum verifici:** intră în cont pe telefon, `/cont/setari/notificari`,
activează notificările și acceptă permisiunea. Trebuie să primești una de
test.

## 6. Datele firmei în cod

**Ce:** cine operează platforma, legal. Sunt **goale intenționat** — un
CUI inventat pe o pagină care e un contract e mai rău decât un loc gol.

**Unde exact:** `src/config/company.ts`, obiectul `OPERATOR`:

```ts
export const OPERATOR: LegalEntity = {
  legalName: '',      // Denumirea completă, ca la registrul comerțului
  cui: '',            // Doar cifre, fără „RO"
  regCom: '',         // ex. J40/1234/2020
  address: '',        // Sediul social, pe un rând
  email: '',          // Unde se scrie despre platformă
  privacyEmail: '',   // Unde se scrie despre date personale (poate fi aceeași)
  phone: '',          // Opțional
};
```

**Cum verifici:** `/contact`, `/termeni`, `/confidentialitate` și
`/cookies` nu mai trebuie să conțină nicăieri `[de completat]`, iar banda
galbenă de sus de pe `/contact` trebuie să dispară.

## 7. Tarifele orientative

**Ce:** cifrele din `price_rates` sunt **placeholder**, marcate ca atare
în migrația care le-a semănat, și nu sunt copiate de la nimeni. Trebuie
înlocuite cu numere pe care un transportator real le confirmă, altfel
publicăm o listă de prețuri pe care piața o va corecta public.

**Unde exact:** `/admin/preturi`, ca staff. Se schimbă rândurile, apoi se
apasă publicarea. Ambele operațiuni scriu în `audit_log`.

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

**Ce:** un furnizor de SMS în Supabase Auth (Twilio, Vonage, MessageBird).

**De ce e opțional acum:** din 20 septembrie 2026, publicarea unei cereri
cere o adresă de e-mail confirmată și un număr de telefon **în profil**,
nu unul confirmat prin SMS. Numărul confirmat e cerut mai târziu, când
cineva vrea să deschidă datele de contact ale unui transportator — iar
până există furnizor, echipa confirmă manual din `/admin/pilot`, cu motiv
scris și rând în `audit_log`.

**Unde exact:** Supabase → Authentication → Providers → Phone.

**Cum verifici:** `/cont/profil` → adaugi numărul → primești codul prin
SMS → îl introduci. După asta `profiles.phone_verified` e `true` fără ca
cineva din echipă să fi atins ceva.

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
