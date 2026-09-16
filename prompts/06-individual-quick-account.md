# Prompt 06 — Fast account for individuals

**Prerequisites:** prompts 01–05.

The client's requirement: *„Sectiunea pentru masini retur sa posteze
persoanele fizice care au nevoie doar cu un cont rapid."*

The whole point is that it is fast. Every field you add costs conversions on
the side of the market that makes the carrier subscription worth buying.
Target: **under 60 seconds from landing to published request.**

---

## Lovable prompt

```
Add a fast-signup flow for private individuals who need transport on a return
trip. Create only the files listed. Do NOT modify the company signup flow, the
company onboarding wizard, or any existing board page except where noted.

CONTEXT
An individual has profiles.account_type = "individual", never belongs to a
company, and may only post on the return board (cargo_listings with
board = "retur" and company_id null). The database enforces this - do not
duplicate the rule in the UI beyond friendly messaging.

CREATE

1. src/hooks/usePhoneVerification.ts
   Supabase phone OTP:
   - sendOtp(phone): supabase.auth.signInWithOtp({ phone })
   - verifyOtp(phone, token): supabase.auth.verifyOtp({ phone, token, type: "sms" })
   - after a successful verification, update profiles.phone_verified = true
   Normalise Romanian numbers to E.164: "0722 123 456" -> "+40722123456".
   Accept input with or without spaces, dots or the +40 prefix.
   Rate-limit resend to one every 60 seconds with a visible countdown.

2. src/components/auth/PhoneOtpDialog.tsx
   Two steps: phone input, then a 6-digit code input (shadcn InputOTP).
   Romanian copy: "Îți trimitem un cod prin SMS ca să confirmăm numărul."
   Errors: wrong code -> "Codul nu este corect."; expired -> "Codul a expirat,
   cere unul nou."

3. src/components/listings/QuickRequestForm.tsx
   The whole point is speed. Exactly these fields, one screen, no wizard:
   - "Ce transporți?"   -> title            (required)
   - "De unde?"         -> loading city + county select (required)
   - "Până unde?"       -> unloading city + county select (required)
   - "Când?"            -> loading_from date (required), loading_to optional
   - "Cât cântărește?"  -> weight_kg, with quick-pick chips:
                           "sub 100 kg", "100-500 kg", "500-1000 kg", "peste 1 tonă"
   - "Detalii"          -> description (optional, 2 rows)
   - "Numele tău"       -> full_name      (required)
   - "Telefon"          -> phone          (required)
   NOTHING ELSE. No volume, no ldm, no pallets, no ADR, no payment terms -
   a private person moving a sofa does not know those and will abandon.

   Flow:
   - not logged in -> on submit, create the account with phone OTP
     (account_type "individual"), then publish
   - logged in but phone_verified false -> open PhoneOtpDialog, then publish
   - logged in and verified -> publish immediately
   Insert with board = "retur", company_id = null, posted_by = auth user,
   status = "active", plus the matching listing_contacts row from the name
   and phone fields.

4. src/pages/QuickRequest.tsx at route /cerere-transport
   PUBLIC route - no auth guard. This page is the funnel entry; requiring
   login before someone sees the form loses most of them.
   Above the form, three short reassurance lines:
   "Gratuit, fără abonament" / "Transportatorii verificați te contactează"
   / "Durează mai puțin de un minut"
   Below the form, a preview of 3 active return trucks so the person can see
   there is real supply.

5. src/components/layout/IndividualShell.tsx
   A stripped-down shell for individuals. Nav: "Mașini pe retur",
   "Cererile mele", "Cont". No Flota, no Documente, no Curse - those pages
   are meaningless without a company and their presence just confuses.

6. src/pages/MyRequests.tsx at route /cererile-mele
   The individual's own cargo_listings: status, views, number of offers
   received, and buttons to close or republish.

MODIFY

7. src/components/layout/AppShell.tsx
   When profiles.account_type is "individual", render IndividualShell instead
   of the company sidebar. One conditional at the top of the component.
   Do NOT change the company navigation.

8. src/pages/Index.tsx
   Add a secondary call to action below the existing one:
   "Ai nevoie de transport? Postează o cerere gratuit" -> /cerere-transport.
   Do NOT change the existing hero or the company signup CTA.
```

---

## Verification checklist

- [ ] `/cerere-transport` opens without logging in
- [ ] A phone number as `0722 123 456` normalises to `+40722123456`
- [ ] Wrong OTP shows the Romanian message and lets you retry
- [ ] Resend is blocked for 60 seconds with a visible countdown
- [ ] After verification the request publishes with `board = 'retur'` and
      `company_id IS NULL`
- [ ] Publishing without a verified phone raises the trigger error and the UI
      opens the OTP dialog rather than showing a raw Postgres message
- [ ] An individual cannot post on `/curse` — the database constraint
      `cargo_listings_owner_ck` rejects it
- [ ] An individual sees IndividualShell, not the company sidebar
- [ ] Timed end to end on a phone: **under 60 seconds**

**Cost note.** SMS OTP is not free — roughly 0.05–0.12 RON per message through
Twilio, and this is the one flow a bot would hammer. Before launch: enable
Supabase Auth rate limiting, cap OTPs per phone number per day, and add a
honeypot field to the public form. An unprotected public OTP endpoint is a
direct line from someone else's script to our Twilio bill.
