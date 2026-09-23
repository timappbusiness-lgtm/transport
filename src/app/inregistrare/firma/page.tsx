import type { Metadata } from 'next';
import { AuthCard, TextLink } from '@/components/auth/form';
import { CompanySignUpForm } from '@/components/auth/forms';
import { ROUTES } from '@/config/routes';
import { authCopy } from '@/content/auth';

export const metadata: Metadata = { title: authCopy.companySignUp.title };

export default function Page() {
  const c = authCopy.companySignUp;
  return (
    <AuthCard
      eyebrow={c.stepLabel}
      title={c.title}
      lede={c.lede}
      footer={
        <p>
          {c.hasAccount} <TextLink href={ROUTES.signIn}>{c.signIn}</TextLink>
        </p>
      }
    >
      <CompanySignUpForm />
      <p className="mt-5 rounded-card border border-border bg-surface px-3.5 py-2.5 text-small text-muted">
        {c.nextStep}
      </p>
      <p className="mt-3 text-small text-muted">
        {c.verifyIntro} <TextLink href={ROUTES.verification}>{c.verifyLink}</TextLink>
      </p>
    </AuthCard>
  );
}
