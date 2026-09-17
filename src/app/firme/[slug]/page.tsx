import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { RevealContactButton } from '@/components/departures/reveal-contact-button';
import { ReportButton } from '@/components/trust/report-button';
import { buttonClasses } from '@/components/ui/button';
import { Card, CountryTag, StatusBadge, type StatusTone } from '@/components/ui/primitives';
import { SUPPORT_EMAIL } from '@/config/brand';
import { ROUTES, departureRoute } from '@/config/routes';
import { directoryCopy } from '@/content/directory';
import { getAccountContext } from '@/lib/auth/account';
import {
  COMPANY_TYPE_LABELS,
  DOCUMENT_STATE_LABELS,
  monogram,
  monthYear,
  ratingLabel,
  scopeLabel,
  verifiedSinceLabel,
  type DocumentState,
  type PublicCompany,
} from '@/lib/directory';
import { companyLogoUrl, loadCompanyProfile, type CompanyRoute } from '@/lib/directory-source';
import { formatDateRo } from '@/lib/format';
import { pluralRo } from '@/lib/requests';
import { cn } from '@/lib/utils';

const c = directoryCopy.profile;

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const profile = await loadCompanyProfile(slug);
  if (!profile) return { title: c.back, robots: { index: false, follow: false } };

  return {
    title: c.metaTitle(profile.company.name, profile.company.city),
    description: c.metaDescription(profile.company.name),
    alternates: { canonical: `${ROUTES.companies}/${slug}` },
    // Nothing on this site is indexed before launch; the app-wide default
    // in the root layout says so, and this repeats it.
    robots: { index: false, follow: true },
  };
}

