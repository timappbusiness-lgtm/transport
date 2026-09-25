/**
 * Supabase connection settings.
 *
 * Only the publishable key is ever read here. The secret/service-role key
 * must never reach this app: it bypasses RLS, and every authorization
 * decision in this platform is a database decision.
 */
export function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set');
  return url;
}

export function supabasePublishableKey(): string {
  // `sb_publishable_…` is the current name; older projects still issue an
  // anon key. Either is safe to ship to the browser.
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or NEXT_PUBLIC_SUPABASE_ANON_KEY) is not set',
    );
  }
  return key;
}

/** True when the app has enough configuration to talk to Supabase. */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}
