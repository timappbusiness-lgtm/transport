# Competitor analysis — bursatractari.ro

Based on the live site, September 2026. Numbers are theirs, read off their own
counters.

## 1. What they actually are

**Not a freight exchange.** A *vehicle relocation marketplace* — the cargo is
a vehicle, not a pallet.

Their own category counters:

| Category | Listings | Share |
|---|---|---|
| Autoturisme | 21,148 | 83% |
| Autoutilitare | 1,746 | 7% |
| Motociclete | 479 | 1.9% |
| Utilaje agricole | 466 | 1.8% |
| Microbuze | 426 | 1.7% |
| Utilaje de construcții | 372 | 1.5% |
| Rulote | 265 | 1% |
| Capete tractor | 207 | |
| Camioane | 179 | |
| Remorci | 169 | |
| Utilaje de manipulare | 63 | |
| Containere | 37 | |
| Alte cereri | 20 | |
| **Total** | **~25,577** | |

**Cars are 83% of the market. Everything else is a long tail.** Any product
decision that trades car-transport UX for utility-transport UX is a bad trade.

This matters for our build: the schema we wrote models palletized freight
(ldm, pallets, ADR, frigorific). That is a different market — Trans.eu and
Timocom territory. See §9.

## 2. The market insight underneath it

Romanians buy used cars in Western Europe and need them brought home. That is
the whole business.

Their live listings at the moment of capture:

| Route | Distance | Note |
|---|---|---|
| Teltow 🇩🇪 → București | 1,706 km | "Am nevoie de transport pentru o mașina…" |
| Kisigmánd 🇭🇺 → Zalău | 449 km | "Duba s-a stricat directia" |
| București → Milano 🇮🇹 | 1,626 km | "Range rover 2017" |
| Kisigmánd 🇭🇺 → Pfullingen 🇩🇪 | 781 km | "Duba defecta" |
| Oradea → Suceava | 452 km | intern |
| Bréscia 🇮🇹 → Constanța | 1,785 km | "Audi a8" |

Five of six are international; four are inbound to Romania. Their published
international tariffs confirm the corridors they care about:

| Corridor | From |
|---|---|
| Germania → România | 650 € |
| Italia → România | 700 € |
| Olanda → România | 700 € |
| Spania → România | 750 € |

Second market, visible in the listing text: **broken-down vehicles**
("s-a stricat directia", "Duba defecta"). That is the *tractări* half of the
name — recovery and roadside, where the vehicle does not roll.

## 3. Their funnel: demand-first, zero friction

> „Adaugă Cerere Transport **GRATUIT** și **FĂRĂ CONT**"

No account. No e-mail. No phone verification before the form. It is the
single most important decision on the whole site.

The reasoning is correct and worth internalising: the person with a car in
Germany is the **scarce side**. They transact once every three years, they
have no loyalty, and they will bounce at a signup wall straight back to a
Facebook group. The carrier is the **repeat side** — and the one that pays
(`Abonamente` sits in their top nav).

We proposed a 60-second phone-OTP account for individuals. **They beat us.**
Match it: post first, verify the phone only when the first offer arrives and
there is something to lose. See §10.

## 4. Their trust play — and the hole in it

> „Toate firmele înscrise pe BursaTractari sunt verificate manual de către o
> echipă specializată, transportul este în siguranță, ai garanția că firma cu
> care colaborezi este în legalitate."

Strong copy. But it is a **claim, not a mechanism**. Nowhere on the site can
you see:

- which documents a given carrier holds
- when they were checked
- when they expire
- what happens when they lapse

"Verificat manual" is a one-time event stated in the past tense. A licence
checked in March 2025 says nothing about an RCA that lapsed in August.

**This is our wedge, and it is the one thing we already built.** Our
compliance engine turns their marketing sentence into a live, dated,
self-healing mechanism: documents with expiry dates, nightly sweeps,
automatic suspension, automatic reactivation. Their claim is a promise; ours
is a state you can query.

The positioning follows directly:

> Ei: „2.500 de firme verificate."
> Noi: **„Vezi documentele valabile ale transportatorului, în ziua în care îl suni."**

## 5. Price transparency is their strongest asset

Two tables, both public, both above the fold or near it:

**Per-km by weight class** — Motocicletă ~300 kg: 3,7 lei/km inter-city,
2,3 lei/km extra-city, 0,3 €/km international. Hatchback ~1200 kg: 5,1 /
2,8 / 0,57.

**Per-corridor seasonal** — "Tarife Primăvară 2026", the four corridors above.

This does three jobs at once:

1. **SEO.** "cât costă transport mașină din Germania" is the query that owns
   this market. These tables are the answer page.
2. **Lead qualification.** The person arrives already knowing it is ~650 €,
   not ~150 €. Carriers stop wasting time on unrealistic requests.
3. **Price anchoring.** The number is set before any carrier bids.

