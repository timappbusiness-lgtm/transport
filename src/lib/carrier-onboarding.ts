import type { VerificationStatus } from './auth/account';

/**
 * Where a carrier stands between „I have an account" and „I can send an
 * offer", in one place.
 *
 * A real dispatcher told us the platform was hard to connect. The worst
 * of it was here: signing up put a carrier on a dashboard that asked for
 * a company file before they had seen a single request, and nothing on
 * the board ever said what was still missing. So the board now says it,
 * calmly, on every screen a carrier lands on.
 *
 * Two screens read this: the banner above the boards and „Trimite
 * ofertă" on a request. They used to be two copies of the same six
 * conditions, which is how two screens start disagreeing about whether
 * somebody may work. Nothing here is the rule — `guard_offer_insert()`
 * and `guard_offer_terms()` are, in Postgres. This is what lets a
 * carrier read why before typing rather than after.
 *
 * Free of React and of Supabase.
 */

export type CarrierStage =
  /** Signed in, no firm on the account yet. */
  | 'no_company'
  /** The file is started and not yet sent for review. */
  | 'draft'
  /** Sent, waiting on us. */
  | 'pending'
  /** We asked for something to be corrected. */
  | 'rejected'
  | 'suspended'
  /** Nothing in the way. */
  | 'ready';

export interface CarrierState {
  verificationStatus: VerificationStatus;
  isSuspended: boolean;
}

/**
 * The stage, from the firm's own state.
 *
 * `null` means no firm on the account. Suspension is read before the
 * verification status for the reason `banners.ts` reads it first too:
 * a suspended firm cannot work whatever else is true of it.
 */
export function carrierStage(company: CarrierState | null): CarrierStage {
  if (company === null) return 'no_company';
  if (company.isSuspended || company.verificationStatus === 'suspended') return 'suspended';
  switch (company.verificationStatus) {
    case 'verified':
      return 'ready';
    case 'rejected':
      return 'rejected';
    case 'pending':
      return 'pending';
    default:
      return 'draft';
  }
}

/** Whether the boards should say anything to this carrier at all. */
export function needsOnboarding(stage: CarrierStage): boolean {
  return stage !== 'ready';
}

// ---------------------------------------------------------------------
// The company file, as steps somebody can count
// ---------------------------------------------------------------------

/**
 * The file, named in the order it is filled in.
 *
 * It was five tabs with no numbers on them, which is a menu rather than a
 * path: nothing on screen said how much was left. The steps are the tabs
 * — no screen was added and none was removed — with a number, and with
 * one line each saying why the question is asked. A dispatcher who is
 * given a reason fills a field in; one who is not, closes the tab.
 *
 * „Documente" is not on this list. It is its own screen, one document at
 * a time, because that is the step people do with a telephone in one hand
 * and a folder in the other.
 */
export const COMPANY_FILE_STEPS = ['identitate', 'acoperire', 'dotari', 'alerte', 'public'] as const;

export type CompanyFileStep = (typeof COMPANY_FILE_STEPS)[number];

/**
 * „Pasul 2 din 4".
 *
 * The total is the number of steps this firm actually has, not the
 * number the list can hold: a forwarder has no equipment step, and
 * telling it there are five when it will ever see four is a small lie
 * that makes the last step look broken.
 */
export function stepPosition(
  step: CompanyFileStep,
  steps: readonly CompanyFileStep[],
): { current: number; total: number } | null {
  const index = steps.indexOf(step);
  if (index < 0) return null;
  return { current: index + 1, total: steps.length };
}
