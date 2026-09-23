'use client';

import { addOnboardingVehicleAction, type OnboardingState } from '@/app/admin/inscrieri/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { onboardingCopy } from '@/content/inscrieri';
import { VEHICLE_TYPE_LABELS } from '@/lib/vehicles';
import { KeepingForm } from '@/components/ui/keeping-form';
import { useKeptActionState } from '@/lib/continuity/use-kept-action-state';

const EMPTY: OnboardingState = {};
const c = onboardingCopy.wizard.vehicles;
const FIELD =
  'rounded-input border border-border-strong bg-surface px-3 py-2 text-body font-normal';

export function VehicleStep({
  onboardingId,
  companyId,
}: {
  onboardingId: string;
  companyId: string;
}) {
  const [state, action, pending] = useKeptActionState(addOnboardingVehicleAction, EMPTY);

  return (
    // The notice carries the plate, so a remount on it clears the form
    // after a vehicle lands and keeps what was typed after a refusal —
    // which is the moment somebody needs their text back.
    <KeepingForm key={state.notice ?? 'gol'} action={action} className="flex flex-col gap-4">
      <input type="hidden" name="onboarding_id" value={onboardingId} />
      <input type="hidden" name="company_id" value={companyId} />

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5 text-body font-medium">
          {c.plate}
          <input name="plate_number" required className={FIELD} />
          <FormError>{state.fieldErrors?.plate_number}</FormError>
        </label>

        <label className="flex flex-col gap-1.5 text-body font-medium">
          {c.type}
          <select name="vehicle_type" required defaultValue="platforma_auto" className={FIELD}>
            {Object.entries(VEHICLE_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <FormError>{state.fieldErrors?.vehicle_type}</FormError>
        </label>

        <label className="flex flex-col gap-1.5 text-body font-medium">
          {c.weight}
          <input name="max_weight_kg" type="number" min={1} className={FIELD} />
        </label>
      </div>

      <div>
        <button type="submit" disabled={pending} className={buttonClasses('primary', 'md')}>
          {c.add}
        </button>
      </div>

      {state.notice !== undefined ? <FormNotice>{state.notice}</FormNotice> : null}
      <FormError>{state.error}</FormError>
    </KeepingForm>
  );
}
