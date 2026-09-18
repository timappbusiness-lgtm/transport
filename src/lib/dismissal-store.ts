/**
 * "Do not ask me again", held outside React.
 *
 * The same shape as `draft-store.ts` and for the same reason: reading
 * `localStorage` in an effect and calling `setState` is a cascading
 * render, and React's own lint rule says so. `useSyncExternalStore` is
 * what this actually is — state that lives in a browser API, absent on
 * the server.
 *
 * The server snapshot is `null`, meaning "never dismissed". That is the
 * safe direction: the first client render may hide a card the server
 * showed, which nobody notices, where the reverse would flash a card at
 * somebody who dismissed it a week ago.
 *
 * Every access is wrapped. In a private window, or with site data
 * blocked, storage throws rather than returning null — and a dismissal
 * that cannot be stored costs one extra card, which is a smaller failure
 * than a component that will not render.
 */

export interface DismissalStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => string | null;
  getServerSnapshot: () => string | null;
  dismiss: (at?: Date) => void;
}

/** The slice of `Storage` this needs, so a test can pass a plain object. */
export interface DismissalStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
}

function browserStorage(): DismissalStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function createDismissalStore(
  key: string,
  storage: DismissalStorage | null = browserStorage(),
): DismissalStore {
  const listeners = new Set<() => void>();

  // `getSnapshot` runs on every render and must return the same reference
  // until something changes, or React re-renders forever. `loaded` is the
  // flag rather than `current`, because `null` is a real value here.
  let loaded = false;
  let current: string | null = null;

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot() {
      if (!loaded) {
        try {
          current = storage?.getItem(key) ?? null;
        } catch {
          current = null;
        }
        loaded = true;
      }
      return current;
    },

    getServerSnapshot() {
      return null;
    },

    dismiss(at = new Date()) {
      current = at.toISOString();
      loaded = true;
      try {
        storage?.setItem(key, current);
      } catch {
        /* see the note at the top */
      }
      for (const listener of listeners) listener();
    },
  };
}
