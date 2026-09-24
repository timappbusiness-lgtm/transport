import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_PAGES, explicitNextAfterAuth, signInUrlFor } from '@/lib/auth/next-path';
import { ROUTES } from '@/config/routes';
import { PATHNAME_HEADER } from '@/lib/auth/pathname-header';
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from './env';

/** Prefixes that require a signed-in user. */
const PROTECTED = ['/cont', '/admin'] as const;

/** Signed-in users have no business on these. */
const AUTH_ONLY = AUTH_PAGES;

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

  // A server action is a POST to the page it was sent from. Redirecting it
  // answers the form with a sign-in page it cannot read, and the form ends
  // up on the error screen with everything typed into it gone. The action
  // checks the session itself (`requireAccountContext`) and tells the form
  // the session expired, which keeps the fields where they are.
  const isServerAction = request.method === 'POST' && request.headers.has('next-action');

  if (!user && isUnder(pathname, PROTECTED) && !isServerAction) {
    const target = signInUrlFor(pathname, search);
    const [targetPath, targetQuery] = target.split('?');
    const url = request.nextUrl.clone();
    url.pathname = targetPath ?? '/autentificare';
    url.search = targetQuery ? `?${targetQuery}` : '';
    return NextResponse.redirect(url);
  }

  if (user && isUnder(pathname, AUTH_ONLY) && !isServerAction) {
    // Back to where they were going, not to the dashboard: a person who
    // pressed „Intră în cont" in the middle of a form, already signed in
    // in another tab, goes back to the form.
    // With nowhere in particular to go, the same landing a fresh sign-in
    // gets: a carrier to the board, everybody else to their account.
    const target =
      explicitNextAfterAuth(request.nextUrl.searchParams.get('next')) ?? ROUTES.signInLanding;
    return NextResponse.redirect(new URL(target, request.nextUrl.origin));
  }

  return response;
}
