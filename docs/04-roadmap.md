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
  after the MVP. The homepage line that promised them is gone — nothing in
  `src/` offers WhatsApp to a visitor, and
  `tests/e2e/profil-firma-supabase.spec.ts` asserts it stays that way.
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
- Individual quick account: name, e-mail, password and a telephone number.
  Publishing asks for the e-mail confirmed and the number on file; the number
  itself is confirmed later, where it is worth something — by SMS once a
  provider secret exists, by staff until then
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

## Phase 2 — Requests

- Vehicle transport request with **make, model, manufacturing year**,
  **starts and drives**, **service level** standard (`pe_sens`) or express
  (`expres`); `tractare` stays in the schema, hidden in the UI
- Individuals post a request with the quick account. **Not without an
  account**: the form is filled in whole without one and the account is made
  at the last step, with the draft kept across registration. The alternative
  is argued in `docs/10-analiza-lipsuri.md` §3.1 and was decided against on
  22 September 2026
- Listing statuses from the product spec: `draft`, `active`, `cancelled`,
  `expired`, `suspended` in use; `carrier_selected` replaces `assigned` and
  `delivered` replaces `completed`
- Boards: browse and filter requests by route, dates, vehicle category,
  condition — and, since `20261002100000`, by **radius from a chosen
  locality** and by **weight**. The same two on the departures board, where
  the weight is the platform's free capacity. Coordinates come from the
  `localities` table, stamped onto every listing by a trigger; `cities.ts`
  stays the list a picker shows
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
- **Saved-route alerts by e-mail** (MVP; WhatsApp after the MVP). A saved
  search stores radius and weight like every other criterion, and
  `saved_search_match()` applies them exactly as the board does — an alert
  that disagrees with the screen is worse than no alert
- **Phone confirmation by SMS**, `20261003100000`: the road is built and
  inactive until a provider secret is set. Without one, `sms-verify` refuses
  and names the missing variable, `/admin/notificari` shows it, and a number
  is still confirmed by hand from `/admin/pilot`. Twilio Programmable
  Messaging rather than Verify, so the code's lifetime, its attempt count
  and the rate limits stay in `phone_verification_settings` where they can
  be read and tested
- ~~Homepage: „Alerte pe WhatsApp pentru traseele tale” becomes „Alerte pe
  email pentru cereri pe traseele tale”~~ *— done; the WhatsApp line is gone*

## Phase 5 — Offers (done, September 2026)

- Offer with price, **estimated pickup date**, **estimated delivery date**,
  **transport conditions**, and a **link to the carrier profile** *— done*
- Accept, reject, withdraw, and **request clarification** *— done*
- ~~`offers_received` while at least one offer is pending; back to `active`
  when every offer is withdrawn or rejected~~ **Changed: the count is
  derived, not stored.** Four paths would have to keep the status in step —
  insert, withdraw, reject, expire — and the fourth is an hourly job, so a
  stored status drifts from the offers it claims to describe the first time
  one of them is missed. `requestStateLabel()` counts the live offers
  instead. The enum value stays where it is; nothing writes it.
- Messaging: conversations through the contact gate *(database done)*;
  **phone numbers and e-mails masked automatically** until the order is
  confirmed *— done, at insert, so the unmasked text never reaches a row*;
  messages immutable *— done, the update policy is gone*; staff hide a
  message with an audit entry *— done*
- ~~**Not built: report abusive message.**~~ **Built in phase 11.**
  `report_message()` opens a report of kind „mesaj" from the thread, and
  it is also what decides whether staff may read the conversation at
  all.

What this phase added beyond the list above, because the flow needed it:

- An hourly job that expires an offer past its validity, tells the carrier
  and leaves the request taking offers
- A per-plan monthly offer quota (`plans.max_offers_month`, NULL everywhere
  today, which means unlimited)
- `order_contacts()`: after acceptance each side sees the other's contact,
  recorded and never charged. `reveal_contact()` only ever answered with
  the *listing's* contact, which is the client's — the client had no way
  to reach the carrier at all.
