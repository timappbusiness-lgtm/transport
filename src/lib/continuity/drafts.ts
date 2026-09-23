/**
 * A form's draft, kept so that nothing typed has to be typed twice.
 *
 * Two places hold it. In the browser, always: `localStorage`, so a refresh,
 * a closed tab reopened, or the trip through sign-in finds it again. On the
 * server, once there is an account: so the same draft is there on the
 * phone and on the desktop. Whichever was saved last wins.
 *
 * Every draft is an envelope — a version, when it was saved, the step it
 * was on, and the payload — and every payload goes back through the form's
 * own parser on the way in. Storage can hold anything: an older release,
 * another tab, a person with a console.
 *
 * A browser draft expires. Contact details in `localStorage` on a shared
 * computer should not outlive the reason they were typed, so after
 * `LOCAL_DRAFT_TTL_MS` it is treated as gone and removed. Every read and
 * write is wrapped: in a private window, with site data blocked, or during
 * a thumbnail capture, storage throws or comes back empty, and the form
 * works without it.
 */

/** Three days: long enough to come back tomorrow, short enough for a shared computer. */
export const LOCAL_DRAFT_TTL_MS = 3 * 24 * 60 * 60 * 1000;

/** A server draft is kept for a month; past that nobody is coming back for it. */
export const SERVER_DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** The forms that keep a draft. A name here is a promise that one is written. */
export const DRAFT_FORMS = ['cerere', 'traseu', 'oferta', 'vehicul', 'firma', 'inscriere-asistata'] as const;
export type DraftForm = (typeof DRAFT_FORMS)[number];

export function isDraftForm(value: unknown): value is DraftForm {
  return typeof value === 'string' && (DRAFT_FORMS as readonly string[]).includes(value);
}

/**
 * The key a form's draft is kept under. A scope separates two drafts of the
 * same form — an offer on one request and an offer on another.
 */
export function draftKey(form: DraftForm, scope?: string | null): string {
  return scope ? `coridor.ciorna.${form}.${scope}` : `coridor.ciorna.${form}`;
}

/** Largest payload kept, in characters. The database refuses more too. */
export const MAX_DRAFT_CHARS = 32_000;

export interface DraftEnvelope<T> {
  payload: T;
  /** The step it was on, when the form has steps. */
  step: string | null;
  /** Epoch milliseconds. */
  savedAt: number;
}

/** The slice of `Storage` this needs, so a test can pass a plain object. */
export interface DraftStorage {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
}

export function browserStorage(kind: 'local' | 'session' = 'local'): DraftStorage | null {
  try {
    if (typeof window === 'undefined') return null;
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Reads an envelope, or null when there is none, it is unreadable, its
 * payload does not parse, or it has expired — in which case it is removed.
 */
export function readDraft<T>(
  storage: DraftStorage | null,
  key: string,
  parse: (payload: unknown) => T | null,
  now: number,
  ttl: number = LOCAL_DRAFT_TTL_MS,
): DraftEnvelope<T> | null {
  if (storage === null) return null;
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch {
    return null;
  }
  if (raw === null || raw === '') return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  const envelope = parsed as Record<string, unknown>;
  if (envelope.v !== 1 || typeof envelope.savedAt !== 'number') return null;

  if (now - envelope.savedAt > ttl || envelope.savedAt > now + 60_000) {
    try {
      storage.removeItem(key);
    } catch {
      /* see the note at the top */
    }
    return null;
  }

  const payload = parse(envelope.payload);
  if (payload === null) return null;
  return {
    payload,
    step: typeof envelope.step === 'string' ? envelope.step : null,
    savedAt: envelope.savedAt,
  };
}

/** Writes an envelope. Returns false when storage refused, so the caller can say so. */
export function writeDraft<T>(
  storage: DraftStorage | null,
  key: string,
  payload: T,
  step: string | null,
  now: number,
): boolean {
  if (storage === null) return false;
  try {
    const body = JSON.stringify({ v: 1, savedAt: now, step, payload });
    if (body.length > MAX_DRAFT_CHARS) return false;
    storage.setItem(key, body);
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(storage: DraftStorage | null, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    /* see the note at the top */
  }
}

/**
 * The draft to resume from, when there are two: the one saved last. A tie
 * goes to the server, which is the one every device agrees on.
 */
export function newestDraft<T>(
  local: DraftEnvelope<T> | null,
  server: DraftEnvelope<T> | null,
): DraftEnvelope<T> | null {
  if (local === null) return server;
  if (server === null) return local;
  return local.savedAt > server.savedAt ? local : server;
}

/** The same shapes the table's constraints accept, checked before asking it. */
export function isDraftScope(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z0-9-]{0,64}$/.test(value);
}

export function isDraftStep(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && /^[a-z0-9-]{1,32}$/.test(value));
}

/** A server draft's payload: a plain object, small enough for the table. */
export function isDraftPayload(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  try {
    return JSON.stringify(value).length <= MAX_DRAFT_CHARS;
  } catch {
    return false;
  }
}
