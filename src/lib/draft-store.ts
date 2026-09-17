import {
  DRAFT_STORAGE_KEY,
  parseDraft,
  serialiseDraft,
  type RequestDraft,
} from './request-form';

/**
 * The request draft, held outside React.
 *
 * Publishing needs an account and the middle of a four-step form is where
 * people leave, so what was typed has to survive the trip through sign-up.
 * `sessionStorage` is where it waits: one tab, one origin, gone when the tab
 * closes, never sent anywhere.
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

export interface DraftStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => RequestDraft;
  getServerSnapshot: () => RequestDraft;
  set: (draft: RequestDraft) => void;
  clear: () => void;
}

/** The slice of `Storage` this needs, so a test can pass a plain object. */
export interface DraftStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

function browserStorage(): DraftStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function createDraftStore(
  initial: RequestDraft,
  /** True when the link carried its own choices, which are the more recent intention. */
  ignoreStored: boolean,
  storage: DraftStorage | null = browserStorage(),
): DraftStore {
  const listeners = new Set<() => void>();

  // `getSnapshot` is called on every render and must return the same
  // reference until something changes, or React re-renders forever.
  let current: RequestDraft | null = null;

  function load(): RequestDraft {
    if (ignoreStored || storage === null) return initial;
    try {
      return parseDraft(storage.getItem(DRAFT_STORAGE_KEY)) ?? initial;
    } catch {
      return initial;
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
      current ??= load();
      return current;
    },

    // What the server rendered. Storage is not read here, and must not be:
    // the hydration render has to produce the same tree as the HTML.
    getServerSnapshot() {
      return initial;
    },

    set(draft) {
      current = draft;
      try {
        storage?.setItem(DRAFT_STORAGE_KEY, serialiseDraft(draft));
      } catch {
        /* see the note at the top */
      }
      for (const listener of listeners) listener();
    },

    clear() {
      try {
        storage?.removeItem(DRAFT_STORAGE_KEY);
      } catch {
        /* see the note at the top */
      }
    },
  };
}
