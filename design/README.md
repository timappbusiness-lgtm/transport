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
/* accent — the whole scale */
--color-accent:         #15616d;  /* text 6.60:1 on ground, 7.09:1 on white, 6.24:1 on ground-alt */
--color-accent-hover:   #114f59;  /* on-accent text on it 9.18:1 */
--color-accent-subtle:  #e6f1f2;  /* a tinted background; accent on it 6.15:1, ink 13.39:1 */
--color-accent-border:  #9cc5cb;  /* the edge of a tinted chip; decorative, never the only boundary */
--color-on-accent:      #ffffff;  /* text on a filled accent: 7.09:1 */
--color-accent-on-dark: #a3dce3;  /* the dark header: 5.37:1 on its worst case */
--color-ink-hover:      #2a3740;

/* category grounds — one per vehicle family, all quieter than the accent */
--color-tint-petrol: #e6f1f2;  --color-tint-sand:  #f6efe3;
--color-tint-sage:   #e9f1ea;  --color-tint-sky:   #e7eef6;
--color-tint-clay:   #f5e9e4;  --color-tint-stone: #eceeef;

/* motion */
--ease-soft:      cubic-bezier(0.2, 0.7, 0.2, 1);
--duration-quick: 120ms;  /* a press, a colour */
--duration-calm:  220ms;  /* a lift, a toast, a success moment */
```

Every pair above is measured in `tests/unit/accent-scale.test.ts`, which
reads the values out of `globals.css` rather than repeating them — change a
token and the test measures the new one. `tests/unit/token-usage.test.ts`
fails on any hex, `rgb()` or arbitrary colour class in a component; the one
literal allowed is `THEME_COLOR` in `src/config/theme.ts`, for the browser
chrome, and a test holds it equal to `--color-foreground`.

### The accent: why petrol, where it goes, where it never does

There was no accent colour for the first year of this system, deliberately:
emphasis came from weight, space and the dark sections. Users said the result
read professional and cold — the competitor they compared us with is
readable at a glance because one strong colour marks the logo, the headings
that matter and the numbers. So the accent was decided properly, with both
candidates measured:

| | Deep teal-blue (chosen) | Warm amber |
|---|---|---|
| As text on ground / white | **6.60 / 7.09** | 5.52 / 5.93 (`#8a5a00`, a brown) |
| White text on the fill | **7.09**, 9.18 on hover | **2.23** — fails; the fill needs ink text (6.92) |
| The fill against white | 7.09 | 2.23 — under 3:1, the button has no edge |
| On the dark header | `#a3dce3`, 5.37 | the light amber reads as a warning light |
| Next to the status colours | hue far from warning | same hue as `--color-warning #b7791f` |

Amber would have needed two different colours to work — a brown for text and
a gold for fills with ink on it — and it sits in the hue of „expiră curând".
On a platform where a warning must look like a warning, the brand colour
cannot be the warning colour. Petrol is from the same blue-leaning family as
`--color-dark-from`, so it belongs to the palette rather than sitting on it,
and one value does text, fill and edge. A test keeps the accent's hue more
than 90° away from the warning's.

**Where it is spent** — each place has a test or a check that it is there:

| Where | What carries it |
|---|---|
| The wordmark | `header-brand.tsx`, `--color-accent-on-dark` on the dark header |
| The primary action | `buttonClasses('primary')`: filled, `text-on-accent` |
| Active navigation and tabs | header link (`aria-current`, underline), sidebar, phone bar, `TabLink` |
| Key numbers | distance on a request, free seats and price on a route, a live offer's price, the dashboard's counts (`DataRow tone="accent"`), `Figure` |
| The current step of an order | the timeline rail |
| Links inside text | `link-accent` — accent, underlined, offset 4px |
| Counts and „Nou" | the `Badge` kinds `count` and `new` |

**Where it never goes:** legal pages, suspensions, rejections, disputes,
deletions, error screens — including the 404 — and never as a mark that
could be read as verification (no accent tick, seal or badge beside a
company name). A link inside one of those is `link-ink`; the button is `ink`.
The deletion panel, dispute, rejection, order cancellation, report and block
buttons were `primary` from before the accent existed and turned petrol with
it; they are `ink` now, and `accent-scale.test.ts` names each of them.
`tests/e2e/ton-cald.spec.ts` reads the computed colour of everything on the
legal pages and the 404 — with a positive control that proves the detector
sees the accent where it is.

**On the dark header** the accent is `--color-accent-on-dark`. The header
itself went from ink at 72% to ink at 80%, so that on the palest part of any
page behind it the wordmark still measures 5.37:1. On the gradient sections
the pale step measures only 3.03:1 at the light end, so those keep white.

