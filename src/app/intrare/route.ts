import { NextResponse, type NextRequest } from 'next/server';
import { ROUTES } from '@/config/routes';
import { getAccountContext } from '@/lib/auth/account';
import { loadJourney } from '@/lib/journey-source';
import { landingAfterSignIn } from '@/lib/landing';

/**
 * The first page after a sign-in that had nowhere particular to go.
 *
 * A redirect and nothing else, decided in a request of its own — the
 * sign-in has already set its cookies, so this reads the session like
 * any page does. The rule is `landingAfterSignIn`; this only reads the
 * facts it needs: the kind of account, the firm, the role, and for a
 * firm's account the carrier journey's stage.
 */
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const context = await getAccountContext();
  if (context === null) {
    return NextResponse.redirect(new URL(ROUTES.signIn, request.nextUrl.origin));
  }

  const accountType = context.profile?.account_type ?? null;
  const journey = accountType === 'company' ? await loadJourney(context) : null;
  const target = landingAfterSignIn({
    accountType,
    companyType: context.activeCompany?.company_type ?? null,
    role: context.activeRole,
    stage: journey?.stage ?? null,
  });
  return NextResponse.redirect(new URL(target, request.nextUrl.origin));
}
