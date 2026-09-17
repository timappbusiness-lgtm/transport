import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { supabasePublishableKey, supabaseUrl } from './env';

/**
 * A server client with no session at all.
 *
 * The rest of the app uses `server.ts`, which reads cookies and is created
 * fresh per request precisely so one user's session never leaks into
 * another's. This one is the opposite case and the reason it can be a
 * module-level singleton: it never has a session to leak. It carries the
 * publishable key, is seen by the database as `anon`, and is used only for
 * data that is identical for every visitor.
 *
 * That also makes the reads cacheable. A function that calls `cookies()`
 * cannot go inside `unstable_cache`; this one can, which is how the
 * homepage asks the database about its own activity once a minute instead
 * of once a visitor.
 */
let client: SupabaseClient<Database> | null = null;

export function createPublicClient(): SupabaseClient<Database> {
  if (!client) {
    client = createSupabaseClient<Database>(supabaseUrl(), supabasePublishableKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
