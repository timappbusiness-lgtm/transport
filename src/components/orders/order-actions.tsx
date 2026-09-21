'use client';

import { useActionState, useId, useState } from 'react';
import {
  assignCrewAction,
  cancelOrderAction,
  openDisputeAction,
  saveChecklistAction,
  transitionOrderAction,
  type OrderState,
} from '@/app/cont/transporturi/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { ordersCopy } from '@/content/comenzi';
import {
  CONDITION_CHECKLIST,
  CONDITION_STATES,
  canAct,
  confirmationDeadline,
  formatCode,
  missingEvidence,
  nextAction,
  normaliseCode,
  type NextAction,
  type OrderSide,
} from '@/lib/orders';
import type { CrewOption, DisputeReason } from '@/lib/orders-source';

const EMPTY: OrderState = {};
const CONTROL = 'w-full rounded-input border border-border-strong bg-surface px-3 py-2 text-sm';

/**
 * The one thing to do next, and who may do it.
 *
 * Whoever may act gets a button; everybody else gets the sentence that
 * says who they are waiting for. A screen that shows a disabled button
 * with no explanation is a screen people press twice and then telephone
 * about.
 */
export function NextStep({
  orderId,
  status,
  side,
  evidence,
  needsCrew,
}: {
  orderId: string;
  status: string;
  side: OrderSide;
  evidence: Readonly<Record<string, number>>;
  /** True until a driver and a vehicle are chosen. */
  needsCrew: boolean;
}) {
  const action = nextAction(status);
  if (action === null) return null;

  const mine = canAct(action, side);
  const gaps = missingEvidence(action, evidence);

  if (!mine) {
    return (
      <p className="rounded-card border border-border bg-ground-alt p-4 text-sm text-muted">
        {ordersCopy.actions.waitingOn(action.waitingFor)}
      </p>
    );
  }

  if (action.to === 'pickup_scheduled' || action.to === 'delivery_scheduled') {
    return <ScheduleForm orderId={orderId} action={action} needsCrew={needsCrew} />;
  }
  return <SimpleStep orderId={orderId} action={action} gaps={gaps} />;
}

function SimpleStep({
  orderId,
  action,
  gaps,
}: {
  orderId: string;
  action: NextAction;
  gaps: readonly string[];
}) {
  const [state, submit, pending] = useActionState(transitionOrderAction, EMPTY);
  const blocked = gaps.length > 0;

  return (
    <form action={submit} className="flex flex-col gap-2">
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="to" value={action.to} />
      <button
        type="submit"
        disabled={pending || blocked}
        className={`${buttonClasses('primary', 'md')} w-full py-3.5`}
      >
        {action.label}
      </button>
      {blocked ? (
        <p className="text-[0.8125rem] text-muted">{ordersCopy.actions.missing([...gaps])}</p>
      ) : null}
      <FormError>{state.error}</FormError>
    </form>
  );
}

function ScheduleForm({
  orderId,
  action,
  needsCrew,
}: {
  orderId: string;
  action: NextAction;
  needsCrew: boolean;
}) {
  const [state, submit, pending] = useActionState(transitionOrderAction, EMPTY);
  const [open, setOpen] = useState(false);
  const id = useId();
  const pickup = action.to === 'pickup_scheduled';
  const prefix = pickup ? 'pickup' : 'delivery';

  if (!open) {
    return (
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={pickup && needsCrew}
          className={`${buttonClasses('primary', 'md')} w-full py-3.5`}
        >
          {action.label}
        </button>
        {pickup && needsCrew ? (
          <p className="text-[0.8125rem] text-muted">{ordersCopy.detail.assign}</p>
        ) : null}
      </div>
    );
  }

  return (
    <form action={submit} className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="to" value={action.to} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label htmlFor={`${id}-from`} className="flex flex-col gap-1.5 text-sm font-medium">
          {ordersCopy.actions.from}
          <input
            id={`${id}-from`}
            name={`${prefix}_from`}
            type="datetime-local"
            required
            className={`${CONTROL} font-normal`}
          />
        </label>
        <label htmlFor={`${id}-to`} className="flex flex-col gap-1.5 text-sm font-medium">
          {ordersCopy.actions.to}
          <input
            id={`${id}-to`}
            name={`${prefix}_to`}
            type="datetime-local"
            className={`${CONTROL} font-normal`}
          />
        </label>
      </div>
      <p className="text-xs text-muted">{ordersCopy.actions.windowHint}</p>

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={buttonClasses('primary', 'sm')}>
          {pending ? ordersCopy.actions.saving : ordersCopy.actions.save}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={buttonClasses('secondary', 'sm')}
        >
          {ordersCopy.actions.cancel}
        </button>
      </div>
      <FormError>{state.error}</FormError>
    </form>
  );
}