**The soft half of a two-tone headline is never the accent.** It is the part
somebody may skip, and the accent marks what they should not.

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
- `Badge` — the one small sign: `new`, `time`, `count`, `express`, `return`.
  See [Badges](#badges).
- `TabLink` / `tabClasses` — every tab and filter chip in the account area.
- `CategoryTile` / `CategoryArt` — the vehicle drawing on its tinted ground.
- `SuccessMoment` — the four moments worth marking. See [Success](#success).
- `BoardSkeleton`, `DashboardSkeleton` — loading states, shaped like the page.
- `ToastProvider`, `useToast`, `useActionToast` — one toast component.
- `CARD_INTERACTIVE`, `CARD_ACTION` (`interactive.ts`) — how a clickable card
  answers the pointer, defined once.

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

## Badges

One component, `src/components/ui/badge.tsx`, and five kinds. Shape, size
and colour come from tokens; no screen invents its own. None carries an
icon, and none is ever the only place a meaning lives.

| Kind | Shows | When — and when not |
|---|---|---|
| `new` | „Nou" | published less than 24 hours ago, by `isNew()` in `src/lib/badges.ts`. Not at 24 h, not for a missing or unreadable date; five minutes of clock skew allowed |
| `time` | „acum 16 min" | beside every published item; kept current by `RelativeTime`. A route with no `published_at` shows nothing rather than „chiar acum" |
| `count` | „3", „9+" | on a menu item with something waiting — unread messages, unanswered offers, blocking documents missing, rejected or expired. `countLabel()` returns nothing for 0, negatives or NaN, so a „0" never appears |
| `express` | „Expres" | the service is express |
| `return` | „Pe retur" | the route is a return leg that is not full; a full one keeps its status chip |

Status chips (`StatusBadge`) are unchanged: a state is a chip, a sign is a
badge. Every rule is in `tests/unit/badges.test.tsx`; the e2e suite checks
that a board with no rows and a visitor's header show no badge at all.

The numbers that show the place is alive — requests this week, verified
carriers, free seats — were already at figure size and in the accent; this
pass left them there and left every threshold that hides them until they
mean something exactly as it was. Nothing is shown that is not counted.

## Category drawings

Ten line drawings, one per offered category — autoturism, autoutilitară,
microbuz, motocicletă, ATV, rulotă, remorcă, cvadriciclu, istoric, altceva —
in `src/components/ui/category-art.tsx`, the same family as the hero:

- inline SVG on a 64×40 box, no fill, two stroke weights (2.2 for the body,
  1.2 for the detail), a soft ground ellipse;
- the hub of each wheel and one detail in the accent, which becomes
  `accent-on-dark` inside `data-surface="dark"`;
- `aria-hidden` beside the category's name, or labelled when it stands alone.

`CategoryTile` puts a drawing on its family's tint: petrol for cars, sky for
vans and minibuses, clay for motorcycles, sage for ATVs and quadricycles,
sand for caravans and classics, stone for trailers and „altceva". It leads
every board card, homepage card and category tile, opens the request page,
and sits beside the category field of the publish form. A retired category
still renders, as „altceva": a published listing is a real listing.
`tests/unit/category-art.test.tsx` checks the map both ways — every offered
category has a drawing and a tint, every drawing belongs to a category.

## Success

Four moments get a calm confirmation — a small drawing (a road and a flag,
no tick, no seal), one sentence and the next action:

| Moment | Where |
|---|---|
| Request published | the last step of `/cerere/noua` |
| Company verified | the company's documents page |
| Offer accepted | both sides: „Ai ales transportatorul." / „Clientul ți-a acceptat oferta." |
| Order completed | the order page |

The words are in `src/content/success.ts`. No exclamation marks in any of
the interface copy in `src/content` — `tests/unit/tone.test.tsx` enforces it
— and no promise the database does not enforce.

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
4. **Transform and opacity only.** A card lifts 2px on hover and settles on
   press; its raised shadow is a layer on `::before` that fades in, not an
   animated `box-shadow`. A button presses in by 2%. Every movement is
   `motion-safe:`. Colour changes — a border darkening on a hovered input,
   a tab tint — happen at once: they are state, not motion.
5. **The one exception to rule 1 is a toast,** which rises 8px and fades in:
   it appears after something the person did, never on the first frame.

Loading states are skeletons shaped like the page — the board's own heading
and lede, then the filter card and card outlines; the dashboard's blocks.
Never a spinner. The pulse is an opacity animation and is still under
reduced motion. A skeleton covers only a list page, from inside a route
group (`cereri/(panou)`, `trasee/(panou)`, `cont/(acasa)`): a `loading.tsx`
makes everything under it stream, and a page that has already sent its 200
cannot turn into a 404. `tests/unit/feedback.test.tsx` fails if a loading
boundary ever covers a page that calls `notFound()` or `redirect()`.

Saves and errors answer in one toast component. A success leaves after
four seconds and is read politely; an error stays ten, is read at once, and
can be closed. On a form that keeps its inline error, the error toast is
drawn but not announced — one failure, one sentence for a screen reader.

## Copy

Romanian with correct diacritics, written from the user's side of the screen.
Regulatory terms stay Romanian — `copie conformă`, `ITP`, `RCA`, `licență
comunitară`. They are proper nouns of Romanian law.

Rules enforced by `tests/unit/home-content.test.ts`, not by review:

- No exclamation marks, no superlatives.
- A person talking to a dispatcher: second person, short sentences, no
  jargon — „Spui ce ai de mutat și de unde". Homepage sections, boards,
  empty states, onboarding, dashboard widgets and success moments are
  written that way; legal, suspension, dispute, deletion and staff screens
  keep their formal register, and the tone test does not touch them.
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

### After the warmth pass

Measured the same way, a production build of `main` and of this branch side
by side on the same machine, mobile preset, no data:

| Page | `devtools` — main | `devtools` — branch | `simulate` — both |
|---|---|---|---|
| `/` | 91–93 (median 92) | 89–92 (median 91) | 83–87 |
| `/cereri` | 97 | 96 | 86–89 |
| `/trasee` | 98 | 92 | 86–87 |
| `/cerere/noua` | 92 | 96 | 86–87 |
| `/termeni` | 97 | 96 | 86–87 |

Accessibility 100 on every page, CLS under 0.05. The simulated score was
under 90 on `main` before this pass too; it is the model's render delay
described above, not a regression. One regression this pass did cause and
then removed: a board skeleton drawn as grey bars pushed the lede — the
element a phone paints as largest — behind the rows, and cost `/cereri` six
points. The skeleton now draws the page's real heading and lede.

SEO scores 63 because `robots` is `noindex, nofollow` until launch. That is
the one line to flip in `src/app/layout.tsx`, and there is a TODO on it.
