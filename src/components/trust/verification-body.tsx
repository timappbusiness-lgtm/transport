import Link from 'next/link';
import { ReportButton } from '@/components/trust/report-button';
import { EyebrowPill, Headline, Lede } from '@/components/ui/primitives';
import { SUPPORT_EMAIL } from '@/config/brand';
import { ROUTES } from '@/config/routes';
import { legalCopy } from '@/content/legal-copy';
import { verificationCopy } from '@/content/siguranta';
import {
  appliesTo,
  exemptVehicles,
  expiryEffect,
  graceLabel,
  remindersLabel,
  requiredDocuments,
  type PublicRequirement,
} from '@/lib/trust';
import { cn } from '@/lib/utils';

const c = verificationCopy;

/**
 * The page, given its data rather than fetching it.
 *
 * Split out so the arrangement can be rendered — in a test, in a preview —
 * without a database behind it. `src/app/verificare/page.tsx` is the only
 * thing that reads one.
 */
export function VerificationBody({
  requirements,
  reviewTimeLabel,
  signedIn,
}: {
  requirements: PublicRequirement[];
  reviewTimeLabel: string | null;
  signedIn: boolean;
}) {
  const documents = requiredDocuments(requirements);

  return (
    <div className="mx-auto w-full max-w-[72rem] px-[clamp(16px,4vw,56px)] py-10 sm:py-14">
      <header className="max-w-[46rem]">
        <EyebrowPill>{c.hero.eyebrow}</EyebrowPill>
        <Headline as="h1" strong={c.hero.strong} soft={c.hero.soft} className="mt-5" />
        <Lede className="mt-4">{c.hero.lede}</Lede>
      </header>

      <Steps />
      {documents.length > 0 ? <Documents documents={documents} /> : null}
      <Scope />
      <Report signedIn={signedIn} />
      <LegalLinks />
      <Faq reviewTimeLabel={reviewTimeLabel} />
    </div>
  );
}

/**
 * Five steps, numbered. A timeline rather than a paragraph because the
 * order is the point: nothing reaches a client before step three.
 */
