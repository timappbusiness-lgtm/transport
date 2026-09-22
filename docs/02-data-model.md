# Data model

Applied in filename order — the nine foundation migrations are the table
below; `supabase/migrations/` holds every one since (54 today). Each is
self-contained and ends with its own RLS policies — never add a table without
its four policies in the same file.

| File | Contents |
|---|---|
| `20260916120000_core_identity.sql` | `profiles`, `companies`, `company_members`, RLS helper functions |
| `20260916120100_fleet.sql` | `vehicles`, `drivers` |
| `20260916120200_documents_compliance.sql` | `document_requirements`, `documents`, `account_suspensions`, compliance views, `run_compliance_sweep()`, `review_document()` |
| `20260916120300_listings.sql` | `cargo_listings`, `truck_listings`, `listing_contacts`, `saved_searches`, `distance_km()` |
| `20260916120400_deals.sql` | `offers`, `conversations`, `messages`, `transports`, `ratings`, `reports` |
| `20260916120500_billing_access.sql` | `plans`, `subscriptions`, `contact_reveals`, `reveal_contact()`, quota guards |
| `20260916120600_storage_notifications_cron.sql` | storage buckets + policies, `notification_outbox`, `queue_expiry_reminders()`, pg_cron schedule |
| `20260916120700_vehicle_type_additions.sql` | platform taxonomy enum values (separate file — see below) |
| `20260916120800_vehicle_cargo.sql` | `cargo_vehicle_details`, `cargo_freight_details`, platform slots, `departure_bookings`, `price_benchmarks`, `v_corridor_prices` |

## Entity map

```
auth.users 1─1 profiles
                 │
                 ├─< company_members >─ companies ─< vehicles ─< documents (scope='vehicle')
                 │                          │           │
                 │                          │           └─< truck_listings ─< offers
                 │                          ├─< drivers ─< documents (scope='driver')
                 │                          ├─< documents (scope='company')
                 │                          ├─< subscriptions ─ plans
                 │                          └─< account_suspensions
                 │
                 └─< cargo_listings ─< offers ─> transports ─< ratings
                          │
                          └─1 listing_contacts   (gated by reveal_contact())

localities            (gazetteer; a trigger stamps both listing tables from it)
```

## Design decisions worth knowing

### Contact data lives in its own table

`listing_contacts` is separate from the listing so RLS can gate it without
column-level tricks. A listing row is readable by anyone signed in; the
contact row is readable only by its owner, by an admin, or through the
`reveal_contact()` RPC. If contacts were columns on the listing, the only way
to hide them would be a view plus revoked column grants — harder to reason
about and easy to leak through a `select *` in a future feature.

### RLS helpers are SECURITY DEFINER on purpose

`is_company_member()` reads `company_members`, and it is called from the RLS
policy *on* `company_members`. Without `SECURITY DEFINER` that recurses
infinitely. All five helpers (`is_platform_admin`, `is_company_member`,
`is_company_manager`, `my_company_ids`, `company_can_act`) pin
`search_path = public` so they cannot be hijacked by a schema shadowing
attack.

### Requirements are data, not code

`document_requirements` says which documents are mandatory for which company
type and vehicle type, how long the grace period is, and when reminders fire.
Rules in Romanian road transport change; a change should be an `UPDATE`, not
a deploy. The seeded rows encode the current rules, including the exception
that vehicles under 3.5 t do not need a `copie conformă`.

### One approved and one in-review document per (target, kind)

Two sets of partial unique indexes (migration `…130100`): at most one
`approved` row, and at most one row in `uploaded`/`parsing`/`pending`, per
company, vehicle or driver and kind. A new upload retires only a previous
upload still in review. The approved document is retired by
`review_document()` at the moment its replacement is approved.

This is what makes early renewal safe. The first version kept one row across
approved and pending and retired the approved one on upload, so a carrier who
renewed an RCA a month early dropped out of compliance until someone reviewed
the new policy — and was suspended that night if nobody had.

### Derived compliance flags are cached, not computed per query

`companies.is_suspended` and `vehicles.is_compliant` are columns maintained by
the sweep, not expressions evaluated on every board query. Recomputing
compliance inside the listing query would mean joining four tables on every
page load. The views (`v_company_compliance`, `v_vehicle_missing_documents`)
exist for the admin panel and the sweep, which run rarely.

The trade-off: a stale flag between the moment a document expires and the
02:00 sweep. Acceptable — `grace_days` is the real control, and the sweep also
runs synchronously after every document review.

### The sweep is idempotent and forward-compatible

`run_compliance_sweep()` is defined in migration 0003 but touches tables
created in 0004. It guards those with `to_regclass(...) is not null` so the
migration file applies cleanly on a fresh database in filename order.

### Publishing is guarded in the database

`guard_truck_listing_publish()` and `guard_cargo_listing_publish()` raise on
`status = 'active'` when the company is suspended or the vehicle is not
compliant. Put another way: even if the frontend has a bug, a truck without
a valid ITP cannot reach the board. The frontend check is a UX affordance; the
database check is the rule.

