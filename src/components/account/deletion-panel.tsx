'use client';

import { useActionState, useId, useState } from 'react';
import {
  cancelDeletionAction,
  requestDeletionAction,
  type PersonalDataState,
} from '@/app/cont/setari/date-personale/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { personalDataCopy } from '@/content/date-personale';
import type { DeletionRequest } from '@/lib/account-deletion-source';

const c = personalDataCopy.deletion;
const EMPTY: PersonalDataState = {};
const CONTROL =
  'w-full rounded-input border border-border-strong bg-surface px-3.5 py-2.5 text-[0.9375rem]';

function onDate(value: string | null): string {
  if (value === null) return '';
  return new Date(value).toLocaleDateString('ro-RO', {
    timeZone: 'Europe/Bucharest',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export interface DeletionPanelProps {
  kind: 'user' | 'company';
  /** For a firm: its id and the name that has to be typed back. */
  companyId?: string;
  /** What the person types to confirm: their e-mail, or the firm's name. */
  confirmWith: string;
  graceDays: number;
  blockers: string[];
  request: DeletionRequest | null;
}

/**
 * Asking for an erasure, in two steps.
 *
 * The typed confirmation is a brake and nothing more. It is checked on
 * the server too, but the rule that matters — who may ask, what blocks
 * it, how long the grace period runs — is in the database, and the
 * sentence shown when it refuses is the database's own.
 *
 * What is blocking is shown *before* the second step rather than after
 * it: somebody who types their own e-mail address to confirm something
 * and is then told it was never possible has been made to do a
 * frightening thing for nothing.
 */
export function DeletionPanel({
  kind,
  companyId,
  confirmWith,
  graceDays,
  blockers,
  request,
}: DeletionPanelProps) {
  const [state, action, pending] = useActionState(requestDeletionAction, EMPTY);
  const [cancelState, cancelAction, cancelling] = useActionState(cancelDeletionAction, EMPTY);
  const [confirming, setConfirming] = useState(false);
  const id = useId();

  const scheduled = request?.status === 'scheduled';
  const blocked = request?.status === 'blocked' || blockers.length > 0;
  const reasons = request?.reason_blocked
    ? [request.reason_blocked]
    : blockers;

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="rounded-card border border-border bg-surface p-5 sm:p-6"
    >
      <h2 id={`${id}-title`} className="text-[1.0625rem]">
        {kind === 'company' ? `${c.companyTitle}: ${confirmWith}` : c.title}
      </h2>
      <p className="mt-2 max-w-[62ch] text-sm text-muted">
        {kind === 'company' ? c.companyBody(graceDays) : c.body(graceDays)}
      </p>

      {scheduled ? (
        <div className="mt-4 rounded-input border border-warning/45 bg-warning/8 p-4">
          <p className="text-sm font-medium">{c.scheduledTitle}</p>
          <p className="mt-1 text-sm">{c.scheduledOn(onDate(request!.scheduled_for))}</p>
          <p className="mt-1 text-sm text-muted">{c.held}</p>
          <form action={cancelAction} className="mt-3">
            <input type="hidden" name="request_id" value={request!.id} />
            <button type="submit" disabled={cancelling} className={buttonClasses('primary', 'sm')}>
              {c.cancel}
            </button>
          </form>
        </div>
      ) : null}

      {!scheduled && blocked ? (
        <div className="mt-4 rounded-input border border-danger/45 bg-danger/8 p-4">
          <p className="text-sm font-medium">{c.blockedTitle}</p>
          <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          <p className="mt-2 text-sm text-muted">{c.blockedHelp}</p>
        </div>
      ) : null}

      {!scheduled && !blocked ? (
        <>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <h3 className="text-sm font-medium">{c.whatGoes}</h3>
              <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-muted">
                {c.whatGoesList.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-medium">{c.whatStays}</h3>
              <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-sm text-muted">
                {c.whatStaysList.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          </div>

          {confirming ? (
            <form action={action} className="mt-5 flex max-w-[42ch] flex-col gap-2">
              <input type="hidden" name="kind" value={kind} />
              {companyId !== undefined ? (
                <input type="hidden" name="company_id" value={companyId} />
              ) : null}
              <label htmlFor={`${id}-confirm`} className="text-sm font-medium">
                {c.confirmLabel}
              </label>
              <p className="text-sm text-muted">
                {kind === 'company' ? c.confirmCompany(confirmWith) : c.confirmUser(confirmWith)}
              </p>
              <input
                id={`${id}-confirm`}
                name="confirmation"
                required
                autoComplete="off"
                className={CONTROL}
              />
              <div className="mt-1 flex flex-wrap gap-3">
                <button type="submit" disabled={pending} className={buttonClasses('primary', 'sm')}>
                  {c.start}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  className={buttonClasses('secondary', 'sm')}
                >
                  {c.back}
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className={`${buttonClasses('secondary', 'sm')} mt-5`}
            >
              {kind === 'company' ? c.companyTitle : c.title}
            </button>
          )}
        </>
      ) : null}

      {state.error !== undefined ? (
        <div className="mt-3">
          <FormError>{state.error}</FormError>
        </div>
      ) : null}
      {cancelState.error !== undefined ? (
        <div className="mt-3">
          <FormError>{cancelState.error}</FormError>
        </div>
      ) : null}
      {cancelState.notice !== undefined ? (
        <div className="mt-3">
          <FormNotice>{cancelState.notice}</FormNotice>
        </div>
      ) : null}
    </section>
  );
}
