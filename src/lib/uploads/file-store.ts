/**
 * Files chosen and not yet confirmed by the server, kept where a reload
 * cannot reach them.
 *
 * A carrier photographs the licence, the signal drops, the page reloads —
 * or the phone locks and the browser drops the tab. A file held in React
 * state is gone then, and the paper is back in the lorry's cab. So a file
 * is written here the moment it is chosen and removed the moment the
 * server has it; whatever is still here when the page opens again is
 * picked up and sent.
 *
 * IndexedDB, not `localStorage`: it holds Blobs, and a photograph is a
 * megabyte. The database and store keep the names the driver's photos
 * were first kept under (`coridor-trimiteri` / `poze`), so a photograph
 * waiting on a phone from before this file existed is still found. Every
 * call is wrapped — a private window, a full disk, an old browser all
 * mean the file lives only in memory, which the screen then says.
 */

export interface StoredFile {
  /**
   * The upload's own id, chosen once on the device and sent with every
   * attempt: the server uses it for the object path and the row, so a
   * retry after a lost answer finds what the first attempt made instead
   * of making it twice.
   */
  id: string;
  /** What the file belongs to: `doc:<company>`, `mesaj:<conversation>`, `<order>:<kind>`… */
  scope: string;
  blob: Blob;
  name: string;
  type: string;
  createdAt: number;
  /** What the upload needs to be sent again: a document's kind, a vehicle, a position. */
  meta?: Record<string, string | number | boolean | null>;
}

/** The storage the store talks to: IndexedDB in a browser, a Map in the unit tests. */
export interface FileBackend {
  put(file: StoredFile): Promise<boolean>;
  remove(id: string): Promise<void>;
  byScope(scope: string): Promise<StoredFile[]>;
  all(): Promise<StoredFile[]>;
}

/**
 * The largest file kept across a reload. Documents and photographs stop
 * at 10 MB on the server; this leaves room for one that is drawn down
 * afterwards and refuses what would fill a phone's storage quota.
 */
export const MAX_KEEP_BYTES = 15 * 1024 * 1024;
/** Everything kept at once, across every screen. */
export const MAX_KEEP_TOTAL_BYTES = 80 * 1024 * 1024;
/** Kept for a week: a file older than that belongs to something finished. */
export const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export type KeepResult = { kept: true } | { kept: false; reason: 'too_large' | 'full' | 'unavailable' };

export function createFileStore(backend: FileBackend, now: () => number = Date.now) {
  async function sweep(files: StoredFile[]): Promise<StoredFile[]> {
    const fresh: StoredFile[] = [];
    for (const file of files) {
      if (now() - file.createdAt > MAX_AGE_MS) await backend.remove(file.id);
      else fresh.push(file);
    }
    return fresh;
  }

  return {
    /** Keeps the file, or says why it could not be kept. Never throws. */
    async keep(file: StoredFile): Promise<KeepResult> {
      if (file.blob.size > MAX_KEEP_BYTES) return { kept: false, reason: 'too_large' };
      const others = (await sweep(await backend.all())).filter((other) => other.id !== file.id);
      const used = others.reduce((sum, other) => sum + other.blob.size, 0);
      if (used + file.blob.size > MAX_KEEP_TOTAL_BYTES) return { kept: false, reason: 'full' };
      return (await backend.put(file)) ? { kept: true } : { kept: false, reason: 'unavailable' };
    },

    /** Once the server has it. */
    async drop(id: string): Promise<void> {
      await backend.remove(id);
    },

    /** What is still waiting for this scope, oldest first. */
    async list(scope: string): Promise<StoredFile[]> {
      const files = await sweep(await backend.byScope(scope));
      return files.sort((a, b) => a.createdAt - b.createdAt);
    },
  };
}

export type FileStore = ReturnType<typeof createFileStore>;

// ---------------------------------------------------------------------
// Backends
// ---------------------------------------------------------------------

const DB_NAME = 'coridor-trimiteri';
const STORE = 'poze';

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

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  const db = await open();
  if (db === null) return null;
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(STORE, mode);
      const request = work(transaction.objectStore(STORE));
      // A write counts once the transaction commits, not when the request
      // answers: a quota error surfaces on the transaction.
      let result: T | null = null;
      request.onsuccess = () => {
        result = request.result;
      };
      transaction.oncomplete = () => resolve(result === undefined ? (true as T) : result);
      transaction.onerror = () => resolve(null);
      transaction.onabort = () => resolve(null);
    } catch {
      resolve(null);
    } finally {
      db.close();
    }
  });
}

/** The browser's IndexedDB. */
export const indexedDbBackend: FileBackend = {
  async put(file) {
    return (await run('readwrite', (store) => store.put(file))) !== null;
  },
  async remove(id) {
    await run('readwrite', (store) => store.delete(id));
  },
  async byScope(scope) {
    return ((await run('readonly', (store) => store.index('scope').getAll(scope))) ?? []) as StoredFile[];
  },
  async all() {
    return ((await run('readonly', (store) => store.getAll())) ?? []) as StoredFile[];
  },
};

/** For the unit tests, and for a browser with no IndexedDB at all. */
export function memoryBackend(): FileBackend & { files: Map<string, StoredFile> } {
  const files = new Map<string, StoredFile>();
  return {
    files,
    async put(file) {
      files.set(file.id, file);
      return true;
    },
    async remove(id) {
      files.delete(id);
    },
    async byScope(scope) {
      return [...files.values()].filter((file) => file.scope === scope);
    },
    async all() {
      return [...files.values()];
    },
  };
}

/** The store every screen in the browser shares. */
export const browserFileStore = createFileStore(indexedDbBackend);
