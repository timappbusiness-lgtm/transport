# Roadmap

Three phases. Phase 1 is a product someone would pay for; phases 2 and 3 are
what turns it into a business. Estimates assume our team on Lovable +
Supabase and shift once design is fixed.

## Phase 1 — MVP (4–6 weeks)

The smallest thing that is genuinely better than a Facebook group.

**Accounts and compliance**
- Signup for companies and individuals, phone OTP for individuals
- CUI lookup via ANAF, autofill + inactive-company flag
- Document upload with AI extraction, admin review queue
- Automatic suspension and reactivation, reminder e-mails

**The three boards**
- Post and browse loads (`curse`)
- Post and browse trucks on `tur` and on `retur`
- Individuals post return-trip requests
- Filters: route, dates, vehicle type, weight, radius
- Contact reveal gated by plan and compliance

**Admin**
- Document review queue with the extracted fields pre-filled
- Company list with compliance status
- Manual suspend / reactivate

**Deliberately not in phase 1:** in-platform messaging, ratings, online
payments, mobile app. Phone and e-mail carry the first hundred customers.

**Exit criteria:** 20 verified carriers and 5 forwarders using it weekly
without us in the loop.

## Phase 2 — Transactional (3–4 weeks)

Once people are on the platform, keep the deal on the platform.

- Price offers on listings, accept / reject / counter
- In-platform messaging with realtime
- `transports`: an accepted offer becomes a tracked job
- Mutual ratings after delivery, company profile pages
- Reports and a fraud review flow
- Subscriptions with real payments (Netopia or Stripe) and self-serve upgrade
- Full admin panel: reports, subscriptions, revenue, activity

**Exit criteria:** more than half of accepted deals start from an in-platform
offer rather than a phone call.

## Phase 3 — Growth (4+ weeks)

- WhatsApp alerts on saved searches (the highest-value feature for carriers —
  a return trip is worth money for about two hours)
- Promoted listings, credits included per plan
- Mobile app (drivers do not use a laptop in the cab)
- Public company profiles for SEO
- Optional: insurer / vehicle-data integration through a commercial partner
  (see `docs/03-document-compliance.md`)
- Optional: e-CMR, GPS integrations, TMS import

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

**Do not let the vehicle-data integration slip into phase 1.** It depends on
a commercial agreement outside our control, and the feature the client asked
for does not need it.
