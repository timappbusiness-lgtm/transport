import type { Company } from '@/lib/auth/account';

/**
 * Which single thing the account area tells somebody about their company.
 *
 * There is never more than one. A screen that opens with four warnings
 * stacked on top of each other is a screen people learn to scroll past, so
 * the rules below pick one: the thing that is blocking work first, then the
 * thing that will block it soon, then the thing that is merely useful to
 * know.
 *
 * Free of React, because "why am I seeing this and not that" should be
 * answerable by reading one list.
 */

export type BannerKind =
  | 'suspended'
  | 'rejected'
  | 'pending'
  | 'documents_expiring'
  | 'trial_ending'
  | 'quota_reached';

export interface BannerState {
  kind: BannerKind;
  /** A blocking banner cannot be dismissed: it is the state of the firm. */
  blocking: boolean;
}

/**
 * Highest first. Suspension outranks everything because nothing else
 * matters while the firm cannot work; a rejected verification outranks a
 * pending one because it needs an action rather than patience; expiring
 * documents outrank the trial because letting them lapse is what causes the
 * suspension at the top of this list.
 */
const PRIORITY: readonly BannerKind[] = [
  'suspended',
  'rejected',
  'pending',
  'documents_expiring',
  'quota_reached',
  'trial_ending',
];

const BLOCKING: ReadonlySet<BannerKind> = new Set<BannerKind>([
  'suspended',
  'rejected',
  'pending',
]);

export interface BannerInput {
  company: Company | null;
  /** Documents expiring within the warning window, or already rejected. */
  expiringDocuments: number;
  /** Days until the free period ends, null when there is no trial running. */
  trialDaysLeft: number | null;
  /** True once the plan's contact allowance is spent. */
  quotaReached: boolean;
}

/** A trial is worth mentioning in its last week, not for a month. */
export const TRIAL_WARNING_DAYS = 7;

export function pickBanner(input: BannerInput): BannerState | null {
  const kinds = new Set<BannerKind>();
  const company = input.company;

  if (company) {
    if (company.is_suspended || company.verification_status === 'suspended') {
      kinds.add('suspended');
    } else if (company.verification_status === 'rejected') {
      kinds.add('rejected');
    } else if (company.verification_status === 'pending') {
      kinds.add('pending');
    }
  }

  if (input.expiringDocuments > 0) kinds.add('documents_expiring');
  if (input.quotaReached) kinds.add('quota_reached');
  if (
    input.trialDaysLeft !== null &&
    input.trialDaysLeft >= 0 &&
    input.trialDaysLeft <= TRIAL_WARNING_DAYS
  ) {
    kinds.add('trial_ending');
  }

  const kind = PRIORITY.find((candidate) => kinds.has(candidate));
  return kind ? { kind, blocking: BLOCKING.has(kind) } : null;
}
