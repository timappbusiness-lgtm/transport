# Screenshots

Captured with Chromium at a device pixel ratio of 2, at 1440 (desktop) and
390 (Pixel 7) CSS pixels.

| File | What it is |
|---|---|
| `home-1440.png`, `home-390.png` | The homepage. |
| `cereri-noi-gol-1440.png`, `cereri-noi-gol-390.png` | The activity section as it ships: nothing published, so no figures and no cards. |
| `cereri-noi-1440.png`, `cereri-noi-390.png` | The same section with the demo requests from `supabase/seed/requests.sql`. |
| `admin-activitate-1440.png` | `/admin/activitate`, where the thresholds are set. |
| `siguranta-1440.png`, `siguranta-390.png` | The carrier band and the safety section, with a carrier count above the threshold. |
| `siguranta-fara-numar-1440.png` | The same band as it ships: no database, so no number is stated. |
| `verificare-1440.png`, `verificare-390.png` | `/verificare`, with the document table rendered from the requirement rows. |
| `admin-verificare-1440.png`, `admin-verificare-390.png` | `/admin/documente`, the review queue. |
| `firme-inscriere-1440.png`, `firme-inscriere-390.png` | The carrier section: the price read from `plans`, and the grid of listed firms. |
| `firme-carduri-1440.png` | The directory card, with the detail the `/firme` list adds. |
| `firme-profil-1440.png`, `firme-profil-390.png` | A company profile: the compliance shield, the ratings and the published routes. |
| `firme-cifre-1440.png` | The stats band, above its threshold. |
| `firme-faq-1440.png`, `firme-faq-390.png` | The homepage FAQ, with the answers that read the document rules and the price. |
| `firme-lista-goala-1440.png`, `firme-lista-goala-390.png` | `/firme` as it ships: no verified firm has opted in, so the list says it is filling up rather than showing samples. |
| `intrebari-frecvente-1440.png`, `intrebari-frecvente-390.png` | `/intrebari-frecvente` with no database: only the questions that need no data are there, which is the point. |
| `abonamente-lunar-1440.png`, `abonamente-lunar-390.png` | `/abonamente` at the monthly rate. |
| `abonamente-12-luni-1440.png`, `abonamente-12-luni-390.png` | Twelve months: the monthly equivalent, the total under it, and „2 luni gratuite” — which appears only because 1.490 is exactly ten times 149. |
| `abonamente-6-luni-1440.png` | Six months, where the totals do not divide cleanly, so the saving is stated in lei instead. |
| `abonamente-expeditii-1440.png` | The forwarder tab. One plan today; the team adds more from /admin/planuri. |
| `abonamente-goale-1440.png` | `/abonamente` as it ships: no database, so no price is stated at all. |
| `cont-transportator-1440.png`, `cont-transportator-390.png` | The carrier's home: the sidebar with the plan chip, one status banner, what needs attention, requests matched to the routes, and the activity figures. |
| `cont-meniu-mobil-390.png` | The overflow sheet on a phone, holding what does not fit the five-slot bottom bar. |
| `acasa-tarife-1440.png` | The homepage price band before the team publishes: no figures, one link. |
| `preturi-nepublicat-1440.png`, `preturi-nepublicat-390.png` | `/preturi` as it ships — nothing published, so no table and no calculator. |
| `preturi-1440.png`, `preturi-390.png` | `/preturi` with the rates published. |
| `admin-preturi-1440.png` | `/admin/preturi`, the staff screen. |
| `cerere-noua-ruta-1440.png`, `cerere-noua-ruta-390.png` | `/cerere/noua`, step one, arriving from the price calculator. |
| `cerere-noua-vehicul-1440.png` | Step two: the category, make, model and year the board cannot do without. |
| `cerere-noua-stare-1440.png`, `cerere-noua-stare-390.png` | Step three, with „pornește" unticked — the winch line appears from the answers, the way the database derives `needs_winch`. |
| `cerere-noua-cont-1440.png` | Step four with nobody signed in: an account is offered instead of a publish button, and what was typed is already saved. |
| `cereri-goale-1440.png`, `cereri-goale-390.png` | `/cereri` as it ships: nothing published yet, so the board says so and offers the one thing that fills it. |
| `cereri-panou-1440.png`, `cereri-panou-390.png` | The board's cards with requests on it. |
| `cont-cereri-1440.png`, `cont-cereri-390.png` | `/cont/cereri`: one request on the board, one draft and one expired, each with what it can do next. |

**The ones showing populated data were rendered through a throwaway route**,
not from a live database: this checkout cannot reach a Supabase instance, and
most of these screens show their empty state until real rows exist. The
components are the real ones and the rows are shaped like real ones. Two
things differ from what a reviewer will see: the staff sidebar that the
`/admin` layout wraps around the admin pages, and date inputs, which render
`mm/dd/yyyy` under the capture browser's en-US locale and `zz.ll.aaaa` in a
Romanian one.

The `firme-*` captures of a section rather than a whole page were taken with
the element screenshot, so the sticky site header floats over the top of a
few of them. That is an artefact of capturing one element out of a page, not
a layout fault: on the page itself the header sits above the section.

**The last three were rendered through a throwaway route**, not from a live
database: this checkout cannot reach a Supabase instance, and the rates are
unpublished everywhere until the team publishes them. The figures in them are
the placeholder rows seeded by migration `20260917170000`, and the components
are the real ones — but the admin shot is missing the staff sidebar that the
`/admin` layout wraps around it. Re-take them from a preview deployment once
somebody publishes, and this note goes.

The two board captures and the two of `/cont/cereri` were rendered the same
way, through a throwaway route deleted before the commit: the exchange has no
published requests yet, and a screenshot of an empty board is already in the
list above it. The cards are the real components and the rows are shaped like
real ones. Everything else in the `cerere-noua-*` and `cereri-goale-*` set
came from the real pages, because the form and the empty board need no
database at all.

Date inputs in the `cerere-noua-*` captures read `mm/dd/yyyy`: Chromium
renders them in its own UI language, which here is en-US. A Romanian browser
shows `zz.ll.aaaa`.
