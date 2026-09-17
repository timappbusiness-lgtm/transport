'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import type { FaqEntry } from '@/content/faq';
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
}: {
  entries: readonly FaqEntry[];
  className?: string | undefined;
  /** Opened on first render, for a page linked to a single question. */
  defaultOpenId?: string | undefined;
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
    <div className={cn('grid gap-3', className)}>
      {entries.map((entry) => (
        <Item key={entry.id} entry={entry} open={open.has(entry.id)} onToggle={toggle} />
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
    <div className="rounded-card border border-border bg-surface">
      <h3 className="text-[0.9375rem]">
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
          <span>{entry.question}</span>
          <ChevronDown
            size={18}
            aria-hidden="true"
            className={cn(
              'mt-0.5 flex-none text-muted transition-transform motion-reduce:transition-none',
              open && 'rotate-180',
            )}
          />
        </button>
      </h3>

      {open ? (
        <div id={panelId} className="px-5 pb-5">
          {entry.answer.map((paragraph) => (
            <p key={paragraph} className="mt-2 text-[0.9375rem] leading-relaxed text-muted first:mt-0">
              {paragraph}
            </p>
          ))}
          {entry.link ? (
            <p className="mt-3 text-sm">
              <Link
                href={entry.link.href}
                className="text-foreground underline underline-offset-4 decoration-border-strong hover:decoration-foreground"
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
