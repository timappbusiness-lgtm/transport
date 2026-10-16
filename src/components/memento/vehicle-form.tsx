'use client';

import Link from 'next/link';
import { useId, useRef, useState } from 'react';
import { DraftRestored, DraftStatus } from '@/components/continuity/draft-status';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { KeepingForm } from '@/components/ui/keeping-form';
import { saveMementoVehicleAction, type MementoVehicleState } from '@/app/cont/memento/actions';
import { mementoVehicleRoute } from '@/config/routes';
import { mementoCopy } from '@/content/memento';
import { useFormDraft } from '@/lib/continuity/use-form-draft';
import { useKeptActionState } from '@/lib/continuity/use-kept-action-state';
import { MEMENTO_KIND_LABELS, MEMENTO_MAIN_KINDS, VEHICLE_KIND_LABELS, VEHICLE_KINDS } from '@/lib/memento';
import { newUploadId } from '@/lib/uploads/paths';
import { cn } from '@/lib/utils';

const EMPTY: MementoVehicleState = {};
const f = mementoCopy.fields;

export const MEMENTO_CONTROL = 'w-full rounded-input border bg-surface px-3.5 py-2.5 text-body';

export function Labelled({
  label,
  htmlFor,
  hint,
  error,
  optional = false,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string | undefined;
  error?: string | undefined;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-body font-medium">
        {label}
        {optional ? <span className="font-normal text-muted"> ({f.optional})</span> : null}
      </label>
      {children}
      {hint ? <p className="text-small text-muted">{hint}</p> : null}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-small text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** The four dates every vehicle is offered, and the rest folded under them. */
export function DateFields({ prefix, errors }: { prefix: string; errors?: Record<string, string> | undefined }) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {MEMENTO_MAIN_KINDS.map((kind) => (
          <Labelled key={kind} label={`${MEMENTO_KIND_LABELS[kind]} · ${f.expires.toLowerCase()}`} htmlFor={`${prefix}-${kind}`} error={errors?.[`date_${kind}`]}>
            <input
              id={`${prefix}-${kind}`}
              name={`date_${kind}`}
              type="date"
              className={cn(MEMENTO_CONTROL, errors?.[`date_${kind}`] ? 'border-danger' : 'border-border-strong')}
              data-memento-date={kind}
            />
          </Labelled>
        ))}
      </div>
      <details className="rounded-input border border-border px-3.5 py-2.5" data-memento-more>
        <summary className="cursor-pointer text-body">{f.more}</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {(['trusa_medicala', 'extinctor'] as const).map((kind) => (
            <Labelled key={kind} label={`${MEMENTO_KIND_LABELS[kind]} · ${f.expires.toLowerCase()}`} htmlFor={`${prefix}-${kind}`} error={errors?.[`date_${kind}`]}>
              <input id={`${prefix}-${kind}`} name={`date_${kind}`} type="date" className={cn(MEMENTO_CONTROL, 'border-border-strong')} />
            </Labelled>
          ))}
          <Labelled label={`${MEMENTO_KIND_LABELS.revizie} · ${f.expires.toLowerCase()}`} htmlFor={`${prefix}-revizie`} error={errors?.date_revizie}>
            <input id={`${prefix}-revizie`} name="date_revizie" type="date" className={cn(MEMENTO_CONTROL, 'border-border-strong')} />
          </Labelled>
          <Labelled label={`${MEMENTO_KIND_LABELS.revizie} · ${f.dueKm.toLowerCase()}`} htmlFor={`${prefix}-km`} error={errors?.km_revizie}>
            <input id={`${prefix}-km`} name="km_revizie" inputMode="numeric" placeholder="150000" className={cn(MEMENTO_CONTROL, 'border-border-strong')} />
          </Labelled>
          <Labelled label={f.customName} htmlFor={`${prefix}-other-name`} error={errors?.name_altceva}>
            <input
              id={`${prefix}-other-name`}
              name="name_altceva"
              maxLength={60}
              placeholder={f.customNamePlaceholder}
              className={cn(MEMENTO_CONTROL, 'border-border-strong')}
            />
          </Labelled>
          <Labelled label={`${MEMENTO_KIND_LABELS.altceva} · ${f.expires.toLowerCase()}`} htmlFor={`${prefix}-other`} error={errors?.date_altceva}>
            <input id={`${prefix}-other`} name="date_altceva" type="date" className={cn(MEMENTO_CONTROL, 'border-border-strong')} />
          </Labelled>
        </div>
      </details>
    </>
  );
}

