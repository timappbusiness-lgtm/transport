import { Bike, Car, CarFront, CarTaxiFront, Van, type LucideIcon } from 'lucide-react';
import type { VehicleClass } from '@/lib/pricing';
import { cn } from '@/lib/utils';

/**
 * Decorative, like every other glyph on the site: the class name next to it
 * carries the meaning, so the icon is aria-hidden and a screen reader never
 * has to guess which drawing is the SUV.
 */
const ICONS: Record<VehicleClass, LucideIcon> = {
  motocicleta: Bike,
  hatchback: Car,
  sedan: CarFront,
  suv: CarTaxiFront,
  autoutilitara: Van,
};

export function VehicleIcon({
  vehicleClass,
  size = 20,
  className,
}: {
  vehicleClass: VehicleClass;
  size?: number | undefined;
  className?: string | undefined;
}) {
  const Icon = ICONS[vehicleClass];
  return (
    <span aria-hidden="true" className={cn('flex-none text-muted', className)}>
      <Icon size={size} strokeWidth={1.5} />
    </span>
  );
}
