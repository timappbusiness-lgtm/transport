import { NextResponse, type NextRequest } from 'next/server';
import { safeNextPath, withNext } from '@/lib/auth/next-path';
import { createClient } from '@/lib/supabase/server';

/**
 * Where Supabase sends the user after an e-mail confirmation, a magic link
 * or a password recovery link.
 *
 * Exchanges the one-time code for a session, then forwards to `next` — which
 * is validated, because the whole URL arrives from an e-mail and an
 * attacker-supplied `next` would turn our own confirmation link into an open
 * redirect.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get('code');
  const next = safeNextPath(searchParams.get('next'));

  // A link that did not work still knows where it was going: the sign-in
  // page says the link expired and, after the password, goes there.
  const failed = `${origin}${withNext('/autentificare?eroare=link', next)}`;

  if (!code) {
    return NextResponse.redirect(failed);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // No detail in the URL: the reason is for the log, not for the address bar.
    console.error('[authCallback] code exchange failed', { code: error.code });
    return NextResponse.redirect(failed);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
