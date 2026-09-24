import { ROUTES } from '@/config/routes';
import type { JourneyStage } from './carrier-journey';
import type { AccountType, CompanyType, MemberRole } from './navigation';

/**
 * Where somebody lands after signing in with nowhere particular to go.
 *
 * With somewhere to go — the page they were on, the step of a form — they
 * go back there, always (`explicitNextAfterAuth`). This is only for the
 * sign-in pressed from the homepage or typed in directly.
 *
 * A carrier opens the platform to see requests they can bid on, so they
 * land on the board — their own view of it, matching the firm — rather
 * than on a dashboard that sends them there. Unless the firm's file is
 * unfinished: then the next step of it, because the board is where they
 * will want to send an offer, and an offer is what the unfinished file
 * stops. A suspended firm lands on the dashboard, which says why.
 *
 * Everybody else — a client, a forwarder, a private person, a driver —
 * lands in their account, which is built around their own work.
 *
 * Free of Supabase and React; `src/app/intrare/route.ts` reads the facts.
 */
export interface LandingInput {
  accountType: AccountType | null;
  companyType: CompanyType | null;
  role: MemberRole | null;
  /** The carrier journey's stage, for a firm's account; null otherwise. */
  stage: JourneyStage | null;
  /**
   * Terms to accept before anything else. The gate that asks is the
   * account's (`src/app/cont/layout.tsx`); a public page does not draw it,
   * so landing on the board would let somebody work without it.
   */
  termsPending: boolean;
}

export function landingAfterSignIn(input: LandingInput): string {
  if (input.termsPending) return ROUTES.account;
  if (input.role === 'driver') return ROUTES.account;
  if (input.accountType !== 'company') return ROUTES.account;

  // A firm's account with no firm yet: the firm is the next step, whatever
  // it will turn out to do.
  if (input.companyType === null) return ROUTES.accountCompanyCreate;

  const carrier = input.companyType === 'transport' || input.companyType === 'both';
  if (!carrier) return ROUTES.account;

  switch (input.stage) {
    case 'no_company':
      return ROUTES.accountCompanyCreate;
    case 'no_vehicle':
      return ROUTES.accountFleet;
    case 'documents':
    case 'rejected':
    case 'ready_to_submit':
      return ROUTES.accountDocuments;
    case 'suspended':
      return ROUTES.account;
    // With us, or verified: the board. Browsing is never gated, and a firm
    // waiting on our check has nothing to finish.
    case 'in_review':
    case 'verified':
    case null:
      return ROUTES.requests;
  }
}
