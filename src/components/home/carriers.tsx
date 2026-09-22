import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { uiIcon } from '@/lib/icons';
import { CompanyCard } from '@/components/directory/company-card';
import { Container } from '@/components/layout/container';
import { buttonClasses } from '@/components/ui/button';
import { Card, Lede, SectionHead } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { directoryCopy } from '@/content/directory';
import {
  companyLogoUrl,
  loadHomepageDirectory,
  type HomepageDirectory,
} from '@/lib/directory-source';
import {
  cardFeatures,
  formatLei,
  highlightedPlan,
  type Plan,
  type PricingSettings,
} from '@/lib/plans';
import { loadPricing } from '@/lib/plans-source';
import { showCompanyGrid } from '@/lib/directory';
import { formatCompanies } from '@/lib/trust';
import { pluralRo } from '@/lib/requests';
import { cn } from '@/lib/utils';
import { iconForContent } from '@/lib/icons';

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
  const [directory, pricing] = await Promise.all([loadHomepageDirectory(), loadPricing()]);

  return (
    <CarriersBody
      {...directory}
      plan={highlightedPlan(pricing.plans, 'carrier')}
      settings={pricing.settings}
    />
  );
}

/**
 * The section, given its data rather than fetching it — which is what lets
 * a populated state be rendered for a screenshot without a database, and
 * what keeps the layout testable.
 */
export function CarriersBody({
  companies,
  stats,
  thresholds,
  plan,
  settings,
}: HomepageDirectory & { plan: Plan | null; settings: PricingSettings }) {
  const showGrid = showCompanyGrid(companies, stats, thresholds);
  const showCount =
    stats !== null && stats.verifiedCompanies >= thresholds.statsMinCompanies;

  return (
    <section id="transportatori" className="bg-ground-alt">
      <Container className="py-16 sm:py-20">
        <div className="grid items-start gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
          <SectionHead eyebrow={c.eyebrow} icon={iconForContent('comanda')} strong={c.strong} soft={c.soft}>
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
                  {formatLei(plan.monthlyPrice)}
                </span>
                <span className="text-[0.9375rem] text-muted">{c.period}</span>
              </p>

              {cardFeatures(plan).length > 0 ? (
                <ul className="mt-6 grid gap-2.5">
                  {cardFeatures(plan).map((feature) => (
                    <li key={feature.key} className="flex gap-2.5 text-[0.9375rem] text-muted">
                      {feature.status === 'coming_soon' ? (
                        <Icon as={uiIcon('pending')} size="md" className="mt-0.5 text-muted" />
                      ) : (
                        <Icon as={uiIcon('check')} size="md" className="mt-0.5 text-success" />
                      )}
                      <span>
                        {feature.label}
                        {feature.status === 'coming_soon' ? (
                          <span className="text-muted"> · în curând</span>
                        ) : null}
                      </span>
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
                {settings.trialDays > 0
                  ? c.trial(pluralRo(settings.trialDays, 'zi', 'zile'))
                  : c.noTrial}
              </p>
              <p className="mt-3 text-center text-[0.8125rem]">
                <Link
                  href={ROUTES.plans}
                  className="text-foreground underline underline-offset-4 decoration-border-strong hover:decoration-foreground"
                >
                  {c.allPlans}
                </Link>
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
