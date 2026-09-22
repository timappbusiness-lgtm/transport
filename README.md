# Coridor — vehicle transport marketplace

A Romanian vehicle transport marketplace: a Next.js app, a Supabase database
with a document-compliance engine, edge functions and n8n workflows.

> **Stack decision, September 2026: Next.js.** Lovable is no longer used on
> this project. `prompts/` is kept as **archived specification** — those files
> describe what each part of the product must do and are useful as a reference,
> but they are **not instructions to run**. Do not paste them anywhere.

**Start here:** [`docs/00-rezumat-ro.md`](docs/00-rezumat-ro.md) — the Romanian
summary, written to be sent to the client.

## What the client asked for, and where it is handled

| Requirement (original wording) | Where |
|---|---|
| „secțiune pentru case de expediții să posteze curse" | `cargo_listings` + `cargo_vehicle_details` · `prompts/04-cargo-board.md` |
| „secțiune mașini pe tur" | `truck_listings` (`direction = 'tur'`) · `prompts/05-truck-boards.md` |
| „secțiune mașini pe retur" | `truck_listings` (`direction = 'retur'`) · `prompts/05-truck-boards.md` |
| „când se loghează să încarce licența de transport / casă de expediții" | `documents` + `document_requirements` · `prompts/02`, `prompts/03` |
| „să sincronizăm cu asigurările, să vedem când expiră, să suspendăm contul" | `run_compliance_sweep()` · [`docs/03-document-compliance.md`](docs/03-document-compliance.md) — **read this one, it explains what is and is not possible in Romania** |
| „secțiune să verifice ITP și asigurări la mașină și copiile conforme ARR" | `vehicles` + vehicle-scoped `documents` · `prompts/03` |
| „persoanele fizice… doar cu un cont rapid" | Formularul se completează fără cont, contul se face la ultimul pas; telefonul se confirmă abia când cineva cere un contact · `prompts/06-individual-quick-account.md` |

## Layout

```
docs/          spec, data model, compliance, roadmap, pricing, GDPR,
               and 07-competitor-analysis.md — read that one before building
src/           the Next.js app
design/        the design system: tokens, type, motion, copy rules
supabase/
  migrations/  SQL files, applied in filename order
  functions/   Deno edge functions
  tests/       smoke_test.sql (business rules) and rls_test.sql (who may do
               what, run as the API roles) — `pnpm db:test` runs both
prompts/       ARCHIVED Lovable prompts — specifications, not runnable
n8n/           4 workflows: delivery, nightly sweep, alerts, parse retry
```

## The market this is built for

Vehicle relocation, not palletized freight. The cargo **is** a vehicle —
83% of the reference market is cars, and the money corridor is
Germany / Italy / Netherlands / Spain → Romania, where people buy a used car
abroad and need it home. The second market is recovery: vehicles that no
longer roll.

General freight stays addable — a listing carries a `listing_kind` and the
type-specific fields live in `cargo_vehicle_details` or
`cargo_freight_details`. Launch is auto-first.

## The app

```bash
pnpm install
pnpm dev          # http://localhost:3000
pnpm typecheck    # tsc --noEmit, strict
pnpm lint
pnpm test         # Vitest unit tests
pnpm test:e2e     # Playwright
pnpm build
```

Next.js 16 (App Router, server components by default), TypeScript strict,
Tailwind v4, Vitest, Playwright. `src/` holds the app; `docs/`, `design/`,
`supabase/`, `n8n/` and `prompts/` sit alongside it, unmoved.

`supabase/functions/` is excluded from the app's `tsconfig.json` — those run on
Deno, not Node. See `supabase/functions/README.md`.

Deployment: [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

## Setup (database)

1. **Create the Supabase project in `eu-central-1` (Frankfurt).** This cannot
   be changed later and the platform holds EU personal data.
2. Enable extensions in Dashboard → Database → Extensions: `pgcrypto`,
   `pg_trgm`, `pg_cron`. Do this **before** applying the migrations —
   migration 0007 schedules the nightly jobs and skips them with a notice if
   `pg_cron` is not there yet.
3. Apply `supabase/migrations/*.sql` in filename order.
4. Set the edge function secrets:
   ```
   ANTHROPIC_API_KEY=...
   CRON_SECRET=...            # long random string, shared with n8n
   ALLOWED_ORIGIN=https://<app-domain>
   # optional overrides
   ANTHROPIC_MODEL=claude-opus-5
   ANAF_ENDPOINT=https://webservicesp.anaf.ro/api/PlatitorTvaRest/v9/tva
   ```
   `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are
   injected automatically.
5. Deploy the functions:
   ```bash
   supabase functions deploy parse-document
   supabase functions deploy verify-cui-anaf
   supabase functions deploy compliance-sweep
   ```
6. Generate types and commit them:
   ```bash
   supabase gen types typescript --project-id <id> --schema public \
     > src/integrations/supabase/types.ts
   ```
7. Work through `prompts/` in order, starting with `prompts/00-conventions.md`.
8. Import the n8n workflows from `n8n/README.md`.

Verify before building anything on top:

```sql
-- every public table has RLS enabled
select relname from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
-- expected: zero rows

-- the three scheduled jobs exist
select jobname, schedule, active from cron.job;
```

Then run the database test suites — they cover the rules Postgres enforces
rather than the frontend (suspension, reactivation, publish guards, plan
quotas, the contact gate) and who may do what:

```bash
pnpm db:test
```

It creates a throwaway local database, applies every migration and runs
`smoke_test.sql` (48 checks, as superuser) and `rls_test.sql` (141 checks, as
`authenticated`, `anon` and `service_role`), then drops the database. See
[`supabase/tests/README.md`](supabase/tests/README.md), including how to run
them against a Supabase branch.

## Three things to decide before writing code

1. **Who reviews documents, and how fast?** The AI extracts, a human approves —
   never the other way round, for reasons in
   [`docs/03-document-compliance.md`](docs/03-document-compliance.md). A
   "verified in 24h" promise needs a named person behind it.
2. **How does the exchange get its first hundred listings?** An empty freight
   exchange is worth nothing to either side. See the sequencing risks in
   [`docs/04-roadmap.md`](docs/04-roadmap.md).
3. **Payments in MVP or not?** The schema supports subscriptions from day one;
   twenty customers do not justify a payment integration. Manual invoicing
   ships weeks earlier.

## Conventions

- Code, comments, identifiers, commit messages and technical docs: English.
- UI text, client-facing content and `docs/00-rezumat-ro.md`: Romanian with
  diacritics.
- Romanian regulatory terms stay Romanian in code and UI — `copie_conforma`,
  `itp`, `rca`, `licenta_comunitara`. They are proper nouns of Romanian law.
- Every new table ships with RLS enabled and all four policies in the same
  migration.
