'use client';

import { useId, useRef, useState, useTransition } from 'react';
import {
  removeRequestPhotoAction,
  uploadRequestPhotoAction,
} from '@/app/cerere/import-actions';
import { requestsCopy } from '@/content/cereri';
import {
  ACCEPTED_PHOTO_TYPES,
  MAX_PHOTOS,
  canResizeInBrowser,
  rejectPhoto,
  remainingPhotoSlots,
  scaleToFit,
} from '@/lib/photo-upload';
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
 * Drawing a photo down to size before it is uploaded.
 *
 * On a phone this is the difference between an upload that finishes and
 * one somebody abandons: a modern camera writes 4–8 MB and four of those
 * over a mobile connection is a minute of nothing happening.
 *
 * HEIC cannot be drawn into a canvas anywhere, so it goes up as it is and
 * the server converts it. Every failure here falls back to the original
 * file rather than refusing: a resize is an optimisation, and an
 * optimisation that can block an upload is a bug.
 */
async function shrink(file: File): Promise<File> {
  if (!canResizeInBrowser(file.type)) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = scaleToFit(bitmap.width, bitmap.height);
    if (width === bitmap.width && height === bitmap.height) {
      bitmap.close();
      return file;
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (context === null) {
      bitmap.close();
      return file;
    }
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', 0.85);
    });
    if (blob === null) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
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
  onChange,
}: {
  photos: ChosenPhoto[];
  onChange: (next: ChosenPhoto[]) => void;
}) {
  const c = requestsCopy.form.photos;
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);
  const remaining = remainingPhotoSlots(photos.length);

  async function add(files: FileList) {
    setError(null);
    const accepted: ChosenPhoto[] = [];

    for (const file of Array.from(files)) {
      const rejection = rejectPhoto(file, photos.length + accepted.length);
      if (rejection !== null) {
        setError(rejection.message);
        break;
      }

      const result = await uploadRequestPhotoAction(toFormData(await shrink(file)));
      if (!result.ok) {
        setError(result.message);
        break;
      }
      accepted.push({ path: result.path, preview: URL.createObjectURL(file) });
    }

    if (accepted.length > 0) onChange([...photos, ...accepted]);
    if (input.current !== null) input.current.value = '';
  }

  function remove(photo: ChosenPhoto) {
    onChange(photos.filter((p) => p.path !== photo.path));
    URL.revokeObjectURL(photo.preview);
    // Fire and forget: the request has not been published, so nothing
    // references the file and a failed delete costs a stray object rather
    // than a broken form.
    void removeRequestPhotoAction(photo.path);
  }

  function pick(files: FileList | null) {
    if (files === null || files.length === 0) return;
    startTransition(() => {
      void add(files);
    });
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
              {/* eslint-disable-next-line @next/next/no-img-element -- a blob: URL from this browser, never a remote one */}
              <img src={photo.preview} alt="" className="aspect-square w-full object-cover" />
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
            {pending ? c.uploading : `${c.dropHint} ${c.remaining(remaining, MAX_PHOTOS)}`}
          </span>
          <input
            id={id}
            ref={input}
            type="file"
            multiple
            accept={ACCEPTED_PHOTO_TYPES.join(',')}
            disabled={pending}
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
