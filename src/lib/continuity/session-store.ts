/**
 * The one piece of page-wide state a failed form leaves behind: „the
 * session expired", and later „it is back".
 *
 * A form learns that its session expired from its own action, and shows
 * the sentence beside its fields. The notice with the way back — sign in
 * again in a new tab — is page-wide (`SessionNotice`), because not every
 * form draws its errors the same way and the person needs the link either
 * way. This is the channel between the two, plus the one between tabs:
 * the tab that signs in again says so on a `BroadcastChannel`, and this
 * tab's notice changes to „you are back in, press the button again".
 */

import { SESSION_CHANNEL, type SessionMessage } from './session';

export type SessionState = 'ok' | 'expired' | 'restored';

let state: SessionState = 'ok';
const listeners = new Set<() => void>();

function set(next: SessionState) {
  if (state === next) return;
  state = next;
  for (const listener of listeners) listener();
}

export function announceSessionExpired() {
  set('expired');
}

export function dismissSessionNotice() {
  set('ok');
}

export function getSessionState(): SessionState {
  return state;
}

export function getServerSessionState(): SessionState {
  return 'ok';
}

let channel: BroadcastChannel | null = null;

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  if (channel === null && typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(SESSION_CHANNEL);
    channel.onmessage = (event: MessageEvent<SessionMessage>) => {
      if (event.data?.type === 'restored' && state === 'expired') set('restored');
    };
  }
  return () => {
    listeners.delete(listener);
  };
}

/** Called by the page a second tab lands on after signing in again. */
export function broadcastSessionRestored() {
  if (typeof BroadcastChannel === 'undefined') return;
  const out = new BroadcastChannel(SESSION_CHANNEL);
  out.postMessage({ type: 'restored' } satisfies SessionMessage);
  out.close();
}
