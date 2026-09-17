import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { PATHNAME_HEADER } from './pathname-header';
import { safeNextPath, signInUrlFor } from './next-path';

/**
 * Server-side account context.
 *
 * Everything the account area renders from comes through here, so there is
 * exactly one place that reads the session. Nothing about the caller is ever
 * taken from the client: the company id arrives in a cookie, but it is only
 * honoured when the database confirms the user is a member of it.
 */

export type AccountType = 'company' | 'individual';
export type CompanyType = 'transport' | 'expeditie' | 'both';
export type MemberRole = 'owner' | 'admin' | 'dispatcher' | 'driver';
export type VerificationStatus =
  | 'draft'
  | 'pending'
  | 'verified'
  | 'rejected'
  | 'suspended';

export interface Profile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  phone_verified: boolean;
  account_type: AccountType;
}

export interface Company {
  id: string;
  cui: string;
  legal_name: string;
  display_name: string | null;
  company_type: CompanyType;
  verification_status: VerificationStatus;
  /** Why the last review was rejected. Written only by review_company(). */
  verification_note: string | null;
  is_suspended: boolean;
  suspended_at: string | null;
  suspension_reason: string | null;
  county: string | null;
  city: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  /** Whether the firm asked to appear in the public directory. */
  public_profile_enabled: boolean;
  /** Set by trigger from the legal name and city; never editable. */
  slug: string | null;
  public_description: string | null;
  logo_path: string | null;
}

export interface Membership {
  role: MemberRole;
  company: Company;
}

export interface AccountContext {
  user: User;
  profile: Profile | null;
  memberships: Membership[];
  /** The company the user is currently acting as, if any. */
  activeCompany: Company | null;
  activeRole: MemberRole | null;
  isStaff: boolean;
}

/** Cookie holding the active company for multi-company users. */
export const ACTIVE_COMPANY_COOKIE = 'coridor_company';

const COMPANY_COLUMNS =
  'id, cui, legal_name, display_name, company_type, verification_status, verification_note, is_suspended, suspended_at, suspension_reason, county, city, contact_email, contact_phone, public_profile_enabled, slug, public_description, logo_path';

/**
 * Reads the signed-in user, their profile and their companies.
 *
 * Returns null when nobody is signed in. Wrapped in `cache()` so a page that
 * renders four components sharing this context still makes one round trip.
 */
export const getAccountContext = cache(async (): Promise<AccountContext | null> => {
  // Without configuration there is no session to read. Returning null keeps
  // the marketing pages renderable on a checkout with no .env file, and the
  // protected pages still redirect.
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();

  // getUser() revalidates with Supabase; getSession() trusts the cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [profileResult, membershipResult, staffResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email, phone, phone_verified, account_type')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('company_members')
      .select(`role, company:companies(${COMPANY_COLUMNS})`)
      .eq('user_id', user.id),
    supabase.from('platform_staff').select('user_id').eq('user_id', user.id).maybeSingle(),
  ]);

  const profile = (profileResult.data as Profile | null) ?? null;

  const memberships: Membership[] = ((membershipResult.data ?? []) as unknown[])
    .map((row) => {
      const record = row as { role: MemberRole; company: Company | Company[] | null };
      // PostgREST returns an embedded row as an object, but typings widen it
      // to an array when the relationship is not provably to-one.
      const company = Array.isArray(record.company) ? record.company[0] : record.company;
      return company ? { role: record.role, company } : null;
    })
    .filter((m): m is Membership => m !== null);

  const cookieStore = await cookies();
  const requested = cookieStore.get(ACTIVE_COMPANY_COOKIE)?.value;

  // The cookie is a preference, never a permission: if the user is not a
  // member of the company it names, it is ignored entirely.
  const active =
    memberships.find((m) => m.company.id === requested) ?? memberships[0] ?? null;

  return {
    user,
    profile,
    memberships,
    activeCompany: active?.company ?? null,
    activeRole: active?.role ?? null,
    // RLS on platform_staff only lets a member read their own row, so a
    // returned row is proof; the database re-checks on every staff action.
    isStaff: Boolean(staffResult.data),
  };
});

/**
 * Account context or a redirect to sign-in carrying the current path.
 *
 * The middleware already redirects unauthenticated users, but this runs
 * again on the page itself: the middleware is a convenience, the page is
 * the boundary.
 */
export async function requireAccountContext(
  fallbackPath: string,
  search?: string,
): Promise<AccountContext> {
  const context = await getAccountContext();
  if (context) return context;

  // Prefer the real request path, which the middleware forwards; a layout
  // only knows the route it was mounted under, so its own guess would send
  // the user to the wrong page after signing in.
  const headerList = await headers();
  const actual = headerList.get(PATHNAME_HEADER);
  const target = actual ? safeNextPath(actual, fallbackPath) : `${fallbackPath}${search ?? ''}`;

  redirect(signInUrlFor(target));
}

/** Managers may invite, change roles and remove members. */
export function isManager(role: MemberRole | null): boolean {
  return role === 'owner' || role === 'admin';
}

export function companyDisplayName(company: Company): string {
  return company.display_name ?? company.legal_name;
}

/**
 * What the account area should show this user first.
 *
 * A company account with no company yet is the common case right after
 * e-mail confirmation: sign-up creates the user, company creation is the
 * step after.
 */
export type AccountStage =
  | 'individual'
  | 'needs-company'
  | 'company';

export function accountStage(context: AccountContext): AccountStage {
  if (context.profile?.account_type === 'individual') return 'individual';
  if (context.memberships.length === 0) return 'needs-company';
  return 'company';
}
