'use client';

import { NOT_KEPT_MESSAGES, UPLOAD_ACTION_LABELS, statusLine, type UploadItem } from '@/lib/uploads/queue';

/**
 * One file on its way, the same everywhere a file is sent: a thumbnail,
 * its state in words („în așteptare", „se încarcă — 42%", „încărcat",
 * „eșuat"), the progress, the reason when it failed, and „Încearcă din
 * nou", which sends the same file again.
 *
 * The bar moves by `transform`, never by width (`feedback.test.tsx`).
 */
export function UploadLine({
  item,
  preview,
  onRetry,
  onDiscard,
  className,
}: {
  item: UploadItem;
  preview: string | null;
  onRetry: (id: string) => void;
  onDiscard: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      className={`flex gap-3 rounded-input border border-border bg-ground-alt p-2.5 ${className ?? ''}`}
      data-upload-status={item.status}
      data-upload-name={item.name}
    >
      <Thumbnail item={item} preview={preview} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-small">{item.name}</p>
        <p className="text-small text-muted" aria-live="polite">
          {statusLine(item)}
        </p>
        {item.status === 'uploading' ? (
          <div className="mt-1 h-1.5 overflow-hidden rounded-pill bg-surface">
            <div className="h-full origin-left bg-accent" style={{ transform: `scaleX(${item.progress})` }} />
          </div>
        ) : null}
        {item.status === 'failed' && item.error ? (
          <p role="alert" className="mt-1 text-small text-danger">
            {item.error}
          </p>
        ) : null}
        {item.kept !== null && item.kept !== true ? (
          <p className="mt-1 text-small text-muted">{NOT_KEPT_MESSAGES[item.kept]}</p>
        ) : null}
        {item.status === 'failed' ? (
          <div className="mt-1.5 flex gap-4">
            <button type="button" className="text-small font-medium underline underline-offset-4" onClick={() => onRetry(item.id)} data-upload-retry>
              {UPLOAD_ACTION_LABELS.retry}
            </button>
            <button
              type="button"
              className="text-small text-muted underline-offset-4 hover:underline"
              onClick={() => onDiscard(item.id)}
            >
              {UPLOAD_ACTION_LABELS.discard}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function Thumbnail({ item, preview }: { item: Pick<UploadItem, 'name' | 'type'>; preview: string | null }) {
  return preview !== null ? (
    // eslint-disable-next-line @next/next/no-img-element -- a blob: URL on the device, never optimised
    <img src={preview} alt="" className="h-12 w-12 flex-none rounded-input object-cover" />
  ) : (
    <span className="flex h-12 w-12 flex-none items-center justify-center rounded-input bg-surface text-small text-muted">
      {item.type === 'application/pdf' ? 'PDF' : '—'}
    </span>
  );
}
