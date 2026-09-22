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
| `pe sens` / `expres` | Service level: standard (the platform fills up, cheaper) / express (dedicated departure). Schema values `pe_sens`, `expres` |
| `cerere` | A client's transport request — a `cargo_listings` row |
| `plecare` | A carrier's published availability on `tur` or `retur` — a `truck_listings` row, with seats when it is a car platform |

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

### 1. Curse (loads and vehicle transport requests)

Posted by companies. Fields that matter to a Romanian dispatcher:

- Route: loading and unloading city + county, with dates (`from` / `to`,
  because loading windows are ranges, not points)
- Cargo: type, weight in kg, volume, **loading metres (ldm)**, pallet count
- Requirements: vehicle types accepted, ADR, reefer with temperature range,
  tail lift
- Commercials: fixed / negotiable / auction, amount, currency (RON or EUR),
  **payment term in days** — the single most argued-about field in Romanian
  road freight, so it is first class, not buried in the description

A vehicle transport request (`listing_kind = 'vehicul'`, the launch market)
also carries, and cannot be published without:

- **Make, model and manufacturing year** of the vehicle
- **Starts and drives** (yes / no) — the biggest price driver: a vehicle that
  does not drive needs a winch and a second operator
- **Service level**: standard (`pe_sens`) or express (`expres`)

The schema also has a third service level, `tractare`. It stays, but the UI
hides it at launch: a vehicle that does not drive is ordered as standard or
express, and its condition flags (`needs_winch`) tell the carrier what to
bring.

### Listing statuses

A request moves through these statuses, and only these. Availabilities
(`tur` / `retur`) use the same list. `assigned` and `completed`, used so far,
are replaced by `carrier_selected` and `delivered` everywhere in the
documentation.

| Status | Meaning | Enters when |
|---|---|---|
| `draft` | Being written, not on the board | Created |
| `active` | On the board, no offer yet | Published |
| `offers_received` | **In the enum, never written.** See the note below | — |
| `carrier_selected` | An offer was accepted, or a seat reservation confirmed; off the board | `accept_offer()` / `confirm_departure_booking()` — a stored status, written by those two and by nothing else |
| `in_progress` | The vehicle has been picked up | Order reaches `vehicle_picked_up` |
| `delivered` | The vehicle has been delivered | Order reaches `vehicle_delivered` |
| `cancelled` | Withdrawn by the client, before or after selection | Client cancels |
| `expired` | Its dates passed while it was on the board or suspended | Cleanup job, or reactivation after the dates |
| `suspended` | Taken off the board because its owner lost compliance | Compliance sweep |
| `disputed` | A party opened a complaint on the order | Complaint filed |

**`offers_received` exists and is never set.** It was meant to mean „on the
board, with at least one pending offer", and keeping it in step would take
four paths — an offer arriving, being withdrawn, being rejected, and
expiring — the last of which is an hourly job. The first time one of them
is missed, the stored status describes offers that are no longer there. So
the label is derived from the live offers instead, in `requestStateLabel()`,
and nothing writes the enum value. A row that somehow arrives carrying it
still reads correctly, because the derivation is what decides the words.

**Suspension and return.** When an owner is suspended, their `active` and
`offers_received` listings become `suspended`, and the status they had is
stored with them. On reactivation each one returns automatically to that
status if its dates are still valid, and becomes `expired` otherwise. An
availability whose vehicle loses compliance leaves and returns the same way.

### 2. Mașini pe tur (outbound trucks)

Posted by carriers who have spare capacity on a leg they are already running.
Same route shape as a load, plus free capacity (kg / ldm / m³) and whether
partial loads are accepted.

Every availability, on `tur` and on `retur`, carries:

- **Waypoints** — the cities the truck passes through
- **Accepted vehicle types** — what the platform can load (cars, vans,
  motorcycles, vehicles that do not drive)
- **Indicative price**, optional
- **Free seats**, for a car platform. They decrease automatically when an
  order on that departure is confirmed; clients never edit them.

### 3. Mașini pe retur (return trucks)

Same table as tur, `direction = 'retur'`. Two things make returns different:

