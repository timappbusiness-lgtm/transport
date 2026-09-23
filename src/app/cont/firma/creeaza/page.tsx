import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CompanyCreateForm } from '@/components/account/company-create-form';
import { EyebrowPill } from '@/components/ui/primitives';
import { ROUTES } from '@/config/routes';
import { isCompanyType } from '@/lib/validation/auth';
import { requireAccountContext } from '@/lib/auth/account';

export const metadata: Metadata = { title: 'Adaugă firma' };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tip?: string }>;
}) {
  const context = await requireAccountContext(ROUTES.accountCompanyCreate);

  // Already has a company: there is nothing to create.
  if (context.memberships.length > 0) redirect(ROUTES.accountCompany);

  const { tip } = await searchParams;
  const defaultType = isCompanyType(tip) ? tip : 'transport';

  return (
    <div className="flex flex-col gap-6">
      <div>
        <EyebrowPill>Pasul 2 din 2</EyebrowPill>
        <h1 className="mt-2 text-h2">Datele firmei</h1>
        <p className="mt-2 max-w-[54ch] text-sm text-muted">
          După ce salvezi, poți încărca documentele și trimite firma la verificare.
        </p>
      </div>
      <CompanyCreateForm defaultType={defaultType} />
    </div>
  );
}
