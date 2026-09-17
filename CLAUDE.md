# Working agreement

Coridor — a Romanian vehicle transport marketplace. Next.js app in `src/`,
Supabase database in `supabase/`, n8n workflows in `n8n/`.

## Session rules

These come first because everything else assumes them. They hold the same
way in VS Code on the Mac and in Claude Code, so the two behave identically.

1. **Start every session by looking at the remote.** `git fetch`, pull
   `main`, then list the open pull requests and the remote branches. If
   another open pull request already touches the area you are about to work
   on, **stop and say so** rather than building a second version of it.
2. **Every change goes to a branch and a pull request.** Never leave work
   only on a laptop or only inside a session. `main` takes no direct pushes.
3. **End every session by pushing the branch and reporting the pull request
   link.** A session that ends with unpushed commits has lost the work as
   far as everyone else is concerned.
4. **Never commit a secret.** Local configuration comes from
   `vercel env pull .env.local`, and `.env.local` is gitignored.
   `.env.example` lists every variable name and no values.
5. **No session touches the remote database.** Migrations reach SAAS
   TRANSPORT only through the `main` pipeline — never `supabase db push`
   from a laptop, never a manual change in the dashboard. Write a migration,
   open a pull request, and let the merge apply it.

One more, learned the hard way: **one session per phase.** Two sessions
working the same phase produced two complete implementations of phase 1 and
a reconciliation that cost more than the feature.

## Sources of truth

- `docs/01-product-spec.md` — what the product does. Changes are shown as a
  diff and approved before they are written.
- `docs/04-roadmap.md` — which phase each requirement belongs to. One pull
  request per phase.
- `prompts/` is archived specification from the Lovable period. Read it for
  intent; never run it, never update it.

## Database

- **New migration files only.** Never edit a migration that has been merged.
- **Business rules are enforced in Postgres.** The frontend is not a security
  boundary; a check in a component is a convenience, the trigger or policy is
  the rule.
- **Every new function needs explicit grants in its migration.** Default
  privileges grant EXECUTE to nobody (migration `20260916130300`). Grant each
  function to exactly the roles that call it: policy helpers to the roles the
  policy applies to, RPCs to `authenticated`, jobs to `service_role`, trigger
  and internal functions to nobody.
- **Every policy, grant or protection gets a check in
  `supabase/tests/rls_test.sql`** that runs the action as `authenticated`,
  `anon` or `service_role` — never as superuser, which skips RLS. A fix check
  must fail on the schema before the migration and pass after it.
- Users never write state transitions directly: status changes, approvals,
  orders and ownership go through SECURITY DEFINER RPCs that check the caller
  and write to `audit_log`.
- Keep existing schema names (`curse`, `retur`, `pe_sens`, …). No renames.

## Commands

```bash
pnpm dev               # http://localhost:3000
pnpm typecheck && pnpm lint && pnpm test
pnpm test:e2e          # Playwright
pnpm db:test           # throwaway Postgres: every migration, smoke + RLS suites
pnpm test:functions    # Deno tests for the edge functions
pnpm check:functions   # Deno type-check for the edge functions
```

## Conventions

- The brand name lives only in `src/config/brand.ts`; internal links only in
  `src/config/routes.ts`.
- UI copy is Romanian with correct diacritics; regulatory terms stay Romanian
  (`copie conformă`, `ITP`, `RCA`). Code and technical docs are English.
- Never show invented numbers as real data. Samples are labelled as samples,
  estimates as estimates.
- Nothing is created or changed on a remote Supabase or Vercel project without
  an explicit go-ahead.
