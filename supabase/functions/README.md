# Edge functions

These run on **Deno** inside Supabase, not on Node inside Next.js.

`supabase/` is excluded from the app's `tsconfig.json` on purpose: `Deno`,
`npm:` and `jsr:` specifiers do not resolve under Node module resolution, so
including them makes `pnpm typecheck` fail on code that is correct for its own
runtime.

Type-check them with the Supabase CLI instead:

```bash
pnpm check:functions   # deno check on every index.ts
pnpm test:functions    # deno test, e.g. verify-cui-anaf/authorize_test.ts
supabase functions serve parse-document   # runs one under Deno
```

Both scripts go through `npx deno`, so Deno does not need to be installed.
`DENO_NO_PACKAGE_JSON=1` stops Deno from reading the app's `package.json` and
`node_modules`, which belong to Next.js.

`verify-cui-anaf` writes with the service role, which bypasses RLS. Before
saving a snapshot it asks the database, with the caller's JWT, whether the
caller manages the company, and checks that the CUI is that company's own
(`authorize.ts`).

Deploy:

```bash
supabase functions deploy parse-document
supabase functions deploy verify-cui-anaf
supabase functions deploy compliance-sweep
```
