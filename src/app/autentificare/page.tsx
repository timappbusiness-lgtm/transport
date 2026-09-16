import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthPage } from '@/components/app/auth-page';
import { SignInForm } from '@/components/app/auth-forms';
import { getSession, safeNext } from '@/lib/auth';

export const metadata: Metadata = { title: 'Autentificare' };

export default async function Page({ searchParams }: { searchParams: Promise<{ next?: string; eroare?: string }> }) {
  const params = await searchParams;
  const next = safeNext(params.next);
  if (await getSession()) redirect(next);

  return (
    <AuthPage title="Autentificare" intro="Intră în contul tău de firmă sau de persoană fizică.">
      {params.eroare === 'link' ? (
        <p role="alert" className="mb-4 rounded-[6px] border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          Linkul de confirmare a expirat sau a fost deja folosit. Autentifică-te sau cere unul nou.
        </p>
      ) : null}
      <SignInForm next={next} />
    </AuthPage>
  );
}
