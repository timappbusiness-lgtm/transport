# The transport contract

Faza 3 starts here. When an order exists, either party — or staff — can
generate a transport contract filled in from the data the platform
already holds and has checked. Each party accepts it with their account.
It replaces the blank template a carrier fills by hand, and it is the
first document in the file if anything goes wrong.

The contract text is a **draft for legal review**; every PDF says so on
its first page. What the lawyer has to check, clause by clause, is item 8
of `docs/09-verificare-juridica.md`.

## Where each piece lives

| Piece | Where |
|---|---|
| Tables, RPCs, bucket, retention | `supabase/migrations/20261009100000_contract_transport.sql` |
| Access and immutability checks | `supabase/tests/rls_test.sql`, block `CON` (43 checks) |
| The PDF: model, template, renderer | `supabase/functions/contract-pdf/` |
| Contract text, version 1.0 | `supabase/functions/contract-pdf/templates/contract-1.0.ts` |
| Card on the order page | `src/components/orders/contract-card.tsx`, `contract-forms.tsx` |
| Server actions | `src/app/cont/transporturi/contract-actions.ts` |
| Open / download | `src/app/cont/transporturi/[id]/contract/[contractId]/route.ts` |
| Staff record | `src/components/admin/order-contracts.tsx` on `/admin/transporturi/[id]` |
| E-mails | `contract_generated`, `contract_accepted` in `outbox-dispatcher/templates.ts` |
| Words | `src/content/contract.ts` |

## What the database does

**A version is a snapshot.** `generate_order_contract(order, operator)`
builds one jsonb from its own tables — the order, the accepted offer, the
request and the vehicle carried, both parties, the carrier's approved
documents with their numbers and dates, the vehicle on the order (or the
one offered, until one is assigned) with its ITP, RCA and copie conformă —
and stores it with its SHA-256. Nothing is read from the tables again when
the PDF is drawn, so a document never changes because the data behind it
did. The one value that does not come from a table is the operator's own
block, from `src/config/company.ts`; the database keeps only the known
keys, trimmed to 200 characters.

**Versions.** Regenerating creates version N+1; earlier versions stay,
unchanged and downloadable. Only the latest can be accepted. At most 30
per order.

