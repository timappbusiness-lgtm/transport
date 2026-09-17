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

**The ones showing populated data were rendered through a throwaway route**,
not from a live database: this checkout cannot reach a Supabase instance, and
most of these screens show their empty state until real rows exist. The
components are the real ones and the rows are shaped like real ones. Two
things differ from what a reviewer will see: the staff sidebar that the
`/admin` layout wraps around the admin pages, and date inputs, which render
`mm/dd/yyyy` under the capture browser's en-US locale and `zz.ll.aaaa` in a
Romanian one.
