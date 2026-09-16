# Database tests

Two suites, both run on a throwaway database:

| File | Runs as | Covers |
|---|---|---|
| `smoke_test.sql` | superuser | The business rules enforced in Postgres: compliance, suspension, reactivation, publish guards, plan quotas, the contact gate, seats. 47 checks; aborts on the first failure. |
| `rls_test.sql` | `authenticated`, `anon`, `service_role` | Who may do what: RLS policies, protection triggers, RPC authorisation, function privileges, views, storage, the audit log, membership invitations. Each action runs as an API role, the way PostgREST and the edge functions call the database. 135 checks; reports every result, then fails if any did. |

Superuser skips row-level security and function privileges, so a rule that
only `smoke_test.sql` checks has never been checked against a real caller.
Add a check to `rls_test.sql` for every policy, grant or protection you add.

## Run them

```bash
pnpm db:test
```

`scripts/db-test.sh` creates a uniquely named local database, applies
`supabase_shim.sql`, every migration, then both suites, and always drops the
database afterwards. It needs a local Postgres 15+ with contrib (`dblink` is
used by the concurrency test) and `createdb` / `psql` / `dropdb` on PATH;
connection settings come from the usual `PG*` variables.

| Variable | Effect |
|---|---|
| `DB_TEST_MIGRATIONS=9` | Apply only the first N migrations — how the "before" run of `rls_test.sql` is produced. |
| `DB_TEST_SUITES=rls` | Run only the named suites (`smoke`, `rls`). |
| `DB_TEST_VERBOSE=1` | Print why every RLS check passed, not only why one failed. |

`supabase_shim.sql` stubs what a plain Postgres lacks — `auth.users`,
`auth.uid()`, `storage`, a `cron.schedule` stand-in — and reproduces
Supabase's default grants to `anon`, `authenticated` and `service_role`, so a
migration that revokes access is tested from the same starting point it meets
in production. **Never apply the shim to a Supabase project.**

## Against a Supabase branch

Skip the shim — Supabase already provides those schemas.

```bash
supabase db reset          # applies every migration
psql "$SUPABASE_DB_URL" -f supabase/tests/smoke_test.sql
psql "$SUPABASE_DB_URL" -f supabase/tests/rls_test.sql
```

Use a preview branch or a scratch project. Both scripts insert real rows, and
the concurrency test in `rls_test.sql` commits.

## rls_test.sql

Each check runs in its own subtransaction and is rolled back. Fixtures are
created as superuser (there is no other way to write `auth.users`); only the
action under test runs as an API role. A check is one of:

- **fix** — a hole found in the September 2026 audit, or a rule added since
  (`INV`, invitations). It fails on the schema before the migration that
  brings the rule, and passes after it.
- **guard** — something that must keep working, such as a legitimate write
  or a policy helper that has to stay executable. It may pass on both.

A missing table, column or function never counts as "blocked", so a check
cannot pass just because the code it tests does not exist.

The last check opens two real connections with `dblink` and accepts two
offers on the same listing at the same time: the second must wait on the row
lock, then fail, leaving one accepted offer and one transport.

## smoke_test.sql

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

Two fixture changes came with the phase 0 hardening, no assertion changed:
the admin is created in `platform_staff` instead of through the removed
`profiles.is_platform_admin` column, and section 11 puts the test truck back
on the board before revealing its contact, because contacts are now revealed
only for active listings.
