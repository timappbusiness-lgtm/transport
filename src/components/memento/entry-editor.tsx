'use client';

import { useId, useRef, useState } from 'react';
import { FormError, FormNotice } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { KeepingForm } from '@/components/ui/keeping-form';
import { UploadLine } from '@/components/ui/upload-line';
import { Labelled, MEMENTO_CONTROL } from '@/components/memento/vehicle-form';
import {
  readMementoPhotoAction,
  saveMementoEntryAction,
  type MementoPhotoReading,
  type MementoState,
} from '@/app/cont/memento/actions';
import { uploadRoute } from '@/config/routes';
import { mementoCopy } from '@/content/memento';
import { useFormDirty } from '@/lib/continuity/use-form-draft';
import { useKeptActionState } from '@/lib/continuity/use-kept-action-state';
import { useLeaveGuard } from '@/lib/continuity/use-leave-guard';
import { formatDay, MEMENTO_KIND_LABELS, MEMENTO_KINDS, type MementoKind } from '@/lib/memento';
import type { MementoEntry } from '@/lib/memento-source';
import { shrinkPhoto } from '@/lib/photo-shrink';
import { SEND_ERROR_MESSAGES, SendError, postUpload } from '@/lib/uploads/transport';
import { useUploadQueue } from '@/lib/uploads/use-upload-queue';
import { cn } from '@/lib/utils';

const EMPTY: MementoState = {};
const f = mementoCopy.fields;
const p = mementoCopy.photo;

type Reading = { state: 'idle' } | { state: 'reading' } | MementoPhotoReading;

/**
 * One date: a new one, or a correction of the one there.
 *
 * The photo is optional. Taken, it is uploaded at once (EXIF gone, the
 * server re-encodes it) and read: the date the model found goes into the
 * field, with a line saying so, and nothing is saved until the person
 * presses „Salvează data". Without the reading configured the line says
 * to type the date, and the form is exactly the manual one.
 *
 * `action`, `readPhoto` and `uploadUrl` are the real ones unless the
 * screen harness replaces them.
 */
