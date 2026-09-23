import Link from 'next/link';
import { DepartureCard } from '@/components/departures/departure-card';
import { FaqAccordion } from '@/components/faq/accordion';
import { RequestCard } from '@/components/requests/request-card';
import { buttonClasses } from '@/components/ui/button';
import { Card } from '@/components/ui/primitives';
import { SITE_URL } from '@/config/brand';
import { ROUTES } from '@/config/routes';
import { seoCopy } from '@/content/transport-auto';
import { formatAmount } from '@/lib/pricing';
import { formatNumber, pluralRo } from '@/lib/requests';
import type { SeoPageData } from '@/lib/seo-data-source';
import { breadcrumbJsonLd, faqJsonLd } from '@/lib/seo-jsonld';
import { prefillQuery } from '@/lib/price-prefill';
import {
  boardHref,
  breadcrumbs,
  pageHref,
  pageSubject,
  prefillFor,
  requestHref,
  type SeoPage,
} from '@/lib/seo-pages';

const c = seoCopy;

/**
 * A landing page, given its row and its live data rather than fetching
 * them — the same shape as the other bodies in this codebase, which is
 * what lets a populated state be rendered without a database.
 *
 * Every block that can be empty renders its empty state rather than
 * disappearing. A landing page that hides its empty sections looks
 * identical whether the marketplace has ten carriers or none, and the
 * whole argument for these pages is that we can show the real number.
 */
export function SeoPageBody({
  page,
  data,
  related,
  now,
}: {
  page: SeoPage;
  data: SeoPageData;
  related: SeoPage[];
  /** Passed in so the server and a test agree on what "now" means. */
  now: Date;
}) {
  const trail = breadcrumbs(page, c.breadcrumbHome);
  const faqEntries = page.faq.map((item, index) => ({
    id: `q${index}`,
    question: item.q,
    answer: [item.a],
  }));

  const faqLd = faqJsonLd(page.faq);
  const crumbLd = breadcrumbJsonLd(trail, SITE_URL);

  return (
    <div className="mx-auto w-full max-w-[64rem] px-[clamp(16px,4vw,56px)] py-8 sm:py-12">
      {crumbLd ? <JsonLdScript json={crumbLd} /> : null}
      {faqLd ? <JsonLdScript json={faqLd} /> : null}

      <Breadcrumbs trail={trail} />

      <header className="mt-6">
        <h1 className="text-h1 leading-tight">
          {page.h1}
          {page.h1Soft ? <span className="text-ink-soft"> {page.h1Soft}</span> : null}
        </h1>
        <p className="mt-4 max-w-[64ch] text-body-lg leading-relaxed text-muted">
          {page.intro}
        </p>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Link
            href={requestHref(page, ROUTES.newRequest)}
            className={buttonClasses('primary', 'md')}
          >
            {c.cta.publish}
          </Link>
          <Link href={ROUTES.routes} className={buttonClasses('secondary', 'md')}>
            {c.cta.departures}
          </Link>
        </div>
        <p className="mt-3 text-small text-muted">{c.cta.publishNote}</p>
      </header>

      <Facts data={data} />
      <Price page={page} data={data} />
      <Requests page={page} data={data} now={now} />
      <Departures data={data} />
      <Companies data={data} />

      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        <Summary
          title={c.documents.title}
          body={c.documents.body}
          href={ROUTES.verification}
          link={c.documents.link}
        />
        <Summary
          title={c.verification.title}
          body={c.verification.body}
          href={ROUTES.verification}
          link={c.verification.link}
        />
      </div>

      {faqEntries.length > 0 ? (
        <section aria-labelledby="intrebari" className="mt-12">
          <h2 id="intrebari" className="text-xl">
            {c.faq.title}
          </h2>
          <FaqAccordion entries={faqEntries} className="mt-4" />
        </section>
      ) : null}

      <Related page={page} related={related} />
    </div>
  );
}

