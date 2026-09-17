# Working agreement

Coridor — a Romanian vehicle transport marketplace. Next.js app in `src/`,
Supabase database in `supabase/`, n8n workflows in `n8n/`.

## Session rules

Two places work on this repository at once — Claude Code and VS Code on the
Mac — so these come first. They exist so that neither place is ever
surprised by what the other did.

1. **Start by looking at the remote.** `git fetch --all --prune`, switch to
   `main`, pull. List the open pull requests **and the files each one
   touches**. Then say out loud which area this session is taking, before
   writing anything.
2. **One branch per task**, named `feature/<area>` or `fix/<area>`. Never
   work on `main`. Never reuse another open pull request's branch unless you
   are asked to continue that specific piece of work.
3. **Stop and ask when another open pull request touches the same files.**
   Not "work around it" — ask. These are the files where two sessions
   collide worst, because everything imports them:

   - `src/app/globals.css`
   - `src/config/routes.ts`
   - `src/components/layout/site-header.tsx`
   - `src/lib/auth/`
   - `middleware.ts`
   - `supabase/migrations/`

4. **Commit and push after every working step**, not only at the end. An
   unpushed commit is invisible to the other place, and two people building
   the same thing twice costs more than any merge conflict.
5. **Migrations carry the current timestamp.** Before merging, rebase on
   `main`; if `main` gained a newer migration in the meantime, rename yours
   so it sorts after it and re-run `pnpm db:test`. Two migrations that
   disagree about their order apply in one sequence locally and another on
   the project.
6. **Before merging: rebase on `main`, every check green.** No exceptions,
   including for a one-line change.
7. **End by pushing, updating the pull request description with what is done
   and what remains, and reporting the link.** The description is how the
   other place picks the work up.
8. **Continuing work started elsewhere:** fetch, check out the existing
   branch, and **read its pull request description first**. It says where
   the other place stopped and why.

One more, learned the hard way: **one session per phase.** Two sessions on
phase 1 produced two complete implementations and a reconciliation that cost
more than the feature.

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
