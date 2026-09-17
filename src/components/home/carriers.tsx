import Link from 'next/link';
import { Check } from 'lucide-react';
import { CompanyCard } from '@/components/directory/company-card';
import { Container } from '@/components/layout/container';
import { buttonClasses } from '@/components/ui/button';
import { Card, Lede, SectionHead } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { directoryCopy } from '@/content/directory';
import { companyLogoUrl, loadHomepageDirectory } from '@/lib/directory-source';
import { showCompanyGrid } from '@/lib/directory';
import { formatCompanies } from '@/lib/trust';
import { formatNumber, pluralRo } from '@/lib/requests';
import { cn } from '@/lib/utils';

const c = directoryCopy.signup;

/**
 * The carrier's side of the homepage: what it costs, and who is already here.
 *
 * The price, the features and the trial are read from `plans` and
 * `homepage_settings` rather than written into the page — the team changes
 * a price in the admin screen and the homepage follows, with no deploy and
 * no chance of the two disagreeing. When there is no plan to read, the card
 * is absent: a subscription price is not something to state from memory.
 *
 * The grid below it is hidden entirely while there are fewer listed firms
 * than the threshold. Three cards do not show a marketplace, they show an
 * empty one.
 */
export async function Carriers() {
  const { companies, stats, thresholds, plan } = await loadHomepageDirectory();
  const showGrid = showCompanyGrid(companies, stats, thresholds);
  const showCount =
    stats !== null && stats.verifiedCompanies >= thresholds.statsMinCompanies;

  return (
    <section id="transportatori" className="bg-ground-alt">
      <Container className="py-16 sm:py-20">
        <div className="grid items-start gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
          <SectionHead eyebrow={c.eyebrow} strong={c.strong} soft={c.soft}>
            <Lede>{c.lede}</Lede>
            {showCount ? (
              <p className="mt-4 text-[0.9375rem] text-muted">
                {c.verifiedLine(formatCompanies(stats.verifiedCompanies))}
              </p>
            ) : null}
          </SectionHead>

          {plan ? (
            <Card className="min-w-0 p-6">
              <p className="font-mono text-[0.6875rem] uppercase tracking-[0.12em] text-muted">
                {plan.name}
              </p>
              <p className="mt-3 flex items-baseline gap-2">
                <span className="font-display text-[2.5rem] leading-none font-light tracking-[-0.03em]">
                  {formatNumber(plan.priceMonth)} {c.currency}
                </span>
                <span className="text-[0.9375rem] text-muted">{c.period}</span>
              </p>

              {plan.features.length > 0 ? (
                <ul className="mt-6 grid gap-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex gap-2.5 text-[0.9375rem] text-muted">
                      <Check size={16} className="mt-0.5 flex-none text-success" aria-hidden="true" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              <Link
                href={`${ROUTES.signUpCompany}?tip=transport`}
                className={cn(buttonClasses('primary', 'md'), 'mt-7 w-full')}
              >
                {c.cta}
              </Link>
              <Link
                href={`${ROUTES.signUpCompany}?tip=expeditie`}
                className={cn(buttonClasses('secondary', 'md'), 'mt-3 w-full')}
              >
                {c.secondary}
              </Link>
              <p className="mt-3 text-center text-[0.8125rem] text-muted">
                {thresholds.trialDays > 0
                  ? c.trial(pluralRo(thresholds.trialDays, 'zi', 'zile'))
                  : c.noTrial}
              </p>
            </Card>
          ) : null}
        </div>

        {showGrid ? (
          <div className="mt-14">
            <p className="text-[0.9375rem] text-muted">{c.gridNote}</p>
            <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {companies.map((company) => (
                <li key={company.slug} className="min-w-0">
                  <CompanyCard company={company} logoUrl={companyLogoUrl(company.logoPath)} />
                </li>
              ))}
            </ul>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link href={ROUTES.companies} className={buttonClasses('secondary', 'sm')}>
                {c.seeAll}
              </Link>
              <Link
                href={`${ROUTES.routes}?acoperire=intern`}
                className={buttonClasses('secondary', 'sm')}
              >
                {c.domestic}
              </Link>
              <Link
                href={`${ROUTES.routes}?acoperire=international`}
                className={buttonClasses('secondary', 'sm')}
              >
                {c.international}
              </Link>
            </div>
          </div>
        ) : null}
      </Container>
    </section>
  );
}
