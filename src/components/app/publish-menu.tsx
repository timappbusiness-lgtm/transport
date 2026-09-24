'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { iconForAction, uiIcon } from '@/lib/icons';
import { buttonClasses } from '@/components/ui/button';
import { appCopy } from '@/content/app';
import { menuSide, type MenuSide } from '@/lib/menu-side';
import type { PublishAction } from '@/lib/navigation';
import { cn } from '@/lib/utils';

const c = appCopy.shell;

/** `w-60`, in pixels, for choosing the side it opens on. */
const MENU_WIDTH = 240;

/**
 * The one thing this account is for, always in the same place.
 *
 * With a single action it is a link, not a menu — a dropdown that opens to
 * reveal one item wastes a click. With several it is a menu that closes on
 * Escape and on an outside click, and returns focus to the button, because
 * a menu that strands the keyboard is worse than no menu.
 */
export function PublishMenu({ actions }: { actions: readonly PublishAction[] }) {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<MenuSide>('right');
  const menuId = useId();
  const wrapper = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (wrapper.current && !wrapper.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      setOpen(false);
      button.current?.focus();
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (actions.length === 0) return null;

  const only = actions[0];
  if (actions.length === 1 && only) {
    return (
      <Link href={only.href} className={buttonClasses('primary', 'sm')}>
        <Icon as={iconForAction('add')} size="sm" />
        {only.label}
      </Link>
    );
  }

  return (
    <div ref={wrapper} className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={(event) => {
          // Decided at the moment it opens, from where the button is now:
          // on a phone it wraps under the title, at the left edge.
          const rect = event.currentTarget.getBoundingClientRect();
          setSide(menuSide(rect, document.documentElement.clientWidth, MENU_WIDTH));
          setOpen((current) => !current);
        }}
        className={buttonClasses('primary', 'sm')}
      >
        <Icon as={iconForAction('add')} size="sm" />
        {c.publish}
        <Icon as={uiIcon('expand')} size="sm" />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={c.publishMenu}
          className={cn(
            'absolute z-50 mt-2 w-60 max-w-[calc(100vw-1rem)] overflow-hidden rounded-card border border-border',
            side === 'right' ? 'right-0' : 'left-0',
            'bg-surface shadow-float',
          )}
        >
          {actions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-body hover:bg-ground-alt"
            >
              {action.label}
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
