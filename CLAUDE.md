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

## Continuity: nobody types anything twice

`/cerere/noua` kept its step in `useState`: a refresh on step 3 or the way
back from signing in landed on step 1. Looking for the same class of bug
found it in every form on the platform — a validation error that emptied
the form, a dropped connection that replaced it with the error page, an
expired session that redirected it away, a clarification button that
cleared its own text before sending it. The audit, flow by flow, with the
six interruptions each one now survives, is `docs/16-continuitate.md`.
A new screen follows these:

1. **A form uses `KeepingForm` and `useKeptActionState`**, never a bare
   `<form action={fn}>` or `useActionState`. A dropped connection, a
   server error, an expired session and a page left behind by a deploy
   become a sentence beside the fields; nothing is cleared. A form that
   should be empty after a success says so with `resetOn`.
2. **A step is in the address** (`?pas=`, `src/lib/continuity/steps.ts`),
   checked on arrival with `reachableStep`: a step whose earlier steps
   are incomplete shows the first incomplete one, without messages on
   steps nobody reached. Each step is a history entry.
3. **A long form keeps a draft** with `useFormDraft` (or `useDraft`,
   `useTextDraft`): in the browser always, on the account
   (`form_drafts`) once signed in, newest wins, with `DraftStatus` and
   `DraftRestored`. A new form key is added to `DRAFT_FORMS` **and** to the
   table's check constraint in a migration, or to `LOCAL_DRAFT_FORMS` when
   it stays in the browser. The action that finishes the form deletes the
   account copy (`deleteServerDraft`) and redirects with `doneUrl`, which
   clears the browser copy.
4. **A settings form asks once before leaving with unsaved changes**
   (`useUnsavedGuard`) and never after a successful save.
5. **Every way to sign in carries the way back.** Links use `withNext`;
   `next` goes through `safeNextPath` and lands with `returnPathAfterAuth`
   — internal paths only, never back onto a sign-in page. A page that
   sends people to sign in passes the exact place, step and filters
   included.
6. **An action never redirects to sign-in.** It calls
   `requireAccountContext` / `redirectToSignIn`, which throw the
   session-expired error inside an action; the form keeps its fields and
   offers a sign-in in a new tab. The middleware does not redirect server
   actions. The notice with that link comes with `KeepingForm` and the
   `/cont` and `/admin` shells — never the root layout, where one more
   client component left the 404 page blank one load in a few hundred.
7. **Every upload goes through `useUploadQueue`** (`src/lib/uploads/`):
   the file is in IndexedDB from the moment it is chosen until the server
   confirms it, each file shows its state with `UploadLine`, and a
   failure keeps it with „Încearcă din nou". The file is sent under an id
   chosen once on the device and the object path and row id come from
   it, so a retry or a reload never stores it twice. Photos the server
   re-encodes go through `/api/incarcare/[tip]`; photos are drawn down
   with `shrinkPhoto` first (4 MB ceiling).
8. **A list's filters, sort and page are in the address**, and a link that
   changes one keeps the others (`withParam`). A detail page links back to
   its board with `BackToBoard`. An e-mail links to the exact place — the
   conversation, the section, the anchor — not to a list.

## Layout: nothing changes because a neighbour did

Opening one question in the billing FAQ on /abonamente made the card
beside it grow to the same height, empty: a two-column grid, and a grid
row is as tall as its tallest cell. Looking for the same class found a
save bar and a message box hidden under the phone menu, a sheet whose
page scrolled behind it, fields that ended up under „Continuă", tables
clipped at tablet width and labels drawn over their values.
`tests/e2e/aspect-asezare.spec.ts` sweeps every screen for it at 1440
and 390; `tests/e2e/acordeon.spec.ts` holds the accordion.

1. **Accordions and expandable cards never affect their neighbours.**
   Opening one changes the height of that one; what is beside it keeps
   its height and its place. Only what is under it, in its own column,
   moves down.
2. **A grid of expandable items aligns to the start and never shares
   rows.** Two columns of them are two independent stacks
   (`splitColumns`, `FaqAccordion columns={2}`), not `grid-cols-2`. A grid
   of static cards may stretch to equal height; the moment a card can
   open, it leaves the grid.
3. **Wide content scrolls inside its own container** (`overflow-x-auto`
   on the wrapper), never the page and never clipped with
   `overflow-hidden`. Long names, localities, document names and numbers
   wrap (`min-w-0`, `[overflow-wrap:anywhere]`) or truncate with an
   ellipsis where the full text is one click away.
4. **A sticky or fixed bar never covers what it belongs to.** Inside the
   account a bottom bar sits at `bottom-[var(--bottom-bar,0px)]`, above
   the phone menu; a page with a bottom bar marks it (`data-action-bar`,
   `data-save-bar`) so a focused field scrolls clear of it
   (`scroll-padding-bottom` in `globals.css`).
5. **A sheet or a dialog locks the page behind it** (`lockScroll`),
   scrolls inside itself with a height limit, traps focus while open and
   gives it back on close. A menu or a dropdown gets a `max-h` and
   `overflow-y-auto`, so a phone held sideways still reaches its last
   item.
6. **Hover is for pointers that hover.** Tailwind's `hover:` already is;
   a hand-written `:hover` goes inside `@media (hover: hover)`, or a tap
   on a phone leaves it stuck.
7. **Every control is at least 24×24 CSS px**, or has room around it
   (WCAG 2.5.8, the sweep checks it). A link inside a sentence is exempt.

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
- **Icons help scanning; they never decorate a serious moment.** One map,
  `src/lib/icons.ts`, and one component, `<Icon>` — `lucide-react` is
  imported in that one file and nowhere else, which a test enforces. Never an icon as the only meaning, never one on
  a legal page, a suspension, a rejection, a dispute, a deletion, an
  error or a destructive confirmation, and never one that could read as
  an official seal. No emoji anywhere in the interface. The whole rule,
  with the reasons, is `docs/13-iconuri.md`.
- **A new screen states its purpose in one sentence, shows at most
  three primary controls above the fold, and keeps advanced options one
  click away.** A transport professional told us the platform was hard
  to connect and had to be far simpler; `/cereri` was putting thirteen
  form fields on screen, twelve of them above the fold, under 461 words
  of heading and lede, before a single request. Nothing is deleted to
  meet this — the tenth filter goes behind a disclosure that opens by
  itself when a link carries it, so a shared search still explains
  itself. The before/after count for every journey is
  `docs/15-simplitate.md`; the shape both boards take is
  `src/lib/board-simplicity.ts`.
- **The vehicle categories are one list**, `OFFERED_CATEGORIES` in
  `src/lib/vehicle-categories.ts`, with the weight hint and the price
  class on the same row as the label. The niche is what goes up on a car
  transporter: no boats, containers, agricultural or construction
  machinery, lorries, coaches, tractor units or semi-trailers. Values
  outside it stay in the enum and stay readable — `RETIRED_CATEGORIES` —
  because a published listing is a real listing.
- Nothing is created or changed on a remote Supabase or Vercel project without
  an explicit go-ahead.
