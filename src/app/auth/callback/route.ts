import { NextResponse, type NextRequest } from 'next/server';
import { safeNextPath } from '@/lib/auth/next-path';
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

  if (!code) {
    return NextResponse.redirect(`${origin}/autentificare?eroare=link`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // No detail in the URL: the reason is for the log, not for the address bar.
    console.error('[authCallback] code exchange failed', { code: error.code });
    return NextResponse.redirect(`${origin}/autentificare?eroare=link`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
