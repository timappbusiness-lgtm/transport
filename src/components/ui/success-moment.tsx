import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A small confirmation for a moment that deserves one.
 *
 * A drawing, a sentence, and the next thing to do. The drawing is a road
 * running to a flag — arrived, not approved: nothing round, nothing with
 * a tick in it, nothing that could be read as a seal or a verification
 * mark, because the one thing on this platform that looks official is
 * the verification itself, and it is granted after checking documents.
 *
 * On the accent's subtle ground rather than the success green: the green
 * belongs to a status chip, and this is not a status, it is a moment.
 * It rises into place once, by transform, and not at all under
 * prefers-reduced-motion.
 */
export function SuccessMoment({
  title,
  body,
  children,
  as: Heading = 'h2',
  className,
}: {
  title: string;
  /** One sentence. */
  body: string;
  /** The next action — a link, a button, the contacts. */
  children?: ReactNode;
  as?: 'h2' | 'h3';
  className?: string | undefined;
}) {
  return (
    <section
      data-success-moment
      className={cn(
        'flex flex-col gap-4 rounded-card border border-accent-border bg-accent-subtle p-5 sm:flex-row sm:items-start sm:p-6',
        'motion-safe:animate-[rise-in_var(--duration-calm)_var(--ease-soft)_both]',
        className,
      )}
    >
      <SuccessArt className="h-14 w-24 flex-none" />
      <div className="min-w-0 flex-1">
        <Heading className="text-h3">{title}</Heading>
        <p className="mt-1 max-w-[56ch] text-small text-muted">{body}</p>
        {children === undefined ? null : <div className="mt-4">{children}</div>}
      </div>
    </section>
  );
}

/** A road to a flag, in the illustration family. */
function SuccessArt({ className }: { className?: string | undefined }) {
  return (
    <svg
      viewBox="0 0 96 56"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn('text-foreground', className)}
    >
      {/* the road, narrowing to the horizon */}
      <path d="M10 50L40 20M86 50L56 20" stroke="currentColor" strokeWidth="2.2" />
      <path d="M48 46v-6M48 34v-4M48 26v-3" stroke="currentColor" strokeWidth="1.2" opacity="0.7" />
      {/* the flag where it ends */}
      <path d="M58 20V6" stroke="currentColor" strokeWidth="2.2" />
      <path d="M58 6.5h14l-3.5 4.5 3.5 4.5H58" className="fill-accent stroke-accent" strokeWidth="1.2" />
      <ellipse cx="48" cy="52" rx="40" ry="2" className="fill-current" opacity="0.08" />
    </svg>
  );
}
