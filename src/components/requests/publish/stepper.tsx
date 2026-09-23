'use client';

import { Icon } from '@/components/ui/icon';
import { requestsCopy } from '@/content/cereri';
import { uiIcon } from '@/lib/icons';
import { REQUEST_STEPS, type RequestStep } from '@/lib/request-form';
import { cn } from '@/lib/utils';

/**
 * Where you are in the four steps, and the way back.
 *
 * Every step is named — „Traseu, Vehicul, Serviciu, Contact" — because a
 * number alone tells somebody how far they are and nothing about what is
 * left. The current step is filled with the accent and bold; a finished
 * one carries a tick and can be pressed to go back to it; one still ahead
 * is quiet and cannot be pressed, because going forward runs the checks.
 *
 * Under the names a rail fills in as the steps are done. It is a width,
 * not an animation: nothing about it moves.
 */
export function PublishStepper({
  current,
  onSelect,
}: {
  current: RequestStep;
  onSelect: (step: RequestStep) => void;
}) {
  const c = requestsCopy.form;
  const index = REQUEST_STEPS.indexOf(current);

  return (
    <nav aria-label={c.title} data-stepper>
      <p className="sr-only" aria-live="polite">
        {c.stepCurrent(c.steps[current], index + 1, REQUEST_STEPS.length)}
      </p>
      <ol className="grid grid-cols-4 gap-1 sm:gap-2">
        {REQUEST_STEPS.map((step, position) => {
          const done = position < index;
          const active = step === current;
          const mark = (
            <span
              aria-hidden="true"
              className={cn(
                'flex size-8 flex-none items-center justify-center rounded-full font-mono text-small font-medium',
                active && 'bg-accent text-on-accent ring-4 ring-accent-subtle',
                done && 'bg-accent-subtle text-accent',
                !active && !done && 'border border-border-strong text-muted',
              )}
            >
              {done ? <Icon as={uiIcon('check')} size="sm" /> : position + 1}
            </span>
          );
          const label = (
            <span
              className={cn(
                'truncate text-small',
                active ? 'font-semibold text-foreground' : done ? 'text-foreground' : 'text-muted',
              )}
            >
              {c.steps[step]}
            </span>
          );
          return (
            <li key={step} data-step={step} data-state={active ? 'current' : done ? 'done' : 'ahead'} className="min-w-0">
              {done ? (
                <button
                  type="button"
                  onClick={() => onSelect(step)}
                  className="flex w-full min-w-0 flex-col items-center gap-1.5 rounded-input px-1 py-1 hover:bg-accent-subtle sm:flex-row sm:gap-2.5 sm:px-2"
                >
                  {mark}
                  {label}
                  <span className="sr-only">, {c.stepDone}</span>
                </button>
              ) : (
                <span
                  aria-current={active ? 'step' : undefined}
                  className="flex min-w-0 flex-col items-center gap-1.5 px-1 py-1 sm:flex-row sm:gap-2.5 sm:px-2"
                >
                  {mark}
                  {label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <div aria-hidden="true" className="mt-3 h-1 overflow-hidden rounded-pill bg-ground-alt">
        <div
          className="h-full rounded-pill bg-accent"
          style={{ width: `${((index + 1) / REQUEST_STEPS.length) * 100}%` }}
        />
      </div>
    </nav>
  );
}
