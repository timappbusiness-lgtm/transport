import type { Metadata } from 'next';
import { AuthCard, FormError, TextLink } from '@/components/auth/form';
import { SignInForm } from '@/components/auth/forms';
import { ROUTES } from '@/config/routes';
import { authCopy } from '@/content/auth';
import { safeNextPath, withNext } from '@/lib/auth/next-path';

export const metadata: Metadata = { title: authCopy.signIn.title };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; eroare?: string }>;
}) {
  const params = await searchParams;
  // Validated here, not in the form: the value arrives from the URL and an
  // unchecked `next` is an open redirect.
  const next = safeNextPath(params.next);
  const c = authCopy.signIn;

  return (
    <AuthCard
      title={c.title}
      lede={c.lede}
      footer={
        <p>
          {/* Every way off this page carries the place to come back to:
              the switch to sign-up, and „Ai uitat parola?" inside the form. */}
          {c.noAccount} <TextLink href={withNext(ROUTES.signUp, next)}>{c.createAccount}</TextLink>
        </p>
      }
    >
      {params.eroare === 'link' ? (
        <div className="mb-4">
          <FormError>{c.linkExpired}</FormError>
        </div>
      ) : null}
      <SignInForm next={next} />
    </AuthCard>
  );
}
