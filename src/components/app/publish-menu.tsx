'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/icon';
import { iconForAction, uiIcon } from '@/lib/icons';
import { buttonClasses } from '@/components/ui/button';
import { PILL_SOLID } from '@/components/layout/header-shell';
import { appCopy } from '@/content/app';
import { menuSide, type MenuSide } from '@/lib/menu-side';
import type { PublishAction, PublishMenuSpec } from '@/lib/navigation';
import { cn } from '@/lib/utils';

const c = appCopy.shell;

/** `w-60`, in pixels, for choosing the side it opens on. */
const MENU_WIDTH = 240;

/**
 * The one thing this account is for, always in the same place.
 *
 * What it says depends on who is signed in (`publishMenu` in
 * `src/lib/navigation.ts`): „Publică un traseu" for a carrier, with the
 * tour, the return and — lower and quieter — a request; „Publică o
 * cerere" for a client. A driver gets no button.
 *
 * With a single action it is a link, not a menu — a dropdown that opens to
 * reveal one item wastes a click. With several it is a menu that closes on
 * Escape and on an outside click, and returns focus to the button, because
 * a menu that strands the keyboard is worse than no menu.
 *
 * `bar` draws it as the header's filled pill, on the dark bar; `page` as
 * the ordinary primary button, on a page.
 */
export function PublishMenu({
  spec,
  variant = 'page',
  compactLabel,
}: {
  spec: PublishMenuSpec | null;
  variant?: 'page' | 'bar';
  /** A shorter label below `sm`, where the full one does not fit the bar. */
  compactLabel?: string | undefined;
}) {
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

  if (spec === null || spec.actions.length === 0) return null;

  const trigger = variant === 'bar' ? cn(PILL_SOLID, 'gap-1.5') : buttonClasses('primary', 'sm');
  const label = (text: string) =>
    compactLabel === undefined ? (
      text
    ) : (
      <>
        {/* Only one of the two is in the DOM's reading at a time, so the
            accessible name is never doubled. */}
        <span className="sm:hidden">{compactLabel}</span>
        <span className="hidden sm:inline">{text}</span>
      </>
    );

  const only = spec.actions[0];
  if (spec.actions.length === 1 && only) {
    return (
      <Link href={only.href} data-publish className={trigger}>
        {variant === 'page' ? <Icon as={iconForAction('add')} size="sm" /> : null}
        {label(only.label)}
      </Link>
    );
  }

  const main = spec.actions.filter((action) => action.secondary !== true);
  const quiet = spec.actions.filter((action) => action.secondary === true);

  return (
    <div ref={wrapper} className="relative">
      <button
        ref={button}
        type="button"
        data-publish
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
        className={trigger}
      >
        {variant === 'page' ? <Icon as={iconForAction('add')} size="sm" /> : null}
        {label(spec.label)}
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
            'bg-surface text-foreground shadow-float',
          )}
        >
          {main.map((action) => (
            <MenuLink key={action.href} action={action} onPick={() => setOpen(false)} />
          ))}
          {quiet.length > 0 ? (
            // Available, not first: below a rule, in the muted ink.
            <div className="border-t border-border">
              {quiet.map((action) => (
                <MenuLink key={action.href} action={action} onPick={() => setOpen(false)} />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function MenuLink({ action, onPick }: { action: PublishAction; onPick: () => void }) {
  return (
    <Link
      href={action.href}
      role="menuitem"
      data-secondary={action.secondary === true ? 'true' : undefined}
      onClick={onPick}
      className={cn(
        'block px-4 py-2.5 hover:bg-ground-alt',
        action.secondary === true ? 'text-small text-muted' : 'text-body',
      )}
    >
      {action.label}
    </Link>
  );
}
