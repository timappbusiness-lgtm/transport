import Link from 'next/link';
import { directoryCopy } from '@/content/directory';
import { companyRoute } from '@/config/routes';
import {
  COMPANY_TYPE_LABELS,
  monogram,
  ratingLabel,
  scopeLabel,
  verifiedSinceLabel,
  type PublicCompany,
} from '@/lib/directory';
import { pluralRo } from '@/lib/requests';
import { cn } from '@/lib/utils';

const c = directoryCopy.card;

/**
 * One firm, as a card.
 *
 * Everything on it is a fact the database holds: the name, the city, the
 * count of vehicles whose papers are in date, and when the paperwork was
 * approved. There is no score out of five and no row of stars — the rating
 * appears only where there is a real one, and only once there are enough of
 * them to be an average rather than an opinion.
 */
export function CompanyCard({
  company,
  logoUrl,
  detailed = false,
}: {
  company: PublicCompany;
  /** null when the firm uploaded no logo: the card draws initials instead. */
  logoUrl: string | null;
  /** The directory shows a little more than the homepage grid does. */
  detailed?: boolean | undefined;
}) {
  const since = verifiedSinceLabel(company.verifiedSince);
  const rating = ratingLabel(company);
  const scope = scopeLabel(company);

  return (
    <Link
      href={companyRoute(company.slug)}
      className={cn(
        'group flex min-w-0 flex-col rounded-card border border-border bg-surface p-5',
        'hover:border-border-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground',
      )}
    >
      <div className="flex items-start gap-3">
        <Logo company={company} logoUrl={logoUrl} />
        <div className="min-w-0 flex-1">
          {company.city ? (
            <p className="font-mono text-[0.625rem] uppercase tracking-[0.12em] text-muted">
              {company.county && company.county !== company.city
                ? `${company.city} · ${company.county}`
                : company.city}
            </p>
          ) : null}
          <p className="mt-1 truncate font-medium leading-snug">{company.name}</p>
        </div>
      </div>

      {/* No shield here, and none anywhere near a company name.
          `docs/13-iconuri.md` uses this exact case to explain the rule:
          „un scut lângă numele unei firme arată ca o verificare pe care
          firma a câștigat-o". The word does the work. */}
      <p className="mt-4 inline-flex items-center gap-1.5 text-[0.8125rem] text-muted">
        <span className="text-foreground">{c.verified}</span>
        {rating ? <span aria-hidden="true">·</span> : null}
        {rating ? <span className="font-mono tabular-nums">{rating}</span> : null}
      </p>

      {detailed ? (
        <dl className="mt-3 grid gap-1 text-[0.8125rem] text-muted">
          {since ? (
            <div className="flex gap-1.5">
              <dt className="sr-only">{c.verified}</dt>
              <dd>{since}</dd>
            </div>
          ) : null}
          {company.compliantVehicles > 0 ? (
            <div className="flex gap-1.5">
              <dt className="sr-only">{COMPANY_TYPE_LABELS[company.companyType]}</dt>
              <dd>{c.vehicles(pluralRo(company.compliantVehicles, 'platformă', 'platforme'))}</dd>
            </div>
          ) : null}
          {scope ? (
            <div className="flex gap-1.5">
              <dt className="sr-only">{directoryCopy.profile.scope}</dt>
              <dd>{scope}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </Link>
  );
}

/**
 * The firm's logo, or its initials on a tinted disc.
 *
 * Never our own mark as a stand-in: a card carrying the platform's logo
 * where a company's should be reads as an endorsement nobody gave.
 */
function Logo({ company, logoUrl }: { company: PublicCompany; logoUrl: string | null }) {
  if (logoUrl) {
    return (
      // Not next/image: these are arbitrary storage URLs capped at 1 MB and
      // drawn at 44px, so the optimiser would cost a round trip to save
      // nothing, and it would need the Supabase host wired into the build.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt=""
        width={44}
        height={44}
        loading="lazy"
        decoding="async"
        className="size-11 flex-none rounded-full border border-border object-cover"
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex size-11 flex-none items-center justify-center rounded-full',
        'border border-border bg-ground-alt font-mono text-[0.8125rem] text-muted',
      )}
    >
      {monogram(company.name)}
    </span>
  );
}