/**
 * A vehicle in under thirty seconds: the plate, the make and model if
 * they want, and whichever dates they know. The form empties after each
 * one, with a new id, so a firm adds its third van without leaving it.
 *
 * Kept as a draft on the account, like the fleet's own form: a plate and
 * four dates are a lot to type twice.
 */
export function MementoVehicleForm({
  scope,
  action = saveMementoVehicleAction,
}: {
  scope: 'personal' | 'firma';
  action?: (previous: MementoVehicleState, formData: FormData) => Promise<MementoVehicleState>;
}) {
  const [state, dispatch, pending] = useKeptActionState(action, EMPTY);
  const formRef = useRef<HTMLFormElement>(null);
  const draft = useFormDraft(formRef, { form: 'memento', scope: 'adauga', signedIn: true, exclude: ['id', 'scope'] });
  const id = useId();
  const [added, setAdded] = useState<{ id: string; plate: string }[]>([]);
  const [handled, setHandled] = useState(state);
  if (handled !== state) {
    setHandled(state);
    if (state.created !== undefined) {
      draft.clear();
      setAdded((list) => [...list, state.created!]);
    }
  }

  return (
    <KeepingForm
      ref={formRef}
      action={dispatch}
      resetOn={state.created?.id ?? null}
      onSubmit={(event) => {
        // Chosen on the device, once per vehicle, on the first press: a
        // retry sends the same id and finds the same vehicle. The reset
        // after a success empties it for the next one.
        const input = event.currentTarget.elements.namedItem('id') as HTMLInputElement | null;
        if (input !== null && input.value === '') input.value = newUploadId();
      }}
      className="flex flex-col gap-4"
      data-memento-vehicle-form
      noValidate
    >
      {draft.restored !== null ? <DraftRestored savedAt={draft.restored.savedAt} onStartOver={draft.startOver} /> : null}
      <input type="hidden" name="id" defaultValue="" />
      <input type="hidden" name="scope" value={scope} />

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <Labelled label={f.plate} htmlFor={`${id}-plate`} error={state.fieldErrors?.plate}>
          <input
            id={`${id}-plate`}
            name="plate"
            required
            autoCapitalize="characters"
            autoComplete="off"
            placeholder={f.platePlaceholder}
            aria-invalid={state.fieldErrors?.plate ? true : undefined}
            className={cn(MEMENTO_CONTROL, 'font-mono uppercase', state.fieldErrors?.plate ? 'border-danger' : 'border-border-strong')}
          />
        </Labelled>
        <Labelled label={f.make} htmlFor={`${id}-make`} optional>
          <input id={`${id}-make`} name="make" maxLength={40} className={cn(MEMENTO_CONTROL, 'border-border-strong')} />
        </Labelled>
        <Labelled label={f.model} htmlFor={`${id}-model`} optional>
          <input id={`${id}-model`} name="model" maxLength={40} className={cn(MEMENTO_CONTROL, 'border-border-strong')} />
        </Labelled>
      </div>

      {scope === 'firma' ? (
        <Labelled label={f.vehicleKind} htmlFor={`${id}-kind`} optional error={state.fieldErrors?.vehicle_kind}>
          <select id={`${id}-kind`} name="vehicle_kind" defaultValue="" className={cn(MEMENTO_CONTROL, 'border-border-strong sm:max-w-[18rem]')}>
            <option value="">—</option>
            {VEHICLE_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {VEHICLE_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </Labelled>
      ) : null}

      <DateFields prefix={id} errors={state.fieldErrors} />
      <p className="text-small text-muted">{mementoCopy.landing.rovinieta}</p>

      <FormError>{state.error}</FormError>
      <FormNotice>
        {state.notice !== undefined && state.created !== undefined ? (
          <>
            {state.notice}{' '}
            <Link href={mementoVehicleRoute(state.created.id)} className="underline underline-offset-4">
              {mementoCopy.account.open}
            </Link>
          </>
        ) : null}
      </FormNotice>
      <DraftStatus status={draft.status} />

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClasses('ink', 'md')} data-memento-save>
          {pending ? mementoCopy.landing.saving : added.length > 0 ? 'Adaugă și acesta' : mementoCopy.account.add}
        </button>
        {added.length > 0 ? (
          <p className="text-small text-muted" data-memento-added={added.length}>
            Adăugate acum: {added.map((v) => v.plate).join(', ')}
          </p>
        ) : null}
      </div>
    </KeepingForm>
  );
}
