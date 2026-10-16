'use client';

import { useId, useRef, useState } from 'react';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { KeepingForm } from '@/components/ui/keeping-form';
import { renewMementoAction, type MementoState } from '@/app/cont/memento/actions';
import { mementoCopy } from '@/content/memento';
import { useKeptActionState } from '@/lib/continuity/use-kept-action-state';
import { cn } from '@/lib/utils';

const EMPTY: MementoState = {};
const c = mementoCopy.renew;

export type MementoAction = (previous: MementoState, formData: FormData) => Promise<MementoState>;

/**
 * „Am reînnoit": one tap opens a date field, one more saves it. The old
 * date goes to the history in the database (`memento_renew`), so the form
 * has nothing to say about it except that it is kept.
 *
 * `open` starts it unfolded — the entries a reminder's link named.
 * `action` is the server action, replaceable for the screen harness.
 */
export function RenewForm({
  entryId,
  label,
  kind,
  open = false,
  action = renewMementoAction,
}: {
  entryId: string;
  label: string;
  kind: string;
  open?: boolean;
  action?: MementoAction;
}) {
  const [shown, setShown] = useState(open);
  const [state, dispatch, pending] = useKeptActionState(action, EMPTY);
  const formRef = useRef<HTMLFormElement>(null);
  const id = useId();

  const [handled, setHandled] = useState(state);
  if (handled !== state) {
    setHandled(state);
    if (state.notice !== undefined) setShown(false);
  }

  if (!shown) {
    return (
      <div className="flex flex-col items-start gap-2">
        <button
          type="button"
          onClick={() => setShown(true)}
          className={buttonClasses('secondary', 'sm')}
          data-memento-renew={entryId}
        >
          {c.button}
        </button>
        <FormNotice>{state.notice}</FormNotice>
      </div>
    );
  }

  return (
    <KeepingForm
      ref={formRef}
      action={dispatch}
      className="flex w-full flex-col gap-2 rounded-input border border-border bg-ground-alt p-3"
      data-memento-renew-form={entryId}
      noValidate
    >
      <input type="hidden" name="entry_id" value={entryId} />
      <label htmlFor={`${id}-date`} className="text-small font-medium">
        {c.title}: {label}
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id={`${id}-date`}
          name="valid_until"
          type="date"
          required={kind !== 'revizie'}
          autoFocus={!open}
          aria-invalid={state.fieldErrors?.valid_until ? true : undefined}
          className={cn(
            'min-w-0 flex-1 rounded-input border bg-surface px-3 py-2 text-body sm:flex-none',
            state.fieldErrors?.valid_until ? 'border-danger' : 'border-border-strong',
          )}
        />
        {kind === 'revizie' ? (
          <input
            name="due_km"
            inputMode="numeric"
            placeholder="km"
            aria-label={mementoCopy.fields.dueKm}
            className="w-28 rounded-input border border-border-strong bg-surface px-3 py-2 text-body"
          />
        ) : null}
        <button type="submit" disabled={pending} className={buttonClasses('ink', 'sm')}>
          {pending ? c.saving : c.save}
        </button>
        <button type="button" onClick={() => setShown(false)} className="text-small text-muted underline underline-offset-4">
          {c.cancel}
        </button>
      </div>
      {state.fieldErrors?.valid_until ? <p className="text-small text-danger">{state.fieldErrors.valid_until}</p> : null}
      <p className="text-small text-muted">{c.lede}</p>
      <FormError>{state.error}</FormError>
    </KeepingForm>
  );
}
