import 'server-only';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { ROUTES } from '@/config/routes';
import type { Database } from '@/lib/supabase/database.types';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';

type Enums = Database['public']['Enums'];

export interface Membership {
  companyId: string;
  role: Enums['company_member_role'];
  name: string;
  verificationStatus: Enums['company_verification_status'];
  isSuspended: boolean;
}

/**
 * The signed-in user for this request, or null. Cached per request, so a
 * layout and its page share one lookup. Identity comes from the verified
 * JWT (getClaims); everything else is read through RLS as that user.
 */
export const getSession = cache(async () => {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) return null;

  const [profileResult, staffResult, membersResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, phone, phone_verified, account_type')
      .eq('id', userId)
      .maybeSingle(),
    supabase.rpc('is_platform_admin'),
    supabase
      .from('company_members')
      .select('role, company_id, companies (legal_name, display_name, verification_status, is_suspended)')
      .eq('user_id', userId)
      .order('created_at'),
  ]);

  if (!profileResult.data) return null;

  const memberships: Membership[] = (membersResult.data ?? []).flatMap((m) =>
    m.companies
      ? [{
          companyId: m.company_id,
          role: m.role,
          name: m.companies.display_name ?? m.companies.legal_name,
          verificationStatus: m.companies.verification_status,
          isSuspended: m.companies.is_suspended,
        }]
      : [],
  );

  return {
    supabase,
    userId,
    profile: profileResult.data,
    isStaff: staffResult.data === true,
    memberships,
  };
});

export type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>;

export async function requireSession(next?: string): Promise<Session> {
  const session = await getSession();
  if (!session) {
    redirect(next ? `${ROUTES.signIn}?next=${encodeURIComponent(next)}` : ROUTES.signIn);
  }
  return session;
}

export async function requireStaff(): Promise<Session> {
  const session = await requireSession(ROUTES.adminDocuments);
  if (!session.isStaff) redirect(ROUTES.account);
  return session;
}

/** The caller's membership in a company, or a redirect to the account page. */
export async function requireMembership(companyId: string): Promise<{ session: Session; membership: Membership }> {
  const session = await requireSession();
  const membership = session.memberships.find((m) => m.companyId === companyId);
  if (!membership) redirect(ROUTES.account);
  return { session, membership };
}

/** Only redirect targets inside the app, never an absolute URL. */
export function safeNext(value: FormDataEntryValue | string | null | undefined, fallback: string = ROUTES.account): string {
  const s = typeof value === 'string' ? value : '';
  return s.startsWith('/') && !s.startsWith('//') ? s : fallback;
}
