'use client';

import {
  setEquipmentOptionAction,
  setServiceOptionAction,
  type OptionActionState,
} from '@/app/admin/optiuni/actions';
import { Field, FormError, FormNotice, SubmitButton } from '@/components/auth/form';
import { firmaCopy } from '@/content/firma';
import { KeepingForm } from '@/components/ui/keeping-form';
import { useKeptActionState } from '@/lib/continuity/use-kept-action-state';

const EMPTY: OptionActionState = {};
const c = firmaCopy.admin;

export interface OptionRow {
  code: string;
  label: string;
  hint: string | null;
  sortOrder: number;
  isActive: boolean;
}

/**
 * One row of the vocabulary, editable in place.
 *
 * The code is read-only once the row exists, because it is what every
 * company that ticked this option holds. Renaming it would unset them all
 * silently, and there is no migration that could put them back — the RPC
 * refuses it too, so the disabled input is the explanation rather than the
 * protection.
 */
export function OptionForm({
  kind,
  row,
}: {
  kind: 'equipment' | 'service';
  row?: OptionRow | undefined;
}) {
  const [state, action] = useKeptActionState(
    kind === 'equipment' ? setEquipmentOptionAction : setServiceOptionAction,
    EMPTY,
  );
  const existing = row !== undefined;

  return (
    <KeepingForm action={action} className="flex flex-col gap-3 py-4" noValidate>
      <FormError>{state.error}</FormError>
      <FormNotice>{state.notice}</FormNotice>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_5rem]">
        {existing ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-body font-medium">{c.code}</span>
            <input type="hidden" name="code" value={row.code} />
            <span className="rounded-input border border-border bg-background px-3 py-2 font-mono text-small text-muted">
              {row.code}
            </span>
          </div>
        ) : (
          <Field
            label={c.code}
            name="code"
            hint={c.codeHint}
            defaultValue=""
            error={state.fieldErrors?.code}
          />
        )}

        <Field
          label={c.label}
          name="label"
          defaultValue={row?.label ?? ''}
          error={state.fieldErrors?.label}
        />

        <Field
          label={c.order}
          name="sortOrder"
          inputMode="numeric"
          required={false}
          defaultValue={String(row?.sortOrder ?? 100)}
          error={state.fieldErrors?.sortOrder}
        />
      </div>

      <Field
        label={c.description}
        name="description"
        required={false}
        defaultValue={row?.hint ?? ''}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-start gap-2.5 text-body">
          <input
            type="checkbox"
            name="isActive"
            defaultChecked={row?.isActive ?? true}
            className="mt-0.5 size-4 accent-foreground"
          />
          <span>
            {c.active}
            <span className="mt-0.5 block text-small text-muted">{c.inactiveHint}</span>
          </span>
        </label>
        <SubmitButton className="sm:w-auto sm:px-6">
          {existing ? firmaCopy.save : c.add}
        </SubmitButton>
      </div>
    </KeepingForm>
  );
}
