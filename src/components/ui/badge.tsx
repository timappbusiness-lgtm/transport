import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * The small signs that a place is alive — and nothing else.
 *
 * One component for every badge that is not a status: „Nou" on something
 * published today, „acum 16 min", the number waiting on a menu item,
 * „Expres", „Pe retur". Status keeps `StatusBadge`, with its dot and its
 * ink label, because a status is a state somebody must read and these are
 * signs somebody scans.
 *
 * Shape, size and colour come from the kind, and the kind is the only
 * thing a caller chooses. There is no `className` for colour and no
 * `size` prop: the moment a screen can make its own „Nou" slightly
 * bigger, every screen does.
 *
 * Whether a badge appears at all is `src/lib/badges.ts`'s decision. This
 * component is never given a zero, a stale date or an empty string to
 * draw; the caller asks the rule first and renders nothing when it says
 * no.
 *
 * None of them carries an icon, and none of them is round and filled
 * with a tick: nothing here may read as a verification mark, which is a
 * thing the platform grants after checking documents and nothing else.
 */
export type BadgeKind = 'new' | 'time' | 'count' | 'express' | 'return';

const SHAPE =
  'inline-flex flex-none items-center justify-center whitespace-nowrap rounded-pill font-mono text-label leading-none tabular-nums';

const KIND: Record<BadgeKind, string> = {
  // The accent, on its own subtle ground: the one badge meant to be
  // seen first. Uppercase, because „NOU" at 10px reads and „Nou" does not.
  new: 'border border-accent-border bg-accent-subtle px-2 py-1 font-semibold uppercase tracking-[0.08em] text-accent',
  // Quiet: a fact about the row, not a reason to open it.
  time: 'border border-border bg-tint-stone px-2 py-1 text-muted',
  // Filled accent: something is waiting on you.
  count: 'min-w-5 bg-accent px-1.5 py-0.5 font-semibold text-on-accent',
  // Warm: a way the job is run, and the one clients pay more for.
  express: 'border border-border bg-tint-sand px-2 py-1 uppercase tracking-[0.06em] text-foreground',
  // Cool: which leg of the round trip this platform is on.
  return: 'border border-border bg-tint-sky px-2 py-1 uppercase tracking-[0.06em] text-foreground',
};

export function Badge({
  kind,
  children,
  label,
}: {
  kind: BadgeKind;
  children: ReactNode;
  /**
   * What a screen reader hears after the visible text, when the visible
   * text alone is not a sentence — „3" beside „Mesaje" is „3 necitite".
   */
  label?: string | undefined;
}) {
  return (
    <span data-badge={kind} className={cn(SHAPE, KIND[kind])}>
      {children}
      {label === undefined ? null : <span className="sr-only"> {label}</span>}
    </span>
  );
}
