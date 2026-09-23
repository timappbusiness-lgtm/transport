/**
 * A request that failed is not a reason to lose what was typed.
 *
 * A server action that cannot reach the server rejects, and a rejected
 * action inside `useActionState` goes to the nearest error boundary —
 * which replaces the form, and everything in it, with an error page. So
 * every form's action goes through `keepOnFailure`, which turns a failed
 * request into ordinary state: the form stays, its fields stay, and the
 * message says what happened and that trying again is safe.
 *
 * Four kinds of failure are caught, each with its own sentence:
 *
 *   network  the request never arrived (offline, a dropped connection);
 *   session  the server answered that nobody is signed in any more;
 *   server   the server answered with an error instead of a result;
 *   stale    the platform was updated while the form was open, and the
 *            action the page knows no longer exists.
 *
 * Anything else is re-thrown — the special errors Next throws to perform a
 * `redirect()` or a `notFound()` above all, so a redirect still redirects,
 * and a bug in the browser still shows as a bug.
 */

import { SESSION_EXPIRED_DIGEST, SESSION_EXPIRED_MESSAGE } from './session';

const NETWORK_MESSAGES = [
  /failed to fetch/i,
  /networkerror/i,
  /network request failed/i,
  /load failed/i,
  /fetch failed/i,
  /network connection was lost/i,
  /the internet connection appears to be offline/i,
  /err_internet_disconnected/i,
  /connection (?:closed|reset|refused)/i,
];

/** Answers from the server that are not a result: a proxy page, a 413, a 5xx. */
const SERVER_MESSAGES = [/unexpected response was received from the server/i, /body exceeded/i];

/** The page was built before the deployment that is answering it. */
const STALE_MESSAGES = [/server action .* was not found on the server/i, /failed-to-find-server-action/i];

export type FailureKind = 'network' | 'session' | 'server' | 'stale';

function digestOf(error: object): string | null {
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === 'string' ? digest : null;
}

/**
 * Which kind of failed request this is, or `null` for anything that is not
 * a failed request and has to keep propagating.
 */
export function failureKind(error: unknown): FailureKind | null {
  if (typeof error !== 'object' || error === null) return null;
  const message = (error as { message?: unknown }).message;
  const digest = digestOf(error);

  if (digest !== null) {
    if (digest === SESSION_EXPIRED_DIGEST) return 'session';
    // Next's control flow — redirect, notFound, forbidden — is not a
    // failure; it is the action doing what it was written to do.
    if (digest.startsWith('NEXT_')) return null;
    // Any other digest is an exception on the server, sent back in place
    // of the action's result.
    return 'server';
  }

  if (typeof message !== 'string') return null;
  if ((error as { name?: unknown }).name === 'AbortError') return 'network';
  if (NETWORK_MESSAGES.some((pattern) => pattern.test(message))) return 'network';
  if (STALE_MESSAGES.some((pattern) => pattern.test(message))) return 'stale';
  if (SERVER_MESSAGES.some((pattern) => pattern.test(message))) return 'server';
  return null;
}

export function isNetworkError(error: unknown): boolean {
  return failureKind(error) === 'network';
}

/** What every form shows when its request did not arrive. */
export const NETWORK_ERROR_MESSAGE =
  'Nu am putut trimite: conexiunea s-a întrerupt. Ce ai completat a rămas aici — încearcă din nou.';

export const SERVER_ERROR_MESSAGE =
  'Nu am putut salva: serverul a răspuns cu o eroare. Ce ai completat a rămas aici — încearcă din nou peste un minut.';

export const STALE_PAGE_MESSAGE =
  'Platforma s-a actualizat cât timp formularul era deschis. Ce ai completat a rămas aici — reîncarcă pagina și trimite din nou.';

export const FAILURE_MESSAGES: Record<FailureKind, string> = {
  network: NETWORK_ERROR_MESSAGE,
  session: SESSION_EXPIRED_MESSAGE,
  server: SERVER_ERROR_MESSAGE,
  stale: STALE_PAGE_MESSAGE,
};

/**
 * Wraps an action so a failed request becomes state rather than an error
 * page. `onFailure` builds the state to show, from the state before the
 * attempt, so nothing the form already held is thrown away.
 */
export function keepOnFailure<State, Payload>(
  action: (previous: State, payload: Payload) => Promise<State>,
  onFailure: (previous: State, message: string, kind: FailureKind) => State,
): (previous: State, payload: Payload) => Promise<State> {
  return async (previous, payload) => {
    try {
      return await action(previous, payload);
    } catch (error) {
      const kind = failureKind(error);
      if (kind === null) throw error;
      return onFailure(previous, FAILURE_MESSAGES[kind], kind);
    }
  };
}

/** The earlier name; transport failures are one of the four kinds now. */
export const keepOnNetworkFailure = keepOnFailure;
