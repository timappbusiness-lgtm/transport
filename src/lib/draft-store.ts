import {
  LOCAL_DRAFT_TTL_MS,
  clearDraft,
  draftKey,
  newestDraft,
  readDraft,
  writeDraft,
  type DraftEnvelope,
  type DraftStorage,
} from './continuity/drafts';
import { MAX_PHOTOS } from './photo-upload';
import { DRAFT_STORAGE_KEY, parseDraft, parseDraftValue, type RequestDraft } from './request-form';

export type { DraftStorage } from './continuity/drafts';

/**
 * The request draft, held outside React.
 *
 * Publishing needs an account and the middle of a four-step form is where
 * people leave, so what was typed has to survive the trip through sign-up
 * — and a refresh, a closed tab, a password reset, a confirmation e-mail
 * opened on the phone. Two copies keep it:
 *
 *   * `localStorage`, always: the same browser finds it again for three
 *     days (`LOCAL_DRAFT_TTL_MS`), whatever happened to the tab;
 *   * the account, once there is one (`form_drafts`, written by the form
 *     through `onPersist`): the other device finds it too.
 *
 * Whichever was saved last is the one the form resumes from. It used to
 * be `sessionStorage` alone, which a closed tab or an e-mail link opened
 * in a new one lost; a draft still sitting there from before is read once
 * and moved across.
 *
 * Why a store rather than `useState` plus an effect: an effect that calls
 * `setState` on mount is a cascading render, and React's own lint rule says
 * so. `useSyncExternalStore` is the shape this actually is — state that
 * lives in a browser API, read on the client and absent on the server. The
 * server snapshot is the draft the page was rendered with, so hydration
 * matches and the stored one replaces it on the first client render.
 *
 * Every access is wrapped: in a private window, with site data blocked, or
 * during a thumbnail capture, storage throws or comes back empty. The form
 * works without it; only the trip through sign-up stops being free.
 */

/** What is kept: the fields, and the photos already uploaded for them. */
export interface StoredRequest {
  draft: RequestDraft;
  /** Paths in the person's own folder. The action re-checks every one. */
  photos: readonly string[];
}

export interface DraftStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => RequestDraft;
  getServerSnapshot: () => RequestDraft;
  /** The uploaded photos, same identity until they change. */
  getPhotos: () => readonly string[];
  getServerPhotos: () => readonly string[];
  /** The draft the form resumed from on arrival — when, and on which step. */
  getRestored: () => DraftEnvelope<StoredRequest> | null;
  set: (draft: RequestDraft) => void;
  setPhotos: (photos: readonly string[]) => void;
  /** Where the person is, kept with the draft for a return without `?pas=`. */
  setStep: (step: string | null) => void;
  /** Gone from the browser. The account copy is the caller's to clear. */
  clear: () => void;
  /** „Începe din nou": the form empty, nothing kept, nothing written. */
  reset: (draft: RequestDraft) => void;
}

export interface DraftStoreOptions {
  initial: RequestDraft;
  /** True when the link carried its own choices, which are the more recent intention. */
  ignoreStored: boolean;
  /** `localStorage` in the browser; a plain object in a test; null for none. */
  storage: DraftStorage | null;
  /** Where drafts were kept before: read once, moved, removed. */
  legacy?: DraftStorage | null | undefined;
  /** The account's copy, read by the page for a signed-in person. */
  server?: DraftEnvelope<StoredRequest> | null | undefined;
  /** Every write, for the account copy. */
  onPersist?: ((stored: StoredRequest, step: string | null) => void) | undefined;
  now?: (() => number) | undefined;
}

export const REQUEST_DRAFT_KEY = draftKey('cerere');

/** `<user id>/<file>`, as the upload action names them. Nothing that climbs. */
const PHOTO_PATH = /^[A-Za-z0-9-]{1,64}\/[A-Za-z0-9_-][A-Za-z0-9_.-]{0,119}$/;

/** Storage and the account can hold anything; this is the one shape let in. */
export function parseStoredRequest(payload: unknown): StoredRequest | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const source = payload as Record<string, unknown>;
  const draft = parseDraftValue(source.draft);
  if (draft === null) return null;
  const photos = Array.isArray(source.photos)
    ? source.photos
        .filter(
          (path): path is string =>
            typeof path === 'string' && PHOTO_PATH.test(path) && !path.includes('..'),
        )
        .slice(0, MAX_PHOTOS)
    : [];
  return { draft, photos };
}

