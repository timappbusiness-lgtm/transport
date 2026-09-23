/**
 * A session that ends while a form is open.
 *
 * Before: the action asked for the account, found nobody, and redirected
 * to the sign-in page — so the press of „Salvează" was also the moment
 * everything typed into the form was thrown away. Now the action throws
 * one recognisable error instead of redirecting, the form turns it into
 * its own error state (see `keepOnFailure`), and the person signs in again
 * in a new tab, comes back, and presses the same button.
 *
 * This file is shared by the server (which throws) and the browser (which
 * recognises), so it imports nothing from either.
 */

import { ROUTES } from '@/config/routes';
import { withNext } from '@/lib/auth/next-path';

/**
 * Carried as the error's `digest`. Next sends a server error's digest to
 * the browser unchanged when the error already has one, and never sends
 * the message in production — so the digest is the part that arrives.
 */
export const SESSION_EXPIRED_DIGEST = 'CORIDOR_SESSION_EXPIRED';

export const SESSION_EXPIRED_MESSAGE =
  'Sesiunea ta a expirat. Ce ai completat a rămas aici — intră din nou în cont, apoi apasă încă o dată pe buton.';

export function sessionExpiredError(): Error & { digest: string } {
  return Object.assign(new Error(SESSION_EXPIRED_MESSAGE), { digest: SESSION_EXPIRED_DIGEST });
}

export function isSessionExpired(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { digest?: unknown }).digest === SESSION_EXPIRED_DIGEST
  );
}

/**
 * The name of the channel on which a tab that has just signed in again
 * tells the others. The tab whose form hit the expired session is
 * listening, and says „you are back in, press the button again".
 */
export const SESSION_CHANNEL = 'coridor.sesiune';

export type SessionMessage = { type: 'restored' };

/**
 * Signing in again without leaving the page that holds the form: opened in
 * a new tab, it lands on a page that tells this tab the session is back.
 */
export const SIGN_IN_AGAIN_HREF = withNext(ROUTES.signIn, ROUTES.signedInAgain);
