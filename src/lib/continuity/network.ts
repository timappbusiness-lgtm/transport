/**
 * A request that failed is not a reason to lose what was typed.
 *
 * A server action that cannot reach the server rejects, and a rejected
 * action inside `useActionState` goes to the nearest error boundary —
 * which replaces the form, and everything in it, with an error page. So
 * every form's action goes through `keepOnNetworkFailure`, which turns a
 * transport failure into ordinary state: the form stays, its fields stay,
 * and the message says to try again.
 *
 * Only transport failures are caught. Anything else — including the
 * special errors Next throws to perform a `redirect()` — is re-thrown, so
 * a redirect still redirects and a bug still shows as a bug.
 */

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

export function isNetworkError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const name = (error as { name?: unknown }).name;
  const message = (error as { message?: unknown }).message;
  if (typeof message !== 'string') return false;
  // Next's own control-flow errors carry a digest; they are never transport.
  if (typeof (error as { digest?: unknown }).digest === 'string') return false;
  if (name === 'AbortError') return true;
  return NETWORK_MESSAGES.some((pattern) => pattern.test(message));
}

/** What every form shows when its request did not arrive. */
export const NETWORK_ERROR_MESSAGE =
  'Nu am putut trimite: conexiunea s-a întrerupt. Ce ai completat a rămas aici — încearcă din nou.';

/**
 * Wraps a `useActionState` action so a failed request becomes state rather
 * than an error page. `onFailure` builds the state to show, from the state
 * before the attempt, so nothing the form already held is thrown away.
 */
export function keepOnNetworkFailure<State, Payload>(
  action: (previous: State, payload: Payload) => Promise<State>,
  onFailure: (previous: State, message: string) => State,
): (previous: State, payload: Payload) => Promise<State> {
  return async (previous, payload) => {
    try {
      return await action(previous, payload);
    } catch (error) {
      if (isNetworkError(error)) return onFailure(previous, NETWORK_ERROR_MESSAGE);
      throw error;
    }
  };
}