/** Reads the session for the contact button, so never prerendered. */
export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Params }) {
  const { slug } = await params;
  const [profile, context] = await Promise.all([loadCompanyProfile(slug), getAccountContext()]);

  // A firm that is suspended, not verified, or has opted out is simply not
  // there. A 403 with the word "suspendată" on it would publish a claim
  // about a real company that we do not make in public.
  if (!profile) notFound();

  const { company, documents, routes } = profile;
  const scope = scopeLabel(company);
  const rating = ratingLabel(company);

  return (
    <div className="mx-auto w-full max-w-[64rem] px-[clamp(16px,4vw,56px)] py-10 sm:py-14">
      <p className="text-sm">
        <Link
          href={ROUTES.companies}
          className="text-muted underline underline-offset-4 decoration-border-strong hover:text-foreground"
        >
          {c.back}
        </Link>
      </p>

      <header className="mt-6 flex flex-wrap items-start gap-5">
        <Logo company={company} logoUrl={companyLogoUrl(company.logoPath)} />
        <div className="min-w-0 flex-1">
          <h1 className="text-[clamp(1.5rem,3vw,2.25rem)] leading-tight">{company.name}</h1>
          <p className="mt-2 text-[0.9375rem] text-muted">
            {[company.city, company.county, COMPANY_TYPE_LABELS[company.companyType]]
              .filter(Boolean)
              .join(' · ')}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2.5">
            <StatusBadge tone="success">{directoryCopy.card.verified}</StatusBadge>
            {verifiedSinceLabel(company.verifiedSince) ? (
              <span className="text-[0.8125rem] text-muted">
                {verifiedSinceLabel(company.verifiedSince)}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      {company.description ? (
        <section aria-labelledby="despre" className="mt-10">
          <h2 id="despre" className="text-[1.125rem]">
            {c.about}
          </h2>
          <p className="mt-2 max-w-[62ch] text-[0.9375rem] leading-relaxed text-muted">
            {company.description}
          </p>
        </section>
      ) : null}

      <Shield company={company} documents={documents} scope={scope} />

      {rating ? (
        <section aria-labelledby="evaluari" className="mt-10">
          <h2 id="evaluari" className="text-[1.125rem]">
            {c.ratings.title}
          </h2>
          <p className="mt-2 flex items-baseline gap-3">
            <span className="font-display text-[2rem] leading-none font-light tabular-nums">
              {rating}
            </span>
            <span className="text-[0.9375rem] text-muted">
              {c.ratings.count(pluralRo(company.ratingCount, 'evaluare', 'evaluări'))}
            </span>
          </p>
        </section>
      ) : null}

      <Routes routes={routes} />

      <section aria-labelledby="contact" className="mt-10">
        <h2 id="contact" className="sr-only">
          {c.cta.quote}
        </h2>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <Link href={ROUTES.newRequest} className={buttonClasses('primary', 'md')}>
            {c.cta.quote}
          </Link>
          {/* The reveal is tied to a departure, because that is what the
              database charges a contact allowance against. With no active
              route there is nothing to reveal, and no button. */}
          {routes[0] ? (
            <div className="sm:max-w-[22rem]">
              <RevealContactButton
                truckListingId={routes[0].truckListingId}
                signedIn={context !== null}
              />
              <p className="mt-2 text-[0.8125rem] text-muted">{c.cta.contactNote}</p>
            </div>
          ) : null}
        </div>
      </section>

      <section aria-labelledby="raportare" className="mt-12 border-t border-border pt-8">
        <h2 id="raportare" className="text-[1.125rem]">
          {c.report.title}
        </h2>
        <p className="mt-2 max-w-[60ch] text-[0.9375rem] leading-relaxed text-muted">
          {c.report.body}
        </p>
        <ReportButton signedIn={context !== null} supportEmail={SUPPORT_EMAIL} />
      </section>
    </div>
  );
}

/**
 * The compliance shield: which documents are approved, and roughly how long
 * they run.
 *
 * States and months only. A client needs to know the papers are in order
 * and until when; the exact date and the file itself are the company's
 * business, and publishing them would hand anyone the particulars of a real
 * firm's paperwork.
 */
function Shield({
  company,
  documents,
  scope,
}: {
  company: PublicCompany;
  documents: { kind: string; label: string; state: DocumentState; validMonth: string | null }[];
  scope: string | null;
}) {
  return (
    <section aria-labelledby="conformitate" className="mt-10">
      <h2 id="conformitate" className="text-[1.125rem]">
        {c.shield.title}
      </h2>
      <p className="mt-2 max-w-[62ch] text-sm text-muted">{c.shield.lede}</p>

      <Card className="mt-5 p-5 sm:p-6">
        {documents.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {documents.map((document) => (
              <li
                key={document.kind}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border pb-3 last:border-b-0 last:pb-0"
              >
                <ShieldCheck size={16} aria-hidden="true" className="flex-none text-success" />
                <span className="min-w-0 flex-1 text-[0.9375rem]">{document.label}</span>
                {document.validMonth ? (
                  <span className="text-[0.8125rem] text-muted">
                    {c.shield.until(monthYear(new Date(document.validMonth)))}
                  </span>
                ) : null}
                <StatusBadge tone={TONES[document.state]}>
                  {DOCUMENT_STATE_LABELS[document.state]}
                </StatusBadge>
              </li>
            ))}
          </ul>
        ) : null}

        <dl className="mt-5 grid gap-3 border-t border-border pt-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <dt className="text-[0.8125rem] text-muted">{c.shield.vehicles}</dt>
            <dd className="font-mono text-[0.9375rem] tabular-nums">
              {company.compliantVehicles > 0
                ? pluralRo(company.compliantVehicles, 'platformă', 'platforme')
                : c.shield.noVehicles}
            </dd>
          </div>
          {scope ? (
            <div className="flex flex-col gap-1">
              <dt className="text-[0.8125rem] text-muted">{c.scope}</dt>
              <dd className="text-[0.9375rem]">{scope}</dd>
            </div>
          ) : null}
        </dl>

        <p className="mt-5 font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-muted">
          {company.lastCheckedAt
            ? c.shield.lastCheck(formatDateRo(company.lastCheckedAt))
            : c.shield.noCheck}
        </p>
      </Card>
    </section>
  );
}

const TONES: Record<DocumentState, StatusTone> = {
  valid: 'success',
  expiring_soon: 'warning',
  expired: 'danger',
};

function Routes({ routes }: { routes: CompanyRoute[] }) {
  return (
    <section aria-labelledby="trasee" className="mt-10">
      <h2 id="trasee" className="text-[1.125rem]">
        {c.routes.title}
      </h2>
      <p className="mt-2 text-sm text-muted">
        {routes.length > 0 ? c.routes.lede : c.routes.empty}
      </p>

      {routes.length > 0 ? (
        <ul className="mt-5 grid gap-3 sm:grid-cols-2">
          {routes.map((route) => (
            <li key={route.truckListingId} className="min-w-0">
              <Link
                href={departureRoute(route.truckListingId)}
                className={cn(
                  'flex h-full flex-col rounded-card border border-border bg-surface p-4',
                  'hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground',
                )}
              >
                <p className="text-[0.9375rem]">
                  <CountryTag cc={route.fromCountry} /> {route.fromCity}
                  <span className="mx-2 text-muted">→</span>
                  <CountryTag cc={route.toCountry} /> {route.toCity}
                </p>
                <p className="mt-2 text-[0.8125rem] text-muted">
                  {formatDateRo(route.availableFrom)}
                  {route.availableTo ? ` – ${formatDateRo(route.availableTo)}` : ''}
                </p>
                <p className="mt-1 text-[0.8125rem] text-muted">
                  {route.slotsFree > 0
                    ? c.routes.free(pluralRo(route.slotsFree, 'loc', 'locuri'))
                    : c.routes.full}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function Logo({ company, logoUrl }: { company: PublicCompany; logoUrl: string | null }) {
  if (logoUrl) {
    return (
      // Not next/image: an arbitrary storage URL capped at 1 MB, drawn at 72px.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        width={72}
        height={72}
        className="size-18 flex-none rounded-full border border-border object-cover"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-18 flex-none items-center justify-center rounded-full',
        'border border-border bg-ground-alt font-mono text-lg text-muted',
      )}
    >
      {monogram(company.name)}
    </span>
  );
}
