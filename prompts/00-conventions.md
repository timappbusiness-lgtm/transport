# How to use this prompt pack

Eleven prompts, in order. Each one is a self-contained Lovable message that
adds a slice of the product without touching what came before.

## Rules — read once, then follow them for every prompt

1. **Run them in order.** Prompt 01 creates the project. Every prompt after it
   is additive and assumes the previous ones ran.
2. **One prompt, one message.** Do not merge two. Lovable is far more reliable
   when the change is bounded, and a bad merged prompt costs a rollback.
3. **Apply the SQL first.** Where a prompt depends on a table, the migration in
   `supabase/migrations/` must already be applied. The prompt says which.
4. **Check the app before moving on.** Each prompt ends with a checklist. A
   broken step compounds into the next three prompts.
5. **Never accept "let me refactor this".** If Lovable proposes restructuring
   files the prompt did not name, reply: *"No. Only change the files listed in
   my message."*
6. **Regenerate types after every migration.**
   ```bash
   supabase gen types typescript --project-id <id> --schema public \
     > src/integrations/supabase/types.ts
   ```
   Most "this worked yesterday" bugs are a stale types file.

## When you need to change something later

Never say "fix the listings page". Say which file, which change, and what to
leave alone:

> In `src/components/listings/CargoListingCard.tsx`, add a badge showing the
> payment term in days next to the price. Use the existing `Badge` component.
> Do NOT modify any other file. Do NOT change the card layout or the existing
> props.

Three parts, always: **exact file**, **exact change**, **what to preserve.**

## Project conventions Lovable must follow

These are repeated inside each prompt so they survive context loss, but keep
them in mind when writing your own.

- **UI language is Romanian**, with correct diacritics (ă, â, î, ș, ț).
  Code, comments, file names, variables, types: English.
- **Dates** display as `dd.MM.yyyy`, the Romanian convention. Store ISO.
- **Money** displays as `1.250,00 RON` — Romanian separators, `ro-RO` locale.
- **Weight** in kg, **volume** in m³, **loading metres** as `ldm`.
- Components: shadcn/ui only. No new UI library.
- Data access: `@supabase/supabase-js` through `src/integrations/supabase/client.ts`.
  Never call `fetch` against the REST endpoint directly.
- Server state: TanStack Query. One hook per entity, under `src/hooks/`.
- Every query handles three states explicitly: loading (skeleton), error
  (message with a retry), empty (what to do next, not a blank box).
- Never disable RLS to make something work. If a query returns nothing, the
  policy is the bug or the query is.

## Where the Romanian words go

Keep the regulatory terms in Romanian in the UI *and* in the enum values —
`copie_conforma`, `itp`, `rca`, `licenta_comunitara`. They are proper nouns of
Romanian law. A dispatcher searching for "copie conformă" will not find
"conform copy".

## File map after all eleven prompts

```
src/
  components/
    auth/          signup, login, phone OTP
    company/       onboarding, profile, ANAF lookup
    fleet/         vehicles, vehicle documents
    documents/     upload, status, expiry warnings
    listings/      cargo and truck cards, filters, forms
    offers/        offer form, offer list
    messaging/     conversation list, thread
    admin/         review queue, company management
    billing/       plan cards, quota indicators
    layout/        shell, nav, compliance banner
  hooks/           one per entity: useCompany, useDocuments, useCargoListings…
  pages/           route components
  lib/             formatters, constants, validation schemas
  integrations/supabase/  client.ts, types.ts (generated)
```
