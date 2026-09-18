'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { CURRENT_TERMS_VERSION } from '@/content/legal';
import { safeNextPath } from '@/lib/auth/next-path';
import { toAppError } from '@/lib/errors';
import { createClient } from '@/lib/supabase/server';
import {
  validateEmail,
  validateIndividualSignUp,
  validatePassword,
  validateSignIn,
} from '@/lib/validation/auth';

/**
 * Server actions for the authentication flow.
 *
 * Every one of these runs on the server with the user's own session. None of
 * them trusts a role, a company id or an account type sent from the client:
 * where authorization matters, the database decides.
 */

export interface AuthActionState {
  error?: string;
  notice?: string;
  fieldErrors?: Record<string, string>;
  /** Echoed back so a failed submit does not clear what the user typed. */
  values?: Record<string, string>;
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value : '';
}

/** Absolute origin for the links Supabase puts in its e-mails. */
async function siteOrigin(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/$/, '');

  // Fall back to the request host so preview deployments send working links.
  const headerList = await headers();
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host');
  const proto = headerList.get('x-forwarded-proto') ?? 'https';
  return host ? `${proto}://${host}` : 'http://localhost:3000';
}

// ---------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------

export async function signInAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = text(formData, 'email').trim();
  const password = text(formData, 'password');
  const next = safeNextPath(text(formData, 'next'));

  const validation = validateSignIn({ email, password });
  if (!validation.ok) {
    return { fieldErrors: validation.errors, values: { email } };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: toAppError(error, 'signIn').message, values: { email } };
  }

  redirect(next);
}

// ---------------------------------------------------------------------
// Sign up
// ---------------------------------------------------------------------

async function signUp(
  formData: FormData,
  accountType: 'individual' | 'company',
): Promise<AuthActionState> {
  const fullName = text(formData, 'fullName').trim();
  const email = text(formData, 'email').trim();
  const password = text(formData, 'password');
  const terms = formData.get('terms') !== null;

  const validation = validateIndividualSignUp({ fullName, email, password, terms });
  if (!validation.ok) {
    return { fieldErrors: validation.errors, values: { fullName, email } };
  }

  const supabase = await createClient();
  const origin = await siteOrigin();

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent('/cont')}`,
      // A trigger copies these into `profiles`; the column is not writable
      // from the client. The version is the one this server rendered on
      // the checkbox, never a value from the form: a browser that could
      // choose it could accept a document nobody has published.
      data: {
        full_name: fullName,
        account_type: accountType,
        terms_version: CURRENT_TERMS_VERSION,
      },
    },
  });

  if (error) {
    return { error: toAppError(error, 'signUp').message, values: { fullName, email } };
  }

  redirect(`/confirmare-email?email=${encodeURIComponent(email)}`);
}

export async function signUpIndividualAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  return signUp(formData, 'individual');
}

export async function signUpCompanyAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  return signUp(formData, 'company');
}

export async function resendConfirmationAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = text(formData, 'email').trim();

  const emailError = validateEmail(email);
  if (emailError) return { fieldErrors: { email: emailError }, values: { email } };

  const supabase = await createClient();
  const origin = await siteOrigin();

  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent('/cont')}` },
  });

  if (error) {
    return { error: toAppError(error, 'resendConfirmation').message, values: { email } };
  }

  return { notice: 'Am trimis din nou e-mailul de confirmare.', values: { email } };
}

// ---------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------

export async function requestPasswordResetAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = text(formData, 'email').trim();

  const emailError = validateEmail(email);
  if (emailError) return { fieldErrors: { email: emailError }, values: { email } };

  const supabase = await createClient();
  const origin = await siteOrigin();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=${encodeURIComponent('/parola-noua')}`,
  });

  // Rate limiting is worth surfacing; anything else is swallowed on purpose.
  // Telling a stranger whether an address has an account here is an account
  // enumeration oracle, so the success message is the same either way.
  if (error && /rate limit|too many|for security purposes/i.test(error.message)) {
    return { error: toAppError(error, 'requestPasswordReset').message, values: { email } };
  }

  return {
    notice: 'Dacă există un cont cu această adresă, ți-am trimis un link de resetare.',
    values: { email },
  };
}

export async function updatePasswordAction(
  _previous: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const password = text(formData, 'password');

  const passwordError = validatePassword(password);
  if (passwordError) return { fieldErrors: { password: passwordError } };

  const supabase = await createClient();

  // The recovery link established a session in the callback; without it
  // there is nobody to update.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return {
      error: 'Linkul de resetare a expirat sau a fost deja folosit. Cere unul nou.',
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: toAppError(error, 'updatePassword').message };

  redirect('/cont');
}

// ---------------------------------------------------------------------
// Sign out
// ---------------------------------------------------------------------

export async function signOutAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/');
}

/** Ends every session on every device, not just this browser. */
export async function signOutEverywhereAction(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: 'global' });
  redirect('/');
}
