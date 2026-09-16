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
