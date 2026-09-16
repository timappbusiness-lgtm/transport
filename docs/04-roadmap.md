# Roadmap

The MVP is built in ten phases, in this order: verification, requests,
outbound and return availabilities, matching, offers, order, proof of
delivery, rating, subscriptions, admin. Each phase ships as one pull request
and is done when its checks pass: `pnpm db:test` for the rules Postgres
enforces, Playwright for the screens.

Every requirement in `docs/01-product-spec.md` belongs to exactly one phase
below, to "After the MVP" or to "Later". Phases that build screens need a
database to run against: a local Supabase (`supabase start`, which needs
Docker) for development and Playwright, and a Supabase development project
for Vercel previews.

The previous estimates assumed Lovable and are removed; they are set per phase
once the first UI phase has shipped.

## Phase 0 — Security hardening (done, September 2026)

Before any feature work. The September 2026 audit found that the database
rules could be bypassed by any signed-in user: self-granted staff access,
self-approved documents, self-accepted offers, forged transports and ratings,
internal jobs callable by anonymous visitors. Migrations
`20260916130000`–`130400` close them; `supabase/tests/rls_test.sql` proves it
as the API roles, and `pnpm db:test` runs both database suites.

Product decisions taken with it:

- **Starting a conversation is a contact.** It uses the same gate as
  `reveal_contact()` — eligible caller, active listing — and counts against the
  contact quota once per listing.
- **Seat reservations lapse.** An unconfirmed reservation expires after 24
  hours or at the end of the departure day, whichever comes first. One open
  reservation per user per departure. Clients cannot book a seat directly;
  the carrier confirms.
- **Rating individuals is out of the MVP.** A carrier cannot rate a private
  shipper; only companies are rated. Revisit once there is a moderation flow
  for ratings of private persons.
- **Saved-route alerts stay in the MVP, by e-mail only.** WhatsApp alerts move
  after the MVP. The homepage still lists „Alerte pe WhatsApp pentru traseele
  tale” as „în curând”; that line must become „Alerte pe email pentru cereri
  pe traseele tale” (not yet changed).
- **Confirming a seat reservation creates the order**, through the same
  internal function as `accept_offer()` (phase 0 follow-up).
- **Membership is by invitation.** A manager invites by e-mail
  (`invite_company_member`); the person accepts from a confirmed address with
  a company account (`accept_company_invitation`), or declines; invitations
  expire after 7 days. The owner role is never invited or edited in: the
  current owner transfers it (`transfer_company_ownership`), audited. One owner
  per company. Migration `20260916140000`.

## Phase 1 — Verification

Who is on the platform, and whether their papers are valid.

- Company signup with `create_company()`; CUI lookup at ANAF with autofill and
  the inactive / struck-off flag (`verify-cui-anaf`) *— database done in phase 0*
- Membership by invitation, ownership transfer *— done*
- Individual quick account: phone confirmed by OTP
- Document upload into the company folder; **AI extraction** with
  `parse-document` pre-fills kind, number, holder and dates; a person from the
  platform approves or rejects in the review queue (`review_document()`)
- Document display status: `valid`, `expiring_soon` (30 days or less),
  `expired`
- Vehicle registry: plate, VIN, type, **dimensions**, **assigned driver**,
  **operated routes**
- Expiry reminders by e-mail at 30, 14, 7 and 1 days
- Automatic suspension and reactivation; a suspended owner's `active` and
  `offers_received` listings become `suspended` with their previous status
  stored, and return to it on reactivation if their dates are still valid,
  otherwise `expired`
- Staff management (`set_platform_staff()`)

**Exit criteria:** a carrier signs up, invites a dispatcher, registers a
platform, uploads its papers, and is verified by a reviewer without anyone
touching the database; an expired RCA suspends and a renewal reactivates,
end to end.

**Status (September 2026): built.** `tests/e2e/verification.spec.ts` runs the
exit criteria in the browser against the Supabase project. Three parts work
but depend on credentials not yet set, so they are not tested end to end:

- **Phone OTP** for individuals needs an SMS provider in Supabase Auth; until
  then the screen explains that SMS is not active.
- **AI extraction** needs `ANTHROPIC_API_KEY` for `parse-document`; until
  then the reviewer reads the dates from the document, which the queue shows
  as "citire automată eșuată".
- **Expiry reminder e-mails** are queued in `notification_outbox`; delivering
  them needs the n8n dispatcher and an SMTP sender.

## Phase 2 — Requests

- Vehicle transport request with **make, model, manufacturing year**,
  **starts and drives**, **service level** standard (`pe_sens`) or express
  (`expres`); `tractare` stays in the schema, hidden in the UI
- Individuals post a request with the quick account
- Listing statuses from the product spec: `draft`, `active`, `cancelled`,
  `expired`, `suspended` in use; `carrier_selected` replaces `assigned` and
  `delivered` replaces `completed`