`guard_listing_quota()` does the same for plan limits.

### Who may write what is decided in Postgres

Phase 0 hardening (migrations `20260916130000`–`130400`), tested by
`supabase/tests/rls_test.sql` as the API roles rather than as superuser:

- **Staff** is `platform_staff`, written only by `set_platform_staff()`. It is
  not a column on `profiles`, which users edit.
- **Protected columns** — verification, suspension, trust, ANAF, compliance
  flags, document status and dates — are guarded by triggers that refuse
  writes from `authenticated`/`anon`. SECURITY DEFINER functions and the
  service role pass.
- **State changes are RPCs**: `create_company`, `review_document`,
  `accept_offer`, `withdraw_offer`, `reject_offer`,
  `confirm_departure_booking`, `mark_conversation_read`. Transports exist only
  through `create_order()`, and it has exactly two callers: `accept_offer()`
  and `confirm_departure_booking()` — an accepted offer and a confirmed seat
  are the same event as far as an order is concerned.
- **`audit_log`** is append-only, even for the service role; only
  `purge_audit_log()` deletes.
- **Membership is by invitation** (`company_invitations`): nobody is added
  to a company without accepting, and the owner role moves only through
  `transfer_company_ownership()`. One owner per company, enforced by a partial
  unique index.
- **Function privileges start from nothing.** Every function is revoked from
  the API roles and granted back explicitly, and default privileges no
  longer grant EXECUTE to new functions. A new function has to be granted in
  the migration that creates it.

### Money never trusts the client

`subscriptions` has no `INSERT`/`UPDATE` policy for regular users — only
platform admins and the service role (the payment webhook) write to it. A user
cannot grant themselves a plan by crafting a request.

### Enums over lookup tables

`vehicle_type`, `document_kind`, `listing_status` and friends are Postgres
enums. They change rarely, they give the frontend a typed union for free via
generated types, and an invalid value is a hard error rather than a silent
bad row. Adding a value is `ALTER TYPE ... ADD VALUE`; removing one needs a
migration, which is the right amount of friction.

### No PostGIS yet

`distance_km()` is a plain SQL haversine, immutable and parallel-safe. It
covers "loads within 100 km of Cluj". Bring PostGIS in when routing along real
roads or corridor polygons is actually on the roadmap — not before.

### Coordinates are stamped by a trigger, from `localities`

`localities` holds the places we have coordinates for: Romanian county seats
and the European cities cars are brought home from. A trigger on each listing
table fills `from_lat`/`from_lng` (and the unloading pair) from it by city
name, filling only what is missing, so a request that arrived with its own
coordinates keeps them.

A trigger rather than a line in the publish action, because there are three
ways a departure is born — the form, `create_route_series()` and
`generate_route_departures()` — and the last two are SQL and cannot read a
list that lives in TypeScript. `src/lib/cities.ts` stays what it was, the list
a picker shows; a unit test keeps the two in step.

This was found by building the radius filter: `truck_listings.from_lat` had
existed since the first migration and nothing had ever written to it. The
column being empty did not raise anything — it made `best_route_detour()`
quietly find no match, ever.

The board's public view does not serve the listing's own coordinates. It joins
`localities` by city name and serves the centroid, so the column cannot carry
an address whatever a listing holds. That is the view's guarantee rather than
a convention somebody has to remember.

## Computed reputation

Every figure on a company's public profile is derived by
`recompute_company_reputation(company_id)`, in one pass, and written to
`companies`. None of them can be entered: `guard_company_write()` refuses an
update to any of the fourteen columns from an account, which matters because a
Postgres UPDATE policy cannot restrict columns.

Two rules apply to all of them, at computation rather than at display — an
aggregate filtered correctly in one place leaks unfiltered from the second
place that reads it:

- a rating whose author is `profiles.is_test` counts for nothing;
- a rating with `hidden_at` set counts for nothing.

The thresholds are rows in `rating_settings`, not constants. The same names
appear in `src/lib/ratings.ts` and in the „Cum calculăm" note on the profile,
and `tests/unit/ratings.test.ts` reads this migration back to check the two
have not drifted.

| Column | Formula | Shown when |
|---|---|---|
| `rating_avg`, `rating_count` | mean and count of visible ratings whose author is not a test account | `rating_count >= min_public_ratings` (3). Below that the profile says **„Evaluări insuficiente"**, never a smaller number |
| `rating_punctuality`, `rating_communication`, `rating_vehicle_care`, `rating_info_accuracy`, `rating_handover` | mean of each sub-score **over the rows that carry it**, not over all ratings — every sub-score is optional | with the average |
| `completed_as_carrier` | orders in `order_completed`, `invoiced` or `closed` where the firm is `carrier_company_id` | always |
| `completed_as_client` | the same, where the firm is `shipper_company_id` | when above zero |
| `punctuality_pct`, `punctuality_sample` | of the completed orders that have an accepted offer carrying both estimated dates: the share where `picked_up_at::date <= estimated_pickup_date + punctuality_grace_days` **and** `delivered_at::date <= estimated_delivery_date + punctuality_grace_days` (grace 1 day). An order with no promised dates is not in the sample at all — a promise that was never made can be neither kept nor missed | `punctuality_sample >= min_punctuality_orders` (3) |
| `response_pct`, `response_sample` | of the requests published in the last `response_lookback_days` (90) that `company_matches_request()` says the firm matches and whose poster is not a test account: the share the firm answered within `response_window_hours` (24) with an offer **or** a message on that offer's thread. A clarification counts — „ce fel de mașină este" is an answer | `response_sample >= min_response_sample` (5) |
| `disputes_opened_12m`, `disputes_resolved_12m` | orders where the firm is either party and `disputed_at` is within twelve months, counted by `disputed_at` and by `dispute_resolved_at` | always |
| `reputation_computed_at` | when the function last ran. Empty means „never", not „zero" | — |