**Who.** A party to the order (the carrier's managers and dispatchers,
the client — a person or a firm's managers) or staff may generate and
read. Drivers are not parties. Everybody else gets P0002 — the same answer
as for an id that does not exist — and the app turns it into a 404.

**Acceptance.** `accept_order_contract(contract, ip, user_agent)` records,
once per side per version: the side, the account, the person's name, the
firm they accept for, the time, the IP address (`inet`), the browser
string (400 characters) and the snapshot hash of the version. Staff cannot
accept for a party. The row is immutable; the parties can read the name
and time, never the IP or the browser — those are column-revoked and only
`admin_order_contracts()` returns them, to staff.

**Immutable.** A trigger refuses every update and delete on both tables,
for every role including `service_role`. The only exception is the
retention path below, behind the session flag `app.contract_retention`.

**Audit and notifications.** `contract.generated` and `contract.accepted`
go to `audit_log`. The other party gets an e-mail and a push; staff
generating notifies both. Both link to `/cont/transporturi/<id>#contract`.

**Retention.** Contracts live as long as the transport. When a person
deletes their account, or a firm is anonymised, `redact_order_contracts()`
replaces their name and contacts in every snapshot and acceptance, nulls
the IP and browser of their acceptances, marks the versions redacted and
deletes the drawn PDFs; the next download draws them again, with a notice
that data was anonymised.

## The PDF

`contract-pdf` is a Deno edge function. It is called by the Next route
with the user's own session:

1. `order_contract_render_data(contract)` with the caller's token — the
   access check.
2. If the file for this exact state exists in the private bucket
   `order-contracts`, sign it; otherwise draw it, upload it with the
   service role, and sign it. The bucket has no write policy: nobody but
   the function can put a file there.
3. Answer with a link that lives 60 seconds; the route redirects to it.

The object name carries everything that changes the pages —
`<order>/<contract>/v2-of3-t1.0-a3-r1.pdf`: the version, the newest
version (an older one says it was replaced), the template, how many
acceptances the footer shows, whether it was anonymised, and the renderer
revision. The same inputs draw byte-identical files (a unit test checks),
which is why the cache is safe.

**Speed.** About 0.3–0.4 s to draw the sample (six A4 pages, 35 KB) under
Node and under Deno; the unit test fails above 3 s.

**Layout.** A4, 20 mm margins, Inter at 9.5 pt body with the screen's
ratios (`small` 13/15, `h3` 17/15), the stylesheet's greys, a 3 pt grid
(the 4 px grid at 0.75 pt/px). No logo, no icon, no colour; a hairline
only where a table needs one. Every page's footer: contract number,
version, generation time, „Pagina x din n", and the acceptances of this
version and of the previous accepted one.

**Contents.** Draft notice; parties (firms: legal name, CUI with RO for
VAT payers, reg. com., seat, legal representative, contact; persons: name
and contact only, no CNP); the platform as intermediary and not a party;
object; the carrier's verified documents with numbers, validity and the
date checked, and the vehicle with plate, ITP, RCA and copie conformă;
route, windows, service level, vehicle carried (make, model, year,
running or not); price, currency, payment term, conditions from the
offer; obligations of each side; handover; damage and liability (CMR
abroad, Civil Code at home); force majeure and cancellation; disputes,
with consumer rights; personal data; applicable law; the electronic
acceptance, what it records and that it is not a qualified signature;
the acceptances.

## Libraries and licences

| What | Version | Licence | Why |
|---|---|---|---|
| pdfkit | 0.20.2 | MIT | Draws PDF from code, embeds and subsets TrueType fonts with a ToUnicode map, runs in Node and in Deno (`npm:pdfkit`). No paid service, no headless browser. |
| fontkit (pdfkit's dependency) | 2.x | MIT | Font parsing and subsetting. |
| Inter | 4.001 | SIL Open Font License 1.1 | The site's typeface; covers ă â î ș ț and the cedilla forms. Subset to Latin, Latin-1, Latin Extended-A, U+0218–021B and punctuation (`scripts/contract-fonts.sh`), embedded as base64 in `fonts.ts`. Licence text: `supabase/functions/contract-pdf/fonts/OFL.txt`; the copyright and licence stay in each font's name table. Inter reserves no font name, so the subset keeps it. |
| pdfjs-dist | 6.x | Apache 2.0 | Dev only: the unit tests read the PDF's text layer back. |

## Adding a template version

The text of `contract-1.0.ts` never changes once a contract has been
generated from it. A wording change is `contract-1.1.ts`, registered in
`templates/index.ts`, and a migration that makes
`contract_template_version()` return `'1.1'`. Existing versions keep
drawing with 1.0 — the model is chosen by the row's `template_version`.
`tests/unit/contract-model.test.ts` fails if the SQL version and the
current template disagree.

## Tests

- `supabase/tests/rls_test.sql`, block `CON`: generation, reading and
  acceptance by party, staff, driver, stranger and `anon`; one acceptance
  per side per version; snapshot immutability; regeneration; the storage
  policy; retention; the legal representative.
- `tests/unit/contract-model.test.ts`: mapping from the snapshot, fallbacks,
  version numbering, Romanian formatting, label maps against the app's.
- `tests/unit/contract-pdf.test.ts`: the text layer — diacritics with the
  comma below, amounts, dates, footers on every page — A4, the embedded
  font, byte-identical output, under 3 s, tokens against `globals.css`.
- `tests/unit/contracts.test.ts`: the card's decisions, IP and user agent.
- `supabase/functions/contract-pdf/*_test.ts`: the cache path, the request,
  drawing under Deno.
- `tests/e2e/contract-transport.spec.ts`: the card and the staff record at
  1280 and 390, from `/proba/ecrane?sectiune=contract`.
- `tests/e2e/contract-transport-supabase.spec.ts`: both parties, a third
  company by id, regeneration after a data change. Needs a Supabase.

## Not done here

- The product spec (`docs/01-product-spec.md`) still lists the PDF
  contract under „After the MVP"; the change is proposed in the pull
  request, as the spec rule requires.
- The contract is not sent as an e-mail attachment: the e-mail links to
  the card, where the PDF is drawn for the person who opens it.
- No qualified electronic signature. If the lawyer asks for one, it is a
  provider integration on top of this, not a replacement for it.
