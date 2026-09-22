'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { uiIcon } from '@/lib/icons';
import { appCopy } from '@/content/app';
import type { NavItem } from '@/lib/navigation';
import { cn } from '@/lib/utils';

const c = appCopy.shell;

/**
 * The bottom bar on a phone, and the sheet holding the rest.
 *
 * Five slots, one of them "Mai mult" once there is an overflow — the split
 * is decided in `bottomNav`, by how likely an item is to be opened rather
 * than by the order it was written in.
 *
 * The sheet traps focus while it is open and returns it to the button on
 * close. That is the part people skip, and it is the part that decides
 * whether the menu is usable without a mouse.
 */
export function MobileNav({
  bar,
  more,
  current,
}: {
  bar: readonly NavItem[];
  more: readonly NavItem[];
  current: string | null;
}) {
  const [open, setOpen] = useState(false);
  const sheet = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    const node = sheet.current;
    node?.querySelector<HTMLElement>('a, button')?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
        return;
      }
      if (event.key !== 'Tab' || !node) return;

      // The focus trap: Tab past the last control wraps to the first, and
      // Shift+Tab before the first wraps to the last.
      const focusable = node.querySelectorAll<HTMLElement>('a[href], button');
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return (
    <>
      <nav
        aria-label={c.navLabel}
        className={cn(
          'fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface lg:hidden',
          'pb-[env(safe-area-inset-bottom)]',
        )}
      >
        <ul className="flex">
          {bar.map((item) => (
            <li key={item.href} className="min-w-0 flex-1">
              <Link
                href={item.href}
                aria-current={current === item.href ? 'page' : undefined}
                className={cn(
                  'flex h-14 flex-col items-center justify-center gap-0.5 px-1 text-center',
                  'text-[0.6875rem] leading-tight',
                  current === item.href ? 'font-medium text-foreground' : 'text-muted',
                )}
              >
                <span className="line-clamp-2">{item.label}</span>
              </Link>
            </li>
          ))}

          {more.length > 0 ? (
            <li className="min-w-0 flex-1">
              <button
                ref={trigger}
                type="button"
                aria-expanded={open}
                onClick={() => setOpen(true)}
                className="flex h-14 w-full flex-col items-center justify-center gap-0.5 text-[0.6875rem] text-muted"
              >
                <Icon as={uiIcon('menu')} size="md" />
                {c.moreLabel}
              </button>
            </li>
          ) : null}
        </ul>
      </nav>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label={c.close}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-foreground/30"
          />
          <div
            ref={sheet}
            role="dialog"
            aria-modal="true"
            aria-label={c.moreTitle}
            className="absolute inset-x-0 bottom-0 rounded-t-card border-t border-border bg-surface p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
          >
            <div className="flex items-center justify-between">
              <p className="font-display text-[0.9375rem] font-medium">{c.moreTitle}</p>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  trigger.current?.focus();
                }}
                className="rounded-input p-1.5 text-muted hover:text-foreground"
              >
                <Icon as={uiIcon('close')} size="md" />
                <span className="sr-only">{c.close}</span>
              </button>
            </div>

            <ul className="mt-4 flex flex-col">
              {more.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={current === item.href ? 'page' : undefined}
                    onClick={() => setOpen(false)}
                    className={cn(
                      'block rounded-input px-3 py-2.5 text-[0.9375rem]',
                      current === item.href ? 'bg-ground-alt font-medium' : 'text-muted',
                    )}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
