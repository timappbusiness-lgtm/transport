'use client';

import { useActionState, useMemo } from 'react';
import { keepOnFailure } from './network';
import { announceSessionExpired } from './session-store';

/**
 * `useActionState`, except that a failed request never costs the form.
 *
 * The request did not arrive, the server answered with an error, the
 * session expired, the platform was updated while the form was open: in
 * every one of those cases the plain hook sends the form to the error
 * page. This one keeps the state the form had, puts the sentence for what
 * happened in its `error`, and — when it was the session — raises the
 * page-wide notice with the link to sign in again.
 *
 * Pair it with `KeepingForm`, which stops React from clearing the fields
 * after the attempt. Neither is any use without the other.
 */
export function useKeptActionState<State extends { error?: string | undefined }>(
  action: (previous: State, formData: FormData) => Promise<State>,
  initialState: State,
): [state: State, dispatch: (formData: FormData) => void, pending: boolean] {
  const kept = useMemo(
    () =>
      keepOnFailure<State, FormData>(action, (previous, message, kind) => {
        if (kind === 'session') announceSessionExpired();
        return { ...previous, error: message };
      }),
    [action],
  );
  return useActionState<State, FormData>(kept, initialState as Awaited<State>);
}
