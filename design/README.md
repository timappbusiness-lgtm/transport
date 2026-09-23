# Design system

Calm, premium, data-driven. A light ground, generous white space, ink type,
and one family of blue-greys doing all the structural work. Marketing and
product share this system: the landing page and the account area are the same
visual language, so a person who signs up does not land somewhere else.

The previous direction — a dark "motorway at night" landing page with a
canvas corridor animation — is gone. It lives in git history only.

## Reference

The calm, analytical feel of qoves.com: inspiration for the *register*, never
for the content. No text, image, icon or layout of theirs is reproduced here.

## Tokens

Defined once in `src/app/globals.css`, under Tailwind's `@theme`.

```css
/* grounds and surfaces */
--color-background:    #f6f7f7;  /* ground */
--color-ground-alt:    #eef1f2;  /* alternating section */
--color-surface:       #ffffff;  /* card */
--color-border:        #e2e7e9;  /* hairline between surfaces */
--color-border-strong: #7c8a91;  /* boundary of a form control */

/* ink */
--color-foreground: #1c262b;  /* 14.37:1 on ground */
--color-muted:      #5e6d74;  /*  5.00:1 on ground — body-safe */
--color-ink-soft:   #7b8b93;  /*  3.28:1 — large headlines only */

/* dark sections */
--color-dark-from: #33434b;   /* white 10.27:1 */
--color-dark-to:   #69787f;   /* white  4.57:1 */

/* status */
--color-success: #2f8f5b;
--color-warning: #b7791f;
--color-danger:  #c2413a;

/* shape */
--radius-pill:  999px;
--radius-card:  20px;
--radius-input: 12px;
```

```css
/* accent */
--color-accent:       #15616d;  /* 6.60:1 on ground, 7.09:1 on white */
--color-accent-hover: #114f59;  /* white on it 9.18:1 */
--color-ink-hover:    #2a3740;
```

### The accent, and the six places it goes

There was no accent colour for the first year of this system, deliberately:
emphasis came from weight, space and the dark sections. That held up, and it
had one consequence nobody wanted — every screen read grey, because the only
thing separating a price from the word before it was a font weight.

The accent is a petrol blue from the same blue-leaning family as
`--color-dark-from`. It is **spent in six places and nowhere else**:

| Where | What carries it |
|---|---|
| The key figure of a card | `Figure` — a price, free seats, a distance, a rating |
| The primary action | `buttonClasses('primary')`, filled |
| The active tab or filter | the selected chip on both boards |
| The active navigation item | sidebar, phone bar, header menu |
| The current step of an order | the timeline rail |
| The section eyebrow | `EyebrowPill`, light surfaces only |

And it is **forbidden** on: legal pages, suspensions, rejections, disputes,
deletions, incidents and error states — the same list as the icons, for the
same reason. A colour makes a sentence somebody has to read look like a
notification they can dismiss. `EyebrowPill tone="quiet"` exists for the
legal pages; `tests/unit/design-tokens.test.ts` and
`tests/e2e/aspect-vizual.spec.ts` both fail if it spreads.

Two further rules:

- **the soft half of a two-tone headline is never the accent.** It is the
  part somebody may skip, and the accent marks what they should not;
- **it is a light-surface token.** A pale tint of it measures 2.9:1 against
  the light end of the dark gradient, under every floor there is, so the dark
  sections keep white and white/60. A primary action on dark is still a white
  pill.

### Three values differ from the original brief

Each was changed because it failed when measured, and each is pinned by
`tests/unit/contrast.test.ts` so a future tweak cannot quietly undo it.

| Brief | Shipped | Why |
|---|---|---|
| Dark gradient `#6f7f87 → #a9b6bc` | `#33434b → #69787f` | White text on `#a9b6bc` is **2.08:1** — below even the 3:1 large-text floor. The hero and the closing CTA are built on this gradient, so both would have been unreadable. Same hue family, darkened until white is body-safe at both ends. |
| Status colours as label text | Label is ink; the colour carries the dot, border and tint | As text on white, success measures **4.04:1** and warning **3.64:1**, both under AA. The brief already required a text label — this makes the word carry the meaning and the colour reinforce it. |
| One border token | `--color-border` plus `--color-border-strong` | `#e2e7e9` is 1.25:1 on white. Right for a card hairline, wrong for the edge of an input, which WCAG 1.4.11 asks to be 3:1. |

## Type

