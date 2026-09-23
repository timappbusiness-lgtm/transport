import { CountryTag } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

/**
 * A corridor: where a lorry is already going, and how far off it will
 * turn for one more car.
 *
 * The card used to say this in words — origin, arrow, destination, then a
 * definition list with „Ocol acceptat · 50 km" in it. Correct, and it
 * made the detour sound like a fee rather than like a shape. Drawn, the
 * two things a carrier actually weighs are visible at once: the line they
 * are already driving, and the small arc off it.
 *
 * Inline SVG on tokens, so it inherits light or dark from whatever it
 * sits on. Static, so prefers-reduced-motion has nothing to disable. The
 * whole figure carries one accessible label and the text beside it
 * repeats every value, so nothing here is meaning only a sighted person
 * can reach.
 */

export function CorridorRoute({
  from,
  fromCc,
  to,
  toCc,
  waypoints,
  detour,
  detourLabel,
  className,
}: {
  from: string;
  fromCc: string;
  to: string;
  toCc: string;
  /** „Viena · Budapesta · Oradea" — drawn as ticks, listed underneath. */
  waypoints: string;
  /** „50 km", already formatted. */
  detour: string;
  detourLabel: string;
  className?: string | undefined;
}) {
  const stops = waypoints
    .split('·')
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <div className={cn('min-w-0', className)}>
      <div className="flex flex-wrap items-center gap-2 text-body">
        <span className="font-medium">{from}</span>
        <CountryTag cc={fromCc} />
        <span aria-hidden="true" className="text-border-strong">
          →
        </span>
        <span className="font-medium">{to}</span>
        <CountryTag cc={toCc} />
      </div>

      <svg
        viewBox="0 0 300 64"
        role="img"
        aria-label={`${from} către ${to}, prin ${stops.join(', ')}. ${detourLabel}: ${detour}.`}
        className="mt-4 w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* The corridor itself. */}
        <line
          x1="10"
          y1="38"
          x2="290"
          y2="38"
          stroke="var(--color-border-strong)"
          strokeWidth="2"
          strokeLinecap="round"
        />

        {/* Waypoints: a tick each, evenly spaced between the two ends.
            They are passed through, not stopped at, so they are marks on
            the line rather than dots of their own. */}
        {stops.map((stop, i) => {
          // Ticks live in the first two thirds of the line so the detour
          // arc has a clear span of its own. They collided before, and a
          // tick under the arc reads as „the detour is that waypoint".
          const x = 24 + ((i + 1) * 150) / (stops.length + 1);
          return (
            <line
              key={stop}
              x1={x}
              y1="32"
              x2={x}
              y2="44"
              stroke="var(--color-border-strong)"
              strokeWidth="1.4"
              strokeLinecap="round"
              opacity="0.7"
            />
          );
        })}

        {/* The detour: an arc leaving the line and rejoining it. Drawn in
            the accent because the number beside it is what a carrier is
            deciding on. */}
        <path
          d="M196 38 Q 232 4 268 38"
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeDasharray="5 4"
        />
        <circle cx="232" cy="13" r="3" fill="var(--color-accent)" />

        {/* The two ends. Filled origin, ringed destination — the same
            convention as the order timeline: done, and not yet. */}
        <circle cx="10" cy="38" r="5" fill="var(--color-foreground)" />
        <circle
          cx="290"
          cy="38"
          r="5"
          fill="var(--color-surface)"
          stroke="var(--color-foreground)"
          strokeWidth="2"
        />
      </svg>

      <p className="mt-1 truncate font-mono text-label uppercase text-muted">{waypoints}</p>

      <p className="mt-3 flex items-baseline gap-2 text-small text-muted">
        {detourLabel}
        <span className="font-mono font-medium tabular-nums text-accent">{detour}</span>
      </p>
    </div>
  );
}
