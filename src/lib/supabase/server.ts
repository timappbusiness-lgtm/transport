import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { supabasePublishableKey, supabaseUrl } from './env';

/**
 * Server client for server components, server actions and route handlers.
 *
 * Always `await`ed per request — never cached in a module-level variable,
 * which would leak one user's session into another request.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Called from a server component, where cookies are read-only.
          // The middleware refreshes the session, so this is safe to ignore.
        }
      },
    },
  });
}
