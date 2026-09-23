'use client';

import { useId, useRef, useState } from 'react';
import {
  removeRequestPhotoAction,
  uploadRequestPhotoAction,
} from '@/app/cerere/import-actions';
import { requestsCopy } from '@/content/cereri';
import {
  ACCEPTED_PHOTO_TYPES,
  MAX_PHOTOS,
  rejectPhoto,
  remainingPhotoSlots,
} from '@/lib/photo-upload';
import { shrinkPhoto as shrink } from '@/lib/photo-shrink';
import { buttonClasses } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/icon';
import { iconForAction } from '@/lib/icons';

export interface ChosenPhoto {
  /** The path in the bucket, which is what the form submits. */
  path: string;
  /** A local preview, so nothing waits on a round trip to the bucket. */
  preview: string;
  /** True for the one the import found, which is labelled differently. */
  fromImport?: boolean;
}

/**
 * „Pozele vehiculului".
 *
 * Up to six, from the person's own phone. Before this existed the only
 * photo a request could carry was the one the AI import happened to find
 * in the source listing — so somebody with a damaged car, which is the
 * case where a photograph decides the price, could not show it.
 */
export function PhotoPanel({
  photos,
  onAdd,
  onRemove,
}: {
  photos: ChosenPhoto[];
  /** One photo, as soon as it is up: a reload after it loses nothing. */
  onAdd: (photo: ChosenPhoto) => void;
  onRemove: (photo: ChosenPhoto) => void;
}) {
  const c = requestsCopy.form.photos;
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  // Files whose upload failed — the connection dropped, the server said
  // no. They stay chosen, and „Încearcă din nou" sends them again; before,
  // the loop stopped at the first failure and every file after it was
  // silently dropped with it.
  const [failed, setFailed] = useState<File[]>([]);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const remaining = remainingPhotoSlots(photos.length);
  const busy = progress !== null;

  async function upload(files: File[]) {
    setError(null);
    const stillFailing: File[] = [];
    let chosen = photos.length;
    setProgress({ done: 0, total: files.length });

    for (const [index, file] of files.entries()) {
      setProgress({ done: index + 1, total: files.length });
      const rejection = rejectPhoto(file, chosen);
      if (rejection !== null) {
        // Said, and the next file is still tried: one wrong file is not a
        // reason to drop the five right ones after it.
        setError(rejection.message);
        continue;
      }
      try {
        const result = await uploadRequestPhotoAction(toFormData(await shrink(file)));
        if (!result.ok) {
          setError(result.message);
          stillFailing.push(file);
          continue;
        }
        chosen += 1;
        onAdd({ path: result.path, preview: URL.createObjectURL(file) });
      } catch {
        stillFailing.push(file);
      }
    }

    setFailed(stillFailing);
    setProgress(null);
    if (input.current !== null) input.current.value = '';
  }

  function remove(photo: ChosenPhoto) {
    onRemove(photo);
    if (photo.preview.startsWith('blob:')) URL.revokeObjectURL(photo.preview);
    // Fire and forget: the request has not been published, so nothing
    // references the file and a failed delete costs a stray object rather
    // than a broken form.
    removeRequestPhotoAction(photo.path).catch(() => {});
  }

  function pick(files: FileList | null) {
    if (files === null || files.length === 0 || busy) return;
    void upload(Array.from(files));
  }

  return (
    <div data-photo-panel className="flex flex-col gap-3">
      <p className="max-w-[58ch] text-small text-muted">{c.hint}</p>

      {photos.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((photo, index) => (
            <li
              key={photo.path}
              data-photo
              className="relative overflow-hidden rounded-input border border-border bg-surface"
            >
              {photo.preview === '' ? (
                // Brought back by a draft, its picture still on the way.
                <span className="flex aspect-square w-full items-center justify-center bg-ground-alt px-2 text-center text-small text-muted">
                  {c.savedPhoto}
                </span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- a blob: URL from this browser, or a short-lived signed link to the person's own photo
                <img src={photo.preview} alt="" className="aspect-square w-full object-cover" />
              )}
              {/* A word, not a cross: the button says what it does. */}
              <button
                type="button"
                onClick={() => remove(photo)}
                aria-label={c.removeOf(index + 1)}
                className="absolute bottom-1.5 right-1.5 rounded-pill bg-surface/95 px-2.5 py-1 text-small font-medium text-foreground shadow-card hover:bg-surface"
              >
                {c.removeVisible}
              </button>
              {photo.fromImport === true ? (
                <span className="absolute left-1.5 top-1.5 rounded-pill bg-surface/95 px-2 py-0.5 text-small text-foreground">
                  {c.fromImport}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {remaining > 0 ? (
        // The whole area is the control: a click opens the picker, a
        // drop adds the files. On a phone „drag" means nothing and the
        // tap opens the camera roll, which is what the words say.
        <label
          htmlFor={id}
          data-drop
          data-dragging={dragging ? 'true' : undefined}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            pick(event.dataTransfer.files);
          }}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed px-4 py-6 text-center',
            'has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-foreground',
            dragging
              ? 'border-accent bg-accent-subtle'
              : 'border-border-strong bg-surface hover:border-accent hover:bg-accent-subtle',
          )}
        >
          <span className="flex size-10 items-center justify-center rounded-full bg-accent-subtle text-accent">
            <Icon as={iconForAction('upload')} size="md" />
          </span>
          <span className="text-body font-medium text-foreground">{c.drop}</span>
          <span className="text-small text-muted">
            {progress !== null
              ? c.uploadingOf(progress.done, progress.total)
              : `${c.dropHint} ${c.remaining(remaining, MAX_PHOTOS)}`}
          </span>
          <input
            id={id}
            ref={input}
            type="file"
            multiple
            accept={ACCEPTED_PHOTO_TYPES.join(',')}
            disabled={busy}
            aria-label={c.add}
            onChange={(event) => pick(event.target.files)}
            className="sr-only"
          />
        </label>
      ) : (
        <p className="text-small text-muted">{c.full(MAX_PHOTOS)}</p>
      )}

      {error !== null ? (
        <p role="alert" className="rounded-input border border-danger/45 bg-danger/8 px-3.5 py-2.5 text-body">
          {error}
        </p>
      ) : null}

      {failed.length > 0 && !busy ? (
        <div
          role="alert"
          data-photo-failed={failed.length}
          className="flex flex-wrap items-center gap-3 rounded-input border border-danger/45 bg-danger/8 px-3.5 py-2.5 text-body"
        >
          <p className="min-w-0 flex-1">{c.failed(failed.length)}</p>
          <button
            type="button"
            onClick={() => void upload(failed)}
            className={buttonClasses('secondary', 'sm')}
          >
            {c.retry}
          </button>
          <button
            type="button"
            onClick={() => setFailed([])}
            className="text-small text-muted underline underline-offset-4 hover:text-foreground"
          >
            {c.drop_failed}
          </button>
        </div>
      ) : null}

    </div>
  );
}

/**
 * The same area for somebody not signed in yet.
 *
 * Photos go into a folder of the person's own in our bucket, so they need
 * an account; the account is asked for at the last step, and asking for
 * it here would be the sign-up wall in front of the form that this flow
 * exists to avoid. So the area is shown, says when the photos can be
 * added, and says the rest is kept.
 */
export function PhotoPanelLocked() {
  const c = requestsCopy.form.photos;
  return (
    <div
      data-photo-panel
      data-locked="true"
      className="flex flex-col items-center gap-2 rounded-card border-2 border-dashed border-border bg-background px-4 py-6 text-center"
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-ground-alt text-muted">
        <Icon as={iconForAction('upload')} size="md" />
      </span>
      <p className="max-w-[46ch] text-small text-muted">{c.signedOut}</p>
    </div>
  );
}

function toFormData(file: File): FormData {
  const data = new FormData();
  data.set('photo', file);
  return data;
}
