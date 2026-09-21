'use client';

import { useActionState, useEffect, useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { askOfferAction, type OfferState } from '@/app/cont/oferte/actions';
import { buttonClasses } from '@/components/ui/button';
import { offersCopy } from '@/content/oferte';
import { wouldBeMasked } from '@/lib/contact-mask';
import type { ThreadMessage } from '@/lib/offers-source';
import { cn } from '@/lib/utils';

const EMPTY: OfferState = {};
const c = offersCopy.thread;

/** Fifteen seconds: a question is not a chat, and a chat is not this. */
const POLL_MS = 15_000;

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
  const [state, action, pending] = useActionState(askOfferAction, EMPTY);
  const [open, setOpen] = useState(startOpen || messages.length > 0);
  const [body, setBody] = useState('');
  const id = useId();
  const router = useRouter();

  // Polling rather than a subscription: fifteen seconds is well inside
  // what a question deserves, and a websocket per open offer is a
  // connection pool nobody asked for.
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
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
      <h4 className="text-sm font-medium">{c.title}</h4>
      <p className="mt-1 max-w-[58ch] text-xs text-muted">{c.lede}</p>

      {messages.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{c.empty}</p>
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
              <p className="text-xs text-muted">
                {message.is_mine ? 'Tu' : message.sender_name} · {when(message.created_at)}
              </p>
              <p className={cn('mt-1 whitespace-pre-line text-sm', message.is_hidden && 'text-muted')}>
                {message.body}
              </p>
              {message.was_masked && message.is_mine ? (
                <p className="mt-1.5 text-xs text-muted">{c.masked}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <form action={action} className="mt-4 flex flex-col gap-2">
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
          className="w-full resize-y rounded-input border border-border-strong bg-surface px-3 py-2 text-sm"
        />
        {warns ? (
          <p role="status" className="text-xs text-muted">
            {c.willMask}
          </p>
        ) : null}
        <div>
          <button
            type="submit"
            disabled={pending || body.trim() === ''}
            onClick={() => setBody('')}
            className={buttonClasses('secondary', 'sm')}
          >
            {pending ? c.sending : c.send}
          </button>
        </div>
        {state.error !== undefined ? (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        ) : null}
      </form>
    </div>
  );
}
