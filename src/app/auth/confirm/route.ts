import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { ROUTES } from '@/config/routes';
import { safeNext } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

/**
 * The link in the confirmation e-mail lands here, in one of two shapes:
 *   ?code=…                  the default Supabase template (PKCE): the code
 *                            is exchanged with the verifier stored in a
 *                            cookie at signup, so it works in the same browser
 *   ?token_hash=…&type=email a custom template, which also works when the
 *                            link is opened on another device
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const next = safeNext(searchParams.get('next'));
  const supabase = await createClient();

  const code = searchParams.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }

  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(new URL(next, request.url));
  }

  return NextResponse.redirect(new URL(`${ROUTES.signIn}?eroare=link`, request.url));
}
