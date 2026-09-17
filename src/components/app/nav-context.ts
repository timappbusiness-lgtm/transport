import { headers } from 'next/headers';
import { PATHNAME_HEADER } from '@/lib/auth/pathname-header';
import type { AccountContext } from '@/lib/auth/account';
import type { NavContext } from '@/lib/navigation';

/**
 * What the shell needs to know about who is looking at it.
 *
 * The path comes from the header the middleware sets, so the sidebar can
 * mark the current item without becoming a client component — a menu is the
 * last thing that should ship JavaScript to work out which link is bold.
 */
export async function currentPathname(): Promise<string> {
  const header = (await headers()).get(PATHNAME_HEADER) ?? '';
  return header.split('?')[0] ?? '';
}

export function navContextOf(context: AccountContext): NavContext {
  return {
    accountType: context.profile?.account_type ?? 'company',
    companyType: context.activeCompany?.company_type ?? null,
    role: context.activeRole,
    isStaff: context.isStaff,
  };
}
