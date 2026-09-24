'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { buttonClasses } from '@/components/ui/button';
import { UploadLine } from '@/components/ui/upload-line';
import { uploadRoute } from '@/config/routes';
import { ordersCopy } from '@/content/comenzi';
import { shrinkPhoto } from '@/lib/photo-shrink';
import { MAX_EDGE_PX, canResizeInBrowser, scaleToFit } from '@/lib/photo-upload';
import { SEND_ERROR_MESSAGES, SendError, postUpload } from '@/lib/uploads/transport';
import { useUploadQueue } from '@/lib/uploads/use-upload-queue';

const c = ordersCopy.capture;

/**
 * Where a photograph waits on the phone: the order and the kind of shot.
 * The same shape the first version of this screen used, so photographs
 * it kept before this one existed are still found and sent.
 */
export function captureScope(orderId: string, kind: string): string {
  return `${orderId}:${kind}`;
}

/**
 * Four photographs, one at a time, camera first.
 *
 * Built for one hand at a loading bay, not for a desk. `capture`
 * opens the rear camera straight away on a phone; the prompts name the
 * shot so nobody has to remember which corner they are on; and each
 * photograph is uploaded as it is taken rather than all four at the
 * end, so a signal that drops halfway costs one retry and not the set.
 *
 * Nothing is lost to a failed upload, a reload or a closed tab. A
 * photograph is drawn down to size, kept in IndexedDB the moment it is
 * taken (`useUploadQueue`), and removed from there only when the server
 * has it. Each one shows its own state and progress; a failure keeps it
 * with „Trimite din nou", which sends the same photograph under the same
 * id — so a retry after a lost answer finds the row the first attempt
 * made instead of adding a fifth photograph. A page opened with
 * photographs still waiting says so and sends them on request.
 *
 * The count comes from the server alone.
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
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [geoAsked, setGeoAsked] = useState(false);
  const [geoDenied, setGeoDenied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const queue = useUploadQueue({
    scope: captureScope(orderId, kind),
    // Photographs from an earlier visit wait for „Trimite-le acum": the
    // driver may be at another car by now.
    autoResume: false,
    send: async (file, onProgress) => {
      const form = new FormData();
      form.set('id', file.id);
      form.set('order_id', orderId);
      form.set('kind', kind);
      if (typeof file.meta.lat === 'number' && typeof file.meta.lng === 'number') {
        form.set('lat', String(file.meta.lat));
        form.set('lng', String(file.meta.lng));
      }
      form.set('photo', new File([file.blob], file.name, { type: file.type }));
      const answer = await postUpload<{ id?: string }>(uploadRoute('dovada'), form, onProgress);
      if (typeof answer.id !== 'string') throw new SendError('server', SEND_ERROR_MESSAGES.server);
      return { id: answer.id };
    },
    onUploaded: () => router.refresh(),
  });

  const pending = queue.items.filter((item) => item.status !== 'uploaded');
  const restored = pending.filter((item) => item.restored && item.status === 'waiting');
  const have = Math.min(count + pending.length - restored.length, prompts.length);
  const total = prompts.length;
  const complete = count >= total;

  async function taken(file: File | undefined) {
    if (file === undefined) return;
    if (inputRef.current !== null) inputRef.current.value = '';
    setBusy(true);
    try {
      // Drawn down first: what is kept on the phone is what is sent.
      const small = await shrinkPhoto(file);
      queue.add([small], geo === null ? {} : { lat: geo.lat, lng: geo.lng });
    } finally {
      setBusy(false);
    }
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
            className={`h-1.5 flex-1 rounded-pill ${index < count ? 'bg-success' : index < have ? 'bg-border-strong' : 'bg-border'}`}
          />
        ))}
      </ol>

      {restored.length > 0 ? (
        <div data-photo-waiting={restored.length} className="rounded-input border border-border bg-ground-alt p-3">
          <p className="text-body">{c.waiting(restored.length)}</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button type="button" onClick={queue.resume} className={buttonClasses('primary', 'sm')}>
              {c.sendWaiting}
            </button>
            <button
              type="button"
              onClick={() => restored.forEach((item) => queue.discard(item.id))}
              className="text-small text-muted underline underline-offset-4"
            >
              {c.discardWaiting}
            </button>
          </div>
        </div>
      ) : null}

      {pending.length > 0 ? (
        <div className="flex flex-col gap-2" data-photo-queue={pending.length}>
          {pending.map((item) => (
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
    </div>
  );
}

/** The longest edge the browser sends, kept in step with the server. */
export const CAPTURE_MAX_EDGE = MAX_EDGE_PX;
export { canResizeInBrowser, scaleToFit };
