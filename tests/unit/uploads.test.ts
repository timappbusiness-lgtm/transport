import { describe, expect, it } from 'vitest';
import { FAILURE_MESSAGES } from '@/lib/continuity/network';
import {
  MAX_AGE_MS,
  MAX_KEEP_BYTES,
  MAX_KEEP_TOTAL_BYTES,
  createFileStore,
  memoryBackend,
  type FileBackend,
  type StoredFile,
} from '@/lib/uploads/file-store';
import {
  attachmentPath,
  evidencePath,
  isDuplicateObject,
  isDuplicateRow,
  isUploadKind,
  isUuid,
  newUploadId,
  requestPhotoPath,
} from '@/lib/uploads/paths';
import {
  NOT_KEPT_MESSAGES,
  UPLOAD_STATUS_LABELS,
  nextToSend,
  statusLine,
  summarise,
  uploadReducer,
  type UploadItem,
} from '@/lib/uploads/queue';
import { SEND_ERROR_MESSAGES, SendError, errorForAnswer, isAlreadyThere } from '@/lib/uploads/transport';
import { failureMessage } from '@/lib/uploads/use-upload-queue';

const added = (id: string, extra: Partial<Pick<UploadItem, 'meta'>> & { restored?: boolean } = {}) =>
  ({ id, name: `${id}.jpg`, size: 1000, type: 'image/jpeg', meta: extra.meta ?? {}, restored: extra.restored });

function run(events: Parameters<typeof uploadReducer>[1][]): UploadItem[] {
  return events.reduce<UploadItem[]>((items, event) => uploadReducer(items, event), []);
}

describe('a file on its way: the four states a person reads', () => {
  it('starts „în așteptare", then „se încarcă" with how far, then „încărcat"', () => {
    let items = run([{ type: 'added', items: [added('a')] }]);
    expect(items[0]).toMatchObject({ status: 'waiting', progress: 0, error: null });
    expect(statusLine(items[0]!)).toBe('în așteptare');

    items = uploadReducer(items, { type: 'started', id: 'a' });
    items = uploadReducer(items, { type: 'progress', id: 'a', fraction: 0.42 });
    expect(statusLine(items[0]!)).toBe('se încarcă — 42%');

    items = uploadReducer(items, { type: 'succeeded', id: 'a', result: { path: 'x/a.jpg' } });
    expect(items[0]).toMatchObject({ status: 'uploaded', progress: 1, result: { path: 'x/a.jpg' } });
    expect(statusLine(items[0]!)).toBe('încărcat');
  });

  it('a failure keeps the file, with its reason, and never removes it', () => {
    const items = run([
      { type: 'added', items: [added('a')] },
      { type: 'started', id: 'a' },
      { type: 'failed', id: 'a', error: 'Conexiunea s-a întrerupt.' },
    ]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ status: 'failed', error: 'Conexiunea s-a întrerupt.', progress: 0 });
    expect(UPLOAD_STATUS_LABELS.failed).toBe('eșuat');
  });

  it('„Încearcă din nou" puts the same file, under the same id, back in line', () => {
    let items = run([
      { type: 'added', items: [added('a')] },
      { type: 'started', id: 'a' },
      { type: 'failed', id: 'a', error: 'x' },
    ]);
    expect(nextToSend(items)).toBeNull();
    items = uploadReducer(items, { type: 'retried', id: 'a' });
    expect(items[0]).toMatchObject({ status: 'waiting', error: null });
    expect(nextToSend(items)?.id).toBe('a');
  });

  it('a later complaint does not turn a landed upload into a failure', () => {
    const items = run([
      { type: 'added', items: [added('a')] },
      { type: 'succeeded', id: 'a' },
      { type: 'failed', id: 'a', error: 'x' },
    ]);
    expect(items[0]!.status).toBe('uploaded');
  });

  it('progress is clamped, and ignored when the file is not uploading', () => {
    let items = run([{ type: 'added', items: [added('a')] }, { type: 'progress', id: 'a', fraction: 0.5 }]);
    expect(items[0]!.progress).toBe(0);
    items = uploadReducer(uploadReducer(items, { type: 'started', id: 'a' }), { type: 'progress', id: 'a', fraction: 7 });
    expect(items[0]!.progress).toBe(1);
    items = uploadReducer(items, { type: 'progress', id: 'a', fraction: Number.NaN });
    expect(items[0]!.progress).toBe(0);
  });

  it('the same id added twice is one file', () => {
    const items = run([{ type: 'added', items: [added('a')] }, { type: 'added', items: [added('a')] }]);
    expect(items).toHaveLength(1);
  });

  it('a file found on the device already sent comes back as „încărcat", not to be sent again', () => {
    const items = run([
      { type: 'added', items: [{ ...added('a', { restored: true }), uploaded: { path: 'x/a.jpg' } }] },
    ]);
    expect(items[0]).toMatchObject({ status: 'uploaded', restored: true, result: { path: 'x/a.jpg' } });
    expect(nextToSend(items)).toBeNull();
  });

  it('meta merges, and discard removes', () => {
    let items = run([{ type: 'added', items: [added('a', { meta: { kind: 'rca' } })] }]);
    items = uploadReducer(items, { type: 'meta', id: 'a', meta: { vehicleId: 'v1' } });
    expect(items[0]!.meta).toEqual({ kind: 'rca', vehicleId: 'v1' });
    expect(uploadReducer(items, { type: 'removed', id: 'a' })).toEqual([]);
  });
});