| Role | Face | Notes |
|---|---|---|
| Display | **Inter Tight** | 600 for headlines, 300 for the soft half of a two-tone one, 500 for figures and small display labels. |
| Body | **Inter** | 400 normally, 500 for emphasis and controls. |
| Data | **IBM Plex Mono** 400 | Number plates, dates, kilometres, prices, eyebrow labels. Anything that lines up in a column gets `tabular-nums`. |

### The scale

Every step is a token in `globals.css` and carries its own line-height,
tracking and — for headings and figures — weight, so a heading is one class
rather than a class plus two corrections.

| Step | Size | Line | Weight | For |
|---|---|---|---|---|
| `text-display` | clamp 2.25 → 4rem | 1.05 | 600 | the hero, once per site |
| `text-h1` | clamp 1.9 → 3.25rem | 1.06 | 600 | a page title, a section headline |
| `text-h2` | clamp 1.45 → 2rem | 1.12 | 600 | an inner-page title |
| `text-h3` | 1.0625rem | 1.3 | 500 | a card title |
| `text-body-lg` | 1.0625rem | 1.5 | — | a lede |
| `text-body` | 0.9375rem | 1.5 | — | body, and the `<body>` default |
| `text-small` | 0.8125rem | 1.5 | — | metadata, captions |
| `text-label` | 0.625rem | 1.2 | — | mono eyebrows, uppercase, 0.12em |
| `text-figure-lg` / `text-figure` / `text-figure-sm` | 2.5 / 2.25 / 1.75rem | 1 | 500 | `Figure`, and nothing else |

Nothing in `src/` writes an arbitrary size any more — there were 676 of them
across 195 files, in seventeen steps, plus 65 hand-written clamps in eighteen
variants for what were all page titles. Where an existing size fell between
two steps, the Tailwind step of exactly that value is used rather than the
nearest token: nudging 126 sites by a sixteenth of a rem to tidy a scale is a
layout change, and the pass that introduced this was not one.

**Bold carries meaning, never decoration.** The key number in a sentence, the
route cities, the price, the deadline, the status word. Never a whole
paragraph.

Four weights exist in the whole system — 300, 400, 500, 600 — and they are
named explicitly in `src/app/layout.tsx`. 600 is display-only; the body keeps
400 and 500, which is all „bold where it carries meaning" needs, so the
headline weight costs one file on one family.

### A trap worth knowing about

`cn()` extends `tailwind-merge` with the list of custom steps
(`TEXT_SCALE` in `src/lib/utils.ts`). Without that, `twMerge` files
`text-h1` in the same group as `text-white` and keeps only the last one
written — silently. It shipped a 15px hero headline and a white-on-white
button in the space of an afternoon. A step added to `globals.css` and not
to `TEXT_SCALE` breaks the first component that puts it beside a colour;
`tests/unit/design-tokens.test.ts` reads both lists and fails when they
disagree.

`latin-ext` is required on every face — without it ă, â, î, ș and ț fall back
to a second face mid-word.

Eyebrow labels are mono, uppercase, tracking 0.12em, inside a bordered pill.

## Components

In `src/components/ui/`:

- `Headline` — the two-tone headline: `<Headline strong="Transport auto" soft="cu firme verificate." />`. The only place `--color-ink-soft` is allowed, because it is only legible at display sizes.
- `EyebrowPill` — mono uppercase label in a bordered pill, light and dark variants.
- `Button` / `buttonClasses` — pill, four variants: `primary`, `secondary`, `onDark`, `onDarkGhost`.
- `Card`, `Section`, `SectionHead` — surfaces and section scaffolding; `Section tone="dark"` paints the gradient and sets `data-surface="dark"`, which switches the focus ring to white.
- `StatusBadge`, `DataRow`, `CountryTag`, `SampleTag`.

- `Figure` — the one number a card exists to show, in the accent and always
  `tabular-nums`. `tone="plain"` where the figure is not the point.
- `EmptyState` / `EmptyFigure` — an empty list, drawn. An empty screen that
  says only „Nu ai nicio cerere publicată." is indistinguishable from one
  that failed to load.

## Elevation

Three levels, and a card only takes the second if it is genuinely a link.

| Token | Use |
|---|---|
| `shadow-card` | a card at rest. Almost flat — the border does the separating |
| `shadow-raised` | the hover state of a card that is a link |
| `shadow-float` | something over another surface: the hero's cards, a menu |

