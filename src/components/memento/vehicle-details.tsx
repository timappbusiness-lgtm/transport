'use client';

import { useId, useRef, useState } from 'react';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { KeepingForm } from '@/components/ui/keeping-form';
import { Labelled, MEMENTO_CONTROL } from '@/components/memento/vehicle-form';
import {
  deleteMementoEntryAction,
  deleteMementoVehicleAction,
  setMementoResponsibleAction,
  updateMementoVehicleAction,
  type MementoState,
} from '@/app/cont/memento/actions';
import { mementoCopy } from '@/content/memento';
import { useFormDirty } from '@/lib/continuity/use-form-draft';
import { useKeptActionState } from '@/lib/continuity/use-kept-action-state';
import { useLeaveGuard } from '@/lib/continuity/use-leave-guard';
import { VEHICLE_KIND_LABELS, VEHICLE_KINDS, type MementoVehicleKind } from '@/lib/memento';
import { cn } from '@/lib/utils';

const EMPTY: MementoState = {};
const f = mementoCopy.fields;
const v = mementoCopy.vehicle;

/** Plate, make, model and — for a firm — what kind of vehicle it is. */
export function VehicleDetailsForm({
  id,
  plate,
  make,
  model,
  vehicleKind,
  isFirm,
}: {
  id: string;
  plate: string;
  make: string | null;
  model: string | null;
  vehicleKind: MementoVehicleKind | null;
  isFirm: boolean;
}) {
  const [state, dispatch, pending] = useKeptActionState(updateMementoVehicleAction, EMPTY);
  const formRef = useRef<HTMLFormElement>(null);
  const { dirty, markSaved } = useFormDirty(formRef);
  useLeaveGuard(dirty);
  const [handled, setHandled] = useState(state);
  if (handled !== state) {
    setHandled(state);
    if (state.notice !== undefined) markSaved();
  }
  const fieldId = useId();
  return (
    <KeepingForm ref={formRef} action={dispatch} className="flex flex-col gap-3" noValidate>
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Labelled label={f.plate} htmlFor={`${fieldId}-plate`} error={state.fieldErrors?.plate}>
          <input
            id={`${fieldId}-plate`}
            name="plate"
            defaultValue={plate}
            autoCapitalize="characters"
            className={cn(MEMENTO_CONTROL, 'font-mono uppercase', state.fieldErrors?.plate ? 'border-danger' : 'border-border-strong')}
          />
        </Labelled>
        <Labelled label={f.make} htmlFor={`${fieldId}-make`} optional>
          <input id={`${fieldId}-make`} name="make" maxLength={40} defaultValue={make ?? ''} className={cn(MEMENTO_CONTROL, 'border-border-strong')} />
        </Labelled>
        <Labelled label={f.model} htmlFor={`${fieldId}-model`} optional>
          <input id={`${fieldId}-model`} name="model" maxLength={40} defaultValue={model ?? ''} className={cn(MEMENTO_CONTROL, 'border-border-strong')} />
        </Labelled>
      </div>
      {isFirm ? (
        <Labelled label={f.vehicleKind} htmlFor={`${fieldId}-kind`} optional>
          <select id={`${fieldId}-kind`} name="vehicle_kind" defaultValue={vehicleKind ?? ''} className={cn(MEMENTO_CONTROL, 'border-border-strong sm:max-w-[18rem]')}>
            <option value="">—</option>
            {VEHICLE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {VEHICLE_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </Labelled>
      ) : null}
      <FormError>{state.error}</FormError>
      <FormNotice>{state.notice}</FormNotice>
      <div>
        <button type="submit" disabled={pending} className={buttonClasses('ink', 'sm')}>
          {v.save}
        </button>
      </div>
    </KeepingForm>
  );
}

/** Who in the firm receives this vehicle's reminders. */
export function ResponsibleForm({
  vehicleId,
  current,
  members,
}: {
  vehicleId: string;
  current: string | null;
  members: readonly { userId: string; name: string }[];
}) {
  const [state, dispatch, pending] = useKeptActionState(setMementoResponsibleAction, EMPTY);
  const fieldId = useId();
  return (
    <KeepingForm action={dispatch} className="flex flex-col gap-3" data-memento-responsible>
      <input type="hidden" name="vehicle_id" value={vehicleId} />
      <Labelled label={v.responsible} htmlFor={`${fieldId}-who`} hint={v.responsibleHint}>
        <select id={`${fieldId}-who`} name="responsible" defaultValue={current ?? ''} className={cn(MEMENTO_CONTROL, 'border-border-strong sm:max-w-[24rem]')}>
          <option value="">{v.responsibleNone}</option>
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.name}
            </option>
          ))}
        </select>
      </Labelled>
      <FormError>{state.error}</FormError>
      <FormNotice>{state.notice}</FormNotice>
      <div>
        <button type="submit" disabled={pending} className={buttonClasses('ink', 'sm')}>
          {v.saveResponsible}
        </button>
      </div>
    </KeepingForm>
  );
}

/** A destructive button that asks once, in words, before it goes. */
export function ConfirmDelete({
  kind,
  hidden,
  label,
  question,
}: {
  kind: 'vehicle' | 'entry';
  hidden: Record<string, string>;
  label: string;
  question: string;
}) {
  return (
    <KeepingForm
      action={kind === 'vehicle' ? deleteMementoVehicleAction : deleteMementoEntryAction}
      onSubmit={(event) => {
        if (!window.confirm(question)) event.preventDefault();
      }}
    >
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <button type="submit" className="text-small text-danger underline underline-offset-4" data-memento-delete={kind}>
        {label}
      </button>
    </KeepingForm>
  );
}