function JsonLdScript({ json }: { json: object }) {
  return (
    <script
      type="application/ld+json"
      // The content is built from our own rows by `seo-jsonld.ts`, and
      // JSON.stringify escapes what it must. `<` is escaped by hand so a
      // question containing one cannot close this tag early.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(json).replace(/</g, '\\u003c'),
      }}
    />
  );
}

function Breadcrumbs({ trail }: { trail: { label: string; href: string | null }[] }) {
  return (
    <nav aria-label="Navigare" className="text-small">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {trail.map((step, index) => (
          <li key={step.label} className="flex items-center gap-2">
            {index > 0 ? (
              <span aria-hidden="true" className="text-border-strong">
                /
              </span>
            ) : null}
            {step.href === null ? (
              <span aria-current="page" className="text-muted">
                {step.label}
              </span>
            ) : (
              <Link
                href={step.href}
                className="text-muted underline underline-offset-4 decoration-border-strong hover:text-foreground"
              >
                {step.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Facts({ data }: { data: SeoPageData }) {
  if (!data.facts) return null;
  const f = data.facts;

  return (
    <section aria-labelledby="date" className="mt-10">
      <h2 id="date" className="sr-only">
        {c.facts.distance}
      </h2>
      <Card className="flex flex-wrap gap-x-10 gap-y-4 px-5 py-4 sm:px-6">
        <div>
          <p className="text-small text-muted">{c.facts.distance}</p>
          <p className="mt-0.5 font-display text-figure-sm tabular-nums text-accent">
            {c.facts.distanceValue(`${formatNumber(f.km)} km`)}
          </p>
        </div>
        <div>
          <p className="text-small text-muted">{c.facts.duration}</p>
          <p className="mt-0.5 font-display text-figure-sm tabular-nums text-accent">
            {c.facts.durationValue(String(f.hours))}
          </p>
        </div>
        <p className="w-full max-w-[60ch] text-small text-muted">
          {f.isExample ? `${f.fromName} — ${f.toName}, ${c.facts.example}. ` : ''}
          {c.facts.durationNote}
        </p>
      </Card>
    </section>
  );
}

function Price({ page, data }: { page: SeoPage; data: SeoPageData }) {
  return (
    <section aria-labelledby="pret" className="mt-10">
      <h2 id="pret" className="text-xl">
        {c.price.title}
      </h2>

      {data.price ? (
        <Card className="mt-4 px-5 py-5 sm:px-6">
          <p className="font-display text-h1 leading-none font-light">
            {c.price.from(formatAmount(data.price.low, data.price.currency))}
          </p>
          <p className="mt-3 max-w-[62ch] text-small text-muted">
            {data.facts?.isExample ? `${c.price.example} ` : ''}
            {c.price.note}
          </p>
        </Card>
      ) : (
        <p className="mt-3 max-w-[62ch] text-body text-muted">{c.price.unpublished}</p>
      )}

      <p className="mt-4">
        <Link
          href={`${ROUTES.prices}${priceQuery(page)}`}
          className="text-body link-accent"
        >
          {c.price.calculator}
        </Link>
      </p>
    </section>
  );
}

/**
 * The calculator, opened on this page's route where there is one.
 *
 * The same prefill keys the request form reads, because the calculator and
 * the form were built to hand work to each other — a landing page just
 * joins the chain one link earlier.
 */
function priceQuery(page: SeoPage): string {
  return prefillQuery(prefillFor(page));
}

function Requests({
  page,
  data,
  now,
}: {
  page: SeoPage;
  data: SeoPageData;
  now: Date;
}) {
  return (
    <section aria-labelledby="cereri" className="mt-12">
      <h2 id="cereri" className="text-xl">
        {c.requests.title}
      </h2>
      <p className="mt-1 text-small text-muted">{c.requests.lede}</p>

      {data.requests.length > 0 ? (
        <>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {data.requests.map((request) => (
              <li key={request.id} className="min-w-0">
                <RequestCard request={request} now={now} as="div" />
              </li>
            ))}
          </ul>
          <p className="mt-4">
            <Link
              href={boardHref(page, ROUTES.requests)}
              className="text-body link-accent"
            >
              {c.requests.all}
            </Link>
          </p>
        </>
      ) : (
        <EmptyBlock
          body={c.requests.empty}
          href={requestHref(page, ROUTES.newRequest)}
          action={c.requests.emptyAction}
        />
      )}
    </section>
  );
}

function Departures({ data }: { data: SeoPageData }) {
  // One „now" for the whole section, so every card on it agrees.
  const now = new Date();
  return (
    <section aria-labelledby="trasee" className="mt-12">
      <h2 id="trasee" className="text-xl">
        {c.departures.title}
      </h2>
      <p className="mt-1 text-small text-muted">{c.departures.lede}</p>

      {data.departures.length > 0 ? (
        <>
          <ul className="mt-5 flex flex-col gap-3">
            {data.departures.map((departure) => (
              <DepartureCard key={departure.truck_listing_id} departure={departure} now={now} />
            ))}
          </ul>
          <p className="mt-4">
            <Link
              href={ROUTES.routes}
              className="text-body link-accent"
            >
              {c.departures.all}
            </Link>
          </p>
        </>
      ) : (
        <EmptyBlock
          body={c.departures.empty}
          href={ROUTES.routes}
          action={c.departures.emptyAction}
        />
      )}
    </section>
  );
}

function Companies({ data }: { data: SeoPageData }) {
  return (
    <section aria-labelledby="firme" className="mt-12">
      <h2 id="firme" className="text-xl">
        {c.companies.title}
      </h2>

      {data.companies > 0 ? (
        <>
          <p className="mt-2 max-w-[62ch] text-body text-muted">
            {c.companies.count(pluralRo(data.companies, 'firmă verificată', 'firme verificate'))}
          </p>
          <p className="mt-4">
            <Link
              href={ROUTES.companies}
              className="text-body link-accent"
            >
              {c.companies.all}
            </Link>
          </p>
        </>
      ) : (
        <p className="mt-2 max-w-[62ch] text-body text-muted">{c.companies.empty}</p>
      )}
    </section>
  );
}

function EmptyBlock({
  body,
  href,
  action,
}: {
  body: string;
  href: string;
  action: string;
}) {
  return (
    <div className="mt-5 rounded-card border border-dashed border-border-strong bg-ground-alt px-5 py-6">
      <p className="max-w-[56ch] text-body text-muted">{body}</p>
      <Link href={href} className={`${buttonClasses('secondary', 'sm')} mt-4`}>
        {action}
      </Link>
    </div>
  );
}

function Summary({
  title,
  body,
  href,
  link,
}: {
  title: string;
  body: string;
  href: string;
  link: string;
}) {
  return (
    <section className="rounded-card border border-border bg-surface p-5">
      <h2 className="text-h3">{title}</h2>
      <p className="mt-2 text-body leading-relaxed text-muted">{body}</p>
      <p className="mt-3">
        <Link
          href={href}
          className="text-body link-accent"
        >
          {link}
        </Link>
      </p>
    </section>
  );
}

function Related({ page, related }: { page: SeoPage; related: SeoPage[] }) {
  if (related.length === 0) return null;

  return (
    <section aria-labelledby="legaturi" className="mt-12 border-t border-border pt-8">
      <h2 id="legaturi" className="text-h3">
        {c.related[page.type] ?? 'Vezi și'}
      </h2>
      <ul className="mt-4 flex flex-wrap gap-2">
        {related.map((other) => (
          <li key={other.slug}>
            <Link
              href={pageHref(other)}
              className="inline-flex rounded-pill border border-border px-3 py-1.5 text-small text-muted hover:border-border-strong hover:text-foreground"
            >
              {pageSubject(other)}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
