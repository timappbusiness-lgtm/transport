# Deployment

One source of truth, three systems that agree with it:

- **GitHub** is the only place code lives. `main` is the default branch and
  takes no direct pushes.
- **timappbusiness-lgtm's Project** (`ytwzydilyiekhexnpziu`), in the
  TIMAPP Supabase organisation, is the only database. Nothing but the `main`
  pipeline writes to it.
- **Vercel** deploys production from `main` and nowhere else.

## Cum lucrăm

Cele cinci reguli, pe scurt. Varianta completă este în `CLAUDE.md`.

1. **La început de sesiune, uită-te la remote.** `git fetch`, ia `main`, apoi
   vezi ce pull request-uri sunt deschise și ce branch-uri există. Dacă
   altcineva lucrează deja în aceeași zonă, **oprește-te și spune**, nu
   construi a doua variantă a aceluiași lucru.
2. **Orice modificare merge pe un branch și într-un pull request.** Nu lăsa
   munca doar pe laptop sau doar într-o sesiune. În `main` nu se împinge
   direct.
3. **La final de sesiune, dă push branch-ului și trimite linkul de pull
   request.** O sesiune care se termină cu commit-uri nepublicate este, din
   punctul de vedere al echipei, muncă pierdută.
4. **Niciodată secrete în repository.** Configurarea locală vine din
   `vercel env pull .env.local`. `.env.example` conține toate numele de
   variabile și nicio valoare.
5. **Nicio sesiune nu atinge baza de date.** Migrările ajung în SAAS
   TRANSPORT doar prin pipeline-ul de pe `main` — niciun `supabase db push`
   de pe laptop, nicio modificare manuală din dashboard. Scrii migrarea,
   deschizi un pull request, iar merge-ul o aplică.

## The flow

```
branch  →  pull request  →  preview  →  merge into main
                                            │
                                            ├─ 1. checks
                                            ├─ 2. migrations  (db push)
                                            ├─ 3. edge functions
                                            ├─ 4. Vercel production
                                            └─ 5. security advisors
```

**On a pull request** — `.github/workflows/pr.yml` runs typecheck, lint, the
unit tests, `db:test` against a throwaway Postgres, the edge-function checks
and the end-to-end suite. Vercel builds a preview of the branch on its own
(Git integration); the last job waits for that build, checks it answers
through Vercel's login and posts its URL as a comment on the pull request.
Nothing here touches the production database.

**On a push to `main`** — `.github/workflows/main.yml` runs the same checks
and then, in order, stopping at the first failure:

| Step | What it does |
|---|---|
| 1. Checks | everything the pull request ran, again, on the merged result |
| 2. Migrations | `supabase db push --dry-run`, then the real push; the migration list and both outputs go into the run summary |
| 3. Edge functions | deploys only the functions whose sources changed — everything, if `_shared` changed |
| 4. Production | calls the Vercel deploy hook for `main`, waits until production reports this commit, then checks production answers |
| 5. Advisors | security advisors into the run summary, separating new findings from the accepted ones |

The whole file runs under `concurrency: main-release` with
`cancel-in-progress: false`. That flag is deliberate: a run halfway through
`supabase db push` must be allowed to finish, because cancelling it leaves
the project's migration history disagreeing with the repository — the exact
state this pipeline exists to prevent.

## Secrets

Settings → Secrets and variables → Actions. A missing one fails its job with
a message naming it, rather than an authentication error from inside a CLI.

| Secret | Where it comes from |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | https://supabase.com/dashboard/account/tokens |
| `SUPABASE_PROJECT_REF` | `ytwzydilyiekhexnpziu` |
| `SUPABASE_DB_PASSWORD` | Supabase → Project Settings → Database |
| `VERCEL_DEPLOY_HOOK_URL` | Vercel → `transport` → Settings → Git → Deploy Hooks, a hook on `main` (named `pipeline-main`) |
| `VERCEL_AUTOMATION_BYPASS_SECRET` | Vercel → `transport` → Settings → Deployment Protection → Protection Bypass for Automation |

There is no Vercel account token in GitHub. The hook can only rebuild
`main`, and the bypass secret only lets a request past the login on this
project's previews; neither can change anything else on the account.

Application environment variables are **not** duplicated into GitHub. Every
build runs on Vercel, so the Vercel project stays the one place they are
set — and `vercel env pull .env.local` gives a laptop the same values.

## Branch protection

`main` requires a pull request, requires the checks to pass, and allows
neither direct pushes nor force pushes. These are repository settings, not
files: Settings → Branches → Add branch ruleset.

## Deploying by hand

Don't. The pipeline is the only path to production, so that what is deployed
is always what is on `main`. `vercel deploy` from a laptop would put code
live that never passed the checks and that nobody can find in git history.

