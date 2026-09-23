import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { AlertsTab } from '@/components/firma/alerts-tab';
import { CapabilitiesTab } from '@/components/firma/capabilities-tab';
import { CompletenessCard } from '@/components/firma/completeness-card';
import { CoverageTab } from '@/components/firma/coverage-tab';
import { IdentityTab } from '@/components/firma/identity-tab';
import { ProfileTabs } from '@/components/firma/profile-tabs';
import { PublicProfileForm } from '@/components/account/public-profile-form';
import { EyebrowPill } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { VERIFICATION_LABELS, accountCopy } from '@/content/account';
import { firmaCopy } from '@/content/firma';
import { requireManagerContext } from '@/lib/auth/guards';
import { completeness, tabsFor, type ProfileTab } from '@/lib/company-profile';
import { countActiveVehicles, loadCompanyOptions } from '@/lib/company-options-source';
import { companyLogoUrl } from '@/lib/directory-source';

export const metadata: Metadata = { title: firmaCopy.title };

/**
 * The company profile, in five tabs.
 *
 * The tab is a search parameter rather than client state, so it has a URL:
 * the completeness card links straight to the tab that fixes each line,
 * and the browser's back button goes back a tab.
 *
 * A forwarder is shown four of the five. It does not own the truck, so the
 * tab about what is on one has nothing for it to fill in — and asking it
 * anyway would count against its completeness for a question that does not
 * apply. `tabsFor` is the single place that decides, and a URL naming a
 * tab a forwarder does not have is a 404 rather than a silent redirect to
 * the first one, which would look like the link was wrong rather than the
 * tab being absent.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ sectiune?: string }>;
}) {
  const context = await requireManagerContext(ROUTES.accountCompany);
  const company = context.activeCompany;

  const tabs = tabsFor(company.company_type);
  const requested = (await searchParams).sectiune;
  const active: ProfileTab = requested === undefined ? 'identitate' : (requested as ProfileTab);
  if (!tabs.includes(active)) notFound();

  const [options, vehiclesTotal] = await Promise.all([
    loadCompanyOptions({ equipment: company.equipment, services: company.services }),
    countActiveVehicles(company.id),
  ]);

  const progress = completeness({
    companyType: company.company_type,
    contactPhone: company.contact_phone,
    contactEmail: company.contact_email,
    city: company.city,
    county: company.county,
    coverageScope: company.coverage_scope,
    coverageCounties: company.coverage_counties,
    coverageCountries: company.coverage_countries,
    vehicleTypesAccepted: company.vehicle_types_accepted,
    equipment: company.equipment,
    services: company.services,
    publicDescription: company.public_description,
    logoPath: company.logo_path,
    publicProfileEnabled: company.public_profile_enabled,
    vehiclesTotal,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <EyebrowPill>
          {accountCopy.company.status}: {VERIFICATION_LABELS[company.verification_status]}
        </EyebrowPill>
        <h1 className="mt-2 text-h2">{firmaCopy.title}</h1>
        <p className="mt-2 max-w-[62ch] text-body text-muted">{firmaCopy.lede}</p>
      </div>

      <CompletenessCard completeness={progress} />

      <ProfileTabs tabs={tabs} active={active} />

      <section className="rounded-card border border-border bg-surface p-4 sm:p-5">
        {active === 'identitate' ? <IdentityTab company={company} /> : null}
        {active === 'acoperire' ? <CoverageTab company={company} /> : null}
        {active === 'dotari' ? (
          <CapabilitiesTab
            company={company}
            equipmentOptions={options.equipment}
            serviceOptions={options.services}
            vehiclesTotal={vehiclesTotal}
          />
        ) : null}
        {active === 'alerte' ? <AlertsTab company={company} /> : null}
        {active === 'public' ? (
          <>
            <h2 className="mb-1 text-h3">{firmaCopy.publicProfile.title}</h2>
            <p className="mb-4 max-w-[62ch] text-sm text-muted">{firmaCopy.publicProfile.lede}</p>
            <PublicProfileForm company={company} logoUrl={companyLogoUrl(company.logo_path)} />
          </>
        ) : null}
      </section>
    </div>
  );
}
