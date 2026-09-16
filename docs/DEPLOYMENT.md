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
| `/cerere/noua`, `/trasee`, `/transportatori/inscriere`, `/autentificare`, `/termeni`, `/confidentialitate`, `/contact` | „Pagină în lucru” placeholders, so no link on the homepage is a 404. |
| `/demo` | The approved design reference, served as a static page from `public/demo.html`. Useful for showing a client a live URL. |

`robots` is set to `noindex, nofollow` in `src/app/layout.tsx`. **Flip it
before launch** — there is a `TODO` on that line.

## Verify a deployment

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://<deployment>/
curl -s -o /dev/null -w "%{http_code}\n" https://<deployment>/demo
```

Both should be 200. If the build fails, it will be on one of two things:
`pnpm build` running lint/type errors that pass locally but not on a clean
install, or a missing `NEXT_PUBLIC_SITE_URL` making `new URL()` throw in
`metadataBase`.

## Custom domain

Settings → Domains. Point the apex and `www` at Vercel, then update
`NEXT_PUBLIC_SITE_URL` to match and redeploy — it is read at build time, so a
change needs a new build, not just a restart.
