import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

// Only the signed-in part of the app. The public pages stay static.
export const config = {
  matcher: ['/cont/:path*', '/admin/:path*', '/autentificare', '/inregistrare', '/auth/:path*', '/invitatii/:path*'],
};
