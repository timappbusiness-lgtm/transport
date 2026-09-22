# Working agreement

Coridor — a Romanian vehicle transport marketplace. Next.js app in `src/`,
Supabase database in `supabase/`, n8n workflows in `n8n/`.

## Session rules

Two places work on this repository at once — Claude Code and VS Code on the
Mac — so these come first. They exist so that neither place is ever
surprised by what the other did.

1. **Start by looking at the remote.** `git fetch --all --prune`, switch to
   `main`, pull. List the open pull requests **and the files each one
   touches**. Then say out loud which area this session is taking, before
   writing anything.
2. **One branch per task**, named `feature/<area>` or `fix/<area>`. Never
   work on `main`. Never reuse another open pull request's branch unless you
   are asked to continue that specific piece of work.
3. **Stop and ask when another open pull request touches the same files.**
   Not "work around it" — ask. These are the files where two sessions
   collide worst, because everything imports them:

   - `src/app/globals.css`
   - `src/config/routes.ts`
   - `src/components/layout/site-header.tsx`
   - `src/lib/auth/`
   - `middleware.ts`
   - `supabase/migrations/`

4. **Commit and push after every working step**, not only at the end. An
   unpushed commit is invisible to the other place, and two people building
   the same thing twice costs more than any merge conflict.
5. **Migrations carry the current timestamp.** Before merging, rebase on
   `main`; if `main` gained a newer migration in the meantime, rename yours
   so it sorts after it and re-run `pnpm db:test`. Two migrations that
   disagree about their order apply in one sequence locally and another on
   the project.
6. **Before merging: rebase on `main`, every check green.** No exceptions,
   including for a one-line change.
7. **End by pushing, updating the pull request description with what is done
   and what remains, and reporting the link.** The description is how the
   other place picks the work up.
8. **Continuing work started elsewhere:** fetch, check out the existing
   branch, and **read its pull request description first**. It says where
   the other place stopped and why.

One more, learned the hard way: **one session per phase.** Two sessions on
phase 1 produced two complete implementations and a reconciliation that cost
more than the feature.

## Which phase we are in

**Faza 2, the offer flow.** Started 21 September 2026.

Faza 1 is **code-complete**: everything still open in it depends on
configuration outside the repository — the e-mail provider, SMTP in
Supabase Auth, the operator's legal details, the indicative prices, the
legal review — and on two decisions, the payment processor and the
production Supabase project. The list with an owner against each line is
`docs/faza-1-checklist.md`; the steps themselves are
`docs/configurare-externa.md`. **No more Faza 1 code work is expected.**

Faza 2 starts with offers and stops there for now. Order execution
screens, proof of delivery, ratings and general messaging are the phases
after it — the tables exist for all of them, and a table is not a
feature. `src/lib/features.ts` is what decides whether a menu item may
appear, and it is the file to change when one of those becomes real.

The one thing Faza 2 borrows from messaging is the clarification thread
on a single offer, with contact details masked in the database until an
offer is accepted.

## Sources of truth

- `docs/01-product-spec.md` — what the product does. Changes are shown as a
  diff and approved before they are written.
- `docs/04-roadmap.md` — which phase each requirement belongs to. One pull
  request per phase.
- `prompts/` is archived specification from the Lovable period. Read it for
  intent; never run it, never update it.

## Database

- **New migration files only.** Never edit a migration that has been merged.
- **Business rules are enforced in Postgres.** The frontend is not a security
  boundary; a check in a component is a convenience, the trigger or policy is
  the rule.
- **Every new function needs explicit grants in its migration.** Default
  privileges grant EXECUTE to nobody (migration `20260916130300`). Grant each
  function to exactly the roles that call it: policy helpers to the roles the
  policy applies to, RPCs to `authenticated`, jobs to `service_role`, trigger
  and internal functions to nobody.
- **Every policy, grant or protection gets a check in
  `supabase/tests/rls_test.sql`** that runs the action as `authenticated`,
  `anon` or `service_role` — never as superuser, which skips RLS. A fix check
  must fail on the schema before the migration and pass after it.
- Users never write state transitions directly: status changes, approvals,
  orders and ownership go through SECURITY DEFINER RPCs that check the caller
  and write to `audit_log`.
- Keep existing schema names (`curse`, `retur`, `pe_sens`, …). No renames.

## Securitate

Regulile de aici nu sunt generalități. Fiecare vine dintr-un bug care a
existat în proiectul ăsta și este scrisă cu prețul lui. Auditul întreg este
`docs/12-audit-securitate.md`; gărzile care le țin sunt în
`supabase/tests/security_test.sql` și cad CI-ul dacă una se rupe.

1. **`current_user` într-o funcție `SECURITY DEFINER` este proprietarul
   funcției, niciodată apelantul.** A apărut de cinci ori. O condiție pe el
   ori nu se declanșează niciodată (portiță moartă), ori se declanșează
   întotdeauna (gardă moartă) — și în ambele cazuri tăcut. Testul corect al
   apelantului este `auth.uid()`, sau un **flag de sesiune** pus de cine are
   voie: `app.audit_retention`, `app.rating_write`, `app.evidence_retention`.
   Într-o funcție `SECURITY INVOKER`, `current_user` chiar este apelantul și
   se poate folosi.

2. **API-ul este suprafața de atac, nu ecranul.** Cheia `anon` este publică
   — stă în pachetul din browser. PostgREST servește fiecare tabelă, vedere
   și funcție cu drept de execuție, folosită de aplicație sau nu. Înainte să
   adaugi o vedere sau un `grant`, întreabă ce întoarce un `GET` pe ea cu
   cheia aceea.

