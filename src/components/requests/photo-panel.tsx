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

  return (
    <div className="flex flex-col gap-3 rounded-card border border-border bg-ground-alt p-4">
      <div>
        <p className="text-sm font-medium">{c.title}</p>
        <p className="mt-1 max-w-[58ch] text-xs text-muted">{c.hint}</p>
      </div>

      {photos.length > 0 ? (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((photo) => (
            <li key={photo.path} className="relative">
              {/* eslint-disable-next-line @next/next/no-img-element -- a blob: URL from this browser, never a remote one */}
              <img
                src={photo.preview}
                alt=""
                className="aspect-square w-full rounded-input object-cover"
              />
              <button
                type="button"
                onClick={() => remove(photo)}
                aria-label={c.remove}
                className="absolute right-1 top-1 rounded-full bg-surface/90 px-2 py-0.5 text-xs shadow-sm"
              >
                ✕
              </button>
              {photo.fromImport === true ? (
                <span className="absolute bottom-1 left-1 rounded-full bg-surface/90 px-2 py-0.5 text-[0.625rem]">
                  {c.fromImport}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {remaining > 0 ? (
        <div className="flex flex-col gap-2">
          <label htmlFor={id} className="sr-only">
            {c.add}
          </label>
          <input
            id={id}
            ref={input}
            type="file"
            multiple
            accept={ACCEPTED_PHOTO_TYPES.join(',')}
            disabled={pending}
            onChange={(event) => {
              const files = event.target.files;
              if (files !== null && files.length > 0) {
                startTransition(() => {
                  void add(files);
                });
              }
            }}
            className={cn(
              'w-full rounded-input border border-border-strong bg-surface px-3.5 py-2 text-sm',
              'file:mr-3 file:rounded-input file:border-0 file:bg-ground file:px-3 file:py-1.5 file:text-sm',
            )}
          />
          <p className="text-xs text-muted">
            {pending ? c.uploading : c.remaining(remaining, MAX_PHOTOS)}
          </p>
        </div>
      ) : (
        <p className="text-xs text-muted">{c.full(MAX_PHOTOS)}</p>
      )}

      {error !== null ? (
        <p role="alert" className="rounded-input border border-danger/45 bg-danger/8 px-3.5 py-2.5 text-sm">
          {error}
        </p>
      ) : null}

      {photos.map((photo) => (
        <input key={photo.path} type="hidden" name="photo_paths" value={photo.path} />
      ))}
    </div>
  );
}

function toFormData(file: File): FormData {
  const data = new FormData();
  data.set('photo', file);
  return data;
}
