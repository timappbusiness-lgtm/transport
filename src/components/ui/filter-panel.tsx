import type { ReactNode } from 'react';
import { buttonClasses } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { ICON_GAP, iconForAction } from '@/lib/icons';
import { BOARD_SORT_LABELS, SORT_KEY, type BoardSort } from '@/lib/board-simplicity';
import { cn } from '@/lib/utils';

/**
 * The shape both boards' filters take.
 *
 * Three questions on screen — where from, where to, what kind of vehicle
 * — and one link to everything else. A transport professional told us
 * the boards were hard to connect; the measurement said `/cereri` put
 * thirteen fields on screen, twelve above the fold, under 461 words.
 * Nothing was removed to fix that. The other ten filters are one click
 * away and still in the URL under the same keys.
 *
 * Two details that decide whether this helps or annoys:
 *
 *   - the panel is a real `<details>`, so it works with JavaScript off,
 *     the browser handles the disclosure, and a keyboard reaches it the
 *     way a keyboard reaches any disclosure;
 *   - it opens by itself when a link carries advanced filters. Somebody
 *     opening a colleague's link sees a board narrowed by four things
 *     and, without that, no way to tell which four.
 */
export function FilterPanel({
  action,
  title,
  simple,
  advanced,
  advancedCount,
  hidden,
  sort,
  sorts,
  canReset,
  resetHref,
  labels,
  children,
}: {
  /** Where the GET form submits. Filters stay in the URL, as before. */
  action: string;
  title: string;
  /** The three that stay on screen. */
  simple: ReactNode;
  /** Everything else, inside the disclosure. */
  advanced: ReactNode;
  /** Drives the badge, and whether the panel starts open. */
  advancedCount: number;
  /** Values the form must carry through without showing them. */
  hidden?: ReactNode;
  sort: BoardSort;
  /** The three this board offers. They differ: a route has no distance. */
  sorts: readonly BoardSort[];
  canReset: boolean;
  resetHref: string;
  labels: {
    more: string;
    /** „3 active" */
    active: (n: number) => string;
    sort: string;
    apply: string;
    clear: string;
  };
  /** Anything after the buttons — the saved-search entry point. */
  children?: ReactNode;
}) {
  return (
    <form method="get" action={action} className="flex flex-col gap-4">
      {hidden}

      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-h3">{title}</h2>
        <label className="flex items-center gap-2 text-small text-muted">
          {labels.sort}
          <select
            name={SORT_KEY}
            defaultValue={sort}
            className="rounded-input border border-border-strong bg-surface px-2 py-1 text-small"
          >
            {sorts.map((option) => (
              <option key={option} value={option}>
                {BOARD_SORT_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* The three. */}
      <div className="grid gap-3 sm:grid-cols-3">{simple}</div>

      <details
        // Open when something inside it is narrowing the board, so an
        // inherited link explains itself.
        open={advancedCount > 0}
        className="rounded-input border border-border bg-ground-alt/60"
      >
        <summary
          className={cn(
            'flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-small font-medium',
            'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground',
          )}
        >
          <span className={cn('inline-flex items-center', ICON_GAP)}>
            <Icon as={iconForAction('filter')} size="sm" tone="muted" />
            {labels.more}
          </span>
          {advancedCount > 0 ? (
            <span className="inline-flex min-w-5 items-center justify-center rounded-pill bg-accent px-2 py-0.5 font-mono text-label text-white">
              {advancedCount}
              <span className="sr-only"> {labels.active(advancedCount)}</span>
            </span>
          ) : null}
        </summary>
        <div className="flex flex-col gap-4 border-t border-border px-3 py-4">{advanced}</div>
      </details>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className={cn(buttonClasses('primary', 'sm'), 'inline-flex items-center', ICON_GAP)}
        >
          <Icon as={iconForAction('search')} size="sm" />
          {labels.apply}
        </button>
        {canReset ? (
          <a href={resetHref} className="text-small text-muted underline-offset-4 hover:underline">
            {labels.clear}
          </a>
        ) : null}
      </div>

      {children}
    </form>
  );
}

/** One labelled control. The boards had this written out sixteen times. */
export function FilterField({
  id,
  label,
  hint,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string | undefined;
  className?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-xs font-medium">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

/** The class every control on both boards shares. */
export const FILTER_CONTROL =
  'w-full rounded-input border border-border-strong bg-surface px-3 py-2 text-small';