Radii are `--radius-pill`, `--radius-card` (20px), `--radius-input` (12px)
and `--radius-tight` (6px, for chips and seat cells). No component writes a
pixel radius.

## Illustrations

One family, four figures, all inline SVG on tokens: strokes at two weights,
no fill, nothing that could be mistaken for a photograph. Each is either
`aria-hidden` beside text that carries the meaning, or `role="img"` with a
label. All static, so `prefers-reduced-motion` has nothing to disable.

- `SeatDeck` — the eight seats on a carrier. Taken cells share one tint so
  the block that is gone reads as one shape; free cells are dashed with the
  word „liber"; the count is a `Figure`.
- `DocumentFile` — the company's documents as one file: a spine down the
  left, a tick per row, mono plate and date, a chip with an icon and a word,
  and the expiring row tinted.
- `CorridorRoute` — origin filled, destination ringed, waypoints as ticks,
  and the accepted detour as a dashed arc with its distance in the accent.
- `PhotoSlot` — the car transporter behind the hero. Structure heavy, glazing
  and cargo light, a soft ground shadow, and a road whose lane marks shorten
  towards the horizon. Still a placeholder for a real photograph — see its
  TODO.

Every demonstration card carries a `SampleTag` („Exemplu"). That is a legal
requirement, not decoration, and an end-to-end test counts them.

The floating pill navigation is `src/components/layout/site-header.tsx`:
translucent, blurred, sticky, sitting inside the page rather than spanning it.

## Focus

2px ink with a 2px offset on light ground; white on dark sections, switched by
`[data-surface="dark"]`. Never the hairline border, which is 1.25:1 and
invisible as an indicator.

The focus ring never transitions. Tailwind v4's `transition-colors` includes
`outline-color`, so a component using it makes the ring fade in from the
element's own text colour — on a primary button that means it starts
invisible. Both the base layer and the button primitive guard against it, and
an end-to-end test asserts the computed colour.

## Motion

1. **Nothing animates in from `opacity: 0`.** Entrances are transform-only.
   The first painted frame is what a thumbnail, a shared link and a fast
   scroller all get; if the copy is not readable there, the animation is a bug.
2. One orchestrated moment per screen, not scattered effects.
3. Everything has a `prefers-reduced-motion` answer, set globally in
   `globals.css`.

## Copy

Romanian with correct diacritics, written from the user's side of the screen.
Regulatory terms stay Romanian — `copie conformă`, `ITP`, `RCA`, `licență
comunitară`. They are proper nouns of Romanian law.

Rules enforced by `tests/unit/home-content.test.ts`, not by review:

- No exclamation marks, no superlatives.
- No social proof counts. The boards hold no real data yet, so any figure of
  users or carriers would be invented.
- Every demonstration card carries an **Exemplu** badge. Legal requirement,
  never decoration, never removed.
- Every price is labelled **orientativ**, and the copy says plainly that real
  intervals will appear once transports close in the platform.
- Headlines hold two lines on desktop, three on mobile.

## Rendering

Every page carries the header, and the header reads the session, so the root
layout declares `force-dynamic`. That is a deliberate trade: without it the
build output depends on whether an `.env` file exists, and the statically
prerendered variant would call `cookies()` at request time in production.

The session-dependent half of the header is already behind a `<Suspense>`
boundary, which is the shape this needs to become partially prerenderable.
Turning that on means enabling PPR — a decision for the team, not a flag to
slip into a design change.

## Reference screenshots

`design/screenshots/` holds the homepage at 390 and 1440, full page. They are
regenerated from a production build, not maintained by hand — when the page
changes, retake them rather than editing them.

## Measured

Lighthouse on the homepage, production build, three throttling methods:

| Throttling | Performance | LCP | Accessibility |
|---|---|---|---|
| `devtools` — real 4G and 4× CPU | **91** | 1.9 s | 100 |
| `simulate` — Lighthouse's default model | 88 | 4.0 s | 100 |
| `provided` — none | 100 | 0.2 s | 100 |

Under real throttling LCP and FCP land on the same millisecond: the headline
paints in the first contentful frame and nothing delays it. The simulated
run's extra 2.1 s is the model's estimate of a render delay that direct
measurement does not show — `display: optional` on the display face and
preloading only the face the headline uses both left it at 4.0 s, which is
what you would expect if there were no font-blocked paint to remove.

SEO scores 63 because `robots` is `noindex, nofollow` until launch. That is
the one line to flip in `src/app/layout.tsx`, and there is a TODO on it.
