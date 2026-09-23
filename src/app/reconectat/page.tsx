import type { Metadata } from 'next';
import { AuthCard, TextLink } from '@/components/auth/form';
import { SessionRestored } from '@/components/continuity/session-restored';
import { ROUTES } from '@/config/routes';
import { continuityCopy } from '@/content/continuitate';
import { getAccountContext } from '@/lib/auth/account';
import { withNext } from '@/lib/auth/next-path';

export const metadata: Metadata = {
  title: continuityCopy.reconnected.title,
  robots: { index: false },
};

/**
 * Where signing in again in a second tab lands.
 *
 * The first tab still holds the form whose session expired. This page
 * tells it, on a `BroadcastChannel`, that the session is back, and tells
 * the person that this tab can be closed. Nothing here navigates on its
 * own: the work is in the other tab.
 */
export default async function Page() {
  const context = await getAccountContext();
  const c = continuityCopy.reconnected;

  if (!context) {
    return (
      <AuthCard
        title={c.notSignedIn}
        footer={
          <p>
            <TextLink href={withNext(ROUTES.signIn, ROUTES.signedInAgain)}>{c.signIn}</TextLink>
          </p>
        }
      >
        {null}
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={c.title}
      lede={c.lede}
      footer={
        <p>
          <TextLink href={ROUTES.account}>{c.account}</TextLink>
        </p>
      }
    >
      <SessionRestored />
    </AuthCard>
  );
}
