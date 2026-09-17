import type { RequirementState } from './documents';
import type { Database } from '@/lib/supabase/database.types';

/**
 * Whether a company is ready to be looked at, worked out the same way the
 * database works it out.
 *
 * `company_review_readiness()` is the rule; this is the same arithmetic on
 * rows the page already has, so the progress line and the button agree with
 * the RPC that will refuse them. When the two could ever disagree, the RPC
 * wins — it is the one that runs on submit.
 */

export type VehicleType = Database['public']['Enums']['vehicle_type'];

export interface BlockingRow {
  is_blocking: boolean;
  state: RequirementState;
}

/** A requirement counts as handled once it is uploaded: approving is the point. */
export const IN_PLACE: readonly RequirementState[] = ['ok', 'in_review'];

export interface ReviewProgress {
  total: number;
  inPlace: number;
  missing: number;
  ready: boolean;
}

export function reviewProgress(rows: BlockingRow[]): ReviewProgress {
  const blocking = rows.filter((row) => row.is_blocking);
  const inPlace = blocking.filter((row) => IN_PLACE.includes(row.state)).length;
  return {
    total: blocking.length,
    inPlace,
    missing: blocking.length - inPlace,
    ready: blocking.length > 0 && inPlace === blocking.length,
  };
}

/**
 * Does this requirement apply to this vehicle?
 *
 * Mirrors the join in `v_vehicle_missing_documents`: an inclusion list when
 * one is set, then an exclusion list. Copie conformă ARR uses the second —
 * a light commercial under 3.5 t does not need one, and expressing that as
 * an exclusion means a vehicle type added next year keeps the requirement
 * rather than quietly escaping it.
 */
export function requirementAppliesTo(
  requirement: {
    for_vehicle_types: VehicleType[] | null;
    excluded_vehicle_types: VehicleType[] | null;
  },
  vehicleType: VehicleType,
): boolean {
  const included = requirement.for_vehicle_types;
  if (included && included.length > 0 && !included.includes(vehicleType)) return false;

  const excluded = requirement.excluded_vehicle_types;
  if (excluded && excluded.includes(vehicleType)) return false;

  return true;
}
