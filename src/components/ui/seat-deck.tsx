import { cn } from '@/lib/utils';

/**
 * The seats on a car carrier. Filling the platform is the carrier's whole
 * economics, so this is the picture behind „plătești locul, nu camionul".
 *
 * Shared by the homepage panel, the hero and the departures board, so the
 * same eight cells mean the same thing in a sample and in a real route.
 *
 * It used to be eight empty rectangles with a car outline in the taken
 * ones and the word „liber" in the rest — legible, and schematic in the
 * way a wireframe is. Three things changed, all of them about reading it
 * at a glance rather than counting it:
 *
 *   - the taken seats share one tinted panel behind them, so the block
 *     that is gone reads as one shape and the gap reads as the offer;
 *   - a free cell is a dashed outline, which is the drawing convention
 *     for „space reserved, nothing in it";
 *   - the count goes in the accent, because on this card the number of
 *     free seats is the whole point.
 *
 * No animation: it is a static diagram, so there is nothing for
 * prefers-reduced-motion to turn off.
 */

/** One car, seen from the side, sized to its cell. */
function CarGlyph() {
  return (
    <svg viewBox="0 0 24 16" aria-hidden="true" className="w-[72%] text-muted">
      {/* Body heavier than the details, which is the two-weight rule the
          hero illustration uses as well. */}
      <path
        d="M3 11h18M5 11V8l2.5-3.5h9L19 8v3"
        stroke="currentColor"
        strokeWidth="1.7"
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d="M9.4 4.6V8M14.6 4.6V8" stroke="currentColor" strokeWidth="1" opacity="0.55" />
      <circle cx="8" cy="12.4" r="1.7" fill="currentColor" />
      <circle cx="16" cy="12.4" r="1.7" fill="currentColor" />
    </svg>
  );
}

export function SeatDeck({
  taken,
  total,
  compact = false,
  freeLabel = 'liber',
  caption,
  className,
}: {
  taken: number;
  total: number;
  compact?: boolean;
  /** Written inside an empty seat when there is room for it. */
  freeLabel?: string;
  /**
   * „3 locuri libere din 8". Rendered under the deck with the free count
   * pulled out in the accent — the one number the card exists to show.
   * Left out entirely when the caller writes its own line.
   */
  caption?: { free: number; total: number; suffix: string } | undefined;
  className?: string | undefined;
}) {
  const free = total - taken;

  return (
    <div className={cn('min-w-0', className)}>
      <ul
        className={cn('grid gap-1.5', compact ? 'grid-cols-8' : 'grid-cols-4')}
        aria-label={`${free} locuri libere din ${total}`}
      >
        {Array.from({ length: total }, (_, index) => {
          const filled = index < taken;
          return (
            <li
              key={index}
              className={cn(
                'relative grid aspect-[4/3] place-items-center rounded-tight border',
                filled
                  ? // The taken block: a single tint across all of them, so
                    // five full seats read as one mass rather than as five
                    // separate boxes to count.
                    'border-border-strong/35 bg-gradient-to-b from-ground-alt to-border/60'
                  : 'border-dashed border-accent/45 bg-accent/4',
              )}
            >
              {filled ? (
                <CarGlyph />
              ) : compact ? null : (
                // Four columns rather than eight for exactly this: at
                // eight the cell is ~22px and „liber" at 10px mono spills
                // out of it. Two rows of four is the same eight seats and
                // leaves room for the word the brief asks for.
                <span className="font-mono text-label text-accent">{freeLabel}</span>
              )}
            </li>
          );
        })}
      </ul>

      {caption ? (
        <p className="mt-3 font-mono text-small text-muted">
          <span className="text-figure-sm font-display text-accent tabular-nums align-[-2px]">
            {caption.free}
          </span>{' '}
          {caption.suffix}
        </p>
      ) : null}
    </div>
  );
}
