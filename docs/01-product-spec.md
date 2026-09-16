# Product specification

A Romanian freight exchange (*bursă de transport*) in the shape of
`bursatractari.ro`, with compliance verification as the differentiator.

## Glossary

Romanian regulatory terms are kept in Romanian throughout the code — they are
proper nouns of Romanian law and translating them loses meaning.

| Term | What it is |
|---|---|
| `casă de expediții` | Freight forwarder — brokers loads, does not own trucks |
| `licență comunitară` | EU Community Licence for road haulage, issued by ARR |
| `copie conformă` | Certified copy of the licence, one per vehicle |
| `ITP` | Periodic technical inspection (roadworthiness) |
| `RCA` | Compulsory motor third-party liability insurance |
| `CMR` | Carrier liability insurance under the CMR convention |
| `ARR` | Romanian Road Authority, issues licences and conform copies |
| `cursă` | A freight job / load on offer |
| `tur` / `retur` | Outbound leg / return leg |

## Actors

| Actor | Signs up with | Can do |
|---|---|---|
| **Freight forwarder** (`expeditie`) | CUI + forwarder credentials | Post loads, browse trucks, bid, rate carriers |
| **Carrier** (`transport`) | CUI + community licence + fleet | Post trucks (tur/retur), browse loads, bid, rate forwarders |
| **Both** (`both`) | Both document sets | Everything above |
| **Individual** (`individual`) | Phone + OTP, name | Post a return-trip request, browse return trucks, contact carriers |
| **Platform admin** | Internal | Review documents, handle reports, suspend accounts |

The individual account is deliberately thin. Asking a private person for a
transport licence to move a sofa is how you lose that side of the marketplace.
They verify a phone number and nothing else — see `docs/06-gdpr-and-antifraud.md`
for why that is safe enough and what limits it carries.

## The three boards

### 1. Curse (loads)

Posted by companies. Fields that matter to a Romanian dispatcher:

- Route: loading and unloading city + county, with dates (`from` / `to`,
  because loading windows are ranges, not points)
- Cargo: type, weight in kg, volume, **loading metres (ldm)**, pallet count
- Requirements: vehicle types accepted, ADR, reefer with temperature range,
  tail lift
- Commercials: fixed / negotiable / auction, amount, currency (RON or EUR),
  **payment term in days** — the single most argued-about field in Romanian
  road freight, so it is first class, not buried in the description

### 2. Mașini pe tur (outbound trucks)

Posted by carriers who have spare capacity on a leg they are already running.
Same route shape as a load, plus free capacity (kg / ldm / m³) and whether
partial loads are accepted.

### 3. Mașini pe retur (return trucks)

Same table as tur, `direction = 'retur'`. Two things make returns different:

- **Waypoints and detour tolerance.** An empty truck coming back from Hamburg
  will happily take a 40 km detour. `waypoints` (jsonb) plus `max_detour_km`
  drive the matching.
- **Individuals post here.** A private person with a quick account posts a
  request (`cargo_listings.board = 'retur'`, `company_id IS NULL`) and
  returning carriers pick it up.

## Registration and verification flow

```
signup
  └─> choose account type
        ├── individual ──> phone OTP ──> can post on the return board
        └── company
              ├─> enter CUI
              ├─> verify-cui-anaf autofills name, address, VAT, inactive flag
              ├─> pick company type (expeditie / transport / both)
              ├─> upload required company documents
              ├─> (carriers) add vehicles + per-vehicle ITP, RCA, copie conformă
              ├─> each upload -> parse-document (AI extracts expiry)
              ├─> admin reviews and approves -> status 'verified'
              └─> can now post, bid and reveal contacts
```

A company in `draft` or `pending` can log in, see the boards, and see that
listings exist. It cannot post, bid, or reveal a contact. That is intentional:
it shows the value before asking for the paperwork.

## Suspension and reactivation

Enforced by `run_compliance_sweep()` (migration 0003), nightly at 02:00 UTC
plus immediately on every document review.

```
document.valid_until < today - grace_days
  -> document.status = 'expired'
  -> company loses a blocking requirement
  -> companies.is_suspended = true, verification_status = 'suspended'
  -> its active listings -> status 'suspended'
  -> notification_outbox row -> n8n -> e-mail + WhatsApp
```

Reactivation is the same path in reverse and is automatic: the admin approves
the replacement document, the trigger re-runs the sweep, the company is
`verified` again. Its listings are **not** auto-republished — the carrier
reactivates the ones still relevant, because a two-week-old return trip is
no longer useful.

Login is never blocked. A suspended customer must be able to walk in and fix
the problem; locking them out just gets you a phone call.

Vehicle-level compliance is separate from company-level: one truck with an
expired ITP takes that truck off the board, not the whole fleet.

## Access to contact data

Browsing is free, contacting is not — that is the business model of every
exchange that works.

`listing_contacts` is a separate table with its own RLS. A non-owner reaches
it only through `reveal_contact()`, which checks, in order:

1. the caller is authenticated
2. their company is verified and not suspended
3. their plan has quota left this month (re-opening a listing they already
   revealed does not burn quota again)
4. logs the reveal to `contact_reveals`

The log is threefold useful: quota counting, GDPR accountability, and fraud
investigation ("who looked at this load right before it disappeared").

## Search and matching

- Text: trigram index on company names
- Route: county-pair index for the common "Cluj → Timiș" query
- Radius: `distance_km()`, a plain SQL haversine. No PostGIS until routing or
  polygons are actually needed — one less extension to maintain across
  environments.
- Saved searches feed the alerting workflow in `n8n/README.md`

## Out of scope for v1

Stated so nobody assumes otherwise: no GPS tracking integration, no e-CMR,
no automatic invoicing, no route optimisation, no TMS import. Each is a
project of its own; `transports` carries a `cmr_number` field so e-CMR can be
added later without a migration.
