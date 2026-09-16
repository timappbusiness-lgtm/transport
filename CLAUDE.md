# Working agreement

Coridor — a Romanian vehicle transport marketplace. Next.js app in `src/`,
Supabase database in `supabase/`, n8n workflows in `n8n/`.

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
