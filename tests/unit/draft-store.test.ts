import { describe, expect, it } from 'vitest';
import {
  REQUEST_DRAFT_KEY,
  createDraftStore,
  parseStoredRequest,
  type DraftStorage,
  type DraftStoreOptions,
  type StoredRequest,
} from '@/lib/draft-store';
import { LOCAL_DRAFT_TTL_MS, writeDraft } from '@/lib/continuity/drafts';
import { DRAFT_STORAGE_KEY, emptyDraft, serialiseDraft } from '@/lib/request-form';

/**
 * The store exists so the form does not lose what was typed on the way
 * through sign-up, a refresh or a closed tab. These pin the things that
 * would make it worse than no store at all: a snapshot that changes
 * identity on every render, which loops React forever, and a storage that
 * throws, which in a private window it does — and the things it is for:
 * the newest copy wins, an old one expires, the old key is moved across.
 */

function memoryStorage(seed: Record<string, string> = {}): DraftStorage & { map: Map<string, string> } {
  const map = new Map(Object.entries(seed));
  return {
    map,
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

const NOW = Date.UTC(2026, 8, 23, 12, 0, 0);

function store(options: Partial<DraftStoreOptions> & { storage: DraftStorage | null }) {
  return createDraftStore({ initial: emptyDraft(), ignoreStored: false, now: () => NOW, ...options });
}

/** A browser draft saved `ago` milliseconds before NOW. */
function saved(stored: StoredRequest, ago = 60_000, step: string | null = null) {
  const storage = memoryStorage();
  writeDraft(storage, REQUEST_DRAFT_KEY, stored, step, NOW - ago);
  return storage;
}

describe('createDraftStore', () => {
  it('returns the same snapshot until something changes', () => {
    // A new object every call is an infinite render loop, not a bug you
    // notice later.
    const s = store({ storage: memoryStorage() });
    expect(s.getSnapshot()).toBe(s.getSnapshot());
    expect(s.getPhotos()).toBe(s.getPhotos());
  });

  it('starts from what is in storage, and says so', () => {
    const s = store({ storage: saved({ draft: { ...emptyDraft(), make: 'Volkswagen' }, photos: [] }, 60_000, 'vehicul') });
    expect(s.getSnapshot().make).toBe('Volkswagen');
    expect(s.getRestored()?.savedAt).toBe(NOW - 60_000);
    expect(s.getRestored()?.step).toBe('vehicul');
  });

  it('lets a link beat what is in storage', () => {
    // The calculator's choices are the more recent intention.
    const s = createDraftStore({
      initial: { ...emptyDraft(), make: 'Audi' },
      ignoreStored: true,
      storage: saved({ draft: { ...emptyDraft(), make: 'Volkswagen' }, photos: [] }),
    });
    expect(s.getSnapshot().make).toBe('Audi');
    expect(s.getRestored()).toBeNull();
  });

  it('renders the same tree on the server as the page was given', () => {
    const s = createDraftStore({
      initial: { ...emptyDraft(), make: 'Audi' },
      ignoreStored: false,
      storage: saved({ draft: { ...emptyDraft(), make: 'Skoda' }, photos: [] }),
    });
    expect(s.getServerSnapshot().make).toBe('Audi');
  });

  it('renders the account copy on the server when the page has one', () => {
    const s = store({
      storage: memoryStorage(),
      server: { payload: { draft: { ...emptyDraft(), make: 'Dacia' }, photos: ['u/1.jpg'] }, step: 'serviciu', savedAt: NOW - 1000 },
    });
    expect(s.getServerSnapshot().make).toBe('Dacia');
    expect(s.getServerPhotos()).toEqual(['u/1.jpg']);
  });

  it('resumes from whichever copy was saved last', () => {
    const phone = { payload: { draft: { ...emptyDraft(), make: 'Dacia' }, photos: [] }, step: 'serviciu', savedAt: NOW - 1000 };
    const older = saved({ draft: { ...emptyDraft(), make: 'Skoda' }, photos: [] }, 60_000);
    const s = store({ storage: older, server: phone });
    expect(s.getSnapshot().make).toBe('Dacia');
    expect(s.getRestored()?.step).toBe('serviciu');
    // And writes it here, so a refresh finds it without the account.
    expect(older.getItem(REQUEST_DRAFT_KEY)).toContain('Dacia');

    const newer = saved({ draft: { ...emptyDraft(), make: 'Skoda' }, photos: [] }, 10);
    expect(store({ storage: newer, server: phone }).getSnapshot().make).toBe('Skoda');
  });

  it('forgets a browser draft past its three days', () => {
    const storage = saved({ draft: { ...emptyDraft(), make: 'Skoda' }, photos: [] }, LOCAL_DRAFT_TTL_MS + 1);
    const s = store({ storage });
    expect(s.getSnapshot().make).toBe('');
    expect(s.getRestored()).toBeNull();
    expect(storage.getItem(REQUEST_DRAFT_KEY)).toBeNull();
  });

  it('moves a draft from the old sessionStorage key across, once', () => {
    const legacy = memoryStorage({ [DRAFT_STORAGE_KEY]: serialiseDraft({ ...emptyDraft(), make: 'Volkswagen' }) });
    const storage = memoryStorage();
    const s = store({ storage, legacy });
    expect(s.getSnapshot().make).toBe('Volkswagen');
    expect(legacy.getItem(DRAFT_STORAGE_KEY)).toBeNull();
    expect(storage.getItem(REQUEST_DRAFT_KEY)).toContain('Volkswagen');
  });

  it('tells its listeners when the draft changes, and stops when they leave', () => {
    const s = store({ storage: memoryStorage() });
    let calls = 0;
    const unsubscribe = s.subscribe(() => {
      calls += 1;
    });
    s.set({ ...emptyDraft(), model: 'Golf' });
    expect(calls).toBe(1);
    expect(s.getSnapshot().model).toBe('Golf');

    unsubscribe();
    s.set({ ...emptyDraft(), model: 'Passat' });
    expect(calls).toBe(1);
  });

  it('writes through to storage with the step, and clears it', () => {
    const storage = memoryStorage();
    const s = store({ storage });
    s.set({ ...emptyDraft(), model: 'Golf' });
    s.setStep('contact');
    const envelope = JSON.parse(storage.getItem(REQUEST_DRAFT_KEY) ?? '{}');
    expect(envelope.payload.draft.model).toBe('Golf');
    expect(envelope.step).toBe('contact');
    s.clear();
    expect(storage.getItem(REQUEST_DRAFT_KEY)).toBeNull();
  });

  it('starts over without keeping or writing anything', () => {
    const storage = saved({ draft: { ...emptyDraft(), make: 'Skoda' }, photos: ['u/1.jpg'] });
    const writes: unknown[] = [];
    const s = store({ storage, onPersist: (stored) => writes.push(stored) });
    let calls = 0;
    s.subscribe(() => {
      calls += 1;
    });
    s.reset(emptyDraft());
    expect(s.getSnapshot().make).toBe('');
    expect(s.getPhotos()).toEqual([]);
    expect(s.getRestored()).toBeNull();
    expect(storage.getItem(REQUEST_DRAFT_KEY)).toBeNull();
    expect(writes).toHaveLength(0);
    expect(calls).toBe(1);
  });

  it('keeps the uploaded photos with the draft', () => {
    const storage = memoryStorage();
    const s = store({ storage });
    s.setPhotos(['u/1.jpg', 'u/2.jpg']);
    expect(store({ storage }).getPhotos()).toEqual(['u/1.jpg', 'u/2.jpg']);
  });

  it('hands every write to the account copy', () => {
    const writes: [StoredRequest, string | null][] = [];
    const s = store({ storage: memoryStorage(), onPersist: (stored, step) => writes.push([stored, step]) });
    s.set({ ...emptyDraft(), make: 'Opel' });
    s.setStep('vehicul');
    expect(writes).toHaveLength(2);
    expect(writes[1]?.[0].draft.make).toBe('Opel');
    expect(writes[1]?.[1]).toBe('vehicul');
  });

  it('works in a window that refuses storage', () => {
    const s = createDraftStore({ initial: { ...emptyDraft(), make: 'Audi' }, ignoreStored: false, storage: throwingStorage, legacy: throwingStorage });
    expect(s.getSnapshot().make).toBe('Audi');
    expect(() => s.set({ ...emptyDraft(), make: 'Skoda' })).not.toThrow();
    expect(s.getSnapshot().make).toBe('Skoda');
    expect(() => s.clear()).not.toThrow();
  });

  it('works with no storage at all', () => {
    const s = store({ storage: null });
    expect(() => s.set({ ...emptyDraft(), make: 'Skoda' })).not.toThrow();
    expect(s.getSnapshot().make).toBe('Skoda');
  });
});

describe('parseStoredRequest', () => {
  it('lets in only a draft and photo paths', () => {
    expect(parseStoredRequest(null)).toBeNull();
    expect(parseStoredRequest({ photos: [] })).toBeNull();
    const parsed = parseStoredRequest({
      draft: { ...emptyDraft(), make: 'Ford', category: 'tanc' },
      photos: ['u/1.jpg', 42, '../../etc', 'javascript:alert(1)', 'u/2.jpg'],
    });
    expect(parsed?.draft.make).toBe('Ford');
    // An enum the form does not offer falls back rather than rendering.
    expect(parsed?.draft.category).toBe('autoturism');
    expect(parsed?.photos).toEqual(['u/1.jpg', 'u/2.jpg']);
  });

  it('keeps a half-typed value exactly as it was left', () => {
    // A field that failed validation is not dropped on the way back in.
    const parsed = parseStoredRequest({ draft: { ...emptyDraft(), year: '20', contactPhone: '07' }, photos: [] });
    expect(parsed?.draft.year).toBe('20');
    expect(parsed?.draft.contactPhone).toBe('07');
  });
});
