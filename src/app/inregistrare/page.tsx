import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthPage } from '@/components/app/auth-page';
import { SignUpForm } from '@/components/app/auth-forms';
import { ROUTES } from '@/config/routes';
import { getSession } from '@/lib/auth';

export const metadata: Metadata = { title: 'Creează cont' };

export default async function Page({ searchParams }: { searchParams: Promise<{ tip?: string }> }) {
  if (await getSession()) redirect(ROUTES.account);
  const { tip } = await searchParams;

  return (
    <AuthPage title="Creează cont" intro="Gratuit. Firmele încarcă documentele după ce își confirmă adresa de e-mail.">
      <SignUpForm defaultType={tip === 'persoana' ? 'individual' : 'company'} />
    </AuthPage>
  );
}
