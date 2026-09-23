'use client';

import Image from 'next/image';
import { useEffect, useRef } from 'react';
import { markReadAction } from '@/app/cont/mesaje/actions';
import { StatusBadge } from '@/components/ui/primitives';
import { messagesCopy } from '@/content/mesaje';
import { formatTime, groupByDay, type Message } from '@/lib/messages';
import { subscribeToConversation, type RealtimeClientLike } from '@/lib/message-realtime';
import { createPollScheduler } from '@/lib/poll-scheduler';
import { isSupabaseConfigured } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

const c = messagesCopy.thread;
const POLL_MS = 15_000;

/**
 * Un singur temporizator pentru tot modulul, nu unul pe fir.
 *
 * Același obiect ca la firul ofertei, și din același motiv: un inbox cu
 * zece conversații deschise ar fi avut zece ceasuri care bat pe rând.
 * Sare peste tic cât timp tabul este în fundal.
 */
const POLL = createPollScheduler(POLL_MS, undefined, () =>
  typeof document === 'undefined' ? false : document.visibilityState === 'visible',
);

/**
 * Firul, cu separatoare pe zile.
 *
 * O singură abonare de pagină, prin `createPollScheduler` — cea scrisă
 * în faza ofertelor tocmai pentru că fiecare fir cu temporizatorul lui
 * înseamnă zece temporizatoare pe un inbox cu zece fire. Ticul sare cât
 * timp tabul e ascuns.
 */
export function Thread({
  conversationId,
  messages,
  urls,
  onRefresh,
}: {
  conversationId: string;
  messages: readonly Message[];
  urls: Record<string, string>;
  onRefresh: () => void;
}) {
  // Marcat citit o dată, la deschidere. Un ref, nu o stare: nimic din
  // ce se desenează nu depinde de el, iar un setState într-un efect ar
  // declanșa un al doilea render degeaba.
  const marked = useRef<string | null>(null);
  useEffect(() => {
    if (marked.current === conversationId) return;
    marked.current = conversationId;
    void markReadAction(conversationId);
  }, [conversationId]);

  useEffect(() => POLL.subscribe(onRefresh), [onRefresh]);

  // Realtime peste temporizator. Dacă lipsește configurarea, dacă
  // publicația nu are tabela, sau dacă rețeaua taie WebSocket-ul,
  // abonarea pică în gol și rămâne ticul de mai sus — motiv pentru care
  // nu se anunță nicăieri pe ecran că „ești conectat". O promisiune de
  // instantaneu pe care nu o putem garanta este mai rea decât liniștea.
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let close: (() => void) | null = null;
    try {
      const client = createClient() as unknown as RealtimeClientLike;
      close = subscribeToConversation(client, conversationId, onRefresh);
    } catch (error) {
      console.error('[mesaje:realtime]', error);
    }
    return () => close?.();
  }, [conversationId, onRefresh]);

  const groups = groupByDay(messages);
  const anyMasked = messages.some((m) => m.was_masked);

  return (
    <div className="flex flex-col gap-4">
      {anyMasked ? (
        <p className="rounded-card border border-border bg-ground-alt px-4 py-3 text-small text-muted">
          {c.masked}
        </p>
      ) : null}

      {groups.map((group) => (
        <section key={group.day} aria-label={group.label} className="flex flex-col gap-2">
          <p className="text-center text-small text-muted">{group.label}</p>
          {group.messages.map((message) => (
            <Bubble key={message.id} message={message} urls={urls} />
          ))}
        </section>
      ))}
    </div>
  );
}

function Bubble({ message, urls }: { message: Message; urls: Record<string, string> }) {
  if (message.hidden_at !== null) {
    return (
      <p className="self-center text-small text-muted">
        <StatusBadge tone="neutral">{c.hidden}</StatusBadge>
      </p>
    );
  }

  return (
    <article
      className={cn(
        'max-w-[min(34rem,85%)] rounded-card border px-3.5 py-2.5',
        message.mine
          ? 'self-end border-transparent bg-foreground text-white'
          : 'self-start border-border bg-surface',
      )}
    >
      {!message.mine ? (
        <p className="text-small text-muted">{message.sender_name ?? '—'}</p>
      ) : null}

      {message.body !== null && message.body !== '' ? (
        <p className="whitespace-pre-line break-words text-body">{message.body}</p>
      ) : null}

      {message.attachments.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-2">
          {message.attachments.map((path) =>
            urls[path] ? (
              <li key={path}>
                <a href={urls[path]} target="_blank" rel="noreferrer">
                  <Image
                    src={urls[path]}
                    alt=""
                    width={160}
                    height={120}
                    unoptimized
                    className="h-[7.5rem] w-[10rem] rounded-input object-cover"
                  />
                </a>
              </li>
            ) : null,
          )}
        </ul>
      ) : null}

      <p
        className={cn(
          'mt-1 text-small',
          message.mine ? 'text-white/70' : 'text-muted',
        )}
      >
        {formatTime(message.created_at)}
      </p>
    </article>
  );
}