- `/admin/oferte`, read-only, with the clarification thread

## Phase 6 — Order (done, September 2026)

- One internal function creates the order, from an accepted offer or a
  confirmed reservation *— done*
- `/cont/transporturi/[id]` is a summary and the two contacts, put there by
  phase 5 so the accepted offer has somewhere to lead *— now the whole
  order: timeline, evidence, and the button for whoever may act next*
- Order statuses: `order_confirmed`, `pickup_scheduled`, `vehicle_picked_up`,
  `in_transit`, `delivery_scheduled`, `vehicle_delivered`, `order_completed`,
  each moved by the party allowed to move it, through an RPC *— done,
  one RPC (`transition_order`) that checks from→to, the actor and the
  evidence the step needs; no user writes `transports.status`*
- The listing follows the order: `carrier_selected` → `in_progress` →
  `delivered` *— done, from the transition itself rather than from the
  frontend*
- Cancellation, and complaints that put the order in `disputed` *— done*

What this phase added beyond the list above, because the flow needed it:

- **The four old spellings stay for ever.** `agreed`, `loading`,
  `delivered` and `invoiced`/`closed` were already in `transport_status`
  and already in rows. The six new values were added beside them and the
  rows migrated; nothing renames an enum value, so the old names remain
  readable synonyms in `ORDER_STATUS_LABELS`.
- **Auto-completion**, hourly: an order sitting in `vehicle_delivered`
  past `order_settings.auto_complete_hours` (48) with no word from the
  client closes itself, tells both sides, and is audited as `system`.
- **The confirmation code.** A six-digit code on the order, readable by
  the client alone — not by the carrier, not by the driver, and the RLS
  suite checks all three. Delivery takes either that code or a drawn
  signature, never neither.
- **Driver isolation.** `is_transport_party()` says yes to any member of
  the carrier company, which would have handed a driver their firm's
  whole book. `can_see_order()` narrows it: a member whose only role is
  `driver` sees the orders assigned to them and no others.
- **A nightly check** flags an order whose assigned vehicle lost its ITP,
  RCA or copie conformă before pickup. It flags; it never cancels.
- `/admin/transporturi`, with the dispute decision and the evidence
  behind it

## Phase 7 — Proof of delivery (done, September 2026)

- Uploads on the order: **pickup photos**, **vehicle condition report**,
  **transport documents**, **delivery photos**, **recipient signature or
  confirmation**, **incident notes** — timestamped, attributed, immutable
  *— done, `order_evidence`, in a private bucket, with `captured_at` from
  the server clock and a trigger that refuses every update and every
  delete except the anonymisation job's*

Built with it, for the same reason:

- **Four photographs at each end**, prompted in order, and a nine-line
  condition report; the transition is refused without them, in Postgres,
  with the count read from `order_required_photos()`.
- **Location is a choice, not a by-product.** EXIF is stripped from every
  photograph on the server, unconditionally. Coordinates reach `lat`/`lng`
  only when the person taking the photograph allowed it for that capture.
- **The comparison view**: pickup photos beside the client's own photos
  of the car, delivery photos beside the pickup ones, each with its
  timestamp and author.
- Staff hide a piece of evidence with a reason, audited. The row and the
  file stay; only who may see it changes.

## Phase 8 — Rating and reputation (done, September 2026)

- Ratings after delivery, one per side, companies only (individuals are not
  rated in the MVP) *— done. „After delivery" narrowed to „after the order
  is finished": the phase 0 guard allowed `vehicle_delivered`, so a client
  who had not yet confirmed could rate, and a note given before you say
  whether you got the car is a note about something else*
- Carrier profile with **completed transports**, **rating**, **punctuality**,
  **response rate**, **resolved complaints**, **last verification date**
  *— done, every formula in `docs/02-data-model.md` and on the profile as
  „Cum calculăm"*
- No paid badge that can be confused with verification *— still none*

What this phase added beyond the list above:

- **The window and the one correction.** Fourteen days to rate, 48 hours
  to correct it once. A note that can be rewritten at any time is a
  negotiation, and the firm would be negotiating with whoever just rated
  it.