- Boards: browse and filter requests by route, dates, vehicle category,
  condition
- Contact reveal gated by eligibility, active listing and plan quota *—
  database done in phase 0*

## Phase 3 — Outbound and return availabilities

- Availabilities on `tur` and `retur` with **waypoints**, **accepted vehicle
  types**, optional **indicative price**
- Car platforms with seats; **free seats decrease automatically** when an
  order on the departure is confirmed
- Seat reservations: pending until the carrier confirms, lapse after 24 hours
  or at the end of the departure day, one per user per departure; confirming
  creates the order *— database done in phase 0 and its follow-up*
- No direct seat booking by clients

## Phase 4 — Matching

- **Compatible carriers message**: when a request is published, the client
  sees how many verified carriers run a compatible route, without names
- **Saved-route alerts by e-mail** (MVP; WhatsApp after the MVP)
- Homepage: „Alerte pe WhatsApp pentru traseele tale” becomes „Alerte pe
  email pentru cereri pe traseele tale”

## Phase 5 — Offers

- Offer with price, **estimated pickup date**, **estimated delivery date**,
  **transport conditions**, and a **link to the carrier profile**
- Accept, reject, withdraw, and **request clarification** *— accept, reject,
  withdraw done in the database in phase 0*
- `offers_received` while at least one offer is pending; back to `active`
  when every offer is withdrawn or rejected
- Messaging: conversations through the contact gate *(database done)*;
  **phone numbers and e-mails masked automatically** until the order is
  confirmed; **report abusive message**; messages immutable *(database done)*;
  staff hide a message with an audit entry

## Phase 6 — Order

- One internal function creates the order, from an accepted offer or a
  confirmed reservation *— done*
- Order statuses: `order_confirmed`, `pickup_scheduled`, `vehicle_picked_up`,
  `in_transit`, `delivery_scheduled`, `vehicle_delivered`, `order_completed`,
  each moved by the party allowed to move it, through an RPC
- The listing follows the order: `carrier_selected` → `in_progress` →
  `delivered`
- Cancellation, and complaints that put the order in `disputed`

## Phase 7 — Proof of delivery

- Uploads on the order: **pickup photos**, **vehicle condition report**,
  **transport documents**, **delivery photos**, **recipient signature or
  confirmation**, **incident notes** — timestamped, attributed, immutable

## Phase 8 — Rating and reputation

- Ratings after delivery, one per side, companies only (individuals are not
  rated in the MVP) *— database done in phase 0*
- Carrier profile with **completed transports**, **rating**, **punctuality**,
  **response rate**, **resolved complaints**, **last verification date**
- No paid badge that can be confused with verification

## Phase 9 — Subscriptions and billing

- **Free trial**, starting at verification
- **Recurring payment**, **update card**, **cancel**
- **Invoice** for every payment (platform to customer; invoicing transports
  between the parties is Later)
- **Renewal reminder**, **suspension for non-payment**
- **Promo codes**, **payment history**

## Phase 10 — Admin

- **Moderate requests and listings**
- **Reported conversations** and hidden messages
- **Complaints** and **refunds**
- **Grant promotions**
- **Report export**

**MVP exit criteria:** 20 verified carriers and 5 forwarders using it weekly
without us in the loop, and more than half of accepted deals starting from an
in-platform offer rather than a phone call.

## After the MVP

- **Price index**, published only once a corridor has enough completed
  transports
- **Temporary location** of the vehicle during an active order
- **Listing promotions**
- **PDF contract** with electronic acceptance
- **Driver PWA** extras
- WhatsApp delivery for saved-route alerts
- Public company profiles for SEO (from the previous roadmap)

## Later

Each is a project of its own and out of the MVP by decision:

- Payments for the transport itself
- Automatic invoicing of transports between the parties
- Escrow
- Commission on transports
- Automatic ARR / RAR / AIDA checks
- Telematics
- Full e-CMR
- Auctions
- AI pricing
- Native apps
- Load optimisation
- Route optimisation
- TMS import
- Public API

## Sequencing risks

**The chicken-and-egg problem is the whole project.** An empty exchange is
worthless to both sides. Plan for it before launch:

- Seed the carrier side first — they have the spare return capacity and the
  strongest pain. Free plan for the first 3 months, in writing.
- Onboard the forwarders the client already knows personally. A freight
  exchange launches from a phone book, not from ads.
- Until there is liquidity, run a manual matching service on top: someone
  reads new listings and calls the likely match. It does not scale and that
  is fine — it buys the first hundred deals.

**Document review is a staffing commitment, not a feature.** A 24-hour
approval promise needs a named person. If nobody can own it, drop the promise
to 48 hours on business days and say so on the signup page.

**Do not let the vehicle-data integration slip into the MVP.** It depends on
a commercial agreement outside our control, and the feature the client asked
for does not need it.
