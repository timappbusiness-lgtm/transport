import { ROUTES } from '@/config/routes';
import type { VerificationStatus } from './auth/account';
import type { CompanyType } from './validation/auth';

/**
 * A carrier's way from „I have an account" to „I can send an offer", one
 * question at a time, and each question at the moment it pays off.
 *
 * A dispatcher told us signing up was too complicated. The questions are
 * not the problem — the documents are what a carrier pays us to have
 * checked, and every one of them stays. What changed is the order:
 *
 *   1. an account: name, e-mail, password, telephone
 *   2. the board, straight away, with everything on it readable
 *   3. the firm: a CUI that fills itself in from ANAF, the type, a contact
 *   4. the vehicles: plate, type, how many cars fit
 *   5. the documents — asked when the carrier first tries to send an
 *      offer, publish a route or see a contact, with a line on why each
 *      is needed
 *   6. our check, as before
 *
 * None of this is a rule. `company_can_act()` in Postgres is: offers,
 * routes and contacts are refused to a firm that is not verified, whatever
 * this file says. This is what lets the screen send somebody to the one
 * step that is missing instead of to a refusal.
 *
 * Free of React and of Supabase.
 */

export type JourneyStage =
  /** An account and no firm. */
  | 'no_company'
  /** A carrier's firm with no vehicle yet. A forwarder never stops here. */
  | 'no_vehicle'
  /** Blocking documents still to upload, for the firm or a vehicle. */
  | 'documents'
  /** Everything blocking is uploaded; the firm has not been sent to us. */
  | 'ready_to_submit'
  /** Sent back to correct something. */
  | 'rejected'
  /** With us. */
  | 'in_review'
  | 'suspended'
  | 'verified';

export interface JourneyInput {
  company: {
    companyType: CompanyType;
    verificationStatus: VerificationStatus;
    isSuspended: boolean;
  } | null;
  /** Active vehicles on the firm. */
  vehicleCount: number;
  /**
   * Blocking requirements, for the firm and every vehicle, with nothing
   * usable uploaded: missing, rejected or expired. A document waiting for
   * our check counts as uploaded — the same reading as
   * `company_review_readiness()`.
   */
  blockingMissing: number;
}

/** A firm that carries: it has vehicles, and vehicle documents. */
export function carries(companyType: CompanyType): boolean {
  return companyType === 'transport' || companyType === 'both';
}

export function journeyStage(input: JourneyInput): JourneyStage {
  const { company } = input;
  if (company === null) return 'no_company';
  // Suspension first, as everywhere: a suspended firm cannot work,
  // whatever else is true of it.
  if (company.isSuspended || company.verificationStatus === 'suspended') return 'suspended';
  if (company.verificationStatus === 'verified') return 'verified';
  if (company.verificationStatus === 'pending') return 'in_review';
  if (carries(company.companyType) && input.vehicleCount === 0) return 'no_vehicle';
  if (input.blockingMissing > 0) {
    return company.verificationStatus === 'rejected' ? 'rejected' : 'documents';
  }
  return company.verificationStatus === 'rejected' ? 'rejected' : 'ready_to_submit';
}

/** What a carrier wants to do when the platform asks for something. */
export const JOURNEY_ACTIONS = ['oferta', 'traseu', 'contact'] as const;
export type JourneyAction = (typeof JOURNEY_ACTIONS)[number];

export function isJourneyAction(value: unknown): value is JourneyAction {
  return typeof value === 'string' && (JOURNEY_ACTIONS as readonly string[]).includes(value);
}

/**
 * Whether the platform will let this firm do it now. The mirror of
 * `company_can_act()`: verified and not suspended. Browsing is never on
 * this list — the boards are open to everyone.
 */
export function canDo(stage: JourneyStage, action: JourneyAction, companyType: CompanyType | null): boolean {
  if (stage !== 'verified') return false;
  // Routes are a carrier's: a forwarder has no vehicle to put on one.
  if (action === 'traseu') return companyType !== null && carries(companyType);
  return true;
}

/**
 * Where somebody who tried to do `action` is sent, with the way back.
 * `null` when there is nowhere to send them: allowed, or with us already.
 */
export function gateHref(stage: JourneyStage, action: JourneyAction, next: string | null): string | null {
  switch (stage) {
    case 'verified':
    case 'in_review':
      return null;
    case 'no_company':
      return withJourney(ROUTES.accountCompanyCreate, action, next);
    case 'no_vehicle':
      return withJourney(ROUTES.accountFleet, action, next);
    default:
      return withJourney(ROUTES.accountDocuments, action, next);
  }
}

/** `path?pentru=oferta&next=/cereri/…` — the reason and the way back travel together. */
export function withJourney(path: string, action: JourneyAction | null, next: string | null): string {
  const params = new URLSearchParams();
  if (action !== null) params.set('pentru', action);
  if (next !== null && next !== '') params.set('next', next);
  const query = params.toString();
  return query === '' ? path : `${path}?${query}`;
}

/**
 * After the firm is saved. A carrier goes on to its vehicles; a forwarder
 * has none, and goes to the documents if it came here wanting something,
 * or back to where it was.
 */
export function afterCompanyCreated(
  companyType: CompanyType | string,
  next: string | null,
  action: JourneyAction | null = null,
): string {
  if (companyType === 'transport' || companyType === 'both') {
    return withJourney(ROUTES.accountFleet, action, next);
  }
  if (action !== null) return withJourney(ROUTES.accountDocuments, action, next);
  return next ?? ROUTES.requests;
}

/** After the vehicles: to the documents when something is waiting on them, otherwise back. */
export function afterVehicles(action: JourneyAction | null, next: string | null): string {
  if (action !== null) return withJourney(ROUTES.accountDocuments, action, next);
  return next ?? ROUTES.requests;
}

/**
 * „Durează aproximativ X minute să le încarci." One photograph and one
 * confirmed date per document, at the pace measured in
 * docs/17-viteza-inscriere.md. A promise about the typing, which we
 * control — never about how long our check takes.
 */
export const SECONDS_PER_DOCUMENT = 45;

export function uploadMinutes(documentCount: number): number {
  if (documentCount <= 0) return 0;
  return Math.max(1, Math.round((documentCount * SECONDS_PER_DOCUMENT) / 60));
}