`verified_at` is not computed here; it has been on `companies` since
`20260917140000` and the profile reads it directly.

Recomputed on every rating written, edited, hidden or unhidden, and for every
non-test company by `nightly-reputation` at 03:10. The nightly pass is not
redundant: the response-rate window slides, disputes leave the twelve-month
frame, and orders complete without anybody rating them. Without it a firm's
response rate freezes on the day of its last rating.

## Generating TypeScript types

```bash
supabase gen types typescript --project-id <project-id> --schema public \
  > src/integrations/supabase/types.ts
```

Re-run it after every migration and commit the result. Lovable reads that file
to type queries; a stale one is the most common source of "this worked
yesterday".

### The cargo is a vehicle, and freight is the second case

A listing carries `listing_kind` and shares everything both kinds have —
route, dates, price, status, contacts, `weight_kg` — on `cargo_listings`. The
type-specific fields live in `cargo_vehicle_details` or
`cargo_freight_details`, one row each, so neither kind carries the other's
empty columns and a board query never has to know which it is looking at.

`weight_kg` deliberately stays on the listing rather than being duplicated
into both detail tables: every card shows it and every filter uses it, so
pushing it down would make the commonest query a union.

`needs_winch` is `GENERATED ALWAYS AS (not is_running or not wheels_turn or
not steering_works) STORED`. It is the single biggest price driver in vehicle
transport and it must never disagree with the flags it comes from, so the
database computes it and the client only reads it.

### Enum additions get their own migration

Postgres refuses to *use* an enum value in the same transaction that added it
with `ALTER TYPE ... ADD VALUE`. Migration 0008 does nothing but add the three
platform types; 0009 references them. Merging the two files breaks on a fresh
database.

### Free slots are derived, never stored

`v_departures` computes `slots_free` from `departure_bookings`, and
`guard_departure_capacity()` refuses a booking that would overfill the
platform. A stored counter would drift the first time a booking was cancelled
outside the happy path.

### `offers_received` is in the enum and nothing writes it

`carrier_selected` is a real stored status: `accept_offer()` and
`confirm_departure_booking()` write it, and the board reads it.
`offers_received` is the opposite — it exists in `listing_status` and no code
path has ever set it.

That is deliberate, and the same reasoning as free slots above. Keeping it in
step would take four paths: an offer arriving, being withdrawn, being
rejected, and expiring. The last is an hourly job, so the first miss leaves a
row claiming offers that are no longer there. `requestStateLabel()` counts the
live offers instead.

The value stays in the enum: removing it is a migration for no gain, and a row
restored from an old dump still reads correctly because the derivation decides
the words.

### The price view refuses to publish a thin median

`v_corridor_prices` has `having count(*) >= 5`. A median from two transports is
a number that misleads someone about to spend 700 €, so a corridor stays on
the editorial benchmark in `price_benchmarks` until it has a real sample.

## Tests

`supabase/tests/smoke_test.sql` exercises every rule that lives in the
database rather than in the frontend: the publish guards, the compliance
sweep, suspension and automatic reactivation, plan quotas, the contact gate,
the requirement configuration, the vehicle model, platform slots and the
price threshold. 40 checks, abort on first failure.

Run it against a scratch database after touching any migration —
`supabase/tests/README.md` has both the Supabase and the plain-Postgres
recipe. A rule the database enforces but nothing tests is a rule that will be
removed by accident.

## Applying the migrations

Paste each file into the Supabase SQL Editor **in filename order**, or run
`supabase db push` with the CLI linked to the project.

Before the first one, enable in Dashboard → Database → Extensions:
`pgcrypto`, `pg_trgm`, `pg_cron`.

`pg_cron` has to be enabled from the Dashboard because it needs an entry in
`shared_preload_libraries`, which a migration cannot set. Migration 0007
therefore does not `CREATE EXTENSION` — it checks whether `cron.schedule`
exists and raises a notice instead of aborting, so the migration set applies
either way. If you see that notice, enable the extension and re-run the file.

After the last one, verify:

```sql
-- every public table must have RLS on
select relname from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
-- expected: zero rows

-- every scheduled job must be there, and active (20 today; job_health()
-- keeps the list, and rls_test.sql fails if the two disagree)
select jobname, schedule, active from cron.job order by jobname;
```