/** Choosing the driver and the lorry. */
export function AssignCrew({
  orderId,
  options,
  driverId,
  vehicleId,
}: {
  orderId: string;
  options: readonly CrewOption[];
  driverId: string | null;
  vehicleId: string | null;
}) {
  const [state, submit, pending] = useActionState(assignCrewAction, EMPTY);
  const [open, setOpen] = useState(driverId === null || vehicleId === null);
  const id = useId();

  const drivers = options.filter((option) => option.kind === 'driver');
  const vehicles = options.filter((option) => option.kind === 'vehicle');

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-muted underline underline-offset-4"
      >
        {ordersCopy.detail.reassign}
      </button>
    );
  }

  return (
    <form action={submit} className="mt-3 flex flex-col gap-3">
      <input type="hidden" name="order_id" value={orderId} />

      <div className="grid gap-3 sm:grid-cols-2">
        <label htmlFor={`${id}-driver`} className="flex flex-col gap-1.5 text-sm font-medium">
          {ordersCopy.detail.driver}
          <select
            id={`${id}-driver`}
            name="driver_id"
            defaultValue={driverId ?? ''}
            className={`${CONTROL} font-normal`}
          >
            <option value="">—</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.label}
                {driver.detail !== '' ? ` · ${driver.detail}` : ''}
              </option>
            ))}
          </select>
        </label>

        <label htmlFor={`${id}-vehicle`} className="flex flex-col gap-1.5 text-sm font-medium">
          {ordersCopy.detail.vehicle}
          <select
            id={`${id}-vehicle`}
            name="vehicle_id"
            defaultValue={vehicleId ?? ''}
            className={`${CONTROL} font-normal`}
          >
            <option value="">—</option>
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.label}
                {vehicle.detail !== '' ? ` · ${vehicle.detail}` : ''}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={buttonClasses('primary', 'sm')}>
          {pending ? ordersCopy.actions.saving : ordersCopy.actions.save}
        </button>
        {driverId !== null && vehicleId !== null ? (
          <button
            type="button"
            onClick={() => setOpen(false)}
            className={buttonClasses('secondary', 'sm')}
          >
            {ordersCopy.actions.cancel}
          </button>
        ) : null}
      </div>

      {state.fieldErrors?.driver_id !== undefined ? (
        <FormError>{state.fieldErrors.driver_id}</FormError>
      ) : null}
      {state.fieldErrors?.vehicle_id !== undefined ? (
        <FormError>{state.fieldErrors.vehicle_id}</FormError>
      ) : null}
      <FormError>{state.error}</FormError>
    </form>
  );
}

/** The nine lines a driver walks round the car for. */
export function ConditionForm({ orderId }: { orderId: string }) {
  const [state, submit, pending] = useActionState(saveChecklistAction, EMPTY);
  const id = useId();

  if (state.notice !== undefined) return <FormNotice>{state.notice}</FormNotice>;

  return (
    <form action={submit} className="flex flex-col gap-3">
      <input type="hidden" name="order_id" value={orderId} />
      <p className="text-sm text-muted">{ordersCopy.checklist.lede}</p>

      <div className="flex flex-col gap-3">
        {CONDITION_CHECKLIST.map((item) => (
          <div key={item.key} className="flex flex-col gap-1.5">
            <label htmlFor={`${id}-${item.key}`} className="text-sm font-medium">
              {item.label}
            </label>
            {item.kind === 'state' ? (
              <select id={`${id}-${item.key}`} name={item.key} defaultValue="fără" className={CONTROL}>
                {CONDITION_STATES.map((state_) => (
                  <option key={state_} value={state_}>
                    {ordersCopy.checklist.states[state_] ?? state_}
                  </option>
                ))}
              </select>
            ) : item.kind === 'yesno' ? (
              <select id={`${id}-${item.key}`} name={item.key} defaultValue="da" className={CONTROL}>
                <option value="da">{ordersCopy.checklist.yes}</option>
                <option value="nu">{ordersCopy.checklist.no}</option>
              </select>
            ) : (
              <input
                id={`${id}-${item.key}`}
                name={item.key}
                inputMode="numeric"
                required
                className={CONTROL}
              />
            )}
            {state.fieldErrors?.[item.key] !== undefined ? (
              <FormError>{state.fieldErrors[item.key]}</FormError>
            ) : null}
          </div>
        ))}
      </div>

      <label htmlFor={`${id}-note`} className="flex flex-col gap-1.5 text-sm font-medium">
        {ordersCopy.checklist.note}
        <textarea id={`${id}-note`} name="note" rows={3} maxLength={2000} className={`${CONTROL} font-normal`} />
        <span className="text-xs font-normal text-muted">{ordersCopy.checklist.noteHint}</span>
      </label>

      <button type="submit" disabled={pending} className={`${buttonClasses('primary', 'md')} w-full`}>
        {pending ? ordersCopy.actions.saving : ordersCopy.checklist.save}
      </button>
      <FormError>{state.error}</FormError>
    </form>
  );
}

