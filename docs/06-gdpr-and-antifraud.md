# GDPR and anti-fraud

## What personal data the platform holds

Most of the data is company data, which is not personal data. Three things
are, and they are what the compliance work is about.

| Data | Subject | Basis | Retention |
|---|---|---|---|
| Name, phone, e-mail of a company user | Employee of a customer | Contract (Art. 6(1)(b)) | Life of the account + 3 years |
| Name, phone of an individual poster | Private person | Contract | 12 months after the last listing |
| Driver name, phone, `atestat`, licence | Employee of a carrier | Legitimate interest of the carrier, processed by us | While employed + 1 year |
| Contact-reveal log | Whoever revealed | Legitimate interest — fraud prevention, billing | 24 months |
| Uploaded documents | Company, sometimes a named person | Legal obligation of the customer + contract | Account life + 3 years |
| Messages between users | Both parties | Contract | Account life |
| Transport contract versions and their acceptances: parties' names and contacts, who accepted, IP address and browser | Both parties | Contract; legitimate interest (proof of who accepted what) | As the transport. Erasure of a person or a firm anonymises their side of every version and acceptance in place, and deletes the drawn PDFs |

Company documents often carry a named administrator or driver. Treat
everything in the `documents` bucket as containing personal data.

## Practical requirements

**Host in the EU.** Create the Supabase project in `eu-central-1` (Frankfurt).
This is a one-time choice at project creation and cannot be changed later
without a migration — get it right on day one.

**Sign the processor agreements.** We are the processor for our client, who
is the controller. We in turn use sub-processors: Supabase, Anthropic, Twilio
or whichever WhatsApp provider, the e-mail sender, Vercel. List all of them in
the client's privacy policy and in our DPA with them.

**Anthropic and document content.** Uploaded documents are sent to the Claude
API for extraction. Under Anthropic's commercial terms API inputs are not used
for training, but this is a transfer to a sub-processor and must appear in the
privacy notice. If the client objects, the fallback is manual data entry by
the admin — slower, same outcome, no transfer.

**Private storage, always.** The `documents` bucket is private and its RLS
policies key on the first path segment (`<company_id>/<document_id>.<ext>`).
Never make it public, never serve documents through a long-lived signed URL —
generate short-lived ones (5 minutes) on demand.

**Deletion.** Account deletion must cascade. Most tables already
`ON DELETE CASCADE` from `profiles` and `companies`. Two things do not delete
automatically and need a written decision:
- Storage objects: Postgres cascade does not remove files. Add a deletion
  routine that empties the company folder.
- `transports` and invoices: commercial records with a legal retention period.
  Anonymise the personal fields, keep the transaction.
- `order_contracts` and `order_contract_acceptances` are immutable by trigger;
  erasure goes through `redact_order_contracts()` behind the session flag
  `app.contract_retention`, and removes the PDFs in `order-contracts`
  (`docs/20-contract-transport.md`).

**Right of access.** A user can ask what we hold. `contact_reveals` makes the
answer "who saw your phone number" actually answerable — build the export as a
small admin query before someone asks under time pressure.

**Consent is separate from contract.** `profiles.marketing_consent` is
opt-in and unticked by default. Transactional messages (document expiring,
account suspended) are contract, not marketing, and do not need it — do not
let them be suppressed by an unsubscribe.

**WhatsApp.** Business-initiated messages need approved Meta templates.
An expiry reminder is a utility template; a "new load on your route" alert is
marketing and needs its own opt-in. Keep them on separate templates so one
opt-out does not silence the other.

## Fraud: the actual risk

Freight fraud in Romania is concrete: a fake or hijacked carrier accepts a
load, collects it, and the goods vanish. A freight exchange that does not take
this seriously becomes the tool that made it easy. This is also, commercially,
exactly why a forwarder pays for the platform.

### What the build already does

| Control | Where |
|---|---|
| Company must exist and be active at ANAF | `verify-cui-anaf`, `anaf_is_inactive` |
| Blocking documents verified by a human before trading | `review_document()` |
| Expired document → automatic suspension | `run_compliance_sweep()` |
| No contact data without a verified, non-suspended account | `reveal_contact()` |
| Every reveal logged with who and when | `contact_reveals` |
| Individuals must verify a phone number | publish guards on `cargo_listings` |
| Ratings only after a real, delivered transport | `ratings_insert_party` policy |
| Reports with evidence upload | `reports` |

### What still needs doing

**Trust score.** `companies.trust_score` exists but nothing computes it.
Suggested formula, to run nightly:

```
 30  all blocking documents valid
 15  ANAF active, not struck off
 15  account older than 6 months
 20  average rating × 4  (0 when unrated)
 10  more than 5 completed transports
 10  no open reports
 -40 any upheld fraud report
```

Show it as a badge, not a number — "Verificat" / "Verificat, partener de
încredere". A visible 43/100 starts arguments; a missing badge starts an
upload.

**Watch for the hijack pattern.** The classic attack is a real, clean company
whose account is taken over, or a lookalike registered at the same address
with a one-letter difference in the name. Cheap signals to alert on:

- a new company whose `legal_name` is within one or two characters of an
  existing one
- several accounts sharing a phone number or an IP
- a dormant verified account that suddenly reveals 40 contacts in a day
- a document image uploaded with a file hash that already exists on another
  company — the strongest single signal, and trivial to store

**Rate-limit contact reveals** even on unlimited plans. "Unlimited" should
mean unlimited for a dispatcher, not for a scraper. A soft cap of ~50/day with
an alert costs nothing and catches the harvesting case.

**Keep a human in the loop.** For the first year, an admin should look at every
new carrier before the first deal. It does not scale and it does not need to —
by the time it hurts, there is enough data to automate the obvious cases.
