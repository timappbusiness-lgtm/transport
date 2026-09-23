'use client';

import { useEffect, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { askOfferAction, type OfferState } from '@/app/cont/oferte/actions';
import { buttonClasses } from '@/components/ui/button';
import { offersCopy } from '@/content/oferte';
import { wouldBeMasked } from '@/lib/contact-mask';
import { createPollScheduler } from '@/lib/poll-scheduler';
import type { ThreadMessage } from '@/lib/offers-source';
import { cn } from '@/lib/utils';
import { KeepingForm } from '@/components/ui/keeping-form';
import { draftKey } from '@/lib/continuity/drafts';
import { useTextDraft } from '@/lib/continuity/use-text-draft';
import { useKeptActionState } from '@/lib/continuity/use-kept-action-state';

const EMPTY: OfferState = {};
const c = offersCopy.thread;

/** Fifteen seconds: a question is not a chat, and a chat is not this. */
const POLL_MS = 15_000;

/**
 * One timer for the whole page.
 *
 * The offer list renders a thread under each offer, and each of them
 * refreshing the page on its own schedule is six identical requests
 * every fifteen seconds for one answer. They share this instead. It
 * also skips a tick while the tab is in the background, because polling
 * a page nobody is looking at is work nobody asked for.
 */
const POLL = createPollScheduler(POLL_MS, undefined, () =>
  typeof document === 'undefined' ? false : document.visibilityState === 'visible',
);

function when(iso: string): string {
  return new Date(iso).toLocaleString('ro-RO', {
    timeZone: 'Europe/Bucharest',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * The clarification thread on one offer.
 *
 * Two things it says out loud, because both are surprising otherwise:
 * that contact details are masked until the order is confirmed, and —
 * before sending — that this particular message looks like it contains
 * some. The second is the browser's copy of the rule; the database
 * applies the real one either way.
 */
export function OfferThread({
  offerId,
  messages,
  startOpen = false,
}: {
  offerId: string;
  messages: readonly ThreadMessage[];
  startOpen?: boolean;
}) {
  const [state, action, pending] = useKeptActionState(askOfferAction, EMPTY);
  const [open, setOpen] = useState(startOpen || messages.length > 0);
  // Kept in the browser while it is written; emptied once it has gone.
  // It used to be emptied by the button's own click — before the form
  // read it, so the question went out blank and was refused, and the
  // text was gone either way.
  const [body, setBody, clearBody] = useTextDraft(draftKey('intrebare', offerId));
  const [handled, setHandled] = useState(state);
  if (handled !== state) {
    setHandled(state);
    if (state.sent === true) clearBody();
  }
  const id = useId();
  const router = useRouter();

  // Polling rather than a subscription: fifteen seconds is well inside
  // what a question deserves, and a websocket per open offer is a
  // connection pool nobody asked for.
  useEffect(() => {
    if (!open) return;
    return POLL.subscribe(() => router.refresh());
  }, [open, router]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonClasses('secondary', 'sm')}
      >
        {c.open}
      </button>
    );
  }

  const warns = body.trim() !== '' && wouldBeMasked(body);

  return (
    <div className="mt-4 rounded-card border border-border bg-ground-alt p-4">
      <h4 className="text-body font-medium">{c.title}</h4>
      <p className="mt-1 max-w-[58ch] text-small text-muted">{c.lede}</p>

      {messages.length === 0 ? (
        <p className="mt-3 text-body text-muted">{c.empty}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {messages.map((message) => (
            <li
              key={message.id}
              className={cn(
                'rounded-card border p-3',
                message.is_mine ? 'border-border bg-surface' : 'border-border-strong bg-surface',
              )}
            >
              <p className="text-small text-muted">
                {message.is_mine ? 'Tu' : message.sender_name} · {when(message.created_at)}
              </p>
              <p className={cn('mt-1 whitespace-pre-line break-words text-body', message.is_hidden && 'text-muted')}>
                {message.body}
              </p>
              {message.was_masked && message.is_mine ? (
                <p className="mt-1.5 text-small text-muted">{c.masked}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <KeepingForm action={action} className="mt-4 flex flex-col gap-2">
        <input type="hidden" name="offer_id" value={offerId} />
        <label htmlFor={`${id}-body`} className="sr-only">
          {c.placeholder}
        </label>
        <textarea
          id={`${id}-body`}
          name="body"
          rows={2}
          maxLength={1000}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={c.placeholder}
          className="w-full resize-y rounded-input border border-border-strong bg-surface px-3 py-2 text-body"
        />
        {warns ? (
          <p role="status" className="text-small text-muted">
            {c.willMask}
          </p>
        ) : null}
        <div>
          <button
            type="submit"
            disabled={pending || body.trim() === ''}
            className={buttonClasses('secondary', 'sm')}
          >
            {pending ? c.sending : c.send}
          </button>
        </div>
        {state.error !== undefined ? (
          <p role="alert" className="text-body text-danger">
            {state.error}
          </p>
        ) : null}
      </KeepingForm>
    </div>
  );
}
