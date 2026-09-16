'use client';

import { createBrowserClient } from '@supabase/ssr';
import { supabasePublishableKey, supabaseUrl } from './env';

/** Browser client. Used only for interactive auth calls (sign-in, OTP). */
export function createClient() {
  return createBrowserClient(supabaseUrl(), supabasePublishableKey());
}
