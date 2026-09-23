'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { latestRequestsAction } from '@/app/home-actions';
import { RequestCard } from '@/components/requests/request-card';
import { homeCopy } from '@/content/home';
import { FEED_LIMIT_MOBILE, hasNewer, type PublicRequest } from '@/lib/requests';
import { cn } from '@/lib/utils';

const c = homeCopy.activity.feed;
const POLL_MS = 60_000;

/**
 * The feed, kept current without moving under anyone.
 *
 * A grid that silently replaces its own cards while somebody is reading the
 * third one is worse than a stale grid. So the poll never swaps anything
 * in: when something newer exists it raises a small marker, and the visitor
 * decides. The marker's row is always in the layout, so its appearance
 * shifts nothing.
 */
export function RequestFeed({
  initial,
  renderedAt,
}: {
  initial: PublicRequest[];
  /** The server's clock at render time, so relative times start in step. */
  renderedAt: string;
}) {
  const [items, setItems] = useState(initial);
  const [pending, setPending] = useState<PublicRequest[] | null>(null);
  // The poll runs from an interval set up once, so it cannot close over
  // `items`. A ref, written in an effect rather than during render, is how
  // it reads the current list.
  const shown = useRef(items);
  useEffect(() => {
    shown.current = items;
  }, [items]);

  const poll = useCallback(async () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    try {
      const latest = await latestRequestsAction();
      if (hasNewer(shown.current, latest)) setPending(latest);
    } catch {
      // A poll that fails changes nothing on screen. The next one may work,
      // and a visitor reading a grid of cards does not need to hear about it.
    }
  }, []);

  useEffect(() => {
    const id = setInterval(() => void poll(), POLL_MS);
    // Coming back to a tab left open for an hour should not mean waiting
    // another minute to find out nothing has changed.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void poll();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [poll]);

  const now = new Date(renderedAt);

  return (
    <div>
      <div className="flex min-h-8 items-center justify-end">
        {pending ? (
          <button
            type="button"
            onClick={() => {
              setItems(pending);
              setPending(null);
            }}
            className={cn(
              'inline-flex items-center gap-2 rounded-pill border border-border-strong bg-surface px-3 py-1.5',
              'text-small transition-[border-color] duration-150 hover:border-foreground',
            )}
          >
            <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
            {c.newBadge}
            <span className="text-muted">{c.showNew}</span>
          </button>
        ) : null}
      </div>

      <ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((request, index) => (
          <RequestCard
            key={request.id}
            request={request}
            now={now}
            // A phone shows four. The last two stay in the markup so the
            // grid is one list at every width, and one fetch either way.
            className={index >= FEED_LIMIT_MOBILE ? 'hidden sm:block' : undefined}
          />
        ))}
      </ul>
    </div>
  );
}
