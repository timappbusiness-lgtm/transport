import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { signInUrlFor } from '@/lib/auth/next-path';
import { PATHNAME_HEADER } from '@/lib/auth/pathname-header';
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from './env';

/** Prefixes that require a signed-in user. */
const PROTECTED = ['/cont', '/admin'] as const;

/** Signed-in users have no business on these. */
const AUTH_ONLY = ['/autentificare', '/inregistrare'] as const;

function isUnder(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Refreshes the Supabase session on every request and guards protected
 * routes.
 *
 * The response returned must be the one the Supabase client wrote cookies
 * onto. Building a fresh NextResponse afterwards drops the refreshed tokens
 * and signs the user out one request later.
 *
 * This is a convenience layer, not the security boundary: every protected
 * page and action checks the session server-side as well, and the database
 * decides what that session may do.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  request.headers.set(PATHNAME_HEADER, `${pathname}${search}`);

  let response = NextResponse.next({ request });

  if (!isSupabaseConfigured()) {
    // No configuration: nothing to refresh and nobody can be signed in.
    // Protected pages still run their own check and will redirect.
    return response;
  }

  const supabase = createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        request.headers.set(PATHNAME_HEADER, `${pathname}${search}`);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() revalidates the token with Supabase. getSession() only reads
  // the cookie, which the client controls.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user && isUnder(pathname, PROTECTED)) {
    const target = signInUrlFor(pathname, search);
    const [targetPath, targetQuery] = target.split('?');
    const url = request.nextUrl.clone();
    url.pathname = targetPath ?? '/autentificare';
    url.search = targetQuery ? `?${targetQuery}` : '';
    return NextResponse.redirect(url);
  }

  if (user && isUnder(pathname, AUTH_ONLY)) {
    const url = request.nextUrl.clone();
    url.pathname = '/cont';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}
