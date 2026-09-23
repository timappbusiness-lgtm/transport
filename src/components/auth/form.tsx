import Link from 'next/link';
import { buttonClasses } from '@/components/ui/button';
import { EyebrowPill } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

/** Centred card used by every page in the authentication flow. */
export function AuthCard({
  eyebrow,
  title,
  lede,
  children,
  footer,
}: {
  eyebrow?: string | undefined;
  title: string;
  lede?: string | undefined;
  children: React.ReactNode;
  footer?: React.ReactNode | undefined;
}) {
  return (
    <div className="mx-auto flex w-full max-w-[28rem] flex-col justify-center px-4 py-12 sm:px-6 sm:py-16">
      {eyebrow ? <EyebrowPill>{eyebrow}</EyebrowPill> : null}
      <h1 className="mt-2.5 text-h2">{title}</h1>
      {lede ? <p className="mt-3 text-sm text-muted sm:text-base">{lede}</p> : null}
      <div className="mt-8">{children}</div>
      {footer ? (
        <div className="mt-8 border-t border-border pt-6 text-sm text-muted">{footer}</div>
      ) : null}
    </div>
  );
}

export function Field({
  label,
  name,
  type = 'text',
  hint,
  error,
  defaultValue,
  autoComplete,
  required = true,
  inputMode,
  placeholder,
}: {
  label: string;
  name: string;
  type?: string | undefined;
  hint?: string | undefined;
  error?: string | undefined;
  defaultValue?: string | undefined;
  autoComplete?: string | undefined;
  required?: boolean | undefined;
  inputMode?: 'text' | 'email' | 'numeric' | 'tel' | undefined;
  placeholder?: string | undefined;
}) {
  const id = `field-${name}`;
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        defaultValue={defaultValue}
        autoComplete={autoComplete}
        required={required}
        inputMode={inputMode}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy === '' ? undefined : describedBy}
        className={cn(
          'w-full rounded-input border bg-surface px-3.5 py-2.5 text-body',
          'placeholder:text-muted/70',
          error ? 'border-danger' : 'border-border-strong',
        )}
      />
      {hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Form-level error. Assertive: it appears after the user pressed submit. */
export function FormError({ children }: { children?: string | undefined }) {
  if (!children) return null;
  return (
    <p
      role="alert"
      className="rounded-input border border-danger/45 bg-danger/8 px-3.5 py-2.5 text-sm text-foreground"
    >
      {children}
    </p>
  );
}

export function FormNotice({ children }: { children?: React.ReactNode }) {
  if (!children) return null;
  return (
    <p
      role="status"
      className="rounded-input border border-success/40 bg-success/8 px-3.5 py-2.5 text-sm text-foreground"
    >
      {children}
    </p>
  );
}

export function SubmitButton({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string | undefined;
}) {
  return (
    <button type="submit" className={cn(buttonClasses('primary', 'md'), 'w-full', className)}>
      {children}
    </button>
  );
}

export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="link-accent">
      {children}
    </Link>
  );
}
