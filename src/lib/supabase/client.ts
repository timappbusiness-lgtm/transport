'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Database } from './database.types';
import { supabaseEnv } from './env';

/** Supabase client for Client Components (used for direct file uploads). */
export function createClient() {
  const { url, publishableKey } = supabaseEnv();
  return createBrowserClient<Database>(url, publishableKey);
}
