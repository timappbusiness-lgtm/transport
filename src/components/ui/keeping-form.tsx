'use client';

import { startTransition, useEffect, useRef, useState } from 'react';
import type { ComponentPropsWithoutRef, Ref, SubmitEvent } from 'react';
import { FormError } from '@/components/auth/form';
import { SessionNotice } from '@/components/continuity/session-notice';
import { FAILURE_MESSAGES, failureKind } from '@/lib/continuity/network';
import { announceSessionExpired } from '@/lib/continuity/session-store';

function isRedirect(error: unknown): boolean {
  const digest = (error as { digest?: unknown } | null)?.digest;
  return typeof digest === 'string' && digest.startsWith('NEXT_REDIRECT');
}

type Props = Omit<ComponentPropsWithoutRef<'form'>, 'action'> & {
  /** A `useActionState` dispatch, or a server action taking the form data. */
  action: (formData: FormData) => unknown;
  /**
   * When this changes to anything but `null` or `undefined`, the fields go
   * back to their defaults — for the forms that should be empty after a
   * success: a message sent, a vehicle added. Pass the action's state
   * when it says it succeeded, `null` otherwise.
   */
  resetOn?: unknown;
  ref?: Ref<HTMLFormElement>;
};

/**
 * A form that keeps what was typed into it.
 *
 * React clears every uncontrolled field of a `<form action={fn}>` once the
 * action finishes — the right thing after a success, and the wrong one
 * after a failure: a validation error that sends the whole form back
 * empty, a dropped connection that throws the text away. This submits the
 * same form data inside a transition of its own, which React treats as a
 * submission it does not own: `useFormStatus` still reports it as pending,
 * nothing is cleared, and clearing is a decision the form makes with
 * `resetOn`.
 *
 * `action` stays on the element, so the form still works the ordinary way
 * where the handler never runs. A server action passed directly — not
 * through `useKeptActionState` — has its failed requests caught here, and
 * the sentence is drawn at the end of the form. So is the page-wide
 * notice with the way to sign in again, once per page whatever the number
 * of forms on it.
 */
export function KeepingForm({ action, resetOn, onSubmit, children, ref, ...rest }: Props) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    if (resetOn !== null && resetOn !== undefined) formRef.current?.reset();
  }, [resetOn]);

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    onSubmit?.(event);
    if (event.defaultPrevented) return;
    event.preventDefault();

    const form = event.currentTarget;
    const submitter = event.nativeEvent.submitter;
    const formData = submitter ? new FormData(form, submitter) : new FormData(form);
    setFailure(null);

    startTransition(async () => {
      try {
        await action(formData);
      } catch (error) {
        // A redirect from the action: the router is already navigating to
        // it, and the rejection is only its receipt.
        if (isRedirect(error)) return;
        const kind = failureKind(error);
        if (kind === null) throw error;
        if (kind === 'session') announceSessionExpired();
        setFailure(FAILURE_MESSAGES[kind]);
      }
    });
  }

  return (
    <form
      {...rest}
      ref={(node) => {
        formRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }}
      action={action as (formData: FormData) => void}
      onSubmit={handleSubmit}
    >
      {children}
      {failure ? <FormError>{failure}</FormError> : null}
      <SessionNotice />
    </form>
  );
}
