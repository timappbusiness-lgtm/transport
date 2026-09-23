'use client';

import { successCopy } from '@/content/success';
import Link from 'next/link';
import { SuccessMoment } from '@/components/ui/success-moment';
import { ROUTES } from '@/config/routes';
import { useActionState } from 'react';
import { submitCompanyForReviewAction } from '@/app/cont/actions';
import type { ActionState } from '@/app/cont/actions';
import { FormError } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/primitives';
import { accountCopy } from '@/content/account';
import type { VerificationStatus } from '@/lib/auth/account';
import type { ReviewProgress } from '@/lib/review';

const EMPTY: ActionState = {};
const c = accountCopy.review;

/**
 * Where a carrier finds out what is left, and says they are ready.
 *
 * The button appears only when the same arithmetic the database applies
 * says it should — `reviewProgress` here, `company_review_readiness()`
 * there. When they disagree the RPC wins and its refusal is shown, which is
 * why this screen never needs to explain a failure it did not predict.
 */
export function SubmitForReview({
  companyId,
  status,
  progress,
  needsVehicles,
  vehiclesReady,
  note,
}: {
  companyId: string;
  status: VerificationStatus;
  progress: ReviewProgress;
  needsVehicles: boolean;
  vehiclesReady: boolean;
  note: string | null;
}) {
  const [state, action] = useActionState(submitCompanyForReviewAction, EMPTY);

  if (status === 'pending' || state.notice) {
    return (
      <Panel title={c.pendingTitle} tone="neutral">
        <p className="text-body text-muted">{c.pendingBody}</p>
      </Panel>
    );
  }

  if (status === 'verified') {
    // The second moment: the firm can work. Its next action is the board.
    return (
      <SuccessMoment title={successCopy.verified.title} body={successCopy.verified.body}>
        <Link href={ROUTES.requests} className={buttonClasses('primary', 'sm')}>
          {successCopy.verified.action}
        </Link>
      </SuccessMoment>
    );
  }

  if (status === 'suspended') {
    return (
      <Panel title={c.suspendedTitle} tone="danger">
        <p className="text-body text-muted">{c.suspendedBody}</p>
      </Panel>
    );
  }

  const canSubmit = progress.ready && (!needsVehicles || vehiclesReady);

  return (
    <section className="rounded-card border border-border bg-surface p-5">
      <h2 className="text-body font-medium">{c.title}</h2>

      {status === 'rejected' ? (
        <div className="mt-3">
          <StatusBadge tone="danger">{c.rejectedTitle}</StatusBadge>
          <p className="mt-2 text-body text-muted">{c.rejectedBody}</p>
          {note ? <p className="mt-2 text-body">{note}</p> : null}
        </div>
      ) : null}

      <p className="mt-3 text-body text-muted">
        {c.progress(String(progress.inPlace), String(progress.total))}
      </p>
      <p className="mt-1 text-body text-muted">
        {!progress.ready
          ? c.stillMissing
          : needsVehicles && !vehiclesReady
            ? c.vehiclesMissing
            : c.ready}
      </p>

      <form action={action} className="mt-4">
        <input type="hidden" name="company_id" value={companyId} />
        <button
          type="submit"
          disabled={!canSubmit}
          className={buttonClasses('primary', 'md')}
        >
          {c.submit}
        </button>
      </form>

      {state.error ? (
        <div className="mt-3">
          <FormError>{state.error}</FormError>
        </div>
      ) : null}
    </section>
  );
}

function Panel({
  title,
  tone,
  children,
}: {
  title: string;
  tone: 'success' | 'neutral' | 'danger';
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-border bg-surface p-5">
      <StatusBadge tone={tone}>{title}</StatusBadge>
      <div className="mt-3">{children}</div>
    </section>
  );
}