describe('which file goes next', () => {
  it('one at a time, oldest first', () => {
    const items = run([
      { type: 'added', items: [added('a'), added('b')] },
      { type: 'started', id: 'a' },
    ]);
    expect(nextToSend(items)).toBeNull();
    expect(nextToSend(uploadReducer(items, { type: 'succeeded', id: 'a' }))?.id).toBe('b');
  });

  it('a file found after a reload waits for „Trimite-le acum" when the screen asks first', () => {
    const items = run([{ type: 'added', items: [added('a', { restored: true })] }]);
    expect(nextToSend(items, false)).toBeNull();
    expect(nextToSend(items, true)?.id).toBe('a');
    expect(nextToSend(uploadReducer(items, { type: 'resumed' }), false)?.id).toBe('a');
  });

  it('a file on hold — an image chosen for a message not yet sent — is not sent', () => {
    let items = run([{ type: 'added', items: [added('a', { meta: { hold: true } })] }]);
    expect(nextToSend(items)).toBeNull();
    items = uploadReducer(items, { type: 'meta', id: 'a', meta: { hold: false, messageId: 'm1' } });
    expect(nextToSend(items)?.id).toBe('a');
  });

  it('the summary counts each state and knows when everything has arrived', () => {
    const items = run([
      { type: 'added', items: [added('a'), added('b'), added('c')] },
      { type: 'succeeded', id: 'a' },
      { type: 'started', id: 'b' },
      { type: 'failed', id: 'b', error: 'x' },
    ]);
    expect(summarise(items)).toEqual({ total: 3, waiting: 1, uploading: 0, uploaded: 1, failed: 1, done: false });
    expect(summarise([]).done).toBe(false);
    expect(summarise(run([{ type: 'added', items: [added('a')] }, { type: 'succeeded', id: 'a' }])).done).toBe(true);
  });
});

