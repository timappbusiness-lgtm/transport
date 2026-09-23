import type { Metadata } from 'next';
import { AuthCard, TextLink } from '@/components/auth/form';
import { RequestPasswordResetForm } from '@/components/auth/forms';
import { ROUTES } from '@/config/routes';
import { authCopy } from '@/content/auth';
import { safeNextPath, withNext } from '@/lib/auth/next-path';

export const metadata: Metadata = { title: authCopy.resetPassword.title };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next: rawNext } = await searchParams;
  // A password forgotten in the middle of a form: the link in the e-mail,
  // the new password and the sign-in after it all go back to the form.
  const next = safeNextPath(rawNext, '');
  const c = authCopy.resetPassword;
  return (
    <AuthCard
      title={c.title}
      lede={c.lede}
      footer={
        <p>
          <TextLink href={withNext(ROUTES.signIn, next)}>{c.backToSignIn}</TextLink>
        </p>
      }
    >
      <RequestPasswordResetForm next={next} />
    </AuthCard>
  );
}
