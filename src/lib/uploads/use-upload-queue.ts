'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { FAILURE_MESSAGES, failureKind } from '@/lib/continuity/network';
import { announceSessionExpired } from '@/lib/continuity/session-store';
import { browserFileStore, type FileStore, type StoredFile } from './file-store';
import { nextToSend, summarise, uploadReducer, type UploadItem, type UploadSummary } from './queue';
import { newUploadId } from './paths';
import { SEND_ERROR_MESSAGES, SendError } from './transport';

/** A file handed to the sender: the same id and bytes on every attempt. */
export interface QueuedFile {
  id: string;
  blob: Blob;
  name: string;
  type: string;
  meta: UploadItem['meta'];
}

/**
 * Sends one file. It must be idempotent on `file.id`: the same id twice
 * means the same object and the same row, never a second one. Returns
 * whatever the screen needs afterwards — a path, a document id.
 */
export type Sender = (
  file: QueuedFile,
  onProgress: (fraction: number) => void,
) => Promise<Record<string, string> | void>;

export interface UploadQueue {
  items: UploadItem[];
  summary: UploadSummary;
  /** Chosen files: kept on the device, then sent one by one. */
  add: (files: readonly File[], meta?: UploadItem['meta'] | ((file: File) => UploadItem['meta'])) => string[];
  retry: (id: string) => void;
  /** Gone from the list and from the device; the server is not asked. */
  discard: (id: string) => void;
  /** Send what was found on arrival, when the screen asked first. */
  resume: () => void;
  setMeta: (id: string, meta: UploadItem['meta']) => void;
  /** An image's thumbnail, while the page is open. */
  previewOf: (id: string) => string | null;
}

/** A file kept after it was sent: what the server said then, read back from its meta. */
function uploadedResult(meta: StoredFile['meta']): Record<string, string> | null {
  if (!meta || meta.sent !== true) return null;
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (key.startsWith('sent_') && typeof value === 'string') result[key.slice(5)] = value;
  }
  return result;
}


/** The sentence for a failed send, whatever threw it. */
export function failureMessage(error: unknown): { message: string; session: boolean } {
  if (error instanceof SendError) return { message: error.message, session: error.kind === 'session' };
  const kind = failureKind(error);
  if (kind !== null) return { message: FAILURE_MESSAGES[kind], session: kind === 'session' };
  if (error instanceof Error && /[ăâîșț]/i.test(error.message)) return { message: error.message, session: false };
  return { message: SEND_ERROR_MESSAGES.server, session: false };
}

/**
 * Files on their way to the server, surviving a failed request, a reload
 * and a closed tab.
 *
 * A chosen file is written to the device first (`FileStore`), then sent,
 * one at a time, with its progress; it leaves the device only when the
 * server has confirmed it. A failure keeps it, with the reason and a
 * retry that sends the same bytes under the same id. On arrival, what a
 * previous visit left in `scope` is picked up — and sent at once, or kept
 * waiting for `resume()` when `autoResume` is false.
 */