export function browserStorage(kind: 'local' | 'session'): DraftStorage | null {
  try {
    if (typeof window === 'undefined') return null;
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

const NO_PHOTOS: readonly string[] = [];

export function createDraftStore({
  initial,
  ignoreStored,
  storage,
  legacy = null,
  server = null,
  onPersist,
  now = Date.now,
}: DraftStoreOptions): DraftStore {
  const listeners = new Set<() => void>();

  // Snapshots must keep their identity until something changes, or React
  // re-renders forever.
  let loaded = false;
  let current: RequestDraft = initial;
  let photos: readonly string[] = NO_PHOTOS;
  let step: string | null = null;
  let restored: DraftEnvelope<StoredRequest> | null = null;
  // Something worth keeping: a draft found, or anything typed since. Until
  // then there is nothing to write — moving between empty steps is not a
  // draft, and writing one would greet the next visit with „we kept what
  // you filled in" over an empty form.
  let worthKeeping = false;

  const serverDraft = ignoreStored || server === null ? initial : server.payload.draft;
  const serverPhotos = ignoreStored || server === null ? NO_PHOTOS : server.payload.photos;

  function fromLegacy(): DraftEnvelope<StoredRequest> | null {
    if (legacy === null) return null;
    try {
      const draft = parseDraft(legacy.getItem(DRAFT_STORAGE_KEY));
      if (draft === null) return null;
      legacy.removeItem(DRAFT_STORAGE_KEY);
      return { payload: { draft, photos: [] }, step: null, savedAt: now() };
    } catch {
      return null;
    }
  }

  function load() {
    if (loaded) return;
    loaded = true;
    if (ignoreStored) return;
    const fromLocal = readDraft(
      storage,
      REQUEST_DRAFT_KEY,
      parseStoredRequest,
      now(),
      LOCAL_DRAFT_TTL_MS,
    );
    restored = newestDraft(fromLocal ?? fromLegacy(), server);
    if (restored === null) return;
    worthKeeping = true;
    current = restored.payload.draft;
    photos = restored.payload.photos.length === 0 ? NO_PHOTOS : restored.payload.photos;
    step = restored.step;
    // A draft from before the move, or one only the account had, is
    // written here so the next refresh finds it without asking anybody.
    if (restored !== fromLocal) persist(false);
  }

  function clearStorage() {
    clearDraft(storage, REQUEST_DRAFT_KEY);
    restored = null;
    try {
      legacy?.removeItem(DRAFT_STORAGE_KEY);
    } catch {
      /* see the note at the top */
    }
  }

  function persist(notify: boolean) {
    worthKeeping = true;
    const stored: StoredRequest = { draft: current, photos };
    writeDraft(storage, REQUEST_DRAFT_KEY, stored, step, now());
    if (notify) {
      onPersist?.(stored, step);
      for (const listener of listeners) listener();
    }
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot() {
      load();
      return current;
    },

    // What the server rendered. The browser's storage is not read here,
    // and must not be: the hydration render has to produce the same tree
    // as the HTML.
    getServerSnapshot() {
      return serverDraft;
    },

    getPhotos() {
      load();
      return photos;
    },

    getServerPhotos() {
      return serverPhotos;
    },

    getRestored() {
      load();
      return restored;
    },

    set(draft) {
      load();
      current = draft;
      persist(true);
    },

    setPhotos(next) {
      load();
      photos = next.length === 0 ? NO_PHOTOS : [...next];
      persist(true);
    },

    setStep(next) {
      load();
      if (step === next) return;
      step = next;
      if (!worthKeeping) return;
      // Nothing on screen changes, so nobody is told; only the copies are.
      const stored: StoredRequest = { draft: current, photos };
      writeDraft(storage, REQUEST_DRAFT_KEY, stored, step, now());
      onPersist?.(stored, step);
    },

    reset(draft) {
      load();
      current = draft;
      photos = NO_PHOTOS;
      step = null;
      worthKeeping = false;
      clearStorage();
      for (const listener of listeners) listener();
    },

    clear: clearStorage,
  };
}
