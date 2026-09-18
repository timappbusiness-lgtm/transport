'use client';

import { useActionState, useState } from 'react';
import Link from 'next/link';
import {
  cancelRequestAction,
  publishExistingRequestAction,
  reopenRequestAction,
  type RequestActionState,
} from '@/app/cerere/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { CountryTag, StatusBadge } from '@/components/ui/primitives';
import { requestRoute } from '@/config/routes';
import { requestsCopy } from '@/content/cereri';
import { CARGO_CATEGORY_LABELS, SERVICE_TYPE_LABELS, formatWindow } from '@/lib/departures';
import {
  canCancel,
  canPublish,
  canReopen,
  isOnBoard,
  type MyRequest,
} from '@/lib/my-requests';
import type { ListingStatus } from '@/lib/requests';

const EMPTY: RequestActionState = {};

function tone(status: ListingStatus): 'success' | 'warning' | 'danger' | 'neutral' {
  if (isOnBoard(status)) return 'success';
  if (status === 'draft' || status === 'expired') return 'warning';
  if (status === 'cancelled' || status === 'suspended' || status === 'disputed') return 'danger';
  return 'neutral';
}

/**
 * One of the client's own requests, with whatever it can do next.
 *
 * Which buttons appear comes from the status, and the same rules are in
 * `publish_cargo_request`, `cancel_cargo_request` and
 * `reopen_cargo_request` — which is where they are enforced. A button that
 * is not shown is a courtesy; the RPC is the rule.
 */
export function MyRequestCard({ request, today }: { request: MyRequest; today: string }) {
  const [state, action, pending] = useActionState(
    async (previous: RequestActionState, formData: FormData) => {
      const intent = String(formData.get('intent') ?? '');
      if (intent === 'publish') return publishExistingRequestAction(previous, formData);
      if (intent === 'cancel') return cancelRequestAction(previous, formData);
      if (intent === 'reopen') return reopenRequestAction(previous, formData);
      return previous;
    },
    EMPTY,
  );
  const [confirming, setConfirming] = useState<'cancel' | 'reopen' | null>(null);

  const c = requestsCopy.mine;
  const vehicle = [request.make, request.model, request.year].filter(Boolean).join(' ');
  const note = requestsCopy.statusNote[request.status as keyof typeof requestsCopy.statusNote];

  return (
    <li className="rounded-card border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[1rem]">
            <span className="font-medium">{request.fromCity}</span>
            <CountryTag cc={request.fromCountry} />
            <span className="text-muted">→</span>
            <span className="font-medium">{request.toCity}</span>
            <CountryTag cc={request.toCountry} />
          </p>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-muted">
            <span>{formatWindow(request.loadingFrom, request.loadingTo)}</span>
            <span>{CARGO_CATEGORY_LABELS[request.category]}</span>
            {vehicle !== '' ? <span className="truncate">{vehicle}</span> : null}
            {request.serviceType !== 'pe_sens' ? (
              <span>{SERVICE_TYPE_LABELS[request.serviceType]}</span>
            ) : null}
          </p>
        </div>
        <StatusBadge tone={tone(request.status)}>
          {requestsCopy.status[request.status as keyof typeof requestsCopy.status]}
        </StatusBadge>
      </div>

      {note ? <p className="mt-3 text-[0.8125rem] text-muted">{note}</p> : null}

      <form action={action} className="mt-4 flex flex-col gap-3">
        <input type="hidden" name="request_id" value={request.id} />

        {confirming === 'reopen' ? (
          <div className="flex flex-col gap-3 rounded-input border border-border-strong bg-ground-alt p-4">
            <p className="text-sm font-medium">{c.reopenTitle}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-xs font-medium">
                {c.reopenFrom}
                <input
                  type="date"
                  name="loading_from"
                  min={today}
                  defaultValue={today}
                  required
                  className="rounded-input border border-border-strong bg-surface px-3 py-2 text-sm font-normal"
                />
              </label>
              <label className="flex flex-col gap-1.5 text-xs font-medium">
                {c.reopenTo}
                <input
                  type="date"
                  name="loading_to"
                  min={today}
                  className="rounded-input border border-border-strong bg-surface px-3 py-2 text-sm font-normal"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                name="intent"
                value="reopen"
                disabled={pending}
                className={buttonClasses('primary', 'sm')}
              >
                {c.reopenSubmit}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className={buttonClasses('secondary', 'sm')}
              >
                {c.back}
              </button>
            </div>
          </div>
        ) : confirming === 'cancel' ? (
          <div className="flex flex-col gap-3 rounded-input border border-danger/40 bg-danger/8 p-4">
            <p className="text-sm">{c.cancelConfirm}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                name="intent"
                value="cancel"
                disabled={pending}
                className={buttonClasses('primary', 'sm')}
              >
                {c.confirm}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(null)}
                className={buttonClasses('secondary', 'sm')}
              >
                {c.back}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            {isOnBoard(request.status) ? (
              <Link href={requestRoute(request.id)} className={buttonClasses('secondary', 'sm')}>
                {c.view}
              </Link>
            ) : null}
            {canPublish(request.status) ? (
              <button
                type="submit"
                name="intent"
                value="publish"
                disabled={pending}
                className={buttonClasses('primary', 'sm')}
              >
                {c.publishDraft}
              </button>
            ) : null}
            {canReopen(request.status) ? (
              <button
                type="button"
                onClick={() => setConfirming('reopen')}
                className={buttonClasses('primary', 'sm')}
              >
                {c.reopen}
              </button>
            ) : null}
            {canCancel(request.status) ? (
              <button
                type="button"
                onClick={() => setConfirming('cancel')}
                className={buttonClasses('secondary', 'sm')}
              >
                {c.cancel}
              </button>
            ) : null}
          </div>
        )}

        <FormError>{state.error}</FormError>
        {state.notice ? <FormNotice>{state.notice}</FormNotice> : null}
      </form>
    </li>
  );
}
