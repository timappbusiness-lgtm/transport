# Prompt 04 — The requests board (cereri de transport auto)

**Prerequisites:** prompts 01–03; migrations `..._listings.sql`,
`..._vehicle_type_additions.sql`, `..._vehicle_cargo.sql` applied.

The cargo is a **vehicle**, not a pallet. A listing is one row in
`cargo_listings` plus one row in `cargo_vehicle_details`. See
`docs/07-competitor-analysis.md` §9 for why the model is shaped this way.

---

## Lovable prompt

```
Add the vehicle transport requests board. Create only the files listed.
Do NOT modify existing pages except the sidebar entry at the end.

CONTEXT
A request = one cargo_listings row (route, dates, price, status) + one
cargo_vehicle_details row (what the vehicle is and what condition it is in).
The two are always written together in one flow - the database refuses to
publish a listing whose details row is missing.

is_running is the most important field on the whole form. A car that rolls
onto a platform and one that needs a winch are different jobs at different
prices, and needs_winch is computed by the database from is_running,
wheels_turn and steering_works - never set it from the client, just read it.

CREATE

1. src/hooks/useCargoListings.ts
   Paginated query joining cargo_listings to cargo_vehicle_details with filters:
   { board, category, loadingCountry, loadingCounty, unloadingCountry,
     unloadingCounty, dateFrom, dateTo, serviceType, needsWinch, maxWeightKg,
     search }
   Sort: is_promoted desc, published_at desc. Page size 20.
   Mutations: createRequest, updateRequest, setStatus.
   createRequest inserts, in order: cargo_listings (status draft) ->
   cargo_vehicle_details -> listing_contacts -> then flips status to active.
   If any step fails, delete the listing and surface the error - a half
   written listing is invisible and unreachable.

2. src/lib/constants.ts  (extend, do not rewrite)
   Add CARGO_CATEGORY_LABELS with Romanian labels:
   autoturism "Autoturism", autoutilitara "Autoutilitară",
   motocicleta "Motocicletă", utilaj_agricol "Utilaj agricol",
   microbuz "Microbuz", utilaj_constructii "Utilaj de construcții",
   rulota "Rulotă", cap_tractor "Cap tractor", camion "Camion",
   remorca "Remorcă", utilaj_manipulare "Utilaj de manipulare",
   container "Container", ambarcatiune "Ambarcațiune", altele "Altele"
   Add SERVICE_TYPE_LABELS: pe_sens "Pe sens", expres "Expres",
   tractare "Tractare"
   Add EU_COUNTRIES for the corridor selects: RO, DE, IT, NL, ES, FR, BE, AT,
   HU, PL, CZ, SK, GB, CH, SE, DK, PT, GR.

3. src/components/listings/RequestFilters.tsx
   Country + county + city for pickup and drop-off, date range, category
   multi-select, service type segmented control, and a "necesită troliu"
   switch. Filter state in the URL query string so a filtered board can be
   shared. Active filters render as removable chips.

4. src/components/listings/RequestCard.tsx
   Dense, readable at 1366x768:
   - Line 1: category + "Intern"/"Extern" eyebrow, and time ago
   - Line 2: route as "Teltow (DE) → București (RO)" with country codes in
     a small mono badge
   - Line 3: distance badge in mono, then make + model + year
   - Badges: green "rulează" when is_running, amber "necesită troliu" when
     needs_winch is true, and "avariat" when is_damaged
   - Right: price via formatMoney, or "Negociabil"
   - Footer: poster name or company + verification badge
   - Buttons: "Vezi contact" (wired in prompt 09) and "Trimite ofertă"
   The winch badge must be visible on the card, not buried in the detail
   view - it is what a carrier prices on.

5. src/components/listings/RequestForm.tsx
   Sections:
   - "Vehiculul": category, make, model, year, weight_kg, VIN (optional),
     plate_number (optional), colour
   - "Starea vehiculului": four switches - is_running "Pornește și rulează",
     wheels_turn "Roțile se învârt", steering_works "Direcția funcționează",
     brakes_work "Frânele funcționează" - plus has_keys "Am cheile".
     When any of the first three is off, show a live inline note:
     "Va fi nevoie de troliu. Prețul crește cu 15-30%." Do not write
     needs_winch - it is a generated column.
   - "Avarii": is_damaged switch, damage_notes textarea, photo upload to the
     listing-photos bucket writing into cargo_listings.photo_paths
   - "Ridicare" / "Livrare": country, county, city, postcode, date window
   - "Serviciu": service_type radio cards with the price implication spelled
     out - pe sens "mai ieftin, pleacă în 2-6 zile", expres "pleacă în 24h,
     platformă dedicată", tractare "vehicul care nu rulează"
   - "Contact": name, phone, email
   Zod + react-hook-form, Romanian messages.
   On a 42501 error show the database message directly - it already explains
   suspension or plan limits in Romanian.

6. src/pages/RequestsBoard.tsx at route /cereri
   Filters + virtualised card list + pagination. Empty state:
   "Nu am găsit cereri după aceste filtre." with a clear-filters button.
   Loading: 5 skeleton cards, not a spinner.

7. src/pages/MyListings.tsx at route /anunturile-mele
   Tabs: "Cereri", "Platforme" (filled by prompt 05), "Ciorne".
   Rows show status, views_count, offers_count, edit / deactivate / republish.

MODIFY

8. src/components/layout/AppShell.tsx
   Add "Cereri" -> /cereri and "Anunțurile mele" -> /anunturile-mele.
   Do NOT change anything else in this file.
```

---

## Verification checklist

- [ ] Publishing creates three rows: `cargo_listings`, `cargo_vehicle_details`,
      `listing_contacts` — check all three in SQL
- [ ] A listing with no details row cannot publish (the database raises 23502)
- [ ] Turning off `is_running` makes `needs_winch` true in the database without
      the client sending it
- [ ] The winch badge shows on the card, not only in the detail view
- [ ] Country filters work for the DE/IT/NL/ES → RO corridors, which is most
      of the real traffic
- [ ] Filters survive a reload via the URL
- [ ] A suspended company gets the Romanian database message, not a generic one
- [ ] Another company sees the listing but cannot read `listing_contacts`
- [ ] Card is readable at 1366×768 without horizontal scroll

**Common failure:** Lovable tries to write `needs_winch`. It is
`GENERATED ALWAYS AS ... STORED` and the insert will fail. Reply: *"needs_winch
is a generated column. Remove it from the insert payload in
useCargoListings.ts and only read it."*
