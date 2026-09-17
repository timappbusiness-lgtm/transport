import { cn } from '@/lib/utils';
import { homeCopy } from '@/content/home';

/**
 * The seats on a car carrier. Filling the platform is the carrier's whole
 * economics, so this is the picture behind "plătești locul, nu camionul".
 */
export function SeatDeck({
  taken,
  total,
  compact = false,
}: {
  taken: number;
  total: number;
  compact?: boolean;
}) {
  return (
    <ul
      className={cn('grid gap-1.5', compact ? 'grid-cols-8' : 'grid-cols-4 sm:grid-cols-8')}
      aria-label={`${total - taken} locuri libere din ${total}`}
    >
      {Array.from({ length: total }, (_, index) => {
        const filled = index < taken;
        return (
          <li
            key={index}
            className={cn(
              'grid aspect-[3/4] place-items-center rounded-[6px] border',
              filled
                ? 'border-border-strong/40 bg-ground-alt'
                : 'border-dashed border-foreground/45 bg-transparent',
            )}
          >
            {filled ? (
              <svg viewBox="0 0 24 16" aria-hidden="true" className="w-[70%] text-muted">
                <path
                  d="M3 11h18M5 11V8l2.5-3.5h9L19 8v3"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  fill="none"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                <circle cx="8" cy="12.5" r="1.6" fill="currentColor" />
                <circle cx="16" cy="12.5" r="1.6" fill="currentColor" />
              </svg>
            ) : compact ? null : (
              <span className="font-mono text-[0.5rem] tracking-[0.06em] text-foreground">
                {homeCopy.panel.seats.free}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