- **One public reply per rating**, and immutable once published — the
  rating it answers is already immutable, and a reply that can be
  rewritten makes the exchange asymmetric.
- **`post_rating()` is the only door.** The INSERT policy on `ratings` is
  gone; the guard trigger stays under the RPC, because a door can be
  opened wrongly tomorrow.
- **A rating on a disputed order waits** for staff to close it, and then
  carries „după o dispută" on the profile: a low note after a dispute
  means something different from one without.
- **Sub-scores are per side.** A client is asked about the carrier's care
  of the vehicle; a carrier about the client's information and
  availability. The phase 0 column `payment` fits neither and is no
  longer written.
- **The staff screen** at `/admin/evaluari`: hide and unhide with a
  reason, audited, and nothing that writes over what somebody wrote.
- **`notification_types` brought up to date.** It had not been touched
  since `20260918120000`, so the offer and order flows had templates but
  no type rows — which meant `queue_push()` returned null for every one
  of them and nobody could switch an order e-mail off.

## Phase 9 — Subscriptions and billing

- **Free trial**, starting at verification
- **Recurring payment**, **update card**, **cancel**
- **Invoice** for every payment (platform to customer; invoicing transports
  between the parties is Later)
- **Renewal reminder**, **suspension for non-payment**
- **Promo codes**, **payment history**

## Phase 10 — Admin

- **Moderate requests and listings** *— done in phase 11, `/admin/anunturi`*
- **Reported conversations** and hidden messages *— done in phase 11,
  `/admin/conversatii`, and narrowed: only conversations with a report or
  on a disputed order*
- **Complaints** and **refunds**
- **Grant promotions**
- **Report export** *— done in phase 11, CSV of reports and moderation
  actions for a date range*

## Phase 11 — General messaging and moderation (done, September 2026)

This is where Faza 2 stops. Everything in it is code-complete.

- **One inbox for every conversation** at `/cont/mesaje`, for every account
  type *— done*
- **Three kinds of conversation in the same two tables** — the offer
  thread (free, masked), the listing conversation (through the contact
  gate, counted once per listing, masked), the order conversation (made
  by a trigger at order creation, free, never masked) *— done*
- **Attachments**: up to five images per message, re-encoded server-side,
  private bucket, short-lived signed links *— done. No other file type,
  in the browser and in the bucket*
- **Block** a sender from opening new listing conversations, order
  threads unaffected, audited and reversible *— done*
- **Retention**: a conversation with no order is deleted after 24 months
  (a setting), attachments with it *— done, nightly*
- Listing **moderation** with a reason the owner reads, and **restore**
  *— done*

What this phase decided, beyond the list:

- **Three kinds, two tables.** Three tables would have meant three
  policies, three unread counts and three ways for them to drift.
  `conversation_kind()` derives the kind from which column is filled, and
  one check constraint says which combinations exist.
- **Staff read less than they did.** `staff_may_read_conversation()`
  narrows admin access from „every private conversation" to „one with a
  report in it, or on a disputed order", and `/admin/conversatii` *is*
  that set rather than a filtered view over everything. The rule is
  written on `/confidentialitate`, which is what makes it a promise.
- **History never unmasks.** Masking happens at insert, so a message
  written before the order has no unmasked copy anywhere. The order
  thread never masks, because by then `order_contacts()` has already
  given both sides the other's details.
- **The order thread is made by a trigger on `transports`**, not by
  `create_order()`. `create_order` is not the only writer, and a rule
  that lives in one caller is a rule the next caller forgets.
- **Digest by dedupe key.** The 15-minute grouping is the window integer
  inside the outbox dedupe key, so a second message in the same window
  lands on `on conflict do nothing` rather than needing a scheduler.
- **Realtime is an accelerator, not the guarantee.** The event is only a
  signal to re-read through `conversation_messages()`; nothing is drawn
  from the payload. A blocked WebSocket leaves the fifteen-second poll,
  which is why the screen never claims to be „connected".

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