- **Waypoints and detour tolerance.** An empty truck coming back from Hamburg
  will happily take a 40 km detour. `waypoints` (jsonb) plus `max_detour_km`
  drive the matching.
- **Individuals post here.** A private person with a quick account posts a
  request (`cargo_listings.board = 'retur'`, `company_id IS NULL`) and
  returning carriers pick it up.

## Fleet

Each vehicle records, besides plate, VIN, type and documents:

- **Assigned driver**
- **Operated routes** — the corridors the vehicle usually runs, used for
  matching
- **Dimensions** — length, width, height, and payload

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
              ├─> each upload -> parse-document (AI reads it, see below)
              ├─> admin reviews and approves -> status 'verified'
              └─> can now post, bid and reveal contacts
```

**Document reading is part of the MVP.** `parse-document` sends each upload
to an AI model that extracts the document kind, number, holder and validity
dates into `documents.extracted`, with a confidence score. It never approves
anything: the document lands in the review queue with the fields pre-filled,
and a person from the platform confirms or corrects them and approves or
rejects. AI extracts, a human approves.

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
  -> its active / offers_received listings -> 'suspended', previous status stored
  -> notification_outbox row -> n8n -> e-mail + WhatsApp
```

Reactivation is the same path in reverse and is automatic: the admin approves
the replacement document, the trigger re-runs the sweep, the company is
`verified` again. Its suspended listings go back to the status they had if
their dates are still valid, and become `expired` otherwise — a two-week-old
return trip does not come back to the board.

Login is never blocked. A suspended customer must be able to walk in and fix
the problem; locking them out just gets you a phone call.

Vehicle-level compliance is separate from company-level: one truck with an
expired ITP takes that truck off the board, not the whole fleet.

### Document display status

Every document with an expiry date shows one of three statuses, derived
from `valid_until` and never stored:

| Status | Rule |
|---|---|
| `valid` | Expires in more than 30 days |
| `expiring_soon` | Expires in 30 days or less |
| `expired` | Past `valid_until` |

Colour reinforces the status and is always next to its label.

## Access to contact data

Browsing is free, contacting is not — that is the business model of every
exchange that works.

`listing_contacts` is a separate table with its own RLS. A non-owner reaches
it only through `reveal_contact()`, which checks, in order:

1. the caller is a member of a company that is verified and not suspended,
   or an individual with a confirmed phone number
2. the listing is active
3. their plan has quota left this month (re-opening a listing they already
   revealed does not burn quota again)
4. logs the reveal to `contact_reveals`

Starting a conversation on a listing is a contact too: it passes the same
checks and counts against the same quota, once per listing.

The log is threefold useful: quota counting, GDPR accountability, and fraud
investigation ("who looked at this load right before it disappeared").

## Search and matching

- Text: trigram index on company names
- Route: county-pair index for the common "Cluj → Timiș" query
- Radius: `distance_km()`, a plain SQL haversine. No PostGIS until routing or
  polygons are actually needed — one less extension to maintain across
  environments.
- Saved searches feed the alerting workflow in `n8n/README.md`

**Both boards filter by radius and by weight.** On `/cereri` the radius is
measured from the loading locality and the weight is the heaviest vehicle the
carrier will take; on `/trasee` it is measured from the departure locality and
the weight is the free capacity the client needs. Every criterion lives in the
URL, so a search is shareable, and a saved search stores the same keys.

The coordinates come from `localities`, a table of the localities we have
coordinates for, and a trigger stamps every listing from it by city name.
That is deliberately not an address: the radius is between locality centroids,
and both screens say so. A listing whose town is not in the table has no
coordinates and is in no radius — many cars are collected from a village, and
answering „yes" for those would empty the filter of meaning.

Weight goes the other way. The field is optional when publishing, so a listing
that never stated one stays in the list rather than disappearing from every
search that mentions weight; the figure, or its absence, is on the card.
`saved_search_match()` applies both rules exactly as the boards do, because an
alert that disagrees with the screen is worse than no alert.