function Steps() {
  return (
    <section aria-labelledby="pasi" className="mt-14">
      <h2 id="pasi" className="text-[1.125rem]">
        {c.steps.title}
      </h2>
      <ol className="mt-6 flex flex-col gap-6 sm:gap-0">
        {c.steps.items.map((step, index) => (
          <li key={step.title} className="flex gap-4 sm:gap-6">
            <div className="flex flex-none flex-col items-center">
              <span
                aria-hidden="true"
                className="flex size-8 items-center justify-center rounded-full border border-border-strong bg-surface font-mono text-[0.75rem] tabular-nums"
              >
                {index + 1}
              </span>
              {index < c.steps.items.length - 1 ? (
                <span aria-hidden="true" className="hidden w-px flex-1 bg-border sm:block" />
              ) : null}
            </div>
            <div className={cn('min-w-0', index < c.steps.items.length - 1 && 'sm:pb-6')}>
              <h3 className="text-[1rem] font-normal">{step.title}</h3>
              <p className="mt-1.5 max-w-[60ch] text-[0.9375rem] leading-relaxed text-muted">
                {step.body}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/**
 * The document table, rendered from `document_requirements`.
 *
 * Not a list somebody typed: these are the rows the compliance sweep reads
 * every night, so the page cannot promise a rule the platform does not
 * apply, or forget one it does.
 */
function Documents({ documents }: { documents: PublicRequirement[] }) {
  return (
    <section aria-labelledby="documente" className="mt-14">
      <h2 id="documente" className="text-[1.125rem]">
        {c.documents.title}
      </h2>
      <p className="mt-2 max-w-[60ch] text-sm text-muted">{c.documents.lede}</p>

      <div className="mt-6 hidden overflow-hidden rounded-card border border-border bg-surface sm:block">
        <table className="w-full border-collapse text-[0.9375rem]">
          <thead>
            <tr>
              {[c.documents.columns.document, c.documents.columns.scope, c.documents.columns.expiry].map(
                (heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className="border-b border-border px-5 py-3.5 text-left font-mono text-[0.625rem] font-normal uppercase tracking-[0.12em] text-muted"
                  >
                    {heading}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr key={`${doc.scope}-${doc.kind}`}>
                <th scope="row" className="border-b border-border px-5 py-3.5 text-left font-normal">
                  {doc.label_ro}
                  {doc.has_expiry && remindersLabel(doc.reminder_days) ? (
                    <span className="mt-1 block text-[0.8125rem] text-muted">
                      {c.documents.reminders(remindersLabel(doc.reminder_days) ?? '')}
                    </span>
                  ) : null}
                </th>
                <td className="border-b border-border px-5 py-3.5 align-top text-[0.875rem]">
                  {scopeText(doc)}
                  {exemptionText(doc) ? (
                    <span className="mt-1 block text-[0.8125rem] text-muted">
                      {exemptionText(doc)}
                    </span>
                  ) : null}
                </td>
                <td className="border-b border-border px-5 py-3.5 align-top text-[0.875rem] text-muted">
                  {expiryText(doc)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="mt-6 flex flex-col gap-3 sm:hidden">
        {documents.map((doc) => (
          <li key={`${doc.scope}-${doc.kind}`} className="rounded-card border border-border bg-surface p-4">
            <p className="font-medium">{doc.label_ro}</p>
            <p className="mt-1 text-[0.8125rem] text-muted">{scopeText(doc)}</p>
            {exemptionText(doc) ? (
              <p className="mt-1 text-[0.8125rem] text-muted">{exemptionText(doc)}</p>
            ) : null}
            <p className="mt-2 text-[0.8125rem]">{expiryText(doc)}</p>
            {doc.has_expiry && remindersLabel(doc.reminder_days) ? (
              <p className="mt-1 text-[0.8125rem] text-muted">
                {c.documents.reminders(remindersLabel(doc.reminder_days) ?? '')}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function scopeText(doc: PublicRequirement): string {
  const base = doc.scope === 'vehicle' ? c.documents.scopeVehicle : c.documents.scopeCompany;
  const only = appliesTo(doc);
  if (only === 'transport') return `${base} · ${c.documents.onlyTransport}`;
  if (only === 'forwarder') return `${base} · ${c.documents.onlyForwarder}`;
  return base;
}

/** The exemption, where there is one. Empty for a rule that has none. */
function exemptionText(doc: PublicRequirement): string | null {
  const vehicles = exemptVehicles(doc);
  return vehicles === null ? null : c.documents.except(vehicles);
}

function expiryText(doc: PublicRequirement): string {
  const effect = expiryEffect(doc);
  switch (effect.kind) {
    case 'none':
      return c.documents.noExpiry;
    case 'vehicle':
      return c.documents.blocksVehicle;
    case 'optional':
      return c.documents.optional;
    case 'company':
      return effect.graceDays > 0
        ? c.documents.blocksCompanyGrace(graceLabel(effect.graceDays))
        : c.documents.blocksCompany;
  }
}

/** What we check, what we cannot, and what that means for the reader. */
function Scope() {
  return (
    <section aria-labelledby="ce-verificam" className="mt-14">
      <h2 id="ce-verificam" className="text-[1.125rem]">
        {c.scope.title}
      </h2>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="rounded-card border border-border bg-surface p-5">
          <h3 className="text-[1rem] font-normal">{c.scope.weDo.title}</h3>
          <ul className="mt-3 flex flex-col gap-2">
            {c.scope.weDo.items.map((item) => (
              <li key={item} className="text-[0.9375rem] leading-relaxed text-muted">
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-card border border-border bg-surface p-5">
          <h3 className="text-[1rem] font-normal">{c.scope.weDont.title}</h3>
          <ul className="mt-3 flex flex-col gap-2">
            {c.scope.weDont.items.map((item) => (
              <li key={item} className="text-[0.9375rem] leading-relaxed text-muted">
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[0.8125rem] text-muted">{c.scope.weDont.note}</p>
        </div>
      </div>
      <p className="mt-5 max-w-[68ch] text-[0.9375rem]">{c.scope.caveat}</p>
    </section>
  );
}

function Report({ signedIn }: { signedIn: boolean }) {
  return (
    <section aria-labelledby="sesizare" className="mt-14">
      <h2 id="sesizare" className="text-[1.125rem]">
        {c.report.title}
      </h2>
      <p className="mt-2 max-w-[60ch] text-[0.9375rem] leading-relaxed text-muted">
        {c.report.body}
      </p>
      <ReportButton signedIn={signedIn} supportEmail={SUPPORT_EMAIL} />
    </section>
  );
}

/**
 * Four questions. The first one is absent when nobody has set what we can
 * promise about review times — a page that answers "how long does it take"
 * with a guess is worse than one that does not raise the question.
 */
/**
 * The documents, linked from the page that makes the claim.
 *
 * „Verificat" is a word with a precise meaning and a much larger implied
 * one, and the place that word is explained is exactly where somebody
 * should be able to read the sentence that limits it.
 */
function LegalLinks() {
  const l = legalCopy.verification;
  return (
    <section aria-labelledby="documente" className="mt-14 border-t border-border pt-10">
      <h2 id="documente" className="text-[1.125rem]">
        {l.title}
      </h2>
      <p className="mt-3 max-w-[62ch] text-sm leading-relaxed text-muted">{l.body}</p>
      <nav aria-label="Documente legale" className="mt-4 flex flex-wrap gap-5 text-sm">
        <Link href={ROUTES.terms} className="underline underline-offset-4">
          {l.terms}
        </Link>
        <Link href={ROUTES.privacy} className="underline underline-offset-4">
          {l.privacy}
        </Link>
        <Link href={ROUTES.cookies} className="underline underline-offset-4">
          {l.cookies}
        </Link>
      </nav>
    </section>
  );
}

function Faq({ reviewTimeLabel }: { reviewTimeLabel: string | null }) {
  return (
    <section aria-labelledby="intrebari" className="mt-14 border-t border-border pt-10">
      <h2 id="intrebari" className="text-[1.125rem]">
        {c.faq.title}
      </h2>
      <dl className="mt-6 grid gap-6 md:grid-cols-2">
        {reviewTimeLabel ? (
          <div>
            <dt className="font-medium">{c.faq.reviewTime.q}</dt>
            <dd className="mt-2 text-sm leading-relaxed text-muted">
              {c.faq.reviewTime.a(reviewTimeLabel)}
            </dd>
          </div>
        ) : null}
        {c.faq.items.map((item) => (
          <div key={item.q}>
            <dt className="font-medium">{item.q}</dt>
            <dd className="mt-2 text-sm leading-relaxed text-muted">{item.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
