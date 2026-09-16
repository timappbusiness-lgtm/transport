import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card, PageHeader } from '@/components/app/badge';
import { NewCompanyForm } from '@/components/app/company-forms';
import { ROUTES } from '@/config/routes';
import { requireSession } from '@/lib/auth';

export const metadata: Metadata = { title: 'Înregistrează firma' };

export default async function Page() {
  const session = await requireSession(ROUTES.newCompany);
  if (session.profile.account_type !== 'company') redirect(ROUTES.account);

  return (
    <div className="max-w-[640px]">
      <PageHeader
        title="Înregistrează firma"
        description="Datele se completează din registrul ANAF. Firma rămâne în completare până când documentele obligatorii sunt aprobate."
      />
      <Card>
        <NewCompanyForm />
      </Card>
    </div>
  );
}