describe('the device copy: kept until the server has it', () => {
  const file = (over: Partial<StoredFile> = {}): StoredFile => ({
    id: 'a',
    scope: 'doc:c1',
    blob: new Blob([new Uint8Array(1000)], { type: 'image/jpeg' }),
    name: 'licenta.jpg',
    type: 'image/jpeg',
    createdAt: 1_000,
    ...over,
  });

  it('keeps, lists by scope oldest first, and drops', async () => {
    const backend = memoryBackend();
    const store = createFileStore(backend, () => 2_000);
    expect(await store.keep(file({ id: 'b', createdAt: 1_500 }))).toEqual({ kept: true });
    expect(await store.keep(file({ id: 'a', createdAt: 1_000 }))).toEqual({ kept: true });
    expect(await store.keep(file({ id: 'z', scope: 'mesaj:x' }))).toEqual({ kept: true });
    expect((await store.list('doc:c1')).map((f) => f.id)).toEqual(['a', 'b']);
    await store.drop('a');
    expect((await store.list('doc:c1')).map((f) => f.id)).toEqual(['b']);
  });

  it('refuses a file too large to keep, and says so in a sentence', async () => {
    const store = createFileStore(memoryBackend());
    const big = file({ blob: new Blob([new Uint8Array(MAX_KEEP_BYTES + 1)]) });
    expect(await store.keep(big)).toEqual({ kept: false, reason: 'too_large' });
    expect(NOT_KEPT_MESSAGES.too_large).toMatch(/15 MB/);
  });

  it('refuses when everything kept would pass the total', async () => {
    const backend = memoryBackend();
    const store = createFileStore(backend, () => 2_000);
    // Each under the per-file ceiling; together over the total.
    const chunk = 12 * 1024 * 1024;
    const fits = Math.floor(MAX_KEEP_TOTAL_BYTES / chunk);
    for (let i = 0; i < fits; i += 1) {
      expect((await store.keep(file({ id: `f${i}`, blob: new Blob([new Uint8Array(chunk)]) }))).kept).toBe(true);
    }
    expect(await store.keep(file({ id: 'last', blob: new Blob([new Uint8Array(chunk)]) }))).toEqual({
      kept: false,
      reason: 'full',
    });
    // Keeping the same id again replaces it rather than counting twice.
    expect((await store.keep(file({ id: 'f0', blob: new Blob([new Uint8Array(chunk)]) }))).kept).toBe(true);
  });

  it('says „unavailable" when the browser will not store it (a private window)', async () => {
    const refusing: FileBackend = { ...memoryBackend(), put: async () => false };
    expect(await createFileStore(refusing).keep(file())).toEqual({ kept: false, reason: 'unavailable' });
  });

  it('forgets a file older than a week', async () => {
    const backend = memoryBackend();
    const store = createFileStore(backend, () => 1_000 + MAX_AGE_MS + 1);
    await backend.put(file());
    expect(await store.list('doc:c1')).toEqual([]);
    expect(backend.files.size).toBe(0);
  });

  it('still finds a driver photograph kept by the first version (no meta, `<order>:<kind>` scope)', async () => {
    const backend = memoryBackend();
    await backend.put({ id: 'old', scope: 'o1:pickup', blob: new Blob(['x']), name: 'p.jpg', type: 'image/jpeg', createdAt: 1_000 });
    const found = await createFileStore(backend, () => 2_000).list('o1:pickup');
    expect(found.map((f) => f.id)).toEqual(['old']);
  });
});

