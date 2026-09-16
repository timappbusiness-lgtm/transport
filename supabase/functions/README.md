# Edge functions

These run on **Deno** inside Supabase, not on Node inside Next.js.

`supabase/` is excluded from the app's `tsconfig.json` on purpose: `Deno`,
`npm:` and `jsr:` specifiers do not resolve under Node module resolution, so
including them makes `pnpm typecheck` fail on code that is correct for its own
runtime.

Type-check them with the Supabase CLI instead:

```bash
supabase functions serve parse-document   # runs them under Deno
deno check supabase/functions/**/index.ts # if you have Deno installed
```

Deploy:

```bash
supabase functions deploy parse-document
supabase functions deploy verify-cui-anaf
supabase functions deploy compliance-sweep
```