**Saved-route alerts are in the MVP, by e-mail only.** The carrier plan
promises alerts for requests on the carrier's routes; WhatsApp delivery comes
after the MVP.

**Compatible carriers.** When a client publishes a request and verified
carriers have published availabilities or operated routes compatible with it
(route within the detour tolerance, dates, accepted vehicle type), the client
sees a message saying so — for example „3 transportatori verificați circulă
pe această rută în perioada aleasă”. The message never names the carriers
before they make an offer.

## Offers

An offer on a request carries:

- **Price** and currency
- **Estimated pickup date** and **estimated delivery date**
- **Transport conditions** — what is included, insurance, payment terms
- A **link to the carrier's profile** (reputation, verification date)

The client can accept, reject, or **ask for clarification**, which opens a
conversation on that offer without accepting it. Accepting goes through
`accept_offer()`: the offer is accepted, the other pending offers are
rejected, and the order is created in one transaction. On a car platform
with seats, the accepted offer books its seats; the departure stays open
until no seat is left, and only offers that no longer fit are rejected.

Clients do not book a seat directly from a published availability — see open
question 1.

## Messaging

- Until the order is confirmed, **phone numbers and e-mail addresses in
  messages are masked automatically**, so the contact quota cannot be bypassed
  through the chat.
- Any participant can **report an abusive message**.
- **Messages are immutable**: nobody edits or deletes them. Staff can hide a
  message; every hide is recorded in the audit log with its reason.

## Orders and execution

An order is created in exactly two ways, both by the same internal database
function — never by a client writing to `transports`:

- an offer is accepted (`accept_offer()`)
- the carrier confirms a seat reservation (`confirm_departure_booking()`)

It moves through:

`order_confirmed` → `pickup_scheduled` → `vehicle_picked_up` → `in_transit`
→ `delivery_scheduled` → `vehicle_delivered` → `order_completed`

Uploads attached to the order, each timestamped and attributed:

- Pickup photos
- Vehicle condition report
- Transport documents
- Delivery photos
- Recipient signature or confirmation
- Incident notes

## Reputation

A carrier profile shows, all computed from completed orders and platform
records, never entered:

- Completed transports count
- Rating
- Punctuality (pickup and delivery against the estimated dates)
- Response rate (requests answered with an offer or a message)
- Resolved complaints
- Last verification date

**No paid badge may look like verification.** Promoted listings and paid
plans are labelled as such and never use the verification colours, icons or
wording.

## Subscriptions and billing

- Free trial
- Recurring payment
- Invoice for every payment
- Renewal reminder before each charge
- Update card
- Cancel
- Suspension for non-payment
- Promo codes
- Payment history

These are invoices from the platform to its customers for their
subscription, and they are in the MVP. Invoicing the transport between the
parties is not — see Later.

## Admin

Beyond document review and account suspension, staff can:

- Moderate requests and listings
- Review reported conversations
- Handle complaints
- Issue refunds
- Grant promotions
- Export reports

## Open questions

1. **Can a client book a free seat directly from a published availability, or
   only through the offer flow?** Answered September 2026: not directly. A
   client makes an offer, or places a reservation that holds seats for at most
   24 hours (or until the end of the departure day) and that the carrier
   confirms. Either way the order is created only on the carrier's side.
2. **What status does a listing take while its owner is suspended?**
   Answered September 2026: `suspended`, with its previous status stored; on
   reactivation it returns to that status if its dates are still valid,
   otherwise `expired`. See "Listing statuses".

## After the MVP

- **Price index**, published only once a corridor has enough completed
  transports to make a median honest
- **Temporary location** of the vehicle during an active order
- **Listing promotions**
- **PDF contract** with electronic acceptance
- **Driver PWA** extras

## Later

Stated so nobody assumes otherwise. Each is a project of its own:

- Payments for the transport itself
- Automatic invoicing of transports between the parties
- Escrow
- Commission on transports
- Automatic ARR / RAR / AIDA checks
- Telematics
- Full e-CMR (`transports` already carries a `cmr_number` field)
- Auctions
- AI pricing
- Native apps
- Load optimisation
- Route optimisation
- TMS import
- Public API