describe('what an answer means', () => {
  it('2xx is a success; 401 is the session; 413 is the size', () => {
    expect(errorForAnswer({ status: 200, body: {} })).toBeNull();
    expect(errorForAnswer({ status: 401, body: {} })?.kind).toBe('session');
    expect(errorForAnswer({ status: 413, body: {} })?.kind).toBe('too_large');
  });

  it('a 4xx with a Romanian sentence shows that sentence; otherwise ours', () => {
    const said = errorForAnswer({ status: 422, body: { error: 'Fișierul nu pare o poză.' } });
    expect(said).toMatchObject({ kind: 'refused', message: 'Fișierul nu pare o poză.' });
    const english = errorForAnswer({ status: 400, body: { message: 'Bad request' } });
    expect(english?.message).toBe(SEND_ERROR_MESSAGES.refused);
  });

  it('a 5xx, or a gateway page in HTML, is the server, with the file kept', () => {
    expect(errorForAnswer({ status: 502, body: '<html>Bad gateway</html>' })).toMatchObject({
      kind: 'server',
      message: SEND_ERROR_MESSAGES.server,
    });
    expect(SEND_ERROR_MESSAGES.server).toMatch(/a rămas aici/);
  });

  it('an object already at a path chosen once is the earlier attempt, not a duplicate', () => {
    expect(isAlreadyThere({ status: 409, body: {} })).toBe(true);
    expect(isAlreadyThere({ status: 400, body: { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' } })).toBe(true);
    expect(isAlreadyThere({ status: 400, body: { error: 'Duplicate' } })).toBe(true);
    expect(isAlreadyThere({ status: 400, body: { message: 'mime type not supported' } })).toBe(false);
    expect(isAlreadyThere({ status: 200, body: 'ok' })).toBe(false);
  });

  it('every failure becomes a sentence; an expired session is flagged', () => {
    expect(failureMessage(new SendError('session', SEND_ERROR_MESSAGES.session))).toEqual({
      message: SEND_ERROR_MESSAGES.session,
      session: true,
    });
    expect(failureMessage(new TypeError('Failed to fetch'))).toEqual({ message: FAILURE_MESSAGES.network, session: false });
    expect(failureMessage(new Error('Poza depășește 10 MB.'))).toEqual({ message: 'Poza depășește 10 MB.', session: false });
    expect(failureMessage(new Error('undefined is not a function'))).toEqual({
      message: SEND_ERROR_MESSAGES.server,
      session: false,
    });
  });
});

describe('where a file goes: named by the id the device chose', () => {
  const id = '3f6c8a52-6a0e-4f1b-9d7e-2b8c1d9e0a11';

  it('the same id gives the same path, every time', () => {
    expect(requestPhotoPath('u1', id)).toBe(`u1/foto-${id}.jpg`);
    expect(evidencePath('o1', id)).toBe(`o1/${id}.jpg`);
    expect(attachmentPath('c1', 'm1', id)).toBe(`c1/m1-${id}.jpg`);
    expect(requestPhotoPath('u1', id)).toBe(requestPhotoPath('u1', id));
  });

  it('only an id shaped like a uuid is accepted: it becomes part of a path', () => {
    expect(isUuid(id)).toBe(true);
    expect(isUuid('../../etc/passwd')).toBe(false);
    expect(isUuid('a/b')).toBe(false);
    expect(isUuid(42)).toBe(false);
  });

  it('a new id has that shape, with or without crypto.randomUUID', () => {
    expect(isUuid(newUploadId())).toBe(true);
    const original = globalThis.crypto.randomUUID;
    try {
      Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true });
      let n = 0;
      const fallback = newUploadId(() => ((n += 7) % 16) / 16);
      expect(isUuid(fallback)).toBe(true);
      expect(fallback[14]).toBe('4');
    } finally {
      Object.defineProperty(globalThis.crypto, 'randomUUID', { value: original, configurable: true });
    }
  });

  it('knows the three kinds the route takes, and nothing else', () => {
    expect(['poza-cerere', 'dovada', 'atasament'].every(isUploadKind)).toBe(true);
    expect(isUploadKind('documente')).toBe(false);
  });

  it('reads storage and Postgres duplicates', () => {
    expect(isDuplicateObject({ statusCode: '409', message: 'x' })).toBe(true);
    expect(isDuplicateObject({ message: 'The resource already exists' })).toBe(true);
    expect(isDuplicateObject({ message: 'new row violates row-level security policy' })).toBe(false);
    expect(isDuplicateObject(null)).toBe(false);
    expect(isDuplicateRow({ code: '23505' })).toBe(true);
    expect(isDuplicateRow({ code: '42501' })).toBe(false);
  });
});
