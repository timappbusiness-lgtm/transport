import type { ReactNode } from 'react';
import { AdvancedFilters } from '@/components/ui/advanced-filters';
import { buttonClasses } from '@/components/ui/button';
import { FilterChips } from '@/components/ui/filter-chips';
import { filtersCopy } from '@/content/filtre';
import { Icon } from '@/components/ui/icon';
import { ICON_GAP, iconForAction } from '@/lib/icons';
import { BOARD_SORT_LABELS, SORT_KEY, type BoardSort } from '@/lib/board-simplicity';
import type { FilterChip } from '@/lib/filter-disclosure';
import { cn } from '@/lib/utils';

/**
 * The shape every search panel takes: the boards, the directory and the
 * staff lists.
 *
 * At most three questions on screen, and one button to everything else.
 * A transport professional told us the boards were hard to connect; the
 * measurement said `/cereri` put thirteen fields on screen, twelve above
 * the fold. Nothing was removed to fix that: the other filters are one
 * click away and still in the URL under the same keys.
 *
 * The panel is closed on first paint, always (`filter-disclosure.ts`).
 * It used to open itself when a link carried advanced filters, which on
 * /cereri meant every carrier's every visit. What it filters is now said
 * outside it: the count on the button, and a removable chip for each
 * active advanced filter under the main fields, with „Șterge filtrele"
 * at the end of them. The sort stays in the header, apart from both.
 */
export function FilterPanel({
  action,
  screen,
  title,
  simple,
  simpleClassName = 'grid gap-3 sm:grid-cols-3',
  advanced,
  chips,
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
  /** Names the panel's session memory: „cereri", „admin-oferte". */
  screen: string;
  title?: string | undefined;
  /** The (at most) three that stay on screen. */
  simple: ReactNode;
  /** The layout of those three; a narrow sidebar stacks them. */
  simpleClassName?: string | undefined;
  /** Everything else, inside the disclosure. */
  advanced: ReactNode;
  /** One per active advanced filter; their number is the button's count. */
  chips: readonly FilterChip[];
  /** Values the form must carry through without showing them. */
  hidden?: ReactNode;
  sort?: BoardSort | undefined;
  /** The three this board offers. They differ: a route has no distance. */
  sorts?: readonly BoardSort[] | undefined;
  canReset: boolean;
  resetHref: string;
  labels: {
    more: string;
    /** „3 active" */
    active: (n: number) => string;
    sort?: string | undefined;
    apply: string;
    clear: string;
  };
  /** Anything after the buttons — the saved-search entry point. */
  children?: ReactNode;
}) {
  const showSort = sort !== undefined && sorts !== undefined && sorts.length > 0;
  return (
    <form method="get" action={action} className="flex flex-col gap-4" data-search-panel={screen}>
      {hidden}

      {title !== undefined || showSort ? (
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          {title !== undefined ? <h2 className="text-h3">{title}</h2> : <span />}
          {showSort ? (
            <label className="flex items-center gap-2 text-small text-muted">
              {labels.sort}
              <select
                name={SORT_KEY}
                defaultValue={sort}
                data-sort=""
                className="rounded-input border border-border-strong bg-surface px-2 py-1 text-small"
              >
                {sorts.map((option) => (
                  <option key={option} value={option}>
                    {BOARD_SORT_LABELS[option]}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
      ) : null}

      {/* The three. */}
      <div className={simpleClassName}>{simple}</div>

      {/* What the closed panel is filtering, where it can be seen and undone. */}
      <FilterChips
        chips={chips}
        clearHref={resetHref}
        clearLabel={labels.clear}
        heading={filtersCopy.chipsHeading}
        removeLabel={filtersCopy.removeChip}
      />

      <AdvancedFilters
        screen={screen}
        label={labels.more}
        count={chips.length}
        countText={labels.active(chips.length)}
      >
        {advanced}
      </AdvancedFilters>

      {/* One row: the button, and beside it the two things that are not
          decisions — clearing what is set, and saving what is set. The
          clearing link is here only when the chips are not: one way to
          clear, not two. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <button
          type="submit"
          className={cn(buttonClasses('ink', 'sm'), 'inline-flex items-center', ICON_GAP)}
        >
          <Icon as={iconForAction('search')} size="sm" />
          {labels.apply}
        </button>
        {canReset && chips.length === 0 ? (
          <a
            href={resetHref}
            data-filter-reset=""
            className="text-small text-muted underline-offset-4 hover:underline"
          >
            {labels.clear}
          </a>
        ) : null}
        {children}
      </div>
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
      <label htmlFor={id} className="text-small font-medium">
        {label}
      </label>
      {children}
      {hint ? <p className="text-small text-muted">{hint}</p> : null}
    </div>
  );
}

/** One checkbox filter, the staff lists' „doar sesizate" and the like. */
export function FilterCheck({
  id,
  name,
  label,
  defaultChecked,
}: {
  id: string;
  name: string;
  label: string;
  defaultChecked: boolean;
}) {
  return (
    <label htmlFor={id} className="flex min-h-10 items-center gap-2 self-end text-small">
      <input id={id} type="checkbox" name={name} value="da" defaultChecked={defaultChecked} className="size-4" />
      {label}
    </label>
  );
}

/** The class every control on both boards shares. */
export const FILTER_CONTROL =
  'w-full rounded-input border border-border-strong bg-surface px-3 py-2 text-small';
