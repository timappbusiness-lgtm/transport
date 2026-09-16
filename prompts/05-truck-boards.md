# Prompt 05 — Trucks on tur and on retur

**Prerequisites:** prompts 01–04; migrations `..._vehicle_type_additions.sql`
and `..._vehicle_cargo.sql` applied.

Two boards from one table (`truck_listings`, `direction` = `tur` | `retur`).
Build them as one component with a direction prop — duplicating the page is
how they drift apart three months later.

A platform carries 7–9 cars and filling it is the carrier's entire economics,
so a departure is shown with its **free slots**, read from the `v_departures`
view. That is what makes "pe sens" cheap and it is the thing the competitor
sells but does not show.

---

## Lovable prompt

```
Add the truck boards: "Mașini pe tur" and "Mașini pe retur". Both read the same
truck_listings table, differing by the direction column. Build ONE shared set
of components parameterised by direction - do not create two copies.

CREATE

1. src/hooks/useTruckListings.ts
   Paginated query over truck_listings with filters:
   { direction, fromCounty, toCounty, availableFrom, availableTo, vehicleTypes,
     minCapacityKg, acceptsPartialLoads }
   Join vehicles to get plate_number, vehicle_type, capacity and is_compliant.
   Sort: is_promoted desc, published_at desc.
   Mutations: createTruckListing, updateTruckListing, setStatus.
   createTruckListing also inserts the listing_contacts row, same pattern as
   cargo listings.

2. src/components/listings/TruckFilters.tsx
   Same shape as CargoFilters: from/to county and city, date range, vehicle
   type multi-select, minimum free capacity, "acceptă marfă parțială" switch.
   Filter state in the URL query string.
   When direction is "retur", add one extra filter: "Acceptă ocol de cel puțin
   X km", filtering on max_detour_km.

3. src/components/listings/TruckListingCard.tsx
   - Line 1: route "Hamburg (DE) → Cluj-Napoca (CJ)"
   - Line 2: "Disponibil 18.09 - 21.09", vehicle type badge
   - Line 3: slots as "5/8 locuri ocupate" with a compact 8-cell deck where
     taken slots are filled and free ones are dashed in the accent colour.
     Read slots_free and slots_taken from the v_departures view - never
     compute them client-side, they are derived from departure_bookings.
   - When direction is "retur" and waypoints is not empty, render them as small
     chips: "Trece prin: Budapesta, Arad, Deva" - on a return leg this is the
     single most useful piece of information on the card
   - Right: indicative price or "Negociabil"
   - Footer: company name, verification badge, rating stars when rating_count > 0
   - Buttons: "Vezi contact", "Trimite ofertă"

4. src/components/listings/TruckListingForm.tsx
   - "Platforma": vehicle_id select, listing ONLY vehicles where is_compliant
     is true, plus platform_slots_total (default 8 for platforma_auto, 2 for
     platforma_tractari) and a service_types multi-select. Non-compliant vehicles appear disabled with the reason
     "Documente expirate - actualizează-le în secțiunea Flota mea" and a link
     to /flota. Do not hide them; a carrier must understand why the truck is
     missing from the list.
   - "Traseu": from country/county/city, to country/county/city
   - "Oprire pe traseu" (shown only for direction retur): a tag input writing
     into the waypoints jsonb array, plus max_detour_km with a default of 50
   - "Disponibilitate": available_from, available_to
   - "Capacitate liberă": free_capacity_kg, free_ldm, free_volume_m3,
     accepts_partial_loads
   - "Preț orientativ": price_indicative, currency
   - "Contact": contact_name, contact_phone, contact_email
   The direction is passed in as a prop, not chosen in the form - the user
   already picked a board.

5. src/pages/TruckBoard.tsx
   One component, two routes:
   - /masini-tur   renders it with direction="tur",   title "Mașini pe tur"
   - /masini-retur renders it with direction="retur", title "Mașini pe retur"
   On the retur board show an info banner above the filters:
   "Ai nevoie de transport pe o cursă de retur? Poți posta o cerere în câteva
   secunde." with a button to /cerere-transport (built in prompt 06).

MODIFY

6. src/components/layout/AppShell.tsx
   Add "Mașini pe tur" -> /masini-tur and "Mașini pe retur" -> /masini-retur.
   Do NOT change anything else.

7. src/pages/MyListings.tsx
   Fill in the "Mașini" tab with the user's truck listings, same row layout as
   the Curse tab. Do NOT change the Curse tab or the page structure.
```

---

## Verification checklist

- [ ] The same component serves both boards; there is no `TurBoard.tsx` and
      `ReturBoard.tsx` pair
- [ ] Posting a truck with a non-compliant vehicle is impossible, and the form
      says why
- [ ] Expiring a vehicle's ITP, then running `select public.run_compliance_sweep();`
      moves its listings to `suspended` and removes them from the board
- [ ] Waypoints save and render as chips
- [ ] The detour filter only appears on the retur board
- [ ] The retur banner links to the individual request page
- [ ] Switching boards resets pagination but keeps the county filters
- [ ] The slot deck matches `v_departures` — book a request against a
      departure in SQL and confirm the card drops by one free slot
- [ ] Booking more slots than the platform has raises 23514 with the Romanian
      message, and the UI shows it rather than failing silently
