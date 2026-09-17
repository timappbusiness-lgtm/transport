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
