# Pricing

Model: **browsing is free, contacting is not.** Every freight exchange that
works charges for reach, not for access. Seeded in migration 0006 — the
numbers are a starting proposal, not a decision.

| Plan | RON/month | Loads | Trucks | Contacts/mo | Saved searches | WhatsApp | Promoted |
|---|---|---|---|---|---|---|---|
| `free` | 0 | 3 | 3 | 3 | 1 | no | 0 |
| `carrier` | 149 | 10 | ∞ | ∞ | 10 | yes | 2 |
| `forwarder` | 249 | ∞ | 10 | ∞ | 20 | yes | 5 |
| `business` | 449 | ∞ | ∞ | ∞ | ∞ | yes | 15 |
| `individual` | 0 | 2 | — | 5 | 1 | no | 0 |

`individual` is not sold. It is what a fast-signup private person gets.

## Why these shapes

**Free is generous enough to prove the product and tight enough to hurt.**
Three contacts a month lets a carrier find one return trip and see it work.
The fourth one is the conversion.

**The carrier and forwarder plans differ in direction, not in size.** A
carrier posts trucks and consumes loads; a forwarder does the reverse. Each
gets unlimited on its own side and a usable allowance on the other. Selling
both sides the same "10 listings" package would overcharge one and undercharge
the other.

**Contacts, not listings, are the meter that matters.** Listings are cheap to
store and make the board look alive — you want more of them. Contact reveals
are the moment value is delivered.

**Individuals pay nothing and never will.** They are supply for the return
board, which is what makes the carrier subscription worth buying. Charging
them would kill the side of the market that makes the other side pay.

## Second revenue line: promoted listings

A promoted listing sorts first on its board and carries a badge. Credits are
included per plan and sellable on top (suggested: 15 RON each, 10 for 120 RON).
For an empty truck coming back from Germany, being first in the list for two
hours is worth far more than 15 RON — this is the highest-margin line in the
model.

`is_promoted` and `promoted_until` already exist on both listing tables;
`expire_stale_listings()` clears them.

## Billing mechanics

- Monthly, card, auto-renew. Yearly at ten months' price (`price_ron_year`).
- Netopia if the client wants Romanian card handling and local invoicing;
  Stripe if international cards matter more. Decide before phase 2.
- **MVP can ship without any of it:** manual invoicing and an admin who sets
  `subscriptions.plan_code`. Twenty customers do not justify a payment
  integration. The schema is ready for the day they do.
- `subscriptions` has no user-facing INSERT/UPDATE policy — only admins and
  the service role (the payment webhook) write to it.

## Trial

30 days on `carrier` or `forwarder`, no card, starting at **verification**
rather than at signup. That way the trial clock rewards finishing the
paperwork instead of running out while documents sit in the review queue.

## What to validate before launch

1. Will a Romanian carrier pay 149 RON/month? Ask ten before building the
   payment flow.
2. Is 3 free contacts the right number? Watch where free users stop.
3. Do forwarders want per-seat pricing? A 5-dispatcher office on one login is
   revenue left on the table — but only add seats once someone asks twice.

---

# Indicative transport prices

A different thing from everything above, and worth keeping separate in your
head: this page charges nobody. It is what a person with a car to move sees
before they fill in a form — a rate per kilometre by vehicle class, and a
calculator that turns a route into a range.

Two tables, added in migration `20260917104913`:

| Table | Holds |
|---|---|
| `price_rates` | one row per vehicle class: three rates per kilometre (local, national, international) and two minimums (lei, euro) |
| `price_settings` | one row: the not-running and Expres surcharges, the straight-line-to-road factor, the width of the shown range, the month the rates are for, and `is_published` |

## The rules that make it safe to be wrong

**Nothing is visible until the team publishes it.** The read policies on both
tables ask `prices_are_published()`, so an unfinished table is invisible to a
visitor no matter what a page renders. Staff see it while they work on it.

**No table grant lets anyone write a rate**, staff included. Every change goes
through `set_price_rate`, `set_price_settings` or `set_prices_published` —
SECURITY DEFINER, staff-only, each writing the before/after pair to
`audit_log`. A change made after publication carries the reason
`Modificare după publicare`, because that one changed something people had
already read.

**The seeded rates are placeholders**, shaped like real rates so the page
could be built and reviewed. They are not a price list and were not copied
from anybody. `is_published` stays false until the transport partner has
validated them.

## Where the arithmetic lives

`src/lib/pricing.ts` — no SQL, no React, unit-tested. Straight-line distance,
a road factor, the class rate, the minimum as a floor, then the surcharges,
then a range rounded to the nearest ten. Everything the page, the calculator
and (later) the request form show goes through it, so the three cannot
disagree.

The output is always a range. A single number reads as a quote, and the
carrier is the one quoting.

## Not to be confused with

`v_corridor_prices` and `price_benchmarks`, which are medians of transports
that actually closed. That is what happened; this is what we think. Neither
was touched by this feature.
