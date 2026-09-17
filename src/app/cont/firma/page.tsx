import type { Metadata } from 'next';
import { CompanyForm } from '@/components/account/company-form';
import { PublicProfileForm } from '@/components/account/public-profile-form';
import { EyebrowPill } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { VERIFICATION_LABELS, accountCopy } from '@/content/account';
import { requireManagerContext } from '@/lib/auth/guards';
import { companyLogoUrl } from '@/lib/directory-source';

export const metadata: Metadata = { title: accountCopy.company.title };

export default async function Page() {
  const context = await requireManagerContext(ROUTES.accountCompany);
  const company = context.activeCompany;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <EyebrowPill>{accountCopy.company.status}: {VERIFICATION_LABELS[company.verification_status]}</EyebrowPill>
        <h1 className="mt-2 text-[clamp(1.5rem,4vw,2rem)]">{accountCopy.company.title}</h1>
      </div>
      <section className="rounded-card border border-border bg-surface p-5">
        <CompanyForm company={company} />
      </section>

      <section aria-labelledby="profil-public" className="rounded-card border border-border bg-surface p-5">
        <h2 id="profil-public" className="mb-4 text-[1.0625rem]">
          {accountCopy.publicProfile.title}
        </h2>
        <PublicProfileForm company={company} logoUrl={companyLogoUrl(company.logo_path)} />
      </section>
    </div>
  );
}