export function MementoEntryEditor({
  vehicleId,
  folder,
  entry = null,
  takenKinds = [],
  action = saveMementoEntryAction,
  readPhoto = readMementoPhotoAction,
  uploadUrl = uploadRoute('memento'),
}: {
  vehicleId: string;
  /** The photo's folder: the owner's id, the person's or the firm's. */
  folder: string;
  entry?: MementoEntry | null;
  /** Kinds this vehicle already has: a new entry picks from the rest. */
  takenKinds?: readonly MementoKind[];
  action?: (previous: MementoState, formData: FormData) => Promise<MementoState>;
  readPhoto?: (path: string, kind: string) => Promise<MementoPhotoReading>;
  uploadUrl?: string;
}) {
  const [state, dispatch, pending] = useKeptActionState(action, EMPTY);
  const formRef = useRef<HTMLFormElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const referenceRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const { dirty, markSaved } = useFormDirty(formRef);
  useLeaveGuard(dirty);
  const id = useId();

  const free = MEMENTO_KINDS.filter((kind) => kind === 'altceva' || !takenKinds.includes(kind));
  const [kind, setKind] = useState<MementoKind>(entry?.kind ?? free[0] ?? 'altceva');
  const [photoPath, setPhotoPath] = useState<string | null>(entry?.photoPath ?? null);
  const [reading, setReading] = useState<Reading>({ state: 'idle' });

  const [handled, setHandled] = useState(state);
  if (handled !== state) {
    setHandled(state);
    if (state.notice !== undefined) markSaved();
  }

  const queue = useUploadQueue({
    scope: `memento:${vehicleId}:${entry?.id ?? 'nou'}`,
    send: async (file, onProgress) => {
      const form = new FormData();
      form.set('id', file.id);
      form.set('folder', folder);
      form.set('photo', new File([file.blob], file.name, { type: file.type }));
      const answer = await postUpload<{ path?: string }>(uploadUrl, form, onProgress);
      if (typeof answer.path !== 'string') throw new SendError('server', SEND_ERROR_MESSAGES.server);
      return { path: answer.path };
    },
    onUploaded: (_item, result) => {
      const path = result?.path;
      if (typeof path !== 'string') return;
      setPhotoPath(path);
      setReading({ state: 'reading' });
      readPhoto(path, kind)
        .then((answer) => {
          setReading(answer);
          if (answer.status === 'read') {
            if (answer.validUntil !== null && dateRef.current !== null) dateRef.current.value = answer.validUntil;
            if (answer.reference !== null && referenceRef.current !== null && referenceRef.current.value === '') {
              referenceRef.current.value = answer.reference;
            }
          }
        })
        .catch(() => setReading({ status: 'unavailable' }));
    },
  });

  async function chosen(file: File | undefined) {
    if (file === undefined) return;
    if (fileRef.current !== null) fileRef.current.value = '';
    const small = await shrinkPhoto(file);
    queue.add([small]);
  }

  const latest = queue.items.at(-1);

  return (
    <KeepingForm
      ref={formRef}
      action={dispatch}
      className="flex flex-col gap-3"
      data-memento-entry-editor={entry?.kind ?? 'nou'}
      noValidate
    >
      <input type="hidden" name="vehicle_id" value={vehicleId} />
      {entry ? <input type="hidden" name="entry_id" value={entry.id} /> : null}
      <input type="hidden" name="photo_path" value={photoPath ?? ''} />

      {entry ? (
        <input type="hidden" name="kind" value={entry.kind} />
      ) : (
        <Labelled label="Documentul" htmlFor={`${id}-kind`}>
          <select
            id={`${id}-kind`}
            name="kind"
            value={kind}
            onChange={(event) => setKind(event.target.value as MementoKind)}
            className={cn(MEMENTO_CONTROL, 'border-border-strong')}
          >
            {free.map((option) => (
              <option key={option} value={option}>
                {MEMENTO_KIND_LABELS[option]}
              </option>
            ))}
          </select>
        </Labelled>
      )}

      {kind === 'altceva' ? (
        <Labelled label={f.customName} htmlFor={`${id}-name`} error={state.fieldErrors?.custom_name}>
          <input
            id={`${id}-name`}
            name="custom_name"
            maxLength={60}
            defaultValue={entry?.customName ?? ''}
            placeholder={f.customNamePlaceholder}
            className={cn(MEMENTO_CONTROL, state.fieldErrors?.custom_name ? 'border-danger' : 'border-border-strong')}
          />
        </Labelled>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <Labelled label={f.expires} htmlFor={`${id}-date`} error={state.fieldErrors?.valid_until}>
          <input
            ref={dateRef}
            id={`${id}-date`}
            name="valid_until"
            type="date"
            defaultValue={entry?.validUntil ?? ''}
            aria-invalid={state.fieldErrors?.valid_until ? true : undefined}
            className={cn(MEMENTO_CONTROL, state.fieldErrors?.valid_until ? 'border-danger' : 'border-border-strong')}
            data-memento-entry-date
          />
        </Labelled>
        {kind === 'revizie' ? (
          <Labelled label={f.dueKm} htmlFor={`${id}-km`} error={state.fieldErrors?.due_km}>
            <input
              id={`${id}-km`}
              name="due_km"
              inputMode="numeric"
              defaultValue={entry?.dueKm ?? ''}
              className={cn(MEMENTO_CONTROL, 'border-border-strong')}
            />
          </Labelled>
        ) : (
          <Labelled label={f.reference} htmlFor={`${id}-ref`} optional>
            <input
              ref={referenceRef}
              id={`${id}-ref`}
              name="reference"
              maxLength={60}
              defaultValue={entry?.reference ?? ''}
              className={cn(MEMENTO_CONTROL, 'border-border-strong font-mono')}
            />
          </Labelled>
        )}
      </div>

      <Labelled label={f.note} htmlFor={`${id}-note`} optional>
        <textarea
          id={`${id}-note`}
          name="note"
          rows={2}
          maxLength={500}
          defaultValue={entry?.note ?? ''}
          className={cn(MEMENTO_CONTROL, 'border-border-strong')}
        />
      </Labelled>

      <div className="flex flex-col gap-2 rounded-input border border-dashed border-border-strong p-3" data-memento-photo>
        <div className="flex flex-wrap items-center gap-3">
          <label className={cn(buttonClasses('secondary', 'sm'), 'cursor-pointer')}>
            {photoPath ? p.replace : p.choose}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              onChange={(event) => void chosen(event.target.files?.[0])}
              data-memento-photo-input
            />
          </label>
          {photoPath && latest === undefined ? <span className="text-small text-muted">{p.attached}</span> : null}
        </div>
        <p className="text-small text-muted">{p.hint}</p>
        {latest ? (
          <UploadLine item={latest} preview={queue.previewOf(latest.id)} onRetry={queue.retry} onDiscard={queue.discard} />
        ) : null}
        <ReadingLine reading={reading} />
      </div>

      <FormError>{state.error}</FormError>
      <FormNotice>{state.notice}</FormNotice>
      <div>
        <button type="submit" disabled={pending} className={buttonClasses('ink', 'sm')} data-memento-entry-save>
          {pending ? mementoCopy.renew.saving : mementoCopy.vehicle.saveDocument}
        </button>
      </div>
    </KeepingForm>
  );
}

function ReadingLine({ reading }: { reading: Reading }) {
  if ('state' in reading) {
    if (reading.state === 'idle') return null;
    return (
      <p role="status" className="text-small text-muted" data-memento-reading="reading">
        {p.reading}
      </p>
    );
  }
  const text =
    reading.status === 'read'
      ? reading.validUntil !== null
        ? p.read(formatDay(reading.validUntil))
        : p.readNoDate
      : reading.status === 'unreadable'
        ? p.unreadable
        : (reading.message ?? p.unavailable);
  return (
    <p role="status" className="text-small text-foreground" data-memento-reading={reading.status}>
      {text}
    </p>
  );
}
