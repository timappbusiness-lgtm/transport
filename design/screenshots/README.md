# Screenshots

Captured with Chromium at a device pixel ratio of 2, at 1440 (desktop) and
390 (Pixel 7) CSS pixels.

| File | What it is |
|---|---|
| `home-1440.png`, `home-390.png` | The homepage. |
| `admin-verificare-1440.png`, `admin-verificare-390.png` | `/admin/documente`, the review queue. |

**The review queue shots were rendered through a throwaway route**, not from
a live database: this checkout cannot reach a Supabase instance, so there is
no queue to photograph and no staff session to open it with. The components
are the real ones and the rows are shaped like real ones. Two things differ
from what a reviewer will see: the staff sidebar that the `/admin` layout
wraps around the page, and the date input, which renders `mm/dd/yyyy` under
the capture browser's en-US locale and `zz.ll.aaaa` in a Romanian one.
