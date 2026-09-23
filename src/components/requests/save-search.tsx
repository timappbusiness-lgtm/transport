'use client';

import { useActionState, useId, useState } from 'react';
import Link from 'next/link';
import { saveSearchAction, type AlertState } from '@/app/cont/alerte/actions';
import { buttonClasses } from '@/components/ui/button';
import { ROUTES } from '@/config/routes';
import { alertsCopy } from '@/content/alerte';
import {
  FREQUENCY_HINTS,
  FREQUENCY_LABELS,
  describeSearch,
  suggestName,
  type SearchFilters,
} from '@/lib/saved-searches';
import { cn } from '@/lib/utils';

const EMPTY: AlertState = {};
const c = alertsCopy.form;

/**
 * „Salvează căutarea", wherever somebody is standing when they want it.
 *
 * Three screens offer this: the board with whatever is filtered right
 * now, and the two empty states, where it is the most useful button on
 * the page — an empty board is exactly the moment to say „tell me when
 * this changes" rather than to leave.
 *
 * A visitor with no session sees the sign-in link instead of the form,
 * because a saved search belongs to somebody.
 */
export function SaveSearch({
  filters,
  signedIn,
  label,
  variant = 'secondary',
}: {
  filters: SearchFilters;
  signedIn: boolean;
  label?: string;
  variant?: 'primary' | 'secondary' | 'quiet';
}) {
  const [state, action, pending] = useActionState(saveSearchAction, EMPTY);
  const [open, setOpen] = useState(false);
  const id = useId();

  if (!signedIn) {
    return (
      <Link
        href={`${ROUTES.signIn}?next=${encodeURIComponent(ROUTES.requests)}`}
        className={
          // „quiet" is a text link rather than a button: beside „Caută"
          // on the board it is a second thing to do, not a second thing
          // to decide between.
          variant === 'quiet'
            ? 'text-small text-muted underline-offset-4 hover:text-foreground hover:underline'
            : buttonClasses(variant, 'md')
        }
      >
        {label ?? c.title}
      </Link>
    );
  }

  if (state.notice !== undefined) {
    return (
      <p role="status" className="text-sm">
        {state.notice}{' '}
        <Link href={ROUTES.accountAlerts} className="underline underline-offset-4">
          Vezi alertele
        </Link>
      </p>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          variant === 'quiet'
            ? 'text-small text-muted underline-offset-4 hover:text-foreground hover:underline'
            : buttonClasses(variant, 'md')
        }
      >
        {label ?? c.title}
      </button>
    );
  }

  return (
    <form
      action={action}
      className="flex w-full flex-col gap-3 rounded-card border border-border bg-ground-alt p-4"
    >
      <input type="hidden" name="filters" value={JSON.stringify(filters)} />

      <div>
        <p className="text-sm font-medium">{c.title}</p>
        <p className="mt-1 max-w-[58ch] text-sm text-muted">{c.lede}</p>
        <p className="mt-2 text-xs text-muted">{describeSearch(filters)}</p>
      </div>

      <label htmlFor={`${id}-name`} className="flex flex-col gap-1.5 text-sm">
        {c.name}
        <input
          id={`${id}-name`}
          name="name"
          required
          defaultValue={suggestName(filters)}
          placeholder={c.namePlaceholder}
          className="rounded-input border border-border-strong bg-surface px-3 py-2 text-sm"
        />
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm">{c.frequency}</legend>
        {(['immediate', 'daily'] as const).map((frequency) => (
          <label key={frequency} className="flex gap-2.5 text-sm">
            <input
              type="radio"
              name="frequency"
              value={frequency}
              defaultChecked={frequency === 'immediate'}
              className="mt-0.5 size-4 accent-foreground"
            />
            <span>
              {FREQUENCY_LABELS[frequency]}
              <span className="block text-xs text-muted">{FREQUENCY_HINTS[frequency]}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <label className="flex items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          name="notify_email"
          value="yes"
          defaultChecked
          className="mt-0.5 size-4 accent-foreground"
        />
        <span>
          {c.email}
          <span className="block text-xs text-muted">{c.emailHint}</span>
        </span>
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={buttonClasses('primary', 'md')}>
          {pending ? c.submitting : c.submit}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-sm text-muted underline underline-offset-4"
        >
          Renunță
        </button>
      </div>

      {state.error !== undefined ? (
        <div role="alert" className={cn('text-sm', 'text-danger')}>
          <p>{state.error}</p>
          {state.quotaReached === true ? (
            <p className="mt-1 text-foreground">
              <Link href={ROUTES.plans} className="underline underline-offset-4">
                {alertsCopy.quota.action}
              </Link>{' '}
              <span className="text-muted">{alertsCopy.quota.hint}</span>
            </p>
          ) : null}
        </div>
      ) : null}
    </form>
  );
}
