import type { Metadata } from 'next';
import { Icon } from '@/components/ui/icon';
import { uiIcon } from '@/lib/icons';
import { AuthCard, TextLink } from '@/components/auth/form';
import { ResendConfirmationForm } from '@/components/auth/forms';
import { ROUTES } from '@/config/routes';
import { authCopy } from '@/content/auth';

export const metadata: Metadata = { title: authCopy.confirmEmail.title };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  const c = authCopy.confirmEmail;

  return (
    <AuthCard
      title={c.title}
      lede={c.lede}
      footer={
        <p>
          <TextLink href={ROUTES.signIn}>{authCopy.resetPassword.backToSignIn}</TextLink>
        </p>
      }
    >
      <div className="flex flex-col gap-6">
        <div className="flex items-start gap-3 rounded-card border border-border bg-surface p-4">
          <span aria-hidden="true" className="mt-0.5 text-success">
            <Icon as={uiIcon('mail')} size="md" />
          </span>
          <p className="text-body text-muted">{c.checkSpam}</p>
        </div>
        <div>
          <p className="mb-3 text-body font-medium">{c.noEmail}</p>
          <ResendConfirmationForm email={email ?? ''} />
        </div>
      </div>
    </AuthCard>
  );
}
