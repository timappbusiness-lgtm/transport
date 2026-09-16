# Prompt 04 — The loads board (curse)

**Prerequisites:** prompts 01–03; migration `..._listings.sql` applied.

---

## Lovable prompt

```
Add the loads board ("Curse"). Create only the files listed. Do NOT modify
existing pages except the sidebar entry at the end.

CREATE

1. src/hooks/useCargoListings.ts
   Paginated query over cargo_listings with filters:
   { board, loadingCounty, unloadingCounty, dateFrom, dateTo, vehicleTypes,
     minWeight, maxWeight, needsAdr, needsFrigo, search }
   Default sort: is_promoted desc, published_at desc. Page size 20.
   Mutations: createListing, updateListing, setStatus(id, status).
   createListing inserts the cargo_listings row and then the matching
   listing_contacts row in the same flow - a listing without contacts is
   unreachable. If the second insert fails, delete the listing and surface
   the error.

2. src/components/listings/CargoFilters.tsx
   Filter bar, collapsible on mobile:
   - "De la" county select + city input
   - "Până la" county select + city input
   - date range picker (Romanian labels, dd.MM.yyyy)
   - multi-select for vehicle types
   - weight range
   - switches: ADR, Frigorific
   Active filters render as removable chips above the list. Keep filter state
   in the URL query string so a filtered board can be shared or bookmarked.

3. src/components/listings/CargoListingCard.tsx
   One row of the board, dense, readable at 1366x768:
   - Line 1: route "Cluj-Napoca (CJ) → Timișoara (TM)", promoted badge if set
   - Line 2: loading window as "Încărcare 18.09 - 20.09", cargo type
   - Line 3: weight, ldm, required vehicle types as small badges
   - Right: price via formatMoney, or "Negociabil"; payment term as
     "Plata la {n} zile" - dispatchers argue about this more than the price,
     so it is visible on the card, not hidden in the detail view
   - Footer: company name + verification badge, posted "acum 2 ore"
   - Buttons: "Vezi contact" and "Trimite ofertă"
   "Vezi contact" is a placeholder here; prompt 09 wires it to reveal_contact().

4. src/components/listings/CargoListingForm.tsx
   Dialog/sheet form, grouped sections:
   - "Marfă": title, cargo_type, weight_kg, volume_m3, ldm, pallets, dimensions
   - "Încărcare": country, county, city, postcode, loading_from, loading_to
   - "Descărcare": same fields
   - "Cerințe": required_vehicle_types (multi), needs_adr, needs_frigo,
     needs_tail_lift, temperature range (shown only when needs_frigo is on)
   - "Preț": price_type, price_amount, currency, payment_term_days
   - "Contact": contact_name, contact_phone, contact_email
   Zod validation, Romanian messages. Required: title, loading city,
   unloading city, loading_from, weight.
   Two submit buttons: "Salvează ca ciornă" (status draft) and
   "Publică" (status active).
   If publishing returns a Postgres error with code 42501, show the error
   message from the database directly - it already explains in Romanian why
   (suspended account, or plan limit reached) and links to the right page.

5. src/pages/CargoBoard.tsx at route /curse
   CargoFilters + a virtualised list of CargoListingCard + pagination.
   Empty state: "Nu am găsit curse după aceste filtre." with a "Șterge filtrele" button.
   Loading state: 5 skeleton cards, not a spinner.

6. src/pages/MyListings.tsx at route /anunturile-mele
   Tabs: "Curse", "Mașini" (empty for now, filled by prompt 05), "Ciorne".
   Each row shows status, views_count, offers_count, and actions:
   edit, deactivate, republish.

MODIFY

7. src/components/layout/AppShell.tsx
   Add "Curse" -> /curse and "Anunțurile mele" -> /anunturile-mele to the sidebar.
   Do NOT change anything else in this file.
```

---

## Verification checklist

- [ ] A verified company publishes a load; it appears on the board
- [ ] A `draft` company gets the database error message when publishing, in
      Romanian, and is not shown a generic "something went wrong"
- [ ] A suspended company cannot publish
- [ ] Publishing an 11th load on the `free` plan (limit 3) shows the quota message
- [ ] Filters combine correctly; the URL updates and survives a reload
- [ ] `listing_contacts` row is created alongside the listing — check in SQL
- [ ] Another company sees the listing but **cannot** read `listing_contacts`:
      `select * from listing_contacts` as that user returns nothing
- [ ] Promoted listings sort first
- [ ] The card is readable at 1366x768 without horizontal scroll

**Common failure:** Lovable inserts `contact_phone` as a column on
`cargo_listings`. It does not exist there — contacts live in
`listing_contacts` so RLS can gate them separately. Reply: *"contact_phone
belongs in the listing_contacts table, not on cargo_listings. Fix only
useCargoListings.ts."*
