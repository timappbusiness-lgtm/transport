import type { LucideIcon } from 'lucide-react';
import { ICON_SIZES, ICON_STROKE, type IconSize } from '@/lib/icons';
import { cn } from '@/lib/utils';

/**
 * The only way an icon reaches the page.
 *
 * Three jobs, all of which are easy to get wrong one component at a time:
 *
 *   - one size scale and one stroke width, so a row of icons reads as a
 *     row rather than as several different drawings;
 *   - colour from `currentColor`, so an icon inherits the token of the
 *     text it sits beside and never carries a colour of its own;
 *   - a decision about meaning, forced at the call site. Either the icon
 *     is decoration beside a visible label — `aria-hidden`, the default —
 *     or it is carrying the meaning itself and needs a `label`, which
 *     becomes its accessible name. There is no third option, and that is
 *     the point: an icon alone with no name is a thing somebody cannot
 *     read, and it is the failure that gets shipped.
 */
export function Icon({
  as: Glyph,
  size = 'md',
  label,
  className,
}: {
  as: LucideIcon;
  size?: IconSize;
  /**
   * Set only when there is no visible text saying the same thing. Leave
   * it out beside a label — a screen reader that reads „Motocicletă
   * Motocicletă" is worse than one that reads it once.
   */
  label?: string;
  className?: string;
}) {
  return (
    <Glyph
      size={ICON_SIZES[size]}
      strokeWidth={ICON_STROKE}
      className={cn('flex-none', className)}
      aria-hidden={label === undefined ? true : undefined}
      aria-label={label}
      role={label === undefined ? undefined : 'img'}
    />
  );
}
