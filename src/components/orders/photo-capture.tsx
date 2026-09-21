'use client';

import { useActionState, useRef, useState } from 'react';
import { uploadEvidenceAction, type UploadState } from '@/app/cont/transporturi/actions';
import { FormError } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { ordersCopy } from '@/content/comenzi';
import { MAX_EDGE_PX, canResizeInBrowser, scaleToFit } from '@/lib/photo-upload';

const EMPTY: UploadState = {};
const c = ordersCopy.capture;

/**
 * Four photographs, one at a time, camera first.
 *
 * Built for one hand at a loading bay, not for a desk. `capture`
 * opens the rear camera straight away on a phone; the prompts name the
 * shot so nobody has to remember which corner they are on; and each
 * photograph is uploaded as it is taken rather than all four at the
 * end, so a signal that drops halfway costs one retry and not the set.
 *
 * Nothing is ever lost to a failed upload. A file that did not go up
 * stays in the list with a „încarcă din nou" beside it — the one
 * failure mode a driver cannot recover from is a form that empties
 * itself.
 */
export function PhotoCapture({
  orderId,
  kind,
  count,
  prompts = ordersCopy.capture.prompts,
  done,
}: {
  orderId: string;
  kind: string;
  /** How many are already there, so the prompts start in the right place. */
  count: number;
  prompts?: readonly string[];
  /** Shown once the set is complete. */
  done?: React.ReactNode;
}) {
  const [state, action, pending] = useActionState(uploadEvidenceAction, EMPTY);
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [geoAsked, setGeoAsked] = useState(false);
  const [geoDenied, setGeoDenied] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const have = count + (state.saved ?? 0);
  const total = prompts.length;
  const complete = have >= total;

  /**
   * Asked once, for this capture only.
   *
   * The coordinates do not come from the photograph: the server strips
   * every EXIF block, deliberately and without exception. This is the
   * browser's own answer, and it is stored in two columns where it can
   * be seen and deleted like anything else.
   */
  function askLocation() {
    setGeoAsked(true);
    if (!('geolocation' in navigator)) {
      setGeoDenied(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => setGeo({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => setGeoDenied(true),
      { timeout: 8000 },
    );
  }

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-3">
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="kind" value={kind} />
      {geo !== null ? (
        <>
          <input type="hidden" name="lat" value={geo.lat} />
          <input type="hidden" name="lng" value={geo.lng} />
        </>
      ) : null}

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-medium">
          {complete ? c.uploaded : (prompts[have] ?? c.add)}
        </p>
        <p className="text-xs text-muted">{c.promptHint(Math.min(have + 1, total), total)}</p>
      </div>

      {/* The progress reads as four boxes rather than a bar: a driver
          glancing at it needs to know which shot is next, not a
          percentage. */}
      <ol className="flex gap-1.5">
        {prompts.map((prompt, index) => (
          <li
            key={prompt}
            aria-label={prompt}
            className={`h-1.5 flex-1 rounded-pill ${index < have ? 'bg-success' : 'bg-border'}`}
          />
        ))}
      </ol>

      {!complete ? (
        <>
          <input
            ref={inputRef}
            type="file"
            name="photo"
            accept="image/*"
            capture="environment"
            required
            className="sr-only"
            onChange={() => formRef.current?.requestSubmit()}
          />
          <button
            type="button"
            disabled={pending}
            onClick={() => inputRef.current?.click()}
            // Tall enough to hit with a thumb while holding a phone in
            // the other hand, which is how this is actually used.
            className={`${buttonClasses('primary', 'md')} w-full py-4`}
          >
            {pending ? c.uploading : c.add}
          </button>

          {!geoAsked ? (
            <button
              type="button"
              onClick={askLocation}
              className="text-left text-[0.8125rem] text-muted underline underline-offset-4"
            >
              {c.location}
            </button>
          ) : (
            <p className="text-[0.8125rem] text-muted">
              {geoDenied ? c.locationDenied : c.location}
            </p>
          )}
          <p className="text-xs text-muted">{c.locationHint}</p>
        </>
      ) : (
        done
      )}

      {state.error !== undefined ? (
        <div className="rounded-input border border-danger/40 bg-danger/8 p-3">
          <FormError>{state.error}</FormError>
          <p className="mt-1 text-xs text-muted">{c.failed}</p>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={`${buttonClasses('secondary', 'sm')} mt-2`}
          >
            {c.retry}
          </button>
        </div>
      ) : null}
    </form>
  );
}

/** The longest edge the browser sends, kept in step with the server. */
export const CAPTURE_MAX_EDGE = MAX_EDGE_PX;
export { canResizeInBrowser, scaleToFit };
