import type { Metadata } from 'next';
import { AuthCard, TextLink } from '@/components/auth/form';
import { IndividualSignUpForm } from '@/components/auth/forms';
import { ROUTES } from '@/config/routes';
import { authCopy } from '@/content/auth';
import { safeNextPath, withNext } from '@/lib/auth/next-path';

export const metadata: Metadata = { title: authCopy.individualSignUp.title };

/**
 * `?next=` survives the confirmation e-mail.
 *
 * Somebody who was halfway through a request when they were asked for an
 * account comes back to the form, with the draft the browser kept, rather
 * than to a dashboard where they have to find their way back.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.next;
  const next = safeNextPath(
    typeof raw === 'string' ? raw : Array.isArray(raw) ? (raw[0] ?? '') : '',
    ROUTES.account,
  );
  const c = authCopy.individualSignUp;
  return (
    <AuthCard
      eyebrow="Persoană fizică"
      title={c.title}
      lede={c.lede}
      footer={
        <p>
          {c.hasAccount} <TextLink href={withNext(ROUTES.signIn, next)}>{c.signIn}</TextLink>
        </p>
      }
    >
      <IndividualSignUpForm next={next} />
    </AuthCard>
  );
}
