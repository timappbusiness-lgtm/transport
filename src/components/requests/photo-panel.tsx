'use client';

import { useId, useState } from 'react';
import { removeRequestPhotoAction } from '@/app/cerere/import-actions';
import { UploadLine } from '@/components/ui/upload-line';
import { uploadRoute } from '@/config/routes';
import { requestsCopy } from '@/content/cereri';
import {
  ACCEPTED_PHOTO_TYPES,
  MAX_PHOTOS,
  rejectPhoto,
  remainingPhotoSlots,
} from '@/lib/photo-upload';
import { shrinkPhoto as shrink } from '@/lib/photo-shrink';
import { cn } from '@/lib/utils';
import { Icon } from '@/components/ui/icon';
import { iconForAction } from '@/lib/icons';
import { SEND_ERROR_MESSAGES, SendError, postUpload } from '@/lib/uploads/transport';
import { useUploadQueue } from '@/lib/uploads/use-upload-queue';

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
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // Every chosen photo is kept on the device until the server has it, and
  // sent under an id chosen once: a failed one stays with „Încearcă din
  // nou", a reload sends what was still waiting, and a retry after a lost
  // answer lands on the same object instead of a second one.
  const queue = useUploadQueue({
    scope: 'cerere-poze',
    send: async (file, onProgress) => {
      const small = await shrink(new File([file.blob], file.name, { type: file.type }));
      const form = new FormData();
      form.set('id', file.id);
      form.set('photo', small);
      const answer = await postUpload<{ path?: string }>(uploadRoute('poza-cerere'), form, onProgress);
      if (typeof answer.path !== 'string') throw new SendError('server', SEND_ERROR_MESSAGES.server);
      return { path: answer.path };
    },
    onUploaded: (item, result) => {
      if (result?.path) onAdd({ path: result.path, preview: queue.previewOf(item.id) ?? '' });
    },
  });
  const inFlight = queue.items.filter((item) => item.status !== 'uploaded');
  const remaining = remainingPhotoSlots(photos.length + inFlight.length);

  function pick(files: FileList | null) {
    if (files === null || files.length === 0) return;
    setError(null);
    let chosen = photos.length + inFlight.length;
    const accepted: File[] = [];
    for (const file of Array.from(files)) {
      const rejection = rejectPhoto(file, chosen);
      if (rejection !== null) {
        // Said, and the next file is still tried: one wrong file is not a
        // reason to drop the five right ones after it.
        setError(rejection.message);
        continue;
      }
      chosen += 1;
      accepted.push(file);
    }
    if (accepted.length > 0) queue.add(accepted);
  }

  function remove(photo: ChosenPhoto) {
    onRemove(photo);
    if (photo.preview.startsWith('blob:')) URL.revokeObjectURL(photo.preview);
    // Fire and forget: the request has not been published, so nothing
    // references the file and a failed delete costs a stray object rather
    // than a broken form.
    removeRequestPhotoAction(photo.path).catch(() => {});
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
          <span className="text-small text-muted">{`${c.dropHint} ${c.remaining(remaining, MAX_PHOTOS)}`}</span>
          <input
            id={id}
            type="file"
            multiple
            accept={ACCEPTED_PHOTO_TYPES.join(',')}
            aria-label={c.add}
            onChange={(event) => {
              pick(event.target.files);
              event.target.value = '';
            }}
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

      {inFlight.length > 0 ? (
        <div className="flex flex-col gap-2" data-photo-queue={inFlight.length}>
          {inFlight.map((item) => (
            <UploadLine
              key={item.id}
              item={item}
              preview={queue.previewOf(item.id)}
              onRetry={queue.retry}
              onDiscard={queue.discard}
            />
          ))}
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
