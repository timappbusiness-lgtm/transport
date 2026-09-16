# Design system

`landing.html` is the reference implementation — a working page, not a mockup.
Published at the Artifact URL in the session notes; open it on a phone before
reading further, the motion is half the design.

## Direction: a motorway at night

The subject is vehicles moving 1,700 km across Europe over six days. The
visual world is the one the people in this business actually work in: night
motorways, sodium lighting, ferry decks, weighbridges, number plates.

This is a deliberate single-theme commitment — no light variant. A cinematic
dark landing page done well beats a dark page with a half-hearted light twin.
**The app itself is a different decision:** dispatchers work in it for eight
hours on a 1366×768 laptop, so the product UI gets a light surface with this
same accent and type system.

## Tokens

```css
/* ground + surfaces — petrol, not black */
--ground:      #08151A;
--ground-deep: #050E12;
--surface:     #0E212A;
--surface-2:   #142C37;
--line:        #1E3D4B;
--line-soft:   #16303C;

/* type — warm off-white, the colour of road markings */
--ink:     #F2EDE3;
--ink-mid: #A8BDC6;
--ink-dim: #6E8A96;

/* accent — sodium vapour, the colour of European motorway lighting */
--accent:      #FFA92E;
--accent-deep: #E0871A;

/* semantics — document status, kept distinct from the brand accent */
--ok:     #3ECF8E;   /* valid */
--warn:   #FFC366;   /* expiring soon */
--danger: #FF6B6B;   /* expired */
```

The neutrals carry a blue-green bias toward the ground, so they read as chosen
rather than inherited. **The accent is spent in one place** — the primary CTA
and key figures. Everything else stays quiet. Status colours are small and
always carry a text label; colour reinforces, it never carries the meaning
alone.

## Type

| Role | Face | Why |
|---|---|---|
| Display | **Archivo** 700/800 | The proportions of transport signage. Tight tracking (−.022em) at large sizes. |
| Body | **IBM Plex Sans** 400/500/600 | Technical without being cold, and its Romanian diacritics (ă â î ș ț) are properly drawn rather than composed. |
| Data | **IBM Plex Mono** 400/500 | Number plates, VINs, kilometres, expiry dates. Anything that lines up in a column gets `font-variant-numeric: tabular-nums`. |

Radius is 4px throughout — near-square, the way a document or a plate is.
Rounded-everything reads as consumer software; this is a working tool.

## The 3D, and why it is not WebGL

The hero renders a live network of the real corridors — Hamburg, Amsterdam,
Milano, Madrid, München and Berlin into București, Cluj, Timișoara, Constanța
and Iași — as a perspective-projected node-and-arc field with platforms
travelling the arcs.

It is a hand-rolled pinhole camera on canvas 2D: yaw and pitch, quadratic
Bézier arcs in 3D, depth sorting, pointer parallax. About 4KB of script and no
library at all.

Three.js would have been the obvious reach. It is the wrong one here:

- **It is a node network, not a scene.** Arcs, points and depth sorting need a
  projection, not a renderer. Three.js would be ~600KB to draw the same thing.
- **The audience is on 4G with a car stuck in Germany.** Bundle size on that
  first visit is a conversion number, not a preference.
- **A blocked CDN script fails silently.** Canvas 2D cannot.
- Cities carry **real coordinates**, so the geography is truthful — Hamburg
  sits north-west of București on screen because it does on a map.

It stops rendering when the hero scrolls out of view or the tab is hidden, and
draws a single static frame under `prefers-reduced-motion`. Rendering is capped
at `devicePixelRatio` 2, which is where the crispness on a high-density screen
comes from — going past 2 costs fill rate and buys nothing visible.

## Motion rules

1. **Nothing animates in from `opacity: 0`.** Entrances are transform-only. The
   first painted frame is what a thumbnail, a shared link and a fast scroller
   all get — if the copy is not readable there, the animation is a bug.
2. One orchestrated moment per screen, not scattered effects.
3. Every animation has a `prefers-reduced-motion` answer.
4. The live counter ticks once every 26 seconds. A number that moves faster
   than reality reads as fake, and the whole page is arguing for trust.

## Layout

- Gutter `clamp(16px, 4vw, 56px)`, content capped at 1240px.
- Sibling groups use grid/flex with `gap`; no per-element margins.
- Grid and flex children that hold text carry `min-width: 0` — the default
  `auto` lets one long string push a track past the screen.
- Only tables scroll horizontally, inside their own container. The body never
  does.
- Cards are dense on purpose. This is a tool a dispatcher scans, not a page
  they read.

## Copy

Romanian with correct diacritics, written from the user's side of the screen.
Regulatory terms stay Romanian — `copie conformă`, `ITP`, `RCA`, `licență
comunitară`. They are proper nouns of Romanian law, and a dispatcher searching
for "copie conformă" will not find "conform copy".

The page argues one thing: **a claim is not a mechanism.** The competitor says
"firme verificate"; this page shows an expiry date and what happens on the day
it passes. Every section either supports that or earns its place some other
way — the price table by being the honest answer to the question people
actually google.
