# Deployment — Vercel

## Current setup

- **Vercel project:** `eduardooo-s-projects/coridor`
- **Production:** https://coridor-gray.vercel.app
- **Deploys run on GitHub Actions** — `.github/workflows/deploy.yml`. A push
  to `claude/saas-transport-exchange-w6f92q` deploys to production; a pull
  request gets its own preview URL. Nothing deploys until typecheck, lint,
  the unit tests and the database suites pass.
- `NEXT_PUBLIC_SITE_URL` is set for Production. Preview builds fall back to
  `VERCEL_URL` (see `src/config/brand.ts`).

### Three secrets make the pipeline work

Settings → Secrets and variables → Actions:

| Secret | Where it comes from |
|---|---|
| `VERCEL_TOKEN` | https://vercel.com/account/tokens |
| `VERCEL_ORG_ID` | `orgId` in `.vercel/project.json` after `vercel link` |
| `VERCEL_PROJECT_ID` | `projectId` in the same file |

Until all three are set the checks still run and the deploy step skips
itself, writing what is missing into the run summary rather than failing
with an opaque CLI error.

Application environment variables are **not** duplicated into GitHub. The
workflow runs `vercel pull`, so the Vercel project stays the single place
they are set.

### Deploying by hand

Still possible, from a checkout with the CLI logged in:

```bash
vercel deploy            # preview
vercel deploy --prod     # production
```

The project was never linked to Vercel's own Git integration: Vercel
refused the link because the logged-in GitHub account has no write access
to `timappbusiness-lgtm/transport`. The Actions workflow does the same job
without needing it, and runs the tests first, which the Git integration
would not.

## Supabase

- **Project:** `SAAS TRANSPORT`, ref `sspgyuavkjmzgbyqvunk`, Central EU
  (Frankfurt) — https://sspgyuavkjmzgbyqvunk.supabase.co
- **Linked** from this repo (`supabase link`); `supabase/config.toml` is the
  source of truth for its Auth settings — change it there and run
  `supabase config push`, which shows the diff before applying.
- **Schema:** every migration applied with `supabase db push`. Extensions:
  `pgcrypto` (preinstalled), `pg_trgm` (in `public`, where migration 0001
  expects it), `pg_cron`. Three jobs scheduled: `nightly-compliance-sweep`,
  `nightly-expiry-reminders`, `hourly-listing-cleanup`.
- **Auth:** site URL `https://coridor-gray.vercel.app`; redirects allowed for
  `localhost:3000`, production and `coridor-*-eduardooo-s-projects.vercel.app`
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
| `NEXT_PUBLIC_SUPABASE_URL` | Preview, Development |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Preview, Development |

**Production is not set, and phase 1 is now on the default branch.** Without
these two variables the marketing pages render and every protected page
redirects, but nobody can sign in: `isSupabaseConfigured()` returns false and
the whole account area is dead. Add them to Production before announcing the
deployment to anyone.

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

1. Link the project from a checkout, which writes `.vercel/project.json`:

   ```bash
   vercel link            # pick eduardooo-s-projects / coridor
   cat .vercel/project.json
   ```

2. Copy `orgId` and `projectId` into the repository secrets, together with a
   token from https://vercel.com/account/tokens. The three names are in the
   table above.
3. Push, or run the workflow by hand from the Actions tab.

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

Both should be 200 — the workflow checks exactly these two after deploying.

If a run fails before the deploy step, it is the checks doing their job; read
the failing job. If it fails inside the deploy step, the usual causes are a
missing or expired `VERCEL_TOKEN`, or a missing `NEXT_PUBLIC_SITE_URL` making
`new URL()` throw in `metadataBase`.

## Custom domain

Settings → Domains. Point the apex and `www` at Vercel, then update
`NEXT_PUBLIC_SITE_URL` to match and redeploy — it is read at build time, so a
change needs a new build, not just a restart.
