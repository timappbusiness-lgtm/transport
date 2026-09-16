# Bursă de transport — SaaS build pack

Everything needed to build a Romanian freight exchange (`bursatractari.ro`
model) on Lovable + Supabase: the database, the edge functions, the workflows,
and a sequenced pack of Lovable prompts.

**Start here:** [`docs/00-rezumat-ro.md`](docs/00-rezumat-ro.md) — the Romanian
summary, written to be sent to the client.

## What the client asked for, and where it is handled

| Requirement (original wording) | Where |
|---|---|
| „secțiune pentru case de expediții să posteze curse" | `cargo_listings` · `prompts/04-cargo-board.md` |
| „secțiune mașini pe tur" | `truck_listings` (`direction = 'tur'`) · `prompts/05-truck-boards.md` |
| „secțiune mașini pe retur" | `truck_listings` (`direction = 'retur'`) · `prompts/05-truck-boards.md` |
| „când se loghează să încarce licența de transport / casă de expediții" | `documents` + `document_requirements` · `prompts/02`, `prompts/03` |
| „să sincronizăm cu asigurările, să vedem când expiră, să suspendăm contul" | `run_compliance_sweep()` · [`docs/03-document-compliance.md`](docs/03-document-compliance.md) — **read this one, it explains what is and is not possible in Romania** |
| „secțiune să verifice ITP și asigurări la mașină și copiile conforme ARR" | `vehicles` + vehicle-scoped `documents` · `prompts/03` |
| „persoanele fizice… doar cu un cont rapid" | `account_type = 'individual'` · `prompts/06-individual-quick-account.md` |

## Layout

```
docs/          specification, data model, compliance, roadmap, pricing, GDPR
supabase/
  migrations/  7 SQL files, apply in filename order
  functions/   3 Deno edge functions
prompts/       11 sequenced Lovable prompts
n8n/           4 workflows: delivery, nightly sweep, alerts, parse retry
```

## Setup

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

Then run the database test suite against a scratch database — it covers the
rules Postgres enforces rather than the frontend (suspension, reactivation,
publish guards, plan quotas, the contact gate):

```bash
psql "$SCRATCH_DB_URL" -f supabase/tests/smoke_test.sql
```

38 checks, all of which must print `PASS`. See
[`supabase/tests/README.md`](supabase/tests/README.md) — including how to run
it on a plain local Postgres without Supabase.

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