export function useUploadQueue({
  scope,
  send,
  store = browserFileStore,
  onUploaded,
  keepAfterUpload,
  autoResume = true,
  enabled = true,
}: {
  scope: string;
  send: Sender;
  store?: FileStore;
  onUploaded?: ((item: UploadItem, result: Record<string, string> | null) => void) | undefined;
  /**
   * For a file that reaches the server before it is finished with — a
   * gallery photo still waiting for the person to say what it is: kept on
   * the device, marked sent, and found again as „încărcat" after a
   * reload. The screen lets it go with `discard` once it is registered.
   */
  keepAfterUpload?: ((item: UploadItem) => boolean) | undefined;
  autoResume?: boolean;
  enabled?: boolean;
}): UploadQueue {
  const [items, dispatch] = useReducer(uploadReducer, []);
  const blobs = useRef(new Map<string, Blob>());
  const [previews, setPreviews] = useState<ReadonlyMap<string, string>>(new Map());
  // The same URLs, for the clean-up on the way out, which sees only the
  // first render's state.
  const previewUrls = useRef(new Map<string, string>());
  const busy = useRef<string | null>(null);
  const latest = useRef({ send, onUploaded, keepAfterUpload, items });
  useEffect(() => {
    latest.current = { send, onUploaded, keepAfterUpload, items };
  });

  const preview = useCallback((id: string, blob: Blob) => {
    if (!blob.type.startsWith('image/') || typeof URL === 'undefined') return;
    const url = URL.createObjectURL(blob);
    previewUrls.current.set(id, url);
    setPreviews((current) => new Map(current).set(id, url));
  }, []);

  // What a previous visit left on the device, for this scope.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void store.list(scope).then((found) => {
      if (cancelled || found.length === 0) return;
      for (const file of found) {
        blobs.current.set(file.id, file.blob);
        preview(file.id, file.blob);
      }
      dispatch({
        type: 'added',
        items: found.map((file) => ({
          id: file.id,
          name: file.name,
          size: file.blob.size,
          type: file.type,
          meta: file.meta ?? {},
          restored: true,
          uploaded: uploadedResult(file.meta),
        })),
      });
      for (const file of found) dispatch({ type: 'kept', id: file.id, kept: true });
    });
    return () => {
      cancelled = true;
    };
  }, [scope, store, enabled, preview]);

  // Thumbnails go when the page does.
  useEffect(() => {
    const urls = previewUrls.current;
    return () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
    };
  }, []);

  // One file at a time, oldest first.
  useEffect(() => {
    if (!enabled || busy.current !== null) return;
    const next = nextToSend(items, autoResume);
    if (next === null) return;
    const blob = blobs.current.get(next.id);
    if (blob === undefined) return;
    busy.current = next.id;

    void (async () => {
      // Out of the effect's own turn: React is told about the start after
      // the render that found it.
      await Promise.resolve();
      dispatch({ type: 'started', id: next.id });
      try {
        const result = await latest.current.send(
          { id: next.id, blob, name: next.name, type: next.type, meta: next.meta },
          (fraction) => dispatch({ type: 'progress', id: next.id, fraction }),
        );
        dispatch({ type: 'succeeded', id: next.id, result: result ?? null });
        const done: UploadItem = { ...next, status: 'uploaded', progress: 1, result: result ?? null };
        if (latest.current.keepAfterUpload?.(done)) {
          // Still needed on the device: marked sent, with what the server said.
          const sent = Object.fromEntries(Object.entries(result ?? {}).map(([key, value]) => [`sent_${key}`, value]));
          await store.keep({
            id: next.id,
            scope,
            blob,
            name: next.name,
            type: next.type,
            createdAt: Date.now(),
            meta: { ...next.meta, ...sent, sent: true },
          });
        } else {
          await store.drop(next.id);
        }
        latest.current.onUploaded?.(done, result ?? null);
      } catch (error) {
        const { message, session } = failureMessage(error);
        if (session) announceSessionExpired();
        dispatch({ type: 'failed', id: next.id, error: message });
      } finally {
        busy.current = null;
        // Wake the loop for the next file: the reducer has moved on.
        dispatch({ type: 'meta', id: next.id, meta: {} });
      }
    })();
  }, [items, enabled, autoResume, store, scope]);

  const add = useCallback<UploadQueue['add']>(
    (files, meta = {}) => {
      const ids: string[] = [];
      const entries = files.map((file) => {
        const id = newUploadId();
        ids.push(id);
        blobs.current.set(id, file);
        preview(id, file);
        const itemMeta = typeof meta === 'function' ? meta(file) : meta;
        return { id, file, meta: itemMeta };
      });
      dispatch({
        type: 'added',
        items: entries.map(({ id, file, meta: itemMeta }) => ({
          id,
          name: file.name,
          size: file.size,
          type: file.type,
          meta: itemMeta,
        })),
      });
      for (const { id, file, meta: itemMeta } of entries) {
        void store
          .keep({ id, scope, blob: file, name: file.name, type: file.type, createdAt: Date.now(), meta: itemMeta })
          .then((result) => dispatch({ type: 'kept', id, kept: result.kept ? true : result.reason }));
      }
      return ids;
    },
    [scope, store, preview],
  );

  const retry = useCallback((id: string) => dispatch({ type: 'retried', id }), []);

  const discard = useCallback(
    (id: string) => {
      blobs.current.delete(id);
      const url = previewUrls.current.get(id);
      if (url !== undefined) {
        URL.revokeObjectURL(url);
        previewUrls.current.delete(id);
        setPreviews((current) => {
          const rest = new Map(current);
          rest.delete(id);
          return rest;
        });
      }
      void store.drop(id);
      dispatch({ type: 'removed', id });
    },
    [store],
  );

  const resume = useCallback(() => dispatch({ type: 'resumed' }), []);
  const setMeta = useCallback((id: string, meta: UploadItem['meta']) => {
    dispatch({ type: 'meta', id, meta });
    // The device's copy carries the meta too, so a reload keeps the choice.
    const { items: current } = latest.current;
    const item = current.find((entry) => entry.id === id);
    const blob = blobs.current.get(id);
    if (item && blob) {
      void store.keep({
        id,
        scope,
        blob,
        name: item.name,
        type: item.type,
        createdAt: Date.now(),
        meta: { ...item.meta, ...meta },
      });
    }
  }, [scope, store]);

  return {
    items,
    summary: summarise(items),
    add,
    retry,
    discard,
    resume,
    setMeta,
    previewOf: (id) => previews.get(id) ?? null,
  };
}
