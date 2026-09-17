import type { Metadata } from 'next';
import { VerificationBody } from '@/components/trust/verification-body';
import { ROUTES } from '@/config/routes';
import { verificationCopy } from '@/content/siguranta';
import { getAccountContext } from '@/lib/auth/account';
import { loadVerification } from '@/lib/trust-source';

const c = verificationCopy;

export const metadata: Metadata = {
  title: c.meta.title,
  description: c.meta.description,
  alternates: { canonical: ROUTES.verification },
  // Nothing on this site is indexed before launch; the app-wide default in
  // the root layout says so, and this repeats it so a later change there
  // does not quietly expose the page.
  robots: { index: false, follow: true },
};

/** The report form depends on the session, so this is never prerendered. */
export const dynamic = 'force-dynamic';

export default async function Page() {
  const [{ requirements, reviewTimeLabel }, context] = await Promise.all([
    loadVerification(),
    getAccountContext(),
  ]);

  return (
    <VerificationBody
      requirements={requirements}
      reviewTimeLabel={reviewTimeLabel}
      signedIn={context !== null}
    />
  );
}
