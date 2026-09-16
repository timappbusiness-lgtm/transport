# Prompt 11 — Price pages (the SEO asset)

**Prerequisites:** prompts 01–05; migration `..._vehicle_cargo.sql` applied.

Phase 1, not phase 3. „cât costă transport mașină din Germania" is the query
that owns this market, and the incumbent's answer page is a static seasonal
table. Ours is a live median from closed deals — better content, and a page
they cannot match without capturing accepted prices. See
`docs/07-competitor-analysis.md` §5.

---

## Lovable prompt

```
Add the public price pages. Create only the files listed. These pages are
PUBLIC - no auth guard - because they are the entry point from search.

CREATE

1. src/hooks/useCorridorPrices.ts
   Reads two sources and merges them per corridor:
   - v_corridor_prices: the live median from transports closed in the last
     90 days, only where sample_size >= 5
   - price_benchmarks: the editorial fallback
   For each corridor return { price, lo, hi, days, source: "live" | "estimat",
   sampleSize }. Live wins when present.

2. src/components/prices/CorridorTable.tsx
   Columns: Coridor, Preț tipic, Interval, Durată, Sursă.
   The Sursă column is the point of the page - render "LIVE · 142" in green
   with a tooltip "Mediană din 142 transporturi încheiate în ultimele 90 de
   zile", or "ESTIMAT" in grey with "Sub pragul de 5 transporturi încheiate -
   afișăm tariful orientativ". Never blur the difference.
   Prices in mono with tabular-nums. A segmented control switches between
   service_type "pe_sens" and "expres".
   Wrap the table in an overflow-x: auto container.

3. src/pages/Prices.tsx at route /preturi
   CorridorTable, plus a per-km table by weight class for internal transport,
   plus an FAQ block answering, in Romanian:
   - De ce diferă prețul pe sens de expres?
   - Ce înseamnă că platforma se umple?
   - Cât durează de la Germania la România?
   - Ce se întâmplă dacă mașina nu pornește?
   Each answer 2-3 sentences, written to be the answer someone googles.

4. src/pages/CorridorPage.tsx at route /transport-auto/:from/:to
   One page per corridor, e.g. /transport-auto/germania/romania. It gets the
   organic traffic, so:
   - H1 "Transport auto Germania - România"
   - the live price for that corridor, large
   - typical duration, and the cities most often requested on it
   - the 6 most recent active requests on that corridor
   - a CTA to /cerere-transport
   - a short factual section on what the price depends on: distance, whether
     the vehicle runs, season, fuel
   Generate a route for each published corridor in price_benchmarks.
   Set document.title and a meta description per corridor.

MODIFY

5. src/components/layout/AppShell.tsx and the public header
   Add "Prețuri" -> /preturi. Do NOT change anything else.
```

---

## Verification checklist

- [ ] `/preturi` opens without logging in
- [ ] A corridor with ≥5 closed deals shows LIVE with the real sample size
- [ ] A corridor with fewer shows ESTIMAT and the benchmark price
- [ ] Prices render as `1.250 €` with `ro-RO` separators and tabular figures
- [ ] The table scrolls inside its container; the page never scrolls sideways
- [ ] `/transport-auto/germania/romania` renders with its own title and
      description
- [ ] Switching pe sens / expres changes every row

**Why the ≥5 threshold matters:** a median computed from two transports is a
number that misleads someone about to spend 700 €. The database enforces it in
`v_corridor_prices`; do not work around it in the client.