The Vercel project is linked to the repository through Vercel's Git
integration (TIMAPP team, project `transport`, production branch `main`).
Left alone, a push to `main` would deploy production at once — before step 2
has applied the migrations that code expects. `vercel.json` turns that off
for `main` only:

```json
{ "git": { "deploymentEnabled": { "main": false } } }
```

Every other branch still gets a Vercel preview on push; that preview is the
one the pull request workflow checks. Production is built only when step 4
calls the deploy hook — the flag governs Git-triggered deployments, not
hooks.

How step 4 knows it is done: `next.config.ts` sends the build's commit in an
`x-coridor-commit` response header, and `scripts/ci/release-production.sh`
waits until production answers with this run's commit. A hook always builds
the current head of `main`, so a run whose commit has already been
superseded skips the hook — the newer commit's run is queued behind it and
deploys after its own migrations.

## Supabase

- **Project:** `timappbusiness-lgtm's Project`, ref `ytwzydilyiekhexnpziu`,
  organisation `timappbusiness-lgtm's Org`, Central EU (Frankfurt) —
  https://ytwzydilyiekhexnpziu.supabase.co
- **Linked** from this repo (`supabase link`); `supabase/config.toml` is the
  source of truth for its Auth settings — change it there and run
  `supabase config push`, which shows the diff before applying.
- **Schema:** every migration applied with `supabase db push`. Extensions:
  `pgcrypto` (preinstalled), `pg_trgm` (in `public`, where migration 0001
  expects it), `pg_cron`. Three jobs scheduled: `nightly-compliance-sweep`,
  `nightly-expiry-reminders`, `hourly-listing-cleanup`.
- **Auth:** site URL `https://transport-seven-sandy.vercel.app`; redirects
  allowed for `localhost:3000`, production and `transport-*-timapp.vercel.app`
  previews. E-mail confirmation on. Phone OTP needs an SMS provider (not set).
- **Edge functions deployed:** `parse-document`, `verify-cui-anaf`,
  `compliance-sweep` (`supabase functions deploy <name> --use-api` bundles
  without Docker).
- **Function secrets still to set** (`supabase secrets set`):
  `ANTHROPIC_API_KEY` (parse-document fails without it), `CRON_SECRET` (when
  n8n is set up; until then compliance-sweep answers 401 to everyone, and
  pg_cron runs the sweep directly), `ALLOWED_ORIGIN` (unset means `*`; set it
  to the production origin at launch).

### Vercel environment variables for Supabase

| Name | Environments |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Production, Preview, Development |
| `NEXT_PUBLIC_SITE_URL` | Production (`https://transport-seven-sandy.vercel.app`); previews fall back to `VERCEL_URL` |

The secret key is not in Vercel and must not be: every write goes through the
user's session and the RPCs.

After merging a pull request that adds migrations:

```bash
supabase db push --linked --dry-run   # what would be applied
supabase db push --linked
supabase db advisors --linked --type security
```

Advisor findings that are accepted: `security_definer_view` on
`v_companies_public`, `v_corridor_prices` and `v_departures` (each exposes a
filtered public subset on purpose; `v_departures` must count other people's
bookings), `*_security_definer_function_executable` for the RPCs and policy
helpers granted in migration `130300`, and `extension_in_public` for
`pg_trgm`.

## Turning the pipeline on (once)

1. Link the Vercel project from a checkout, which writes
   `.vercel/project.json`:

   ```bash
   vercel link            # pick timapp / transport
   cat .vercel/project.json
   ```

2. Add all six repository secrets from the table above.
3. Protect `main`: Settings → Branches → Add branch ruleset — require a pull
   request, require the status checks, block direct and force pushes.
4. Run **Main** once from the Actions tab to prove the whole chain.

`.vercel/` is gitignored and must stay that way — it is machine state, not
project configuration.

## What goes live today

| Route | What |
|---|---|
| `/` | The homepage. Samples are labelled as samples and prices as estimates — the boards hold no real data yet. |
| `/autentificare`, `/inregistrare`, `/cont`, `/admin` | Authentication and the account area. |
| `/cerere/noua`, `/trasee`, `/termeni`, `/confidentialitate`, `/contact` | „Pagină în lucru” placeholders, so no link on the homepage is a 404. The list is `UNBUILT_ROUTES` in `src/config/routes.ts`. |

`robots` is set to `noindex, nofollow` in `src/app/layout.tsx`. **Flip it
before launch** — there is a `TODO` on that line.