**We must match this or we lose the search traffic.** And we can beat it: they
publish *static seasonal estimates*. We can publish **live medians computed
from actually accepted offers**, per corridor, refreshed weekly, with the
sample size shown. That is better content, it is defensible, and it compounds
— every closed deal makes the page more accurate. Their table cannot catch up
because they do not appear to capture accepted prices at all.

## 6. „Preț pe sens" vs „Expres" — the mechanic to steal and improve

> „un preț de transport pe sens este mult mai mic decât unul obișnuit deoarece
> transportatorul leagă mai multe curse într-un singur traseu"

A car platform carries 7–9 vehicles. **Filling it is the carrier's entire
economics.** Hence two products:

- **Pe sens** (consolidated): you wait until the platform fills. Cheap.
- **Expres** (dedicated): it leaves now. Expensive.

**This resolves the client's brief.** „Mașini pe tur" and „mașini pe retur"
are not generic trucks — they are **car platforms**, going out loaded and
coming back with empty slots. The empty return leg is exactly the capacity
that makes „pe sens" cheap.

Their site sells the concept but does not appear to expose it. We can:

- publish a **departure** (platform, route, date) with **N/8 slots filled**
- let a request **attach to a specific departure** rather than float in a pool
- show the individual a live "mai sunt 3 locuri pe platforma care pleacă marți
  din München" — which is both a better price and a deadline

That is a materially better product, not a reskin.

## 7. Liquidity theatre — how they look alive

- **336,009,580 Km** total offered — large, round, essentially meaningless,
  extremely effective
- "573 noi, dintre care **86 adăugate în ultimele 2 zile**"
- "**acum 2 min**" timestamps on every card
- Per-category counters (§1)
- A live European map dense with pins
- "86 Noi" badge in the nav

Every one of these says *this thing is alive*. For a marketplace that is the
hardest property to fake and the most important to have on day one. Plan the
launch numbers before the design, not after — see `docs/04-roadmap.md` on the
cold-start problem.

## 8. Where we win

| Their weakness | Our play | Already built? |
|---|---|---|
| "Verificat manual" is an unbacked claim | Live document status, dated, auto-suspending | ✅ |
| Static seasonal price tables | Live medians from accepted offers per corridor | ❌ new |
| Consolidation sold but not exposed | Departures with N/8 slots, attach to one | ❌ new |
| No visible carrier reputation | Ratings tied to completed transports only | ✅ |
| „Nu rulează / necesită troliu" not visible as a field | First-class — it is the #1 price driver | ❌ new |
| Nothing for the carrier's empty return leg | The retur board the client asked for | ✅ |
| Dense but flat, Bootstrap-era design | Premium, motion-led | ❌ this task |

## 9. What this means for the schema we already wrote

`cargo_listings` currently models palletized freight. For vehicle transport it
is wrong in both directions:

**Fields that do not belong:** `ldm`, `pallets`, `needs_adr`, `needs_frigo`,
`temp_min_c`, `temp_max_c`, `needs_tail_lift`.

**Fields that are missing and matter more than anything on that list:**

| Field | Why it matters |
|---|---|
| `make`, `model`, `year` | The listing title on every competitor card |
| `vehicle_category` | Their 13 categories (§1), not freight body types |
| `is_running` | **The single biggest price driver.** A rolling car loads in 3 minutes; a seized one needs a winch and two people |
| `has_keys`, `wheels_turn`, `steering_works`, `brakes_work` | What a recovery operator must know before quoting |
| `needs_winch` | Derived, but must be explicit on the card |
| `is_damaged`, `damage_notes`, photos | Insurance and dispute evidence |
| `service_type` (pe sens / expres / tractare) | The product split from §6 |
| `vin` | Optional, but it is how a carrier checks the car is not stolen |

`truck_listings` needs `platform_capacity_slots` and `slots_free` to support
§6, and `vehicle_type` needs the platform taxonomy (platformă 8 auto,
platformă 2 auto, autotractor + trailer, troliu/tractare).

This is a contained change — one new migration adapting `cargo_listings`, not
a rewrite. Everything that makes the product defensible (identity, companies,
documents, the compliance engine, RLS, plans, the contact gate) is untouched.

## 10. Decisions this analysis forces

1. **Drop the account requirement for posting.** Phone OTP moves to "when the
   first offer arrives", not "before you may post". We are currently stricter
   than the incumbent on the side of the market we cannot afford to lose.
2. **Ship the price pages in phase 1, not phase 3.** They are the SEO entry
   point for the entire market. Static estimates at launch, live medians as
   soon as there are 30 closed deals on a corridor.
3. **Make `is_running` a first-class field**, on the form and on the card.
4. **Model departures with slots**, not just "trucks available".
5. **Lead with the compliance mechanism**, since it is the only thing they
   cannot copy in a sprint — it needs a review team and a data model, not a
   paragraph of copy.
