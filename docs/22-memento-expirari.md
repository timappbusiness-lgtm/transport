# 22 — Memento expirări auto

Free expiry reminders for vehicle documents — RCA, ITP, rovinietă, CASCO,
trusă medicală, extinctor, revizie (date or km) and „Altceva" with a name —
for any account, a person or a firm, one car or a fleet. An acquisition
feature: a vehicle owner gets a reason to have an account before they have
a transport to order.

Migration `20261016100000_memento_expirari.sql`. Screens: `/memento-expirari`
(public), `/cont/memento` and below, `/memento-expirari/dezabonare`.

## Declared is not verified

Memento dates are typed by the person. They are kept apart from everything
the platform verifies:

| | Verified documents | Memento |
|---|---|---|
| Tables | `documents`, `vehicles` | `memento_vehicles`, `memento_entries`, `memento_history`, … |
| Who writes | the carrier uploads, staff approve | the owner, through `memento_*` RPCs |
| Compliance, „firmă verificată" | yes (`run_compliance_sweep`) | never |
| Matching, public views, directory | yes | never |
| Wording on screen | Conform, Aprobat, badges, accent | „Memento", plain text, no badge, no accent |

How it is held:

- **Structurally** — `supabase/tests/security_test.sql` guard 9: no
  function outside `memento_*` reads the memento tables except the three
  account functions that must (`queue_expiry_reminders`, `my_data_export`,
  `account_deletion_files`); no view and no non-memento policy reads them;
  the nightly job calls the memento only after the verified reminders, in
  its own `exception` block.
- **Behaviourally** — RLS block MEM: a full memento for a non-compliant
  vehicle leaves it non-compliant with no new `documents` row; a memento
  RCA valid next year does not keep a vehicle compliant when its verified
  RCA runs out; after a memento fleet and a sweep every firm's verification
  status and every vehicle's compliance are byte-for-byte unchanged; the
  public firm and document views are unchanged; `company_matches_request`
  answers the same for every firm and request.
- **On screen** — `tests/e2e/memento.spec.ts`: no verification word, no
  success badge and no accent colour on any memento screen.

A carrier who adds the same RCA for verification uploads it on
`/cont/firma/documente` as before; that is a separate, verified record.

## Reminders

One job, the one that already ran: `queue_expiry_reminders()` (cron
`nightly-expiry-reminders`, 02:15 UTC). Its body for verified documents is
unchanged; it then calls `memento_queue_reminders(now())`. A failure there
is logged on the same job (`job_run_log`, `failed = 1`, `memento_error`)
and leaves the verified reminders queued.

- **Days**: 30, 7, 1 before and on the day (`memento_settings.default_days`).
  Per account and per document type in `/cont/memento/setari`
  (`memento_schedules`, `*` for the account's default, empty = off).
- **Catch-up**: the reminder due is the smallest configured day not below
  the days left, so a night the job did not run is caught up the next.
- **Not retroactive**: a day that had already passed when the date was
  written is skipped (`date_set_on`).
- **Grouping**: per recipient per day. Entries whose next reminder falls
  within `group_window_days` (3) ride along with one that is due, so close
  dates make one e-mail (`memento_expiry_digest`). The day itself is never
  pulled forward.
- **Recipients**: a person's own vehicle → the person. A firm's vehicle →
  the responsible member, or the firm's owner and admins.
- **Channels**: e-mail (`notification_outbox`, preference
  `memento_expiry.email`, quiet hours via `send_after`), push (`queue_push`:
  preference, device, quiet hours, cap), in-app (a calm notice on `/cont`
  when a date is within 7 days or expired in the last 30; honours
  `memento_expiry.inapp`). There is no notifications inbox in the app yet.
- **Links**: „Am reînnoit" → `/cont/memento?reinnoieste=<entry ids>`, the
  forms open at the top. Unsubscribe → `/memento-expirari/dezabonare?t=…`,
  a button (not a GET) that switches off this e-mail type only.
- **Logged** in `memento_reminder_log` (entry, date, milestone) whatever
  the channels did, so a reminder is given once.

## Photo and AI

Optional. Uploaded through `/api/incarcare/memento` (EXIF stripped,
re-encoded to JPEG) into the private `memento` bucket under the owner's
folder. `parse-document` mode `memento` reads it with the caller's token,
writes nothing, and returns only the date, the series and the plate. The
date goes into the form; the person saves it. `memento_claim_ai_read()`
counts it against `ai_reads_per_day` (0 = off). Without the function or
the key the screen says to type the date — the form is the manual one.

Rovinietă: there is no public API. Nothing claims an automatic check.

## Limits and retention (`memento_settings`, staff: `/admin/setari`)

| Setting | Default |
|---|---|
| Vehicles per personal account / per firm | 20 / 500 |
| Dates per vehicle | 12 |
| Vehicles added per hour / CSV imports per hour / rows per import | 30 / 5 / 300 |
| AI photo readings per day | 20 |
| Days an expired date and a replaced date are kept | 365 |

Messages are Romanian with errcode `53400`. Retention runs inside the same
nightly job (`memento_purge`).

## Privacy

Plates and dates are personal data: in `my_data_export()`
(`memento_vehicule`, `memento_documente`, `memento_istoric`), deleted with
the account (foreign keys from `profiles`; a firm's on anonymisation via a
trigger; photos listed by `account_deletion_files`), never public, never
used for matching. Privacy notice 1.2 has a section on it.

## Product spec — proposed change, not applied

`docs/01-product-spec.md` changes only with approval. Proposed addition,
under the client features:

> **Memento expirări auto** — free, for any account. Plates and the expiry
> dates of RCA, ITP, rovinietă, CASCO and others; reminders 30/7/1 days
> before and on the day, by e-mail, push and in the app; fleets with CSV
> import and a responsible person per vehicle. Self-declared, never part of
> verification, matching or anything public.
