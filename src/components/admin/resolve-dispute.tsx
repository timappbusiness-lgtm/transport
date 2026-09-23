'use client';

import { useId } from 'react';
import { resolveDisputeAction, type OrderState } from '@/app/cont/transporturi/actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { ordersCopy } from '@/content/comenzi';
import { KeepingForm } from '@/components/ui/keeping-form';
import { useKeptActionState } from '@/lib/continuity/use-kept-action-state';

const EMPTY: OrderState = {};
const c = ordersCopy.admin.resolve;
const CONTROL = 'w-full rounded-input border border-border-strong bg-surface px-3 py-2 text-body';

/**
 * Closing a dispute, which is the one thing staff decide here.
 *
 * Two outcomes and a reason, because that is all the platform can
 * honestly offer: it holds nobody's money, so „finalizată" and
 * „anulată" are the whole of what a decision can change. The note goes
 * to both parties and into the audit, and `resolve_order_dispute()`
 * refuses a blank one.
 */
export function ResolveDispute({ orderId }: { orderId: string }) {
  const [state, action, pending] = useKeptActionState(resolveDisputeAction, EMPTY);
  const id = useId();

  if (state.notice !== undefined) return <FormNotice>{state.notice}</FormNotice>;

  return (
    <KeepingForm action={action} className="flex flex-col gap-3 rounded-card border border-warning/45 bg-warning/8 p-5">
      <input type="hidden" name="order_id" value={orderId} />

      <h2 className="text-h3">{c.title}</h2>
      <p className="max-w-[62ch] text-body text-muted">{c.lede}</p>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-body font-medium">{c.outcome}</legend>
        <label className="flex items-center gap-2 text-body">
          <input type="radio" name="outcome" value="order_completed" defaultChecked />
          {c.completed}
        </label>
        <label className="flex items-center gap-2 text-body">
          <input type="radio" name="outcome" value="cancelled" />
          {c.cancelled}
        </label>
      </fieldset>

      <label htmlFor={`${id}-note`} className="flex flex-col gap-1.5 text-body font-medium">
        {c.note}
        <textarea
          id={`${id}-note`}
          name="note"
          rows={4}
          required
          maxLength={2000}
          className={`${CONTROL} font-normal`}
        />
        <span className="text-small font-normal text-muted">{c.noteHint}</span>
      </label>
      {state.fieldErrors?.note !== undefined ? <FormError>{state.fieldErrors.note}</FormError> : null}

      <div>
        <button type="submit" disabled={pending} className={buttonClasses('ink', 'sm')}>
          {c.submit}
        </button>
      </div>
      <FormError>{state.error}</FormError>
    </KeepingForm>
  );
}
