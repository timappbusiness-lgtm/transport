import type { Metadata } from 'next';
import { AuthCard, TextLink } from '@/components/auth/form';
import { NewPasswordForm } from '@/components/auth/forms';
import { FormError } from '@/components/auth/form';
import { ROUTES } from '@/config/routes';
import { authCopy } from '@/content/auth';
import { getAccountContext } from '@/lib/auth/account';

export const metadata: Metadata = { title: authCopy.newPassword.title };

/**
 * Reached from the recovery link, which the callback route exchanges for a
 * session. Without that session there is nobody to change the password for,
 * so the page says so rather than showing a form that cannot work.
 */
export default async function Page() {
  const context = await getAccountContext();
  const c = authCopy.newPassword;

  return (
    <AuthCard
      title={c.title}
      lede={context ? c.lede : undefined}
      footer={
        <p>
          <TextLink href={ROUTES.signIn}>{authCopy.resetPassword.backToSignIn}</TextLink>
        </p>
      }
    >
      {context ? (
        <NewPasswordForm />
      ) : (
        <div className="flex flex-col gap-4">
          <FormError>{c.invalidLink}</FormError>
          <TextLink href={ROUTES.resetPassword}>{c.requestNew}</TextLink>
        </div>
      )}
    </AuthCard>
  );
}
