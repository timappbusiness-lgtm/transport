# Database tests

`smoke_test.sql` exercises the rules that are enforced in Postgres rather than
in the frontend: compliance, suspension, reactivation, publish guards, plan
quotas and the contact gate. It prints `PASS` per check and aborts on the first
failure.

Run it against a throwaway database after changing any migration.

## Against a local Postgres (no Supabase)

`supabase_shim.sql` stubs the parts of Supabase a plain Postgres lacks —
`auth.users`, `auth.uid()`, `storage.objects`, `storage.foldername()` and a
`cron.schedule` stand-in. **Never apply the shim to a Supabase project.**

```bash
createdb bursa_test
psql -d bursa_test -f supabase/tests/supabase_shim.sql
for f in supabase/migrations/*.sql; do psql -d bursa_test -v ON_ERROR_STOP=1 -f "$f"; done
psql -d bursa_test -f supabase/tests/smoke_test.sql
dropdb bursa_test
```

`pg_cron` is not available in a plain Postgres. Migration 0007 detects that and
prints a notice instead of failing, so the run completes.

## Against a Supabase branch

Skip the shim — Supabase already provides those schemas.

```bash
supabase db reset          # applies every migration
psql "$SUPABASE_DB_URL" -f supabase/tests/smoke_test.sql
```

Use a preview branch or a scratch project. The script inserts and deletes real
rows.

## What it covers

| # | Check |
|---|---|
| 1 | An unverified company cannot publish |
| 2 | Admin approval verifies the company and its vehicles |
| 3 | Publishing sets `published_at` and `expires_at` |
| 4 | Individuals post on the return board only, and only with a verified phone |
| 5 | `offers_count` stays in sync on insert and delete |
| 6 | An expired vehicle document takes that truck off the board but does not suspend the company |
| 7 | An expired company document suspends the company, pulls its listings, queues a notice, blocks publishing and contact reveals |
| 8 | A replacement upload retires the old document and reactivates the company on approval |
| 9 | The sweep is idempotent |
| 10 | Expiry reminders fire once per milestone |
| 11 | Contact reveal is logged and charges quota once per listing |
| 12 | Plan listing quota is enforced |
| 13 | Requirements match company and vehicle type (3.5 t exception, forwarder vs carrier) |
| 14 | `distance_km` and `safe_uuid` behave on edge inputs |
| 15 | `needs_winch` is derived from the condition flags; a listing cannot publish without its details row |
| 16 | `v_departures` reports free slots; a platform cannot be overbooked |
| 17 | Editorial benchmarks are seeded; a corridor under 5 closed deals publishes no median |

Add a check here for every rule you add to a migration. A rule the database
enforces but nothing tests is a rule that will be removed by accident.
