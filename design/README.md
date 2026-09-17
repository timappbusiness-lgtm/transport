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

There is **no brand accent colour**. Emphasis comes from weight, space and the
dark sections. A primary action is an ink pill on light ground and a white
pill on dark.

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
| Display | **Inter Tight** | 300 for headlines, 500 for small display labels. Tracking −0.03em, line-height 1.02. Never bold: a 700 on this face is not part of the system. |
| Body | **Inter** | 400 normally, 500 for emphasis and controls. |
| Data | **IBM Plex Mono** 400 | Number plates, dates, kilometres, prices, eyebrow labels. Anything that lines up in a column gets `tabular-nums`. |

Three weights exist in the whole system — 300, 400, 500 — and they are named
explicitly in `src/app/layout.tsx`. Google serves the variable file for the
two sans families either way, so nothing is synthesised; naming the weights
is what removed the Plex Mono 500 face, which was fetched on every visit and
rendered nowhere.

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

In `src/components/home/`: `SeatDeck` (the 8 seats on a car carrier) and
`PhotoSlot` (a line-drawn placeholder standing in for a photograph we do not
have yet — see its TODO).

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
