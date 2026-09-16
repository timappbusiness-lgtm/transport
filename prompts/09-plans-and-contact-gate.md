# Prompt 09 — Plans and the contact gate

**Prerequisites:** prompts 01–05; migration `..._billing_access.sql` applied.

This is where the product starts earning. The gate is already enforced in the
database by `reveal_contact()` — the frontend's job is to make hitting the
limit feel like an obvious upgrade rather than a wall.

---

## Lovable prompt

```
Add plans, quotas and the gated contact reveal. Create only the files listed.
Do NOT change the listing card layouts beyond the button wiring noted below.

CREATE

1. src/hooks/usePlan.ts
   Reads the current plan via the current_plan RPC plus the plans table, and
   counts this month's reveals from contact_reveals.
   Returns { plan, revealsUsed, revealsLimit, revealsLeft, isUnlimited }.

2. src/hooks/useRevealContact.ts
   Mutation calling the reveal_contact RPC with either cargo_listing_id or
   truck_listing_id. On success, cache the contact per listing id so reopening
   it does not call again. On a 42501 error, return the database message - it
   already distinguishes a suspended account from an exhausted quota, in
   Romanian, and the UI should show exactly that text.

3. src/components/listings/ContactRevealButton.tsx
   Three states:
   - not revealed -> "Vezi contact" plus, when the plan is limited,
     "({n} rămase luna aceasta)"
   - revealed     -> phone and e-mail as click-to-call and click-to-mail links,
     plus a "Copiază" button
   - blocked      -> disabled button with the database's reason and a CTA:
     quota exhausted -> "Vezi planurile" -> /abonament
     suspended       -> "Actualizează documentele" -> /documente
   When the remaining quota drops to 1, show an inline nudge:
   "Ultimul contact gratuit din luna aceasta."

4. src/components/billing/PlanCard.tsx
   One plan: name, price as "149 lei/lună", the feature list built from the
   plan row (listings, contacts, saved searches, WhatsApp alerts, promoted
   credits), and a CTA. The current plan renders as "Planul tău actual",
   disabled.

5. src/pages/Subscription.tsx at route /abonament
   The four public plans side by side, the individual plan hidden. Above them,
   current usage: "Ai folosit 3 din 3 contacte luna aceasta."
   Below, an FAQ block: what happens at the limit, what happens on suspension,
   how to cancel.
   MVP has no payment integration: the CTA opens a contact form that creates a
   notification_outbox row for the sales team. Leave a clear
   // TODO: payment provider integration (Netopia / Stripe) - phase 2
   comment where the checkout call will go.

6. src/components/billing/QuotaIndicator.tsx
   Small pill for the top bar: "2/3 contacte" - amber at one left, red at zero.
   Hidden on unlimited plans.

MODIFY

7. src/components/listings/CargoListingCard.tsx and TruckListingCard.tsx
   Replace the placeholder "Vezi contact" button with <ContactRevealButton />.
   Do NOT change anything else in these files.

8. src/components/layout/AppShell.tsx
   Add QuotaIndicator to the top bar and "Abonament" -> /abonament to the
   sidebar. Do NOT change anything else.
```

---

## Verification checklist

- [ ] On `free`, the fourth distinct reveal in a month is blocked with the
      quota message
- [ ] Reopening a listing already revealed does **not** consume quota — check
      `contact_reveals` row count stays the same
- [ ] A suspended company gets the suspension message, not the quota one
- [ ] Every reveal writes a `contact_reveals` row with user, company and listing
- [ ] Querying `listing_contacts` directly as a non-owner returns nothing —
      this is the real test; run it in the SQL editor as that user
- [ ] The quota pill matches the actual count
- [ ] Quota resets on the 1st (simulate by backdating a `contact_reveals` row)
- [ ] The individual plan does not appear on `/abonament`

**Security note:** the only path to contact data is `reveal_contact()`. If you
ever find yourself adding a `listing_contacts` select to a hook to "make the
UI simpler", stop — that bypasses the quota, the compliance check and the GDPR
log in one move.
