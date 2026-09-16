import type { Metadata } from 'next';
import { AuthCard, TextLink } from '@/components/auth/form';
import { IndividualSignUpForm } from '@/components/auth/forms';
import { ROUTES } from '@/config/routes';
import { authCopy } from '@/content/auth';

export const metadata: Metadata = { title: authCopy.individualSignUp.title };

export default function Page() {
  const c = authCopy.individualSignUp;
  return (
    <AuthCard
      eyebrow="Persoană fizică"
      title={c.title}
      lede={c.lede}
      footer={
        <p>
          {c.hasAccount} <TextLink href={ROUTES.signIn}>{c.signIn}</TextLink>
        </p>
      }
    >
      <IndividualSignUpForm />
    </AuthCard>
  );
}
