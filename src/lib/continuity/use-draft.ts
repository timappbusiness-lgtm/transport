'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { clearDraftAction, loadDraftAction, saveDraftAction } from '@/app/draft-actions';
import {
  browserStorage,
  clearDraft,
  draftKey,
  isDraftForm,
  newestDraft,
  readDraft,
  writeDraft,
  type DraftEnvelope,
  type DraftForm,
  type LocalDraftForm,
} from './drafts';

/** How long typing has to pause before the account copy is written. */
const SERVER_DEBOUNCE_MS = 1500;

export type DraftSaveStatus = 'idle' | 'saved' | 'saved-account';

export interface DraftOptions<T> {
  /** A form kept on the account too, or one kept only in this browser. */
  form: DraftForm | LocalDraftForm;
  /** Separates two drafts of one form: the request an offer is for. */
  scope?: string | undefined;
  /** Every payload goes back through this on the way in. */
  parse: (payload: unknown) => T | null;
  /** Signed in: the draft is kept on the account too, for the other device. */
  signedIn: boolean;
  /** Called once, with the draft to resume from, when there is one. */
  onRestore?: ((draft: DraftEnvelope<T>) => void) | undefined;
  /** Off: nothing is read or written. For a form that has just been sent. */
  enabled?: boolean | undefined;
}

export interface DraftController<T> {
  /** True once both copies have been looked for. Nothing is saved before. */
  ready: boolean;
  /** The draft the form resumed from, until it is cleared. */
  restored: DraftEnvelope<T> | null;
  status: DraftSaveStatus;
  save: (payload: T, step: string | null) => void;
  /** Both copies gone: after a successful send, or „Începe din nou". */
  clear: () => void;
}

/**
 * A form's draft, kept in the browser always and on the account once
 * there is one, resumed from whichever was saved last.
 *
 * The browser copy is written on every change — it is cheap and it is
 * what a refresh, a closed tab or the trip through sign-in finds. The
 * account copy waits for a pause in the typing. Neither can fail loudly:
 * a draft is a convenience, and a storage that refuses is a form that
 * works as it did before drafts existed.
 */
export function useDraft<T>({
  form,
  scope,
  parse,
  onRestore,
  enabled = true,
  signedIn: signedInOption,
}: DraftOptions<T>): DraftController<T> {
  const key = draftKey(form, scope);
  // Only the forms the table knows follow the account; the rest stay here.
  const signedIn = signedInOption && isDraftForm(form);
  const serverScope = scope ?? '';
  const [ready, setReady] = useState(false);
  const [restored, setRestored] = useState<DraftEnvelope<T> | null>(null);
  const [status, setStatus] = useState<DraftSaveStatus>('idle');

  const readyRef = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ payload: T; step: string | null } | null>(null);
  const parseRef = useRef(parse);
  const onRestoreRef = useRef(onRestore);
  useEffect(() => {
    parseRef.current = parse;
    onRestoreRef.current = onRestore;
  });

  const pushToServer = useCallback(() => {
    timer.current = null;
    const next = pending.current;
    pending.current = null;
    if (next === null || typeof next.payload !== 'object' || next.payload === null) return;
    if (!isDraftForm(form)) return;
    saveDraftAction(form, serverScope, next.step, next.payload)
      .then((ok) => {
        if (ok) setStatus('saved-account');
      })
      .catch(() => {
        /* the browser copy is there; the next change tries again */
      });
  }, [form, serverScope]);

  // Look for a draft once, on arrival.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const local = readDraft(browserStorage(), key, (p) => parseRef.current(p), Date.now());

    function finish(draft: DraftEnvelope<T> | null) {
      if (cancelled) return;
      readyRef.current = true;
      setReady(true);
      setRestored(draft);
      if (draft !== null) onRestoreRef.current?.(draft);
    }

    if (!signedIn) {
      finish(local);
      return () => {
        cancelled = true;
      };
    }

    if (!isDraftForm(form)) {
      finish(local);
      return () => {
        cancelled = true;
      };
    }
    loadDraftAction(form, serverScope)
      .then((found) => {
        const payload = found === null ? null : parseRef.current(found.payload);
        const server = found === null || payload === null ? null : { ...found, payload };
        const chosen = newestDraft(local, server);
        // Typed on this device before signing in: now it follows the account.
        if (chosen !== null && chosen === local) {
          pending.current = { payload: local.payload, step: local.step };
          pushToServer();
        }
        finish(chosen);
      })
      .catch(() => finish(local));

    return () => {
      cancelled = true;
    };
    // Looked for once per form and account state; `parse` and `onRestore`
    // are read through refs so a new closure does not look again.
  }, [enabled, key, form, serverScope, signedIn, pushToServer]);

  // Leaving the page: the account copy goes now rather than never.
  useEffect(() => {
    function flush() {
      if (timer.current !== null) {
        clearTimeout(timer.current);
        pushToServer();
      }
    }
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [pushToServer]);

  const save = useCallback(
    (payload: T, step: string | null) => {
      if (!enabled || !readyRef.current) return;
      if (writeDraft(browserStorage(), key, payload, step, Date.now())) setStatus('saved');
      if (!signedIn) return;
      pending.current = { payload, step };
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(pushToServer, SERVER_DEBOUNCE_MS);
    },
    [enabled, key, signedIn, pushToServer],
  );

  const clear = useCallback(() => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
    clearDraft(browserStorage(), key);
    setRestored(null);
    setStatus('idle');
    if (signedIn && isDraftForm(form)) clearDraftAction(form, serverScope).catch(() => {});
  }, [key, signedIn, form, serverScope]);

  return { ready, restored, status, save, clear };
}
