# Document verification and automatic suspension

The client's request, verbatim:

> „noi sa sincronizam cumva cu asigurarile sa vedem cand expira sa suspendam
> contul pana o reface, sectiune sa verifice itp si asigurari la masina si
> copiile conforme arr"

This document answers two separate questions that are easy to conflate:
**can we tell when a document expires** (yes, fully) and **can we query the
insurer or RAR directly** (no, and here is what to do instead).

## What can actually be integrated in Romania

| Source | Public API? | Verdict |
|---|---|---|
| **ANAF** — company register (`webservicesp.anaf.ro`) | Yes, free, no key, official | **Use it.** Implemented in `supabase/functions/verify-cui-anaf`. Returns legal name, address, `nrRegCom`, VAT status and — the part that matters — `statusInactivi` and whether the company is struck off. |
| **VIES** — EU VAT validation | Yes, free (SOAP/REST) | Worth adding when international loads are in scope. |
| **AIDA / BAAR** — official RCA validity check | No API. Web page, CAPTCHA-protected, plate + chassis series, built for humans. | **Do not scrape.** See below. |
| **RAR** — ITP validity check | Same shape: a public web lookup, no documented API. | **Do not scrape.** |
| **ARR / ISCTR** — conform copies, licences | No public queryable register at all. | Nothing to integrate. |

### Why we are not scraping AIDA or RAR

Not squeamishness — three concrete reasons:

1. **It breaks and you find out from the customer.** A CAPTCHA change or a
   markup tweak silently stops the checks. The failure mode is the worst
   possible one: the platform believes everything is fine while it has stopped
   verifying anything.
2. **It is almost certainly against their terms of use**, and the product's
   entire selling proposition is "we are the exchange that verifies". Building
   that on an unauthorised data feed is not a position we want to defend to a
   client, let alone to BAAR.
3. **It buys less than it looks like.** Those portals confirm a policy exists
   *today*. They do not push a notification when it lapses — you would still
   poll, and you would still need the document on file for the dispute that
   follows a damaged load.

If the client later wants verification at source, the realistic route is a
commercial agreement with an insurance broker or a vehicle-data provider that
already has contractual access. That is a business conversation, priced and
scoped separately, and it is phase 2 in `docs/04-roadmap.md`.

**The important reframe for the client meeting:** the feature they asked for —
see when it expires, suspend the account until it is renewed — does not need
an insurer API at all. The uploaded document is the source of truth, and it is
better evidence than a portal lookup if a dispute ever reaches a court.

## How verification actually works here

```
carrier uploads ITP photo
        │
        ▼
  storage bucket 'documents'         (private, per-company folder)
        │
        ▼
  parse-document edge function       (Claude extracts valid_until + fields)
        │
        ▼
  documents.status = 'pending'       ← never 'approved', see below
        │
        ▼
  admin review queue                 (confirm or correct the date, approve)
        │
        ▼
  documents.status = 'approved'      → trigger re-runs run_compliance_sweep()
        │
        ▼
  nightly sweep tracks valid_until   → reminders at 30/14/7/1 days
        │
        ▼
  expiry + grace_days passed         → suspend, pull listings, notify
```

### The AI never approves

`parse-document` always writes `status = 'pending'`. A human confirms the
date. This is not caution for its own sake:

- A misread `2027` as `2021` suspends a paying customer who is fully compliant.
- A misread the other way puts an uninsured truck on the board. If that truck
  then damages a load, the platform advertised it as verified.
- Someone will eventually upload a doctored PDF. A model reads what is on the
  page; it does not judge whether the page is genuine.

Reviewing is fast — the extracted fields are pre-filled, the reviewer confirms
or corrects and clicks. Budget ~20 seconds per document. At 500 documents a
month that is under three hours of work, and it is the thing the customer is
actually paying for.

`extraction_confidence < 0.7` and any non-empty `issues` array should sort the
document to the top of the review queue.

### If the API rejects the extraction schema

`parse-document` asks for structured output with a strict JSON schema whose
optional fields are typed `["string", "null"]`. That is standard JSON Schema
and the right shape — it gives the model a way to say "this field is not on
the document" instead of inventing a value. If a future API version rejects
the union type, the fallback is to type every field as `"string"`, instruct
the model to return `""` when a field is absent, and map empty strings to
`null` in TypeScript before the update. Do not drop the schema entirely and
parse free text: the whole point is that `valid_until` is either a date or
explicitly absent.

