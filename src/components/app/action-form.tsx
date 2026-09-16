'use client';

import { useActionState } from 'react';
import { type ActionState, initialActionState } from '@/lib/action-state';
import { FormMessage, SubmitButton } from './forms';

/**
 * A one-button form for a server action that needs no input beyond hidden
 * fields: accept, decline, revoke, remove.
 */
export function ActionButtonForm({
  action,
  fields,
  label,
  pendingLabel,
  variant = 'secondary',
  confirmText,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  label: string;
  pendingLabel?: string;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  confirmText?: string;
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  return (
    <form
      action={formAction}
      className="grid gap-2"
      onSubmit={(e) => {
        if (confirmText && !window.confirm(confirmText)) e.preventDefault();
      }}
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <SubmitButton variant={variant} size="sm" pendingLabel={pendingLabel}>
        {label}
      </SubmitButton>
      <FormMessage state={state} />
    </form>
  );
}
