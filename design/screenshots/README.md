# Screenshots

Captured with Chromium at a device pixel ratio of 2, at 1440 (desktop) and
390 (Pixel 7) CSS pixels.

| File | What it is |
|---|---|
| `home-1440.png`, `home-390.png` | The homepage. |
| `acasa-tarife-1440.png` | The homepage price band before the team publishes: no figures, one link. |
| `preturi-nepublicat-1440.png`, `preturi-nepublicat-390.png` | `/preturi` as it ships — nothing published, so no table and no calculator. |
| `preturi-1440.png`, `preturi-390.png` | `/preturi` with the rates published. |
| `admin-preturi-1440.png` | `/admin/preturi`, the staff screen. |

**The last three were rendered through a throwaway route**, not from a live
database: this checkout cannot reach a Supabase instance, and the rates are
unpublished everywhere until the team publishes them. The figures in them are
the placeholder rows seeded by migration `20260917104913`, and the components
are the real ones — but the admin shot is missing the staff sidebar that the
`/admin` layout wraps around it. Re-take them from a preview deployment once
somebody publishes, and this note goes.
