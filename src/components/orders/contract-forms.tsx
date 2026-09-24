'use client';

import { useId } from 'react';
import {
  acceptContractAction,
  generateContractAction,
  type ContractState,
} from '@/app/cont/transporturi/contract-actions';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { KeepingForm } from '@/components/ui/keeping-form';
import { contractCopy } from '@/content/contract';
import { useKeptActionState } from '@/lib/continuity/use-kept-action-state';

const EMPTY: ContractState = {};

/**
 * Generating the first version, or a new one.
 *
 * The first is the card's primary button; a new version is quieter and
 * sits under „Versiuni", because it is for when something changed, not
 * something to press on every visit.
 */
export function GenerateContractForm({ orderId, again = false }: { orderId: string; again?: boolean }) {
  const [state, submit, pending] = useKeptActionState(generateContractAction, EMPTY);
  return (
    <KeepingForm action={submit} className="flex flex-col gap-2">
      <input type="hidden" name="order_id" value={orderId} />
      {again ? <p className="max-w-[62ch] text-small text-muted">{contractCopy.regenerateHint}</p> : null}
      <div>
        <button
          type="submit"
          disabled={pending}
          className={buttonClasses(again ? 'secondary' : 'primary', again ? 'sm' : 'md')}
        >
          {pending ? contractCopy.generating : again ? contractCopy.regenerate : contractCopy.generate}
        </button>
      </div>
      {state.error !== undefined ? <FormError>{state.error}</FormError> : null}
      {state.notice !== undefined ? <FormNotice>{state.notice}</FormNotice> : null}
    </KeepingForm>
  );
}

/**
 * One party accepting the latest version.
 *
 * A checkbox before the button, because an acceptance that is recorded
 * with an IP address and cannot be undone should not be one mis-tap
 * away; and the sentence above it says exactly what is recorded and what
 * it is not.
 */
export function AcceptContractForm({
  orderId,
  contractId,
  version,
}: {
  orderId: string;
  contractId: string;
  version: number;
}) {
  const [state, submit, pending] = useKeptActionState(acceptContractAction, EMPTY);
  const id = useId();

  if (state.notice !== undefined) return <FormNotice>{state.notice}</FormNotice>;

  return (
    <KeepingForm
      action={submit}
      className="flex flex-col gap-3 rounded-card border border-border bg-background p-4"
      data-testid="contract-accept"
    >
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="contract_id" value={contractId} />
      <p className="max-w-[62ch] text-small text-muted">{contractCopy.accept.explain}</p>
      <label htmlFor={`${id}-confirm`} className="flex items-start gap-2 text-body">
        <input
          id={`${id}-confirm`}
          type="checkbox"
          name="confirm"
          required
          className="mt-1 size-5 flex-none"
        />
        <span>{contractCopy.accept.confirm(version)}</span>
      </label>
      {state.fieldErrors?.confirm !== undefined ? <FormError>{state.fieldErrors.confirm}</FormError> : null}
      {state.error !== undefined ? <FormError>{state.error}</FormError> : null}
      <div>
        <button type="submit" disabled={pending} className={buttonClasses('primary', 'md')}>
          {pending ? contractCopy.accept.submitting : contractCopy.accept.submit}
        </button>
      </div>
    </KeepingForm>
  );
}
