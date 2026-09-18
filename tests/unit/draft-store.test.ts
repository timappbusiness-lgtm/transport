import { describe, expect, it } from 'vitest';
import { createDraftStore, type DraftStorage } from '@/lib/draft-store';
import { DRAFT_STORAGE_KEY, emptyDraft, serialiseDraft } from '@/lib/request-form';

/**
 * The store exists so the form does not lose what was typed on the way
 * through sign-up. These pin the two things that would make it worse than
 * no store at all: a snapshot that changes identity on every render, which
 * loops React forever, and a storage that throws, which in a private window
 * it does.
 */

function memoryStorage(seed: Record<string, string> = {}): DraftStorage {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

const throwingStorage: DraftStorage = {
  getItem() {
    throw new Error('private window');
  },
  setItem() {
    throw new Error('private window');
  },
  removeItem() {
    throw new Error('private window');
  },
};

describe('createDraftStore', () => {
  it('returns the same snapshot until something changes', () => {
    // A new object every call is an infinite render loop, not a bug you
    // notice later.
    const store = createDraftStore(emptyDraft(), false, memoryStorage());
    expect(store.getSnapshot()).toBe(store.getSnapshot());
  });

  it('starts from what is in storage', () => {
    const stored = { ...emptyDraft(), make: 'Volkswagen' };
    const store = createDraftStore(
      emptyDraft(),
      false,
      memoryStorage({ [DRAFT_STORAGE_KEY]: serialiseDraft(stored) }),
    );
    expect(store.getSnapshot().make).toBe('Volkswagen');
  });

  it('lets a link beat what is in storage', () => {
    // The calculator's choices are the more recent intention.
    const stored = { ...emptyDraft(), make: 'Volkswagen' };
    const store = createDraftStore(
      { ...emptyDraft(), make: 'Audi' },
      true,
      memoryStorage({ [DRAFT_STORAGE_KEY]: serialiseDraft(stored) }),
    );
    expect(store.getSnapshot().make).toBe('Audi');
  });

  it('renders the same tree on the server as the page was given', () => {
    const store = createDraftStore(
      { ...emptyDraft(), make: 'Audi' },
      false,
      memoryStorage({ [DRAFT_STORAGE_KEY]: serialiseDraft({ ...emptyDraft(), make: 'Skoda' }) }),
    );
    expect(store.getServerSnapshot().make).toBe('Audi');
  });

  it('tells its listeners when the draft changes, and stops when they leave', () => {
    const store = createDraftStore(emptyDraft(), false, memoryStorage());
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls += 1;
    });
    store.set({ ...emptyDraft(), model: 'Golf' });
    expect(calls).toBe(1);
    expect(store.getSnapshot().model).toBe('Golf');

    unsubscribe();
    store.set({ ...emptyDraft(), model: 'Passat' });
    expect(calls).toBe(1);
  });

  it('writes through to storage, and clears it', () => {
    const storage = memoryStorage();
    const store = createDraftStore(emptyDraft(), false, storage);
    store.set({ ...emptyDraft(), model: 'Golf' });
    expect(storage.getItem(DRAFT_STORAGE_KEY)).toContain('Golf');
    store.clear();
    expect(storage.getItem(DRAFT_STORAGE_KEY)).toBeNull();
  });

  it('works in a window that refuses storage', () => {
    const store = createDraftStore({ ...emptyDraft(), make: 'Audi' }, false, throwingStorage);
    expect(store.getSnapshot().make).toBe('Audi');
    expect(() => store.set({ ...emptyDraft(), make: 'Skoda' })).not.toThrow();
    expect(store.getSnapshot().make).toBe('Skoda');
    expect(() => store.clear()).not.toThrow();
  });

  it('works with no storage at all', () => {
    const store = createDraftStore(emptyDraft(), false, null);
    expect(() => store.set({ ...emptyDraft(), make: 'Skoda' })).not.toThrow();
    expect(store.getSnapshot().make).toBe('Skoda');
  });
});
