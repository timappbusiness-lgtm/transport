# Deployment — Vercel

## Why the agent cannot deploy for you

This repo is built from a sandboxed environment whose network policy denies
outbound connections to Vercel:

```
host: api.vercel.com:443
kind: connect_rejected
detail: gateway answered 403 to CONNECT (policy denial)
```

`vercel.com` and `api.vercel.com` are both unreachable, and the Vercel CLI is
not installed. That is an environment policy, not a missing token — a token
would not help.

**It does not matter.** Vercel's normal deployment path is a GitHub
integration: Vercel pulls from GitHub itself. Nothing needs to reach Vercel
from here. Connecting the repo is a one-time action in the Vercel dashboard,
and every later `git push` deploys automatically.

If you do want CLI deploys from an agent session, the environment's network
policy has to allow `vercel.com` — see
https://code.claude.com/docs/en/claude-code-on-the-web

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
