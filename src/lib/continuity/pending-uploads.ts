/**
 * Photographs taken and not yet sent, kept where a reload cannot reach
 * them.
 *
 * A driver at a loading bay takes the photograph, the signal drops, and
 * the page reloads — or the phone locks and the browser drops the tab. A
 * file held in React state is gone then, and the car has driven off. So a
 * photograph is written to IndexedDB the moment it is taken and removed
 * the moment the server has it; whatever is still there when the page
 * opens again is offered to be sent.
 *
 * IndexedDB, not `localStorage`: it holds Blobs, and a photograph is a
 * megabyte. Every call is wrapped — a private window, a full disk or an
 * old browser without it all mean the photograph lives only in memory,
 * which is how it worked before this existed.
 */

const DB_NAME = 'coridor-trimiteri';
const STORE = 'poze';

export interface PendingUpload {
  id: string;
  /** What the upload belongs to: an order and the kind of evidence. */
  scope: string;
  blob: Blob;
  name: string;
  type: string;
  createdAt: number;
}

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') {
        resolve(null);
        return;
      }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore(STORE, { keyPath: 'id' });
        store.createIndex('scope', 'scope');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  const db = await open();
  if (db === null) return null;
  return new Promise((resolve) => {
    try {
      const request = work(db.transaction(STORE, mode).objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    } finally {
      db.close();
    }
  });
}

/** Kept for a week: a photograph older than that belongs to a finished order. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export async function keepPending(upload: PendingUpload): Promise<boolean> {
  return (await run('readwrite', (store) => store.put(upload))) !== null;
}

export async function dropPending(id: string): Promise<void> {
  await run('readwrite', (store) => store.delete(id));
}

export async function listPending(scope: string, now: number = Date.now()): Promise<PendingUpload[]> {
  const all = (await run('readonly', (store) => store.index('scope').getAll(scope))) ?? [];
  const fresh: PendingUpload[] = [];
  for (const item of all as PendingUpload[]) {
    if (now - item.createdAt > MAX_AGE_MS) void dropPending(item.id);
    else fresh.push(item);
  }
  return fresh.sort((a, b) => a.createdAt - b.createdAt);
}

export function pendingScope(orderId: string, kind: string): string {
  return `${orderId}:${kind}`;
}
