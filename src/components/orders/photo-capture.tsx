'use client';

import { useEffect, useRef, useState } from 'react';
import { uploadEvidenceAction, type UploadState } from '@/app/cont/transporturi/actions';
import { FormError } from '@/components/auth/form';
import { buttonClasses } from '@/components/ui/button';
import { ordersCopy } from '@/content/comenzi';
import { FAILURE_MESSAGES, failureKind } from '@/lib/continuity/network';
import {
  dropPending,
  keepPending,
  listPending,
  pendingScope,
  type PendingUpload,
} from '@/lib/continuity/pending-uploads';
import { announceSessionExpired } from '@/lib/continuity/session-store';
import { shrinkPhoto } from '@/lib/photo-shrink';
import { MAX_EDGE_PX, canResizeInBrowser, scaleToFit } from '@/lib/photo-upload';

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
 * Nothing is ever lost to a failed upload, and now not to a reload
 * either. A photograph is drawn down to size (a camera file is several
 * megabytes, over the limit a request may carry), kept in IndexedDB the
 * moment it is taken, and removed from there only when the server has
 * it. A failure keeps it and offers „Trimite din nou", which sends the
 * same photograph — before, the button reopened the camera and the shot
 * had to be taken again. A page opened with photographs still waiting
 * says so and sends them on request.
 *
 * The count comes from the server alone. It used to add the upload's
 * own tally to a count the page had already refreshed, so one
 * photograph advanced the prompts by two.
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
  const scope = pendingScope(orderId, kind);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Taken and not yet on the server: in memory, and in IndexedDB when it can. */
  const [waiting, setWaiting] = useState<PendingUpload[]>([]);
  /** Found in IndexedDB on arrival, from an earlier visit. */
  const [fromBefore, setFromBefore] = useState(false);
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [geoAsked, setGeoAsked] = useState(false);
  const [geoDenied, setGeoDenied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const have = count;
  const total = prompts.length;
  const complete = have >= total;

  useEffect(() => {
    let cancelled = false;
    listPending(scope).then((found) => {
      if (cancelled || found.length === 0) return;
      setWaiting(found);
      setFromBefore(true);
    });
    return () => {
      cancelled = true;
    };
  }, [scope]);

  /** One photograph to the server; true when it arrived. */
  async function send(item: PendingUpload): Promise<boolean> {
    const data = new FormData();
    data.set('order_id', orderId);
    data.set('kind', kind);
    if (geo !== null) {
      data.set('lat', String(geo.lat));
      data.set('lng', String(geo.lng));
    }
    data.set('photo', new File([item.blob], item.name, { type: item.type }));

    let result: UploadState;
    try {
      result = await uploadEvidenceAction({}, data);
    } catch (thrown) {
      const failure = failureKind(thrown);
      if (failure === null) throw thrown;
      if (failure === 'session') announceSessionExpired();
      setError(FAILURE_MESSAGES[failure]);
      return false;
    }
    if (result.error !== undefined || (result.saved ?? 0) === 0) {
      setError(result.error ?? FAILURE_MESSAGES.server);
      return false;
    }
    await dropPending(item.id);
    return true;
  }

  /** Everything waiting, oldest first; stops at the first failure. */
  async function sendAll(queue: PendingUpload[]) {
    setBusy(true);
    setError(null);
    const left = [...queue];
    while (left.length > 0) {
      const ok = await send(left[0]!);
      if (!ok) break;
      left.shift();
    }
    setWaiting(left);
    if (left.length === 0) setFromBefore(false);
    setBusy(false);
  }

  async function taken(file: File | undefined) {
    if (file === undefined) return;
    if (inputRef.current !== null) inputRef.current.value = '';
    setBusy(true);
    const small = await shrinkPhoto(file);
    const item: PendingUpload = {
      id: crypto.randomUUID(),
      scope,
      blob: small,
      name: small.name,
      type: small.type,
      createdAt: Date.now(),
    };
    await keepPending(item);
    await sendAll([...waiting, item]);
  }

  async function discard() {
    for (const item of waiting) await dropPending(item.id);
    setWaiting([]);
    setFromBefore(false);
    setError(null);
  }

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
    <div data-photo-capture className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-body font-medium">
          {complete ? c.uploaded : (prompts[have] ?? c.add)}
        </p>
        <p className="text-small text-muted">{c.promptHint(Math.min(have + 1, total), total)}</p>
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

      {fromBefore && waiting.length > 0 && !busy && error === null ? (
        <div data-photo-waiting={waiting.length} className="rounded-input border border-border bg-ground-alt p-3">
          <p className="text-body">{c.waiting(waiting.length)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => void sendAll(waiting)} className={buttonClasses('primary', 'sm')}>
              {c.sendWaiting}
            </button>
            <button
              type="button"
              onClick={() => void discard()}
              className="text-small text-muted underline underline-offset-4"
            >
              {c.discardWaiting}
            </button>
          </div>
        </div>
      ) : null}

      {!complete ? (
        <>
          <input
            ref={inputRef}
            type="file"
            name="photo"
            accept="image/*"
            capture="environment"
            className="sr-only"
            aria-label={c.add}
            onChange={(event) => void taken(event.target.files?.[0])}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
            // Tall enough to hit with a thumb while holding a phone in
            // the other hand, which is how this is actually used.
            className={`${buttonClasses('primary', 'md')} w-full py-4`}
          >
            {busy ? c.uploading : c.add}
          </button>

          {!geoAsked ? (
            <button
              type="button"
              onClick={askLocation}
              className="text-left text-small text-muted underline underline-offset-4"
            >
              {c.location}
            </button>
          ) : (
            <p className="text-small text-muted">
              {geoDenied ? c.locationDenied : c.location}
            </p>
          )}
          <p className="text-small text-muted">{c.locationHint}</p>
        </>
      ) : (
        done
      )}

      {error !== null && !busy ? (
        <div data-photo-failed={waiting.length} className="rounded-input border border-danger/40 bg-danger/8 p-3">
          <FormError>{error}</FormError>
          <p className="mt-1 text-small text-muted">{c.failed}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            {waiting.length > 0 ? (
              <button type="button" onClick={() => void sendAll(waiting)} className={buttonClasses('secondary', 'sm')}>
                {c.retry}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="text-small text-muted underline underline-offset-4"
            >
              {c.retake}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** The longest edge the browser sends, kept in step with the server. */
export const CAPTURE_MAX_EDGE = MAX_EDGE_PX;
export { canResizeInBrowser, scaleToFit };