## Verify a deployment

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://<deployment>/
curl -s -o /dev/null -w "%{http_code}\n" https://<deployment>/autentificare
```

Both should be 200 — `scripts/ci/smoke-deployment.sh` checks exactly these
two after every deploy, preview and production alike, because a build that
succeeds and a site that answers are different things.

Where a run fails tells you what broke:

| Failing job | What it means |
|---|---|
| 1. Checks | the change is broken; nothing was deployed and the database was not touched |
| 2. Migrations | a migration failed against the real project. **Production still runs the previous code**, because the deploy comes after. Fix forward with a new migration. |
| 3. Edge functions | the schema is already migrated; the functions are not. Re-run the job. |
| 4. Production | schema and functions are live, the site is not. Re-run the job. |
| 5. Advisors | reporting only — never fails the release. |

A missing or expired secret fails its job with a message naming it.

## Custom domain

Settings → Domains. Point the apex and `www` at Vercel, then update
`NEXT_PUBLIC_SITE_URL` to match and redeploy — it is read at build time, so a
change needs a new build, not just a restart.

## Joburi programate

`pg_cron` **nu a fost activat niciodată** pe proiect. S-a aflat pe 18
septembrie 2026, când migrația `20260918160000` a încercat să-l creeze și a
eșuat. Consecința, pentru perioada dinainte: măturarea nocturnă de
conformitate, memento-urile de expirare și curățarea anunțurilor **nu au
rulat deloc**, deci suspendarea automată la expirarea asigurării nu a fost
aplicată în practică, deși trece fiecare test.

Migrația nu mai blochează deploy-ul pentru asta — o migrație care nu se
poate aplica nu e un avertisment, e o pană, și ar fi ținut ostatice și
schimbările care n-au nicio treabă cu cron. În schimb, `/admin/notificari`
arată fiecare job ca **întârziat** cât timp nu e programat, și continuă
s-o arate.

### Pornirea, o singură dată

În Supabase → SQL Editor, ca `postgres`:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule('nightly-compliance-sweep', '0 2 * * *',
                     'select public.run_compliance_sweep();');
select cron.schedule('nightly-expiry-reminders', '15 2 * * *',
                     'select public.queue_expiry_reminders();');
select cron.schedule('hourly-listing-cleanup', '5 * * * *',
                     'select public.expire_stale_listings();');
select cron.schedule('hourly-push-cleanup', '25 * * * *',
                     'select public.expire_stale_push();');
select cron.schedule('hourly-booking-expiry-alerts', '10 * * * *',
                     'select public.queue_booking_expiry_alerts();');
select cron.schedule('outbox-dispatcher', '*/5 * * * *',
                     'select public.dispatch_outbox_http();');
select cron.schedule('account-deletion', '10 3 * * *',
                     'select public.dispatch_account_deletions_http();');
```

Dacă `create extension` dă eroare de permisiuni, extensiile se activează din
Dashboard → Database → Extensions, apoi se rulează doar cele șapte
`cron.schedule`.

Migrația `20260918210000` face asta singură la fiecare deploy, acum că
folosește `to_regprocedure` în loc de `to_regproc`. SQL-ul de mai sus rămâne
aici pentru cazul în care cineva vrea să repornească un job fără un deploy.

### Verificare

```sql
select jobname, schedule, active from cron.job order by jobname;
```

Trebuie să apară șapte rânduri. După asta, `/admin/notificari` trece fiecare
job pe „la zi" pe măsură ce rulează.

**De ce șapte și nu cinci.** `to_regproc()` primește un nume de funcție, nu o
semnătură; cu o semnătură întoarce NULL indiferent dacă funcția există. Două
migrații au folosit-o ca gardă și au scris „pg_cron nu este disponibil" la
fiecare deploy, indiferent de starea proiectului — un mesaj citit ca dovadă
despre proiect, când era doar o dovadă despre `to_regproc`. Migrația
`20260918210000` folosește `to_regprocedure`, programează toate joburile
într-un singur loc, iar blocul JOB din `supabase/tests/rls_test.sql` verifică
faptul în sine: dacă o migrație nu mai programează un job, suita pică.

Jobul `account-deletion` este cel care duce la capăt cererile de ștergere a
contului. Cât timp nu rulează, cererile rămân programate și conturile rămân
oprite în perioada de grație — vizibil pe `/admin/stergeri`, unde fiecare
cerere își arată data. Nimic nu se șterge singur și nimic nu se pierde, dar
termenul legal de o lună curge.

### Secretele dispecerului

`dispatch_outbox_http()` citește adresa funcției și secretul partajat din
Vault, niciodată din migrație — o migrație e în git, iar un secret în git e
unul pe care nimeni nu-l poate roti.

Supabase → Project Settings → Vault → New secret:

| Nume | Valoare |
|---|---|
| `outbox_dispatcher_url` | `https://<project-ref>.supabase.co/functions/v1/outbox-dispatcher` |
| `account_deletion_url` | `https://<project-ref>.supabase.co/functions/v1/account-deletion` |
| `cron_secret` | aceeași valoare ca secretul `CRON_SECRET` al funcțiilor |

Și pe Edge Functions: `RESEND_API_KEY`, `MAIL_FROM`. Fără ele dispecerul
răspunde 503 și numește variabila lipsă, în loc să raporteze succes în timp
ce coada crește.
