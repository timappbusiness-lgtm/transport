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
      <p className="mt-5 rounded-[8px] border border-border bg-surface px-3.5 py-2.5 text-xs text-muted">
        {c.nextStep}
      </p>
    </AuthCard>
  );
}
