import { mementoCopy } from '@/content/memento';
import { mementoState, whenText } from '@/lib/memento';
import { cn } from '@/lib/utils';

/**
 * The state of a memento date, as words.
 *
 * Deliberately not a badge: a pill with a green dot is what a verified
 * document looks like on the fleet page, and a memento must never look
 * like one. Plain text; the danger colour only for a date already past.
 */
export function MementoStateText({ days, className }: { days: number; className?: string | undefined }) {
  const state = mementoState(days);
  return (
    <span data-memento-state={state} className={cn('text-small', className)}>
      <span
        className={cn(
          'font-medium',
          state === 'expirat' ? 'text-danger' : state === 'curand' ? 'text-foreground' : 'text-muted',
        )}
      >
        {mementoCopy.account.states[state]}
      </span>
      <span className="text-muted"> · {whenText(days)}</span>
    </span>
  );
}
