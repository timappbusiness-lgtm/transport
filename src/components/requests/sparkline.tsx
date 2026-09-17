import { cn } from '@/lib/utils';

/**
 * Thirty days of publications, drawn by hand.
 *
 * Inline SVG rather than a chart library: this is one polyline and one dot,
 * and a charting dependency would cost more kilobytes than the whole
 * section. It is not decoration — a shape that trends upwards is a claim —
 * so it carries a label, and the two figures beside it carry the numbers.
 *
 * The aspect ratio is left alone (no `preserveAspectRatio="none"`), which
 * keeps the last-point dot a circle rather than stretching it into an
 * ellipse, and keeps the line weight even.
 */
const WIDTH = 240;
const HEIGHT = 48;
const PADDING = 5;

export function Sparkline({
  values,
  label,
  className,
}: {
  values: number[];
  label: string;
  className?: string | undefined;
}) {
  if (values.length < 2) return null;

  const max = Math.max(...values, 1);
  const step = (WIDTH - PADDING * 2) / (values.length - 1);

  const points = values.map((value, index) => ({
    x: PADDING + index * step,
    y: HEIGHT - PADDING - (value / max) * (HEIGHT - PADDING * 2),
  }));

  const line = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const last = points[points.length - 1];

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className={cn('h-auto w-full max-w-[15rem]', className)}
    >
      {/* A baseline, so a flat run of zeros reads as a floor rather than as
          a chart that failed to draw. */}
      <line
        x1={PADDING}
        y1={HEIGHT - PADDING}
        x2={WIDTH - PADDING}
        y2={HEIGHT - PADDING}
        strokeWidth="1"
        className="stroke-border"
      />
      <polyline
        points={line}
        fill="none"
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        className="stroke-foreground"
      />
      {last ? <circle cx={last.x} cy={last.y} r="2.5" className="fill-foreground" /> : null}
    </svg>
  );
}