### Cost

Claude Opus 5, list price $5/MTok input and $25/MTok output. A phone photo of
an A4 document is ~1.5–2.5k input tokens; the JSON answer is under 300 output
tokens. Roughly **$0.02 (~0.09 RON) per document**.

At 500 documents/month: under 50 RON. At 5,000/month it is worth re-measuring
accuracy on `claude-sonnet-5` before switching — set `ANTHROPIC_MODEL` and
re-run the accuracy check below. Do not switch on price alone; a wrong expiry
date costs more than the model does.

**Accuracy check before any model change:** take 30 real documents across all
kinds (including two deliberately bad photos), run both models, compare
`valid_until` against the human-confirmed value. Anything below 100% on the
legible ones means keep the current model.

## What the requirements table encodes

Seeded in migration 0003, editable without a deploy:

| Scope | Document | Required for | Blocking | Grace |
|---|---|---|---|---|
| company | `licenta_comunitara` | carriers | yes | 0 days |
| company | `certificat_casa_expeditii` | forwarders | yes | 0 days |
| company | `certificat_inregistrare_onrc` | everyone | yes | no expiry |
| company | `asigurare_cmr` | carriers | yes | 3 days |
| company | `asigurare_raspundere_expeditor` | forwarders | no | 3 days |
| vehicle | `copie_conforma` | all except ≤3.5 t | yes | 0 days |
| vehicle | `itp` | every vehicle | yes | 0 days |
| vehicle | `rca` | every vehicle | yes | 0 days |
| vehicle | `carte_verde` | every vehicle | no | 0 days |
| vehicle | `autorizatie_adr` | every vehicle | no | 0 days |
| driver | `atestat_profesional`, `permis_conducere` | optional | no | 0 days |

**Grace days.** ITP, RCA and the conform copy get zero — driving without them
is illegal, and a platform that tolerates a three-day gap is advertising
something false. CMR gets three days, because insurance renewals genuinely lag
by a day or two at the broker and suspending a good customer over paperwork
timing is how you lose them. That is a business decision; it lives in a table
so the client can change it.

## Suspension behaviour

| Suspended company **can** | Suspended company **cannot** |
|---|---|
| Log in | Post a new listing |
| See the boards and listings | Publish a draft |
| Upload replacement documents | Reveal any contact |
| Read its own conversations | Send new offers |
| See exactly what expired and when | Appear on the boards (listings → `suspended`, back automatically on reactivation while still in date) |

Locking a suspended customer out of their account is the single most common
mistake in this pattern. They must be able to walk in, see a clear "your RCA
for B-123-ABC expired on 14 March, upload the new one here" screen, and fix it.

One expired vehicle document suspends **that vehicle**, not the fleet. One
expired company document suspends the company.

## Verification checklist

Run after deploying migrations 0003 and 0007.

```sql
-- 1. Requirements seeded
select scope, kind, is_blocking, grace_days from public.document_requirements order by scope, kind;

-- 2. Sweep runs and is idempotent (second call must return all zeros)
select * from public.run_compliance_sweep();
select * from public.run_compliance_sweep();

-- 3. Force an expiry on a test company and confirm suspension
update public.documents set valid_until = current_date - 1
where company_id = '<test-company-id>' and kind = 'itp';
select * from public.run_compliance_sweep();
select is_suspended, suspension_reason from public.companies where id = '<test-company-id>';

-- 4. Confirm its listings came off the board
select status, count(*) from public.truck_listings where company_id = '<test-company-id>' group by 1;

-- 5. Fix it and confirm automatic reactivation
update public.documents set valid_until = current_date + 365
where company_id = '<test-company-id>' and kind = 'itp';
select * from public.run_compliance_sweep();
select is_suspended from public.companies where id = '<test-company-id>';

-- 6. Reminders are queued, once per milestone
select template, payload->>'days_left' as days_left, dedupe_key
from public.notification_outbox where template = 'document_expiry_reminder';

-- 7. Cron jobs are scheduled and active
select jobname, schedule, active from cron.job;
```

Manual checks:

- Upload a clear ITP photo → `parse-document` returns the right `valid_until`
- Upload a blurry one → `confidence` drops and `issues` is populated
- Upload a PDF → handled as a `document` block, not an image
- Upload an RCA while declaring it an ITP → response carries `kind_mismatch: true`
- Call `parse-document` for another company's document → 403
- A suspended company tries to publish → the trigger raises, not a silent no-op
