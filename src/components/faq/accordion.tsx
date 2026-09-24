'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { uiIcon } from '@/lib/icons';
import type { FaqEntry } from '@/content/faq';
import { splitColumns } from '@/lib/columns';
import { cn } from '@/lib/utils';

/**
 * The accordion pattern, written out rather than reached for.
 *
 * Each question is a real button, so it is in the tab order, answers to
 * Enter and Space, and announces itself as expanded or collapsed. The panel
 * is removed from the accessibility tree when closed rather than hidden
 * with opacity, which is what stops a screen reader reading six answers
 * that are not on screen.
 *
 * More than one can be open at a time: these are independent questions, not
 * steps in a sequence, and closing somebody's answer because they opened
 * another one is a surprise, not a feature.
 */
export function FaqAccordion({
  entries,
  className,
  defaultOpenId,
  columns = 1,
}: {
  entries: readonly FaqEntry[];
  className?: string | undefined;
  /** Opened on first render, for a page linked to a single question. */
  defaultOpenId?: string | undefined;
  /**
   * Two, from the `lg` width up: two independent stacks, never a grid of
   * rows. An answer that opens moves only the questions under it, in its
   * own column; the one beside it keeps its height and its place.
   */
  columns?: 1 | 2;
}) {
  const [open, setOpen] = useState<ReadonlySet<string>>(
    () => new Set(defaultOpenId ? [defaultOpenId] : []),
  );

  function toggle(id: string) {
    setOpen((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  return (
    <div
      data-faq-accordion
      className={cn('grid items-start gap-3', columns === 2 && 'lg:grid-cols-2', className)}
    >
      {splitColumns(entries, columns).map((stack, index) => (
        <div key={index} data-faq-column={index} className="flex min-w-0 flex-col gap-3">
          {stack.map((entry) => (
            <Item key={entry.id} entry={entry} open={open.has(entry.id)} onToggle={toggle} />
          ))}
        </div>
      ))}
    </div>
  );
}

function Item({
  entry,
  open,
  onToggle,
}: {
  entry: FaqEntry;
  open: boolean;
  onToggle: (id: string) => void;
}) {
  const panelId = `${useId()}-panel`;

  return (
    <div data-faq-item className="min-w-0 rounded-card border border-border bg-surface">
      <h3 className="text-body">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => onToggle(entry.id)}
          className={cn(
            'flex w-full items-start justify-between gap-4 rounded-card px-5 py-4 text-left',
            'font-medium hover:bg-ground-alt',
            'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground',
          )}
        >
          <span className="min-w-0 [overflow-wrap:anywhere]">{entry.question}</span>
          <Icon
            as={uiIcon('expand')}
            size="md"
            tone="muted"
            className={cn(
              'mt-0.5 transition-transform motion-reduce:transition-none',
              open && 'rotate-180',
            )}
          />
        </button>
      </h3>

      {open ? (
        <div id={panelId} className="px-5 pb-5">
          {entry.answer.map((paragraph) => (
            <p key={paragraph} className="mt-2 text-body leading-relaxed text-muted first:mt-0">
              {paragraph}
            </p>
          ))}
          {entry.link ? (
            <p className="mt-3 text-body">
              <Link
                href={entry.link.href}
                className="link-accent"
              >
                {entry.link.label}
              </Link>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
