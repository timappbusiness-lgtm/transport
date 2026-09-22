import { Icon } from '@/components/ui/icon';
import { iconForVehicleClass } from '@/lib/icons';
import type { VehicleClass } from '@/lib/pricing';
import type { IconSize } from '@/lib/icons';

/**
 * Decorative, like every other glyph on the site: the class name next to it
 * carries the meaning, so the icon is aria-hidden and a screen reader never
 * has to guess which drawing is the SUV.
 *
 * This file used to hold its own map, its own stroke width and its own
 * pixel size — a second icon system beside the one that was supposed to be
 * the only one. The map moved to `src/lib/icons.ts`; what is left is the
 * name the price screens already call.
 */
export function VehicleIcon({
  vehicleClass,
  size = 'lg',
  className,
}: {
  vehicleClass: VehicleClass;
  size?: IconSize | undefined;
  className?: string | undefined;
}) {
  return (
    <Icon
      as={iconForVehicleClass(vehicleClass)}
      size={size}
      tone="muted"
      className={className}
    />
  );
}
