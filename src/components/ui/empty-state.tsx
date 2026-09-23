import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A screen with nothing on it, drawn rather than merely stated.
 *
 * An empty list that says „Nu ai nicio cerere publicată." and nothing
 * else is indistinguishable from a list that failed to load. A small
 * line drawing says „this is the shape of the thing that will be here",
 * which is the difference between empty and broken.
 *
 * Four figures, all from the same family as the illustrative cards:
 * strokes on `currentColor` at two weights, no fill, nothing that could
 * be mistaken for a photograph. They are decoration beside a sentence
 * that carries the meaning, so each one is `aria-hidden` and the heading
 * is what a screen reader reads.
 *
 * Static — there is nothing here for prefers-reduced-motion to disable.
 */

export type EmptyFigureKind = 'list' | 'route' | 'document' | 'search';

/**
 * The drawing on its own, for an empty state that already has a shape of
 * its own — `/trasee` is a real screen with a heading and two ways
 * forward, and wrapping it in `EmptyState` would be a layout change to
 * gain a figure it can simply be given.
 */
export function EmptyFigure({ kind, className }: { kind: EmptyFigureKind; className?: string | undefined }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  return (
    <svg viewBox="0 0 64 44" aria-hidden="true" className={cn('h-11 w-16 text-border-strong', className)}>
      {kind === 'list' ? (
        <>
          <rect x="8" y="8" width="48" height="28" rx="4" strokeWidth="1.8" {...common} />
          <path d="M16 18h20M16 26h30" strokeWidth="1.2" opacity=".7" {...common} />
        </>
      ) : null}
      {kind === 'route' ? (
        <>
          <path d="M10 30h44" strokeWidth="1.8" {...common} />
          <circle cx="10" cy="30" r="3.4" strokeWidth="1.8" {...common} />
          <circle cx="54" cy="30" r="3.4" strokeWidth="1.8" {...common} />
          <path d="M24 30v-6M40 30v-6" strokeWidth="1.2" opacity=".7" {...common} />
        </>
      ) : null}
      {kind === 'document' ? (
        <>
          <path d="M18 6h18l10 10v22a2 2 0 0 1-2 2H18a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z" strokeWidth="1.8" {...common} />
          <path d="M36 6v10h10" strokeWidth="1.8" {...common} />
          <path d="M23 26h18M23 32h12" strokeWidth="1.2" opacity=".7" {...common} />
        </>
      ) : null}
      {kind === 'search' ? (
        <>
          <circle cx="28" cy="20" r="12" strokeWidth="1.8" {...common} />
          <path d="M37 29l9 9" strokeWidth="1.8" {...common} />
          <path d="M22 20h12" strokeWidth="1.2" opacity=".7" {...common} />
        </>
      ) : null}
    </svg>
  );
}

export function EmptyState({
  figure = 'list',
  title,
  body,
  action,
  className,
}: {
  figure?: EmptyFigureKind | undefined;
  title: string;
  /** One sentence at most. An empty screen is not the place for a paragraph. */
  body?: ReactNode;
  /** The way out, when there is one. */
  action?: ReactNode;
  className?: string | undefined;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 rounded-card border border-border bg-surface px-5 py-12 text-center',
        className,
      )}
    >
      <EmptyFigure kind={figure} />
      <p className="text-h3">{title}</p>
      {body ? <div className="max-w-[46ch] text-small text-muted">{body}</div> : null}
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
