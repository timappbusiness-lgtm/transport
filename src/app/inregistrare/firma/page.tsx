import type { Metadata } from 'next';
import { AuthCard, TextLink } from '@/components/auth/form';
import { CompanySignUpForm } from '@/components/auth/forms';
import { ROUTES } from '@/config/routes';
import { authCopy } from '@/content/auth';
import { safeNextPath, withNext } from '@/lib/auth/next-path';

export const metadata: Metadata = { title: authCopy.companySignUp.title };

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next: rawNext } = await searchParams;
  // Empty when there is nowhere particular to go back to: the action then
  // sends a carrier to the board, which is what they signed up to see.
  const next = safeNextPath(rawNext, '');
  const c = authCopy.companySignUp;
  return (
    <AuthCard
      eyebrow={c.stepLabel}
      title={c.title}
      lede={c.lede}
      footer={
        <p>
          {c.hasAccount} <TextLink href={withNext(ROUTES.signIn, next)}>{c.signIn}</TextLink>
        </p>
      }
    >
      <CompanySignUpForm next={next} />
      <p className="mt-5 rounded-card border border-border bg-surface px-3.5 py-2.5 text-small text-muted">
        {c.nextStep}
      </p>
      <p className="mt-3 text-small text-muted">
        {c.verifyIntro} <TextLink href={ROUTES.verification}>{c.verifyLink}</TextLink>
      </p>
    </AuthCard>
  );
}
