import { MARK, markStroke, type MarkSize } from '@/config/brand-mark';
import { cn } from '@/lib/utils';

export type MarkTone = 'color' | 'mono';

/**
 * The stroke classes for each tone.
 *
 * `color` follows the surface it sits on: petrol and ink on a light
 * ground, the bright step and the pale step inside anything marked
 * `data-surface="dark"` (the header, the dark sections). The same mark in
 * the footer and in the bar is therefore one component, not two, and a
 * dark section added tomorrow gets the right colours without anybody
 * passing a prop. `mono` is one colour, the text colour around it — for a
 * print, a stamp-sized use, or a surface we have not measured.
 */
const TONES: Record<MarkTone, { car: string; deck: string }> = {
  color: {
    car: 'fill-accent in-data-[surface=dark]:fill-accent-bright',
    deck: 'stroke-foreground in-data-[surface=dark]:stroke-accent-on-dark',
  },
  mono: { car: 'fill-current', deck: 'stroke-current' },
};

/**
 * The mark on its own, without the name.
 *
 * Decorative by default: wherever it appears the name is beside it, or in
 * an `sr-only` span next to it (`<Logo layout="mark">`), so a screen
 * reader hears the brand once rather than twice, once as an image.
 */
export function LogoMark({
  size = 24,
  tone = 'color',
  className,
}: {
  size?: MarkSize;
  tone?: MarkTone;
  className?: string;
}) {
  const stroke = TONES[tone];
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${MARK.grid} ${MARK.grid}`}
      aria-hidden="true"
      focusable="false"
      data-logo-mark={tone}
      data-size={size}
      className={cn('flex-none', className)}
    >
      <path d={MARK.car} className={stroke.car} />
      <path
        d={MARK.deck}
        fill="none"
        strokeWidth={markStroke(size)}
        strokeLinecap="round"
        strokeLinejoin="round"
        className={stroke.deck}
      />
    </svg>
  );
}
