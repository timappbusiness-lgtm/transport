import { cn } from '@/lib/utils';

/**
 * Placeholder for a photograph we do not have yet.
 *
 * TODO: replace with a real photograph of a partner car carrier, shot for
 * us or licensed. Until then this draws its own schematic — no stock
 * imagery, no people, nothing licensed. It is deliberately a line drawing
 * rather than an imitation photograph, so nobody mistakes it for a picture
 * of a real customer's truck.
 */

/** One car, drawn on a baseline at (x, y). */
function Car({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path
        d="M2 0v-9l8-9h23l9 9v9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d="M0 0h44" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="1" r="3.2" fill="currentColor" />
      <circle cx="33" cy="1" r="3.2" fill="currentColor" />
    </g>
  );
}

export function PhotoSlot({
  label,
  className,
}: {
  label: string;
  className?: string | undefined;
}) {
  return (
    <div
      role="img"
      aria-label={label}
      className={cn(
        'relative overflow-hidden rounded-card border border-white/15',
        'bg-[linear-gradient(160deg,#41525a,#7e8d94)]',
        className,
      )}
    >
      <svg
        viewBox="0 0 400 260"
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 size-full text-white/55"
        aria-hidden="true"
      >
        {/* road */}
        <path d="M0 214h400" stroke="rgba(255,255,255,.22)" strokeWidth="1.5" />
        <path
          d="M18 226h46M96 226h46M174 226h46M252 226h46M330 226h46"
          stroke="rgba(255,255,255,.14)"
          strokeWidth="3"
          strokeLinecap="round"
        />

        {/* tractor unit */}
        <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round">
          <path d="M26 200v-42l16-20h34v62" />
          <path d="M42 138h34" />
        </g>

        {/* two-deck trailer: posts, decks, chassis */}
        <g fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round">
          <path d="M88 200h286" />
          <path d="M92 200v-84M370 200v-84" />
          <path d="M92 116h278" />
          <path d="M92 156h278" />
        </g>

        {/* wheels */}
        <g fill="currentColor">
          <circle cx="52" cy="204" r="9" />
          <circle cx="300" cy="204" r="9" />
          <circle cx="340" cy="204" r="9" />
        </g>

        {/* the load: two cars per deck */}
        <g>
          <Car x={112} y={156} />
          <Car x={236} y={156} />
          <Car x={112} y={196} />
          <Car x={236} y={196} />
        </g>
      </svg>
    </div>
  );
}