3. **Un `grant` și o politică sunt două lucruri.** RLS care întoarce zero
   rânduri este suficient — până nu mai este. `anon` nu are `select` pe o
   tabelă fără politică pentru el, și nu are `insert`, `update` sau `delete`
   nicăieri. Două lucruri trebuie să meargă prost, nu unul.

4. **Un bucket public nu are RLS la descărcare, iar `select` pe
   `storage.objects` este API-ul de listare.** O politică de forma
   `bucket_id = '...'` și nimic altceva lasă pe oricine să enumere tot
   bucketul. Pozele private se servesc cu URL semnat, dintr-un bucket privat.

5. **O vedere `security_invoker = off` citește — și scrie — pe lângă RLS.**
   Singurul ei filtru este `where`-ul ei. Dacă trebuie să respecte o opțiune
   a utilizatorului — `public_profile_enabled`, `visibility` — filtrul acela
   se scrie explicit, sau vederea nu se dă lui `anon`. Modelul curat este
   `v_requests_private`: nu se dă nimănui, se citește numai printr-o funcție
   care verifică dreptul.

   Partea de scriere a costat o firmă ștearsă de `anon` într-o probă: o
   vedere care este o proiecție simplă dintr-o singură tabelă este
   **scriibilă automat**, iar implicitul Supabase îi dă lui `anon` și lui
   `authenticated` `insert`, `update` și `delete` pe ea. O interogare de
   catalog scrisă cu `relkind = 'r'` nu vede nicio vedere — și exact așa a
   trecut C2 pe lângă audit, pe lângă migrarea de revocare și pe lângă
   garda ei. Când numeri granturi, numără și `'v'`.

6. **Când ascunzi ceva, numără ușile.** O cerere privată se ajunge prin
   pagină, prin ofertele de pe ea, prin firul de mesaje, prin datele de
   contact și prin pozele din storage. Toate trebuie să întrebe aceeași
   funcție. Prima dată am găsit trei din cinci.

7. **404, nu 403, pentru ce nu ai voie să știi că există.** Un „nu ai voie"
   confirmă rândul.

8. **Fiecare funcție nouă: `search_path` fixat și grant explicit.** Fără
   `search_path`, cine poate crea un obiect într-o schemă de pe cale poate
   deturna un apel din interiorul funcției.

9. **Datele personale nu sunt doar în tabela lor.** `audit_log.before` și
   `.after` sunt instantanee întregi de rânduri, iar tabela nu are chei
   străine, deci nu cascadează nimic. Ștergerea la cerere trebuie să treacă
   pe acolo, și prin storage.

10. **O interogare de catalog care numără `relkind = 'r'` numără tabele, nu
    relații.** C2 a trecut pe lângă audit, pe lângă migrarea care revoca
    granturile **și** pe lângă garda scrisă ca să prindă exact clasa aia —
    toate trei întrebau `'r'`, iar `v_public_companies` este `'v'`. Trei
    plase cu aceeași gaură nu sunt trei plase.

    Felurile de relație sunt cinci și se numără dintr-un singur loc,
    `sec_relkinds` din `supabase/tests/security_test.sql`: `'r'` tabelă,
    `'p'` partiționată, `'f'` străină — astea pot purta RLS; `'v'` vedere și
    `'m'` vedere materializată — astea **nu**. Orice gardă sau revocare
    nouă se leagă de tabela aia, nu își scrie propria listă.

    Ce decurge din despărțire:

    - Pe ce poate purta RLS: RLS pornită, cel puțin o politică, `anon` fără
      `select` acolo unde nu are politică.
    - Pe ce nu poate: **niciun** drept de scriere pentru `anon` sau
      `authenticated`, fiindcă nu îl ține nimic — o vedere
      `security_invoker = off` scrie cu drepturile proprietarului, iar o
      vedere care este o proiecție simplă dintr-o tabelă este scriibilă
      automat, fără să fi cerut cineva asta.
    - O vedere citibilă de `anon` are ori `security_invoker = on`, ori un
      `where` al ei. Fără niciuna, servește tabela întreagă oricui are
      cheia din pachetul browserului.

    **Orice migrare care adaugă o vedere își revocă singură ce a primit din
    oficiu**, altfel garda cade în CI:

    ```sql
    revoke insert, update, delete, truncate, references, trigger
      on public.v_noua from anon, authenticated;
    ```

    Implicitul Supabase nu se poate închide la sursă pentru `authenticated`:
    `alter default privileges ... on tables` nu deosebește o vedere de o
    tabelă, iar pe tabele `authenticated` chiar scrie, sub politici.

## Commands

```bash
pnpm dev               # http://localhost:3000
pnpm typecheck && pnpm lint && pnpm test
pnpm test:e2e          # Playwright
pnpm db:test           # throwaway Postgres: every migration, smoke + RLS suites
pnpm test:functions    # Deno tests for the edge functions
pnpm check:functions   # Deno type-check for the edge functions
```

## Conventions

- The brand name lives only in `src/config/brand.ts`; internal links only in
  `src/config/routes.ts`.
- UI copy is Romanian with correct diacritics; regulatory terms stay Romanian
  (`copie conformă`, `ITP`, `RCA`). Code and technical docs are English.
- Never show invented numbers as real data. Samples are labelled as samples,
  estimates as estimates.
- Nothing is created or changed on a remote Supabase or Vercel project without
  an explicit go-ahead.
