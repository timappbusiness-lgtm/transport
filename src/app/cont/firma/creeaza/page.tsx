import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CompanyCreateForm } from '@/components/account/company-create-form';
import { JourneyBecause } from '@/components/onboarding/journey-because';
import { EyebrowPill } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { inscriereCopy } from '@/content/inscriere';
import { safeNextPath } from '@/lib/auth/next-path';
import { afterCompanyCreated, isJourneyAction } from '@/lib/carrier-journey';
import { isCompanyType } from '@/lib/validation/auth';
import { requireAccountContext } from '@/lib/auth/account';

export const metadata: Metadata = { title: 'Adaugă firma' };

const c = inscriereCopy.company;

/**
 * Step 3 of a carrier's way in: the firm, in about two minutes.
 *
 * The CUI fills the rest in from ANAF; the contact comes from the account
 * the person just made, so the usual case is one field typed and one
 * choice made. `pentru` and `next` say why they came and where they go
 * back to — a carrier who pressed „Trimite ofertă" continues to the
 * vehicles and the documents, then back to that request.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tip?: string; pentru?: string; next?: string }>;
}) {
  const { tip, pentru, next } = await searchParams;
  const action = isJourneyAction(pentru) ? pentru : null;
  const back = safeNextPath(next, '') || null;
  const context = await requireAccountContext(ROUTES.accountCompanyCreate);

  // Already has a firm: nothing to create — on to whatever comes after it.
  const existing = context.activeCompany ?? context.memberships[0]?.company ?? null;
  if (existing !== null) redirect(afterCompanyCreated(existing.company_type, back, action));

  const defaultType = isCompanyType(tip) ? tip : 'transport';

  return (
    <div className="flex max-w-[44rem] flex-col gap-6">
      <div>
        <EyebrowPill>{c.eyebrow}</EyebrowPill>
        <h1 className="mt-2 text-h2">{c.title}</h1>
        <p className="mt-2 max-w-[54ch] text-body text-muted">{c.lede}</p>
      </div>
      {action !== null ? <JourneyBecause action={action} /> : null}
      <CompanyCreateForm
        defaultType={defaultType}
        defaults={{ phone: context.profile?.phone ?? '', email: context.user.email ?? '' }}
        next={back}
        pentru={action}
      />
    </div>
  );
}
