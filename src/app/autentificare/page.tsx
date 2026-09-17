import type { Metadata } from 'next';
import { AuthCard, TextLink } from '@/components/auth/form';
import { SignInForm } from '@/components/auth/forms';
import { ROUTES } from '@/config/routes';
import { authCopy } from '@/content/auth';
import { safeNextPath } from '@/lib/auth/next-path';

export const metadata: Metadata = { title: authCopy.signIn.title };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
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
          {c.noAccount} <TextLink href={ROUTES.signUp}>{c.createAccount}</TextLink>
        </p>
      }
    >
      <SignInForm next={next} />
    </AuthCard>
  );
}