/**
 * The handover.
 *
 * The client reads a code off their own screen and says it out loud;
 * the driver types it. That is the whole mechanism, and it is the one
 * moment the platform can say the car reached the right hands rather
 * than merely somewhere. A signature does the same job when the client
 * is not the person at the kerb.
 */
export function HandoverForm({ orderId }: { orderId: string }) {
  const [state, submit, pending] = useActionState(transitionOrderAction, EMPTY);
  const [code, setCode] = useState('');
  const id = useId();

  return (
    <form action={submit} className="flex flex-col gap-3">
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="to" value="vehicle_delivered" />

      <p className="text-sm text-muted">{ordersCopy.handover.driverHint}</p>

      <label htmlFor={`${id}-code`} className="flex flex-col gap-1.5 text-sm font-medium">
        {ordersCopy.handover.codeLabel}
        <input
          id={`${id}-code`}
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          value={code}
          onChange={(event) => setCode(normaliseCode(event.target.value))}
          placeholder="000 000"
          className={`${CONTROL} text-center font-mono text-[1.5rem] tracking-[0.3em]`}
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className={`${buttonClasses('primary', 'md')} w-full py-3.5`}
      >
        {ordersCopy.handover.deliver}
      </button>
      <FormError>{state.error}</FormError>
    </form>
  );
}

/** The client's copy of the code, which the carrier never sees. */
export function ConfirmationCode({ code }: { code: string }) {
  return (
    <div className="rounded-card border border-accent/45 bg-accent/8 p-4">
      <p className="text-xs text-muted">{ordersCopy.handover.title}</p>
      <p className="mt-1 font-mono text-[1.75rem] tracking-[0.2em] tabular-nums">
        {formatCode(code)}
      </p>
      <p className="mt-1 text-sm">{ordersCopy.handover.clientHint}</p>
    </div>
  );
}

