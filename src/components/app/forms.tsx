'use client';

import { useFormStatus } from 'react-dom';
import { buttonClasses } from '@/components/ui/button';
import type { ActionState } from '@/lib/action-state';
import { cn } from '@/lib/utils';

export const inputClasses =
  'block w-full rounded-[6px] border border-border bg-surface px-3 py-2 text-sm text-foreground placeholder:text-muted/70 ' +
  'focus-visible:border-accent disabled:opacity-60 aria-[invalid=true]:border-danger';

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  htmlFor: string;
  hint?: string | undefined;
  error?: string | undefined;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('grid min-w-0 content-start gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function SubmitButton({
  children,
  pendingLabel,
  variant = 'primary',
  size = 'md',
  className,
  name,
  value,
}: {
  children: React.ReactNode;
  pendingLabel?: string | undefined;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
  className?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending}
      aria-disabled={pending}
      className={cn(buttonClasses(variant, size), className)}
    >
      {pending ? (pendingLabel ?? 'Se trimite…') : children}
    </button>
  );
}

export function FormMessage({ state }: { state: ActionState }) {
  if (!state?.message) return null;
  return (
    <p
      role={state.ok ? 'status' : 'alert'}
      className={cn(
        'rounded-[6px] border px-3 py-2 text-sm',
        state.ok ? 'border-success/30 bg-success/10 text-success' : 'border-danger/30 bg-danger/10 text-danger',
      )}
    >
      {state.message}
    </p>
  );
}
