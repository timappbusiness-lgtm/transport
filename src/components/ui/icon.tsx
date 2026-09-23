import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ICON_GAP, ICON_SIZES, ICON_STROKE, type IconSize } from '@/lib/icons';
import { cn } from '@/lib/utils';

/**
 * The only way an icon reaches the page.
 *
 * Four jobs, all of which are easy to get wrong one component at a time:
 *
 *   - one size scale and one stroke width, so a row of icons reads as a
 *     row rather than as several different drawings;
 *   - one of two tones, chosen at the call site. See `IconTone` below —
 *     the default inherits, which is right beside coloured text and
 *     wrong nearly everywhere else;
 *   - a decision about meaning, forced at the call site. Either the icon
 *     is decoration beside a visible label — `aria-hidden`, the default —
 *     or it is carrying the meaning itself and needs a `label`, which
 *     becomes its accessible name. There is no third option, and that is
 *     the point: an icon alone with no name is a thing somebody cannot
 *     read, and it is the failure that gets shipped;
 *   - one gap between an icon and its label, which is `IconLabel`.
 */

/**
 * Two tones and an escape hatch.
 *
 * `strong` is ink — the same token as body text — and it is what „accent"
 * means in this design system. There is no brand accent colour;
 * `globals.css` says so at the top and means it: emphasis comes from
 * weight, space and the dark sections. So an icon that should be seen is
 * not a coloured icon, it is an ink one, and the muted grey is what a
 * secondary icon gets.
 *
 * `inherit` takes the colour of whatever it sits in. Correct inside a
 * button, a status chip or a coloured banner, where the parent already
 * decided; wrong in a row of muted metadata, where it silently becomes
 * the same grey as 10px type and disappears — which is how this whole
 * system came to be invisible in the first place.
 */
export type IconTone = 'strong' | 'muted' | 'inherit';

const TONE_CLASS: Record<IconTone, string> = {
  strong: 'text-foreground',
  muted: 'text-muted',
  inherit: '',
};

export function Icon({
  as: Glyph,
  size = 'md',
  tone = 'inherit',
  label,
  className,
}: {
  as: LucideIcon;
  size?: IconSize | undefined;
  tone?: IconTone | undefined;
  /**
   * Set only when there is no visible text saying the same thing. Leave
   * it out beside a label — a screen reader that reads „Motocicletă
   * Motocicletă" is worse than one that reads it once.
   */
  label?: string | undefined;
  className?: string | undefined;
}) {
  return (
    <Glyph
      size={ICON_SIZES[size]}
      strokeWidth={ICON_STROKE}
      className={cn('flex-none', TONE_CLASS[tone], className)}
      aria-hidden={label === undefined ? true : undefined}
      aria-label={label}
      role={label === undefined ? undefined : 'img'}
    />
  );
}

/**
 * An icon and its label, with the one gap between them.
 *
 * Every pairing went through a hand-written `flex items-center gap-1.5`
 * before this existed, and they had drifted to three different gaps. The
 * component is not ceremony — it is the only way a row of them lines up
 * without somebody checking each call site.
 */
export function IconLabel({
  as,
  size = 'md',
  tone = 'strong',
  wrap = false,
  className,
  children,
}: {
  as: LucideIcon;
  size?: IconSize | undefined;
  tone?: IconTone | undefined;
  /**
   * Let a long label run onto a second line instead of ending in „…".
   * For names that have to be read whole — a document, a company — in a
   * column a phone makes narrow.
   */
  wrap?: boolean | undefined;
  className?: string | undefined;
  children: ReactNode;
}) {
  return (
    <span className={cn('inline-flex min-w-0', wrap ? 'items-start' : 'items-center', ICON_GAP, className)}>
      <Icon as={as} size={size} tone={tone} className={wrap ? 'mt-[0.2em]' : undefined} />
      <span className={cn('min-w-0', wrap ? 'break-words' : 'truncate')}>{children}</span>
    </span>
  );
}
