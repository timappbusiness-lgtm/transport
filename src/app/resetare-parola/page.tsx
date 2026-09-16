import type { Metadata } from 'next';
import { AuthCard, TextLink } from '@/components/auth/form';
import { RequestPasswordResetForm } from '@/components/auth/forms';
import { ROUTES } from '@/config/routes';
import { authCopy } from '@/content/auth';

export const metadata: Metadata = { title: authCopy.resetPassword.title };

export default function Page() {
  const c = authCopy.resetPassword;
  return (
    <AuthCard
      title={c.title}
      lede={c.lede}
      footer={
        <p>
          <TextLink href={ROUTES.signIn}>{c.backToSignIn}</TextLink>
        </p>
      }
    >
      <RequestPasswordResetForm />
    </AuthCard>
  );
}
