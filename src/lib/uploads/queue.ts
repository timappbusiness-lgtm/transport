/**
 * The state of every file on its way to the server, as one reducer.
 *
 * Four states a person can read, in the words the screen uses:
 * „în așteptare", „se încarcă" with how far, „încărcat", and „eșuat" with
 * „Încearcă din nou". A failure never removes the file: it stays, with
 * its reason, until the person retries or discards it — and a retry sends
 * the same file under the same id, so the server finds what an earlier
 * attempt made rather than making it twice.
 *
 * Free of React and of the browser, so the rules are tested on their own.
 */

export type UploadStatus = 'waiting' | 'uploading' | 'uploaded' | 'failed';

export type KeptReason = 'too_large' | 'full' | 'unavailable';

export interface UploadItem {
  id: string;
  name: string;
  size: number;
  type: string;
  status: UploadStatus;
  /** 0 to 1, while uploading. */
  progress: number;
  /** The sentence to show when it failed. */
  error: string | null;
  /** Whether it survives a reload; `false` says why not. */
  kept: true | KeptReason | null;
  /** Found on arrival: chosen before a reload or a closed tab. */
  restored: boolean;
  meta: Record<string, string | number | boolean | null>;
  /** Filled by the screen once the server answers: a path, a document id… */
  result: Record<string, string> | null;
}

export type UploadEvent =
  | {
      type: 'added';
      items: Array<
        Pick<UploadItem, 'id' | 'name' | 'size' | 'type' | 'meta'> & {
          restored?: boolean;
          /** Found on the device already sent, waiting for the person to confirm it. */
          uploaded?: Record<string, string> | null;
        }
      >;
    }
  | { type: 'kept'; id: string; kept: UploadItem['kept'] }
  | { type: 'started'; id: string }
  | { type: 'progress'; id: string; fraction: number }
  | { type: 'succeeded'; id: string; result?: Record<string, string> | null }
  | { type: 'failed'; id: string; error: string }
  | { type: 'retried'; id: string }
  | { type: 'removed'; id: string }
  | { type: 'resumed' }
  | { type: 'meta'; id: string; meta: UploadItem['meta'] };

export function uploadReducer(items: readonly UploadItem[], event: UploadEvent): UploadItem[] {
  switch (event.type) {
    case 'added': {
      const known = new Set(items.map((item) => item.id));
      const fresh = event.items
        .filter((item) => !known.has(item.id))
        .map<UploadItem>(({ uploaded, ...item }) => ({
          ...item,
          status: uploaded ? 'uploaded' : 'waiting',
          progress: uploaded ? 1 : 0,
          error: null,
          kept: null,
          restored: item.restored === true,
          result: uploaded ?? null,
        }));
      return [...items, ...fresh];
    }
    case 'kept':
      return update(items, event.id, () => ({ kept: event.kept }));
    case 'started':
      return update(items, event.id, (item) =>
        item.status === 'uploaded' ? {} : { status: 'uploading', progress: 0, error: null },
      );
    case 'progress':
      return update(items, event.id, (item) =>
        item.status === 'uploading' ? { progress: clamp(event.fraction) } : {},
      );
    case 'succeeded':
      return update(items, event.id, () => ({
        status: 'uploaded',
        progress: 1,
        error: null,
        result: event.result ?? null,
      }));
    case 'failed':
      // An upload that already landed does not become a failure because a
      // later step complained: that is the screen's to say, not this list's.
      return update(items, event.id, (item) =>
        item.status === 'uploaded' ? {} : { status: 'failed', error: event.error, progress: 0 },
      );
    case 'retried':
      return update(items, event.id, (item) =>
        item.status === 'failed' ? { status: 'waiting', error: null, progress: 0 } : {},
      );
    case 'removed':
      return items.filter((item) => item.id !== event.id);
    case 'resumed':
      return items.map((item) => (item.restored ? { ...item, restored: false } : item));
    case 'meta':
      return update(items, event.id, (item) => ({ meta: { ...item.meta, ...event.meta } }));
  }
}

function update(
  items: readonly UploadItem[],
  id: string,
  patch: (item: UploadItem) => Partial<UploadItem>,
): UploadItem[] {
  return items.map((item) => (item.id === id ? { ...item, ...patch(item) } : item));
}

function clamp(fraction: number): number {
  if (!Number.isFinite(fraction)) return 0;
  return Math.min(1, Math.max(0, fraction));
}

/**
 * The next file to send: the oldest one waiting, one at a time — a phone
 * on a weak signal does better with one file at full speed than three at
 * a third. Failed ones wait for the person; restored ones wait for
 * `resumed` when the screen asks before sending them.
 *
 * And none goes before the device has answered whether it kept it
 * (`kept` is no longer null): „se încarcă" then means the file is already
 * safe from a closed tab. Without this the upload started a few
 * milliseconds before the write to IndexedDB finished, and a tab closed
 * in between lost the file — the browser test caught it under load.
 */
export function nextToSend(items: readonly UploadItem[], includeRestored = true): UploadItem | null {
  if (items.some((item) => item.status === 'uploading')) return null;
  return (
    items.find(
      (item) =>
        item.status === 'waiting' &&
        item.kept !== null &&
        item.meta.hold !== true &&
        (includeRestored || !item.restored),
    ) ?? null
  );
}

export interface UploadSummary {
  total: number;
  waiting: number;
  uploading: number;
  uploaded: number;
  failed: number;
  /** Everything on the list has reached the server. */
  done: boolean;
}

export function summarise(items: readonly UploadItem[]): UploadSummary {
  const count = (status: UploadStatus) => items.filter((item) => item.status === status).length;
  const uploaded = count('uploaded');
  return {
    total: items.length,
    waiting: count('waiting'),
    uploading: count('uploading'),
    uploaded,
    failed: count('failed'),
    done: items.length > 0 && uploaded === items.length,
  };
}

/** „se încarcă — 42%", „încărcat", … — the words the screen puts beside a file. */
export const UPLOAD_STATUS_LABELS: Record<UploadStatus, string> = {
  waiting: 'în așteptare',
  uploading: 'se încarcă',
  uploaded: 'încărcat',
  failed: 'eșuat',
};

export function statusLine(item: Pick<UploadItem, 'status' | 'progress'>): string {
  if (item.status === 'uploading') return `${UPLOAD_STATUS_LABELS.uploading} — ${Math.round(item.progress * 100)}%`;
  return UPLOAD_STATUS_LABELS[item.status];
}

/** The two things a person can do with a file that did not go. */
export const UPLOAD_ACTION_LABELS = {
  retry: 'Încearcă din nou',
  discard: 'Renunță',
} as const;

/** Why a chosen file will not survive a reload, when it will not. */
export const NOT_KEPT_MESSAGES: Record<KeptReason, string> = {
  too_large:
    'Fișierul are peste 15 MB, așa că nu îl putem păstra dacă închizi pagina. Îl trimitem cât pagina rămâne deschisă.',
  full: 'Telefonul nu mai are loc să păstreze fișierul dacă închizi pagina. Îl trimitem cât pagina rămâne deschisă.',
  unavailable:
    'Browserul nu ne lasă să păstrăm fișierul dacă închizi pagina (de exemplu într-o fereastră privată). Îl trimitem cât pagina rămâne deschisă.',
};
