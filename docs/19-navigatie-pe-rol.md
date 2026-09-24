# Navigation per account type

A carrier and a client want opposite things. A carrier opens the platform
to see requests they can bid on; a client opens it to publish a request
and follow it. Until September 2026 both saw the same header once signed
in — the public menu (Cereri, Trasee, Firme, Abonamente, Cum funcționează)
and a „Contul meu" button — and the publish button, inside the account,
offered a client's choice next to a carrier's.

This is what changed, where each piece lives, and what is left.

## One builder

Everything below comes from `src/lib/navigation.ts`, and from `buildNav`
in particular:

- `headerBar(context, counts)` — the entries in the bar, for a signed-in
  person. Hrefs chosen by `barOrder(context)`, items (label, whether the
  page exists for this role and feature map) taken from `buildNav`.
- `headerMenu(context, counts)` — the account menu: the dashboard, every
  other `buildNav` page not in the bar (the sidebar's groups), a carrier's
  „Publică o cerere", the public pages the bar does not show, and /admin
  for staff.
- `publishMenu(context)` — the primary action and its menu.
- `PUBLIC_NAV` — the signed-out bar, unchanged.
- `FOOTER_NAV` — the footer, for everyone.

The sidebar, the phone's bottom bar, the header bar and the account menu
read the same `buildNav` output, so a label or a permission cannot differ
between them. `tests/unit/navigation.test.ts` checks that the bar and the
menu together hold every sidebar page and every page of the signed-out
bar, each exactly once, and that every entry is a route with a page.

## The header, before and after

| Account | Bar before | Bar after | Button before → after |
|---|---|---|---|
| Signed out | Cereri, Trasee, Firme, Abonamente, Cum funcționează | unchanged | „Publică o cerere" (unchanged) |
| Carrier (transport, or both) | the public five | **Cereri de transport** (badge: new since last visit), Traseele mele, Oferte trimise, Transporturi, Mesaje | „Contul meu" → **„Publică un traseu"**: Traseu pe tur, Traseu pe retur, and below a rule, quieter, „Publică o cerere" |
| Forwarder / business client | the public five | **Cursele mele**, Oferte primite, Trasee disponibile, Transporturi, Mesaje | „Contul meu" → **„Publică o cerere"** (it said „Publică o cursă" inside the account) |
| Private client | the public five | **Cererile mele**, Oferte primite, Mesaje, Trasee disponibile | „Contul meu" → **„Publică o cerere"** |
| Driver | the public five | **Transporturile mele** — nothing else, in the bar at every width | „Contul meu" → none |
| Staff | the public five | the bar of their own account | unchanged; „Administrare" stays in the account menu |

„Contul meu" did not go anywhere: the name in the bar is the link to it,
and it is the first entry of the account menu.

Below 1280px (`xl`) the signed-in bar folds into „Meniu", with a dot on
it when something behind it carries a badge; the signed-out bar folds
below 1024px, as before. On a phone the publish button says „Traseu nou"
or „Cerere nouă". A driver's single entry never folds.

## Where the moved entries live

| Entry | Now |
|---|---|
| Firme, Abonamente, Cum funcționează | account menu, section „Platformă", for everyone; footer |
| Cereri de transport / Trasee disponibile, when not in the bar | account menu, „Platformă"; footer |
| Evaluări, Flotă, Documente, Echipă, Abonament, Profil firmă, Alerte, Ajutor, Profil, Notificări, Date personale | account menu, in the sidebar's groups (as before in the sidebar) |
| „Publică o cerere" for a carrier | the publish menu, last and quiet; and the account menu, after the carrier's work |
| The dashboard's own „Publică" button | removed: the header carries the role's button on every page; the carrier dashboard's quick actions follow the same order (`publishActions`) |

Nothing a carrier could do before is gone: publishing a request is one
click from the button and one from the account menu, and no permission,
policy or rule changed.

## The carrier's board

`/cereri`, for a signed-in carrier (company type `transport` or `both`,
not a driver):

- Opens on **„Potrivite cu firma mea"** — coverage, vehicle types,
  equipment and the detour their published routes allow, by
  `src/lib/matching.ts` — newest first. **„Toate cererile"** is the tab
  beside it. The view is in the address: nothing for the default,
  `doar=toate` for everything (`parseRequestFilters(params,
  { mineByDefault })`). Everybody else keeps the old meaning
  (`doar=firma` narrows).
- Shows **„12 cereri noi de la ultima vizită"** beside the tabs, hidden
  at zero.
- Every card has one primary button, **„Trimite ofertă"**: to the offer
  form on the request (`#oferta`) for a verified firm; to the missing
  step — company, vehicle, documents — with `pentru=oferta&next=…` back to
  the request while the firm cannot send one yet (`gateHref`).

### How the new-requests count is computed

`loadNewRequestCount(context)` in `src/lib/board-match-source.ts`, cached
per request so the header badge and the board line are one number:

1. Zero, with no query, unless the viewer is a carrier (not a driver) and
   `profiles.last_seen_at` is set. Somebody who never opened the board is
   not told that everything on it is new.
2. The requests on `v_requests_public` published strictly after
   `last_seen_at`, newest first, at most 200.
3. Of those, the ones „Potrivite cu firma mea" keeps (`onlyForCompany`:
   `carries()` and `detourOk()`), counted.

The visit is recorded by `markBoardSeenAction(renderedAt)`, called from
the browser once the board is on the screen — never while it renders, so
a prefetch does not clear a count nobody read. It stores when the server
drew the board (clamped to now, ignored if older than a day), so a
request published in between stays new. The header drops its badge at
once through a `window` event (`coridor:cereri-vazute`).

`last_seen_at` already existed and is the carrier's own row, written
under the policy that lets a person update their profile; no schema,
policy or grant changed. The pilot dashboard reads the same column as
„active this week", which a carrier opening the board is.

In the bar the badge caps at „9+"; a screen reader hears „9+ noi". The
board line says the exact number.

## Where sign-in lands

A sign-in with somewhere to go — the page that sent you, a step of a form
— goes back there, as before (`explicitNextAfterAuth`). With nowhere in
particular, it goes to `/intrare` (`src/app/intrare/route.ts`), which
decides with `landingAfterSignIn` (`src/lib/landing.ts`):

| Who | Lands on |
|---|---|
| Carrier, file done or with us for checking | `/cereri` |
| Carrier, no firm / no vehicle / documents missing or rejected | `/cont/firma/creare` / `/cont/firma/flota` / `/cont/firma/documente` |
| Carrier, suspended | `/cont` (the dashboard says why) |
| Firm account with no firm yet | `/cont/firma/creare` |
| Forwarder, private client, driver | `/cont` |

The same landing applies after a password reset and when a signed-in
person opens a sign-in page.

## Two names, and why not „anunț"

What a client publishes is a **„cerere de transport"**; the board is
**„Cereri de transport"**. What a carrier publishes is a **„traseu"**; the
board is **„Trasee disponibile"**, and a carrier's own list is „Traseele
mele". The same words in the menus, the headings, the e-mails, the
notifications, the empty states and the help pages.

**Neither is ever an „anunț".** The competitor calls both sides
„anunțuri", and it is exactly why their interface is confusing: a
dispatcher looking at a list of „anunțuri" cannot tell whether it is work
to bid on or capacity to book. „Plecare" — the old name for a route — is
gone from the interface too. `tests/unit/cuvinte-cereri-trasee.test.ts`
scans every copy file and the e-mail templates and fails on either word.

Kept deliberately:

- The signed-out bar says „Cereri" and „Trasee": the short forms of the
  same names, because five labels have to fit beside the two buttons.
- A forwarder's own list is „Cursele mele", as specified.
- „anunț" where it means the vehicle's sale ad on a classifieds site
  (`/admin/import`, „din anunț" on a photo) — a different thing.
- „Cursă dedicată" / Expres: the name of a service, not of a listing.

### Not changed here, because they live in the database or in legal text

The task allowed no database changes, and the legal documents change only
as a new version. These still say „anunț", „plecare" or „cursă" and need
a migration, an edit in the admin screens, or a new legal version:

- Notification type labels shown in `/cont/setari/notificari`:
  „Anunț scos de pe panou", „Anunț repus pe panou", „Serie de plecări
  oprită" (migrations `20260925100000`, `20260927100000`).
- The `listing_hidden` payload's fallback title „anunțul tău"; and the
  payload does not say whether it is a request or a route, so the e-mail
  now names neither and links to `/cont`.
- Plan features „Anunțuri promovate", „Publicare nelimitată de curse" and
  a plan description (editable in `/admin/planuri`).
- Four landing pages' text (editable in `/admin/pagini`).
- Database error messages that reach the user: „Anunț inexistent",
  „Compania nu poate publica anunțuri…", „Alege ce vehicule poate duce
  plecarea", and a few more — listed in the pull request.
- `/termeni` and `/confidentialitate` 1.0.
- `docs/01-product-spec.md`'s glossary still says `cursă` and `plecare`;
  it changes only with an approved diff, proposed in the pull request.
