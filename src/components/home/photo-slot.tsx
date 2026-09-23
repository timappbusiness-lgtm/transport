import { cn } from '@/lib/utils';

/**
 * The car transporter behind the hero.
 *
 * TODO: replace with a real photograph of a partner car carrier, shot for
 * us or licensed. Until then this draws its own schematic — no stock
 * imagery, no people, nothing licensed. It is deliberately a line drawing
 * rather than an imitation photograph, so nobody mistakes it for a
 * picture of a real customer's truck.
 *
 * It was one stroke width throughout, which is what made it read as a
 * diagram of a lorry rather than as a lorry. Four changes, all of them
 * depth rather than detail:
 *
 *   - two weights. The structure that holds the load — cab, decks, posts,
 *     chassis — is heavy; glazing, deck edges and the cars are light. An
 *     eye reads the heavy lines as the object and the light ones as what
 *     is on it;
 *   - the carried cars sit at a lower opacity than the frame, because
 *     they are cargo and the transporter is the subject;
 *   - a soft elliptical shadow under the wheels, so the whole thing sits
 *     on the road instead of floating over it;
 *   - the road recedes: the lane marks shorten and fade towards the left,
 *     which is the cheapest perspective cue there is.
 *
 * Static, so there is nothing for prefers-reduced-motion to disable. The
 * gradient and strokes are fixed light values because this panel is
 * always drawn on the dark hero; the cards that float over it use tokens.
 */

/** One carried car. Light weight — it is the load, not the vehicle. */
function Car({ x, y }: { x: number; y: number }) {
  return (
    // The load is what the platform is about, so it is the one thing in
    // the drawing in the bright accent; the rig stays white line-work.
    <g transform={`translate(${x} ${y})`} opacity="0.9" className="text-accent-bright">
      <path
        d="M2 0v-9l8-9h23l9 9v9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Glazing: the line that turns a wedge into a car. */}
      <path d="M11 -9h22M19 -17.5V-9M27 -17.5V-9" stroke="currentColor" strokeWidth="0.9" opacity="0.6" />
      <path d="M0 0h44" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="12" cy="1" r="3" fill="currentColor" />
      <circle cx="33" cy="1" r="3" fill="currentColor" />
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
        'bg-linear-160 from-photo-from to-photo-to',
        className,
      )}
    >
      <svg
        viewBox="0 0 400 260"
        preserveAspectRatio="xMidYMid meet"
        className="absolute inset-0 size-full text-white/60"
        aria-hidden="true"
      >
        <defs>
          {/* The ground shadow. Soft, wide and short — a high sun, which
              is what keeps it from reading as a drop shadow on a sticker. */}
          <radialGradient id="ps-shadow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" className="[stop-color:var(--color-foreground)]" stopOpacity=".45" />
            <stop offset="100%" className="[stop-color:var(--color-foreground)]" stopOpacity="0" />
          </radialGradient>
          {/* The road fading out to the left. */}
          <linearGradient id="ps-road" x1="0" x2="1">
            <stop offset="0%" className="[stop-color:var(--color-surface)]" stopOpacity=".04" />
            <stop offset="100%" className="[stop-color:var(--color-surface)]" stopOpacity=".26" />
          </linearGradient>
        </defs>

        {/* road */}
        <path d="M0 214h400" stroke="url(#ps-road)" strokeWidth="1.5" />
        <g className="stroke-surface/14" strokeLinecap="round">
          <path d="M22 226h34" strokeWidth="2.2" opacity=".45" />
          <path d="M98 226h42" strokeWidth="2.6" opacity=".6" />
          <path d="M176 226h46" strokeWidth="3" opacity=".75" />
          <path d="M254 226h48" strokeWidth="3.2" opacity=".9" />
          <path d="M332 226h50" strokeWidth="3.4" />
        </g>

        {/* the shadow the whole rig casts, under the wheels */}
        <ellipse cx="208" cy="212" rx="180" ry="13" fill="url(#ps-shadow)" />

        {/* STRUCTURE — heavy. Cab, chassis, posts, decks. */}
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinejoin="round"
          strokeLinecap="round"
        >
          <path d="M26 200v-42l16-20h34v62" />
          <path d="M88 200h286" />
          <path d="M92 200v-84M370 200v-84" />
          <path d="M92 116h278" />
        </g>

        {/* DETAIL — light. Glazing, the middle deck, the posts between. */}
        <g fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" opacity=".75">
          <path d="M42 138h34" />
          <path d="M92 156h278" />
          <path d="M184 116v84M278 116v84" />
        </g>

        {/* wheels */}
        <g fill="currentColor">
          <circle cx="52" cy="204" r="9" />
          <circle cx="300" cy="204" r="9" />
          <circle cx="340" cy="204" r="9" />
        </g>
        <g fill="none" className="stroke-foreground/35" strokeWidth="2.4">
          <circle cx="52" cy="204" r="4" />
          <circle cx="300" cy="204" r="4" />
          <circle cx="340" cy="204" r="4" />
        </g>

        {/* the load: two cars per deck */}
        <Car x={112} y={156} />
        <Car x={236} y={156} />
        <Car x={112} y={196} />
        <Car x={236} y={196} />
      </svg>
    </div>
  );
}
