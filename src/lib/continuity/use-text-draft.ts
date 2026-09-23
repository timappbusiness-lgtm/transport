'use client';

import { useSyncExternalStore } from 'react';
import { browserStorage, clearDraft, readDraft, writeDraft } from './drafts';

/**
 * One piece of text, kept in this browser while it is being written.
 *
 * For the short forms — a message, a question on an offer, a rating and
 * its reply — where the whole draft is one textarea. Kept for the same
 * three days as every browser draft; gone the moment it is sent.
 *
 * A store per key, outside React, for the reason the request draft is
 * one: the text lives in a browser API, the server renders it empty, and
 * the first client render picks it up without an effect that sets state.
 */

interface TextStore {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => string;
  set: (text: string) => void;
  clear: () => void;
}

const stores = new Map<string, TextStore>();

function parseText(payload: unknown): string | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const text = (payload as { text?: unknown }).text;
  return typeof text === 'string' ? text.slice(0, 10_000) : null;
}

function storeFor(key: string): TextStore {
  const existing = stores.get(key);
  if (existing) return existing;

  const listeners = new Set<() => void>();
  let current: string | null = null;
  const notify = () => {
    for (const listener of listeners) listener();
  };

  const store: TextStore = {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot() {
      current ??= readDraft(browserStorage(), key, parseText, Date.now())?.payload ?? '';
      return current;
    },
    set(text) {
      current = text;
      if (text.trim() === '') clearDraft(browserStorage(), key);
      else writeDraft(browserStorage(), key, { text }, null, Date.now());
      notify();
    },
    clear() {
      current = '';
      clearDraft(browserStorage(), key);
      notify();
    },
  };
  stores.set(key, store);
  return store;
}

const serverSnapshot = () => '';

export function useTextDraft(key: string): [text: string, set: (text: string) => void, clear: () => void] {
  const store = storeFor(key);
  const text = useSyncExternalStore(store.subscribe, store.getSnapshot, serverSnapshot);
  return [text, store.set, store.clear];
}
