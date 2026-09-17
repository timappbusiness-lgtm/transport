# Deployment — Vercel

## Current setup

- **Vercel project:** `eduardooo-s-projects/coridor`
- **Production:** https://coridor-gray.vercel.app
- **Deploys today:** from a local checkout with the Vercel CLI
  (`vercel deploy --prod`). The project is not connected to GitHub yet:
  Vercel refused the link because the logged-in GitHub account has no
  write access to `timappbusiness-lgtm/transport`. Once it does, connect
  it under Settings → Git and every push deploys on its own.
- `NEXT_PUBLIC_SITE_URL` is set for Production. Preview builds fall back to
  `VERCEL_URL` (see `src/config/brand.ts`).

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

Production is not set yet. The secret key is not in Vercel and must not be:
every write goes through the user's session and the RPCs.

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

## First connection (once, ~4 minutes)

1. https://vercel.com/new → **Import Git Repository** →
   `timappbusiness-lgtm/transport`.
   If the repo is not listed, "Adjust GitHub App Permissions" and grant access.
2. **Framework preset:** Next.js (detected automatically).
   **Root directory:** `./` — leave it. The app lives at the repo root
   alongside `docs/`, `supabase/` and the rest.
   **Build command / output:** leave the defaults. Vercel reads
   `packageManager` from `package.json` and uses pnpm.
3. **Environment variables**, before the first deploy:

   | Name | Value | Environments |
   |---|---|---|
   | `NEXT_PUBLIC_SITE_URL` | the deployment origin, e.g. `https://coridor.vercel.app` | Production, Preview, Development |

   It feeds `metadataBase`, canonical links and Open Graph URLs. Set it per
   environment so preview builds do not advertise the production URL.
4. **Deploy.**

After that: every push to `claude/saas-transport-exchange-w6f92q` builds a
preview; pushes to the production branch deploy to production. Set which branch
is production under Settings → Git.

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

Both should be 200. If the build fails, it will be on one of two things:
`pnpm build` running lint/type errors that pass locally but not on a clean
install, or a missing `NEXT_PUBLIC_SITE_URL` making `new URL()` throw in
`metadataBase`.

## Custom domain

Settings → Domains. Point the apex and `www` at Vercel, then update
`NEXT_PUBLIC_SITE_URL` to match and redeploy — it is read at build time, so a
change needs a new build, not just a restart.