/** The client confirming, with what the clock says. */
export function ConfirmDelivery({
  orderId,
  deliveredAt,
  hours,
  now,
}: {
  orderId: string;
  deliveredAt: string | null;
  hours: number;
  now: string;
}) {
  const [state, submit, pending] = useActionState(transitionOrderAction, EMPTY);
  const deadline = confirmationDeadline(deliveredAt, hours, new Date(now));

  return (
    <form action={submit} className="flex flex-col gap-3 rounded-card border border-accent/45 bg-accent/8 p-5">
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="to" value="order_completed" />

      <p className="text-[1.0625rem]">{ordersCopy.confirm.title}</p>
      <p className="max-w-[60ch] text-sm">{ordersCopy.confirm.body}</p>
      {deadline !== null ? (
        <p className="text-sm text-muted">
          {deadline.passed ? ordersCopy.confirm.passed : ordersCopy.confirm.deadline(deadline.left)}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className={`${buttonClasses('primary', 'md')} w-full py-3.5`}
      >
        {ordersCopy.confirm.submit}
      </button>
      <FormError>{state.error}</FormError>
    </form>
  );
}

/** Cancelling, before the car is on the lorry. */
export function CancelOrder({ orderId, side }: { orderId: string; side: OrderSide }) {
  const [state, submit, pending] = useActionState(cancelOrderAction, EMPTY);
  const [open, setOpen] = useState(false);
  const id = useId();

  if (state.notice !== undefined) return <FormNotice>{state.notice}</FormNotice>;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-muted underline underline-offset-4"
      >
        {ordersCopy.cancel.submit}
      </button>
    );
  }

  return (
    <form action={submit} className="flex flex-col gap-3 rounded-card border border-danger/40 bg-danger/8 p-4">
      <input type="hidden" name="order_id" value={orderId} />
      <p className="text-sm font-medium">{ordersCopy.cancel.title}</p>
      <p className="text-sm text-muted">{ordersCopy.cancel.body}</p>

      <label htmlFor={`${id}-reason`} className="flex flex-col gap-1.5 text-sm font-medium">
        {ordersCopy.cancel.reason}
        <textarea
          id={`${id}-reason`}
          name="reason"
          rows={3}
          required
          maxLength={1000}
          className={`${CONTROL} font-normal`}
        />
      </label>
      {state.fieldErrors?.reason !== undefined ? (
        <FormError>{state.fieldErrors.reason}</FormError>
      ) : null}

      {/* Only the client is asked. A carrier cancelling cannot decide
          for somebody else whether their car still needs moving. */}
      {side === 'client' ? (
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="relist" defaultChecked className="mt-1" />
          <span>
            {ordersCopy.cancel.relist}
            <span className="block text-xs text-muted">{ordersCopy.cancel.relistHint}</span>
          </span>
        </label>
      ) : (
        <input type="hidden" name="relist" value="on" />
      )}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={buttonClasses('primary', 'sm')}>
          {pending ? ordersCopy.cancel.submitting : ordersCopy.cancel.submit}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={buttonClasses('secondary', 'sm')}
        >
          {ordersCopy.actions.cancel}
        </button>
      </div>
      <FormError>{state.error}</FormError>
    </form>
  );
}

/** The client saying something is wrong. */
export function OpenDispute({
  orderId,
  reasons,
}: {
  orderId: string;
  reasons: readonly DisputeReason[];
}) {
  const [state, submit, pending] = useActionState(openDisputeAction, EMPTY);
  const [open, setOpen] = useState(false);
  const id = useId();

  if (state.notice !== undefined) return <FormNotice>{state.notice}</FormNotice>;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-muted underline underline-offset-4"
      >
        {ordersCopy.confirm.disputeInstead}
      </button>
    );
  }

  return (
    <form action={submit} className="flex flex-col gap-3 rounded-card border border-warning/45 bg-warning/8 p-4">
      <input type="hidden" name="order_id" value={orderId} />
      <p className="text-sm font-medium">{ordersCopy.dispute.title}</p>
      <p className="max-w-[60ch] text-sm text-muted">{ordersCopy.dispute.lede}</p>

      <label htmlFor={`${id}-cat`} className="flex flex-col gap-1.5 text-sm font-medium">
        {ordersCopy.dispute.category}
        <select id={`${id}-cat`} name="category" required className={`${CONTROL} font-normal`}>
          <option value="">—</option>
          {reasons.map((reason) => (
            <option key={reason.code} value={reason.code}>
              {reason.label}
            </option>
          ))}
        </select>
      </label>
      {state.fieldErrors?.category !== undefined ? (
        <FormError>{state.fieldErrors.category}</FormError>
      ) : null}

      <label htmlFor={`${id}-why`} className="flex flex-col gap-1.5 text-sm font-medium">
        {ordersCopy.dispute.reason}
        <textarea
          id={`${id}-why`}
          name="reason"
          rows={4}
          required
          maxLength={2000}
          className={`${CONTROL} font-normal`}
        />
        <span className="text-xs font-normal text-muted">{ordersCopy.dispute.reasonHint}</span>
      </label>
      {state.fieldErrors?.reason !== undefined ? (
        <FormError>{state.fieldErrors.reason}</FormError>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={pending} className={buttonClasses('primary', 'sm')}>
          {pending ? ordersCopy.dispute.submitting : ordersCopy.dispute.submit}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={buttonClasses('secondary', 'sm')}
        >
          {ordersCopy.actions.cancel}
        </button>
      </div>
      <FormError>{state.error}</FormError>
    </form>
  );
}
