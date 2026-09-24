'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { toastCopy } from '@/content/toast';
import { cn } from '@/lib/utils';

/**
 * One toast component, for „saved" and for „that did not work".
 *
 * The save buttons on the long forms stick to the bottom of a phone's
 * screen, and the notice they produced was written at the top of the
 * form — off screen, exactly where the person was not looking. A toast
 * appears where they are.
 *
 * Two kinds and no more. A success goes after four seconds and is read
 * politely; an error stays for ten, is read at once, and has a close
 * button. Neither carries an icon: an error never does on this platform,
 * and a tick on a success is too close to the verification mark.
 *
 * Motion is a short rise and a fade — transform and opacity — and the
 * reduced-motion block in globals.css takes it to a single frame.
 */

export type ToastKind = 'success' | 'error';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  /**
   * Drawn but not announced, because the page already says it: a form
   * keeps its inline error, which is the alert, and the toast repeats it
   * for the eye. Two alerts for one failure is a screen reader reading
   * the same sentence twice.
   */
  quiet?: boolean | undefined;
}

type Show = (kind: ToastKind, message: string, options?: { quiet?: boolean }) => void;

const DURATION: Record<ToastKind, number> = { success: 4000, error: 10000 };

const ToastContext = createContext<Show | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((all) => all.filter((t) => t.id !== id));
  }, []);

  const show = useCallback<Show>(
    (kind, message, options) => {
      const id = ++next.current;
      // At most three on screen: a fourth pushes the oldest out.
      setToasts((all) => [...all.slice(-2), { id, kind, message, quiet: options?.quiet }]);
      window.setTimeout(() => dismiss(id), DURATION[kind]);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        // Above the phone's bottom bar, beside nothing on a wide screen.
        // The bar is 3.5rem plus the home indicator's safe area, so the
        // toast adds the same area: a plain 5rem sat on the bar's labels
        // on an iPhone, whose safe area is 34px.
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6"
      >
        {toasts.map((toast) => (
          <ToastView key={toast.id} toast={toast} onClose={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** One toast, drawn. Exported so it can be rendered on its own in a test. */
export function ToastView({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  return (
    <div
      data-toast={toast.kind}
      role={toast.quiet ? undefined : toast.kind === 'error' ? 'alert' : 'status'}
      className={cn(
        'pointer-events-auto flex w-full max-w-[26rem] items-start gap-3 rounded-card border px-4 py-3 text-small shadow-float',
        'motion-safe:animate-[toast-in_var(--duration-calm)_var(--ease-soft)_both]',
        toast.kind === 'success'
          ? 'border-accent-border bg-surface text-foreground'
          : 'border-danger/40 bg-surface text-foreground',
      )}
    >
      {/* The edge carries the kind; the words carry the meaning. */}
      <span
        aria-hidden="true"
        className={cn(
          'mt-1 h-3 w-1 flex-none rounded-pill',
          toast.kind === 'success' ? 'bg-accent' : 'bg-danger',
        )}
      />
      <p className="min-w-0 flex-1">{toast.message}</p>
      {toast.kind === 'error' ? (
        <button
          type="button"
          onClick={onClose}
          className="flex-none text-small text-muted underline-offset-4 hover:text-foreground hover:underline"
        >
          {toastCopy.close}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Which toast a form's result deserves, or none. An error wins over a
 * notice, because a form that half-saved has to say so first.
 */
export function toastFor(state: {
  notice?: string | undefined;
  error?: string | undefined;
}): { kind: ToastKind; message: string } | null {
  if (state.error) return { kind: 'error', message: state.error };
  if (state.notice) return { kind: 'success', message: state.notice };
  return null;
}

/** `show('success', 'Salvat.')` — or nothing, outside the provider. */
export function useToast(): Show {
  const show = useContext(ToastContext);
  return show ?? noop;
}

function noop() {}

/**
 * The bridge from a server action's state to a toast.
 *
 * Every save form here returns `{ notice?, error? }`. This watches that
 * object and raises one toast per new result — keyed on the object, so
 * submitting the same form twice and getting the same message twice
 * says it twice, and a re-render says nothing.
 *
 * Every form that uses it keeps its `FormError` inline — the error has to
 * stay beside the fields until it is fixed — so the error toast here is
 * quiet: seen, not read out a second time.
 */
export function useActionToast(state: { notice?: string | undefined; error?: string | undefined }) {
  const show = useToast();
  const seen = useRef<object | null>(null);

  useEffect(() => {
    if (seen.current === state) return;
    seen.current = state;
    const toast = toastFor(state);
    if (toast !== null) show(toast.kind, toast.message, { quiet: toast.kind === 'error' });
  }, [state, show]);
}
