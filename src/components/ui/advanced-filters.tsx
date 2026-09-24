'use client';

import { useEffect, useId, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Icon } from '@/components/ui/icon';
import { countLabel } from '@/lib/badges';
import { browserStorage } from '@/lib/continuity/drafts';
import { ADVANCED_OPEN_ON_LOAD, rememberChoice, wasLeftOpen } from '@/lib/filter-disclosure';
import { ICON_GAP, UI_ICONS, iconForAction } from '@/lib/icons';
import { cn } from '@/lib/utils';

function subscribeNothing() {
  return () => {};
}

const FOCUSABLE =
  'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href]';

/**
 * „Mai multe filtre": a button and the panel it opens.
 *
 * Closed on first paint, always — the address may carry advanced
 * filters, and the count on the button and the chips above say so; the
 * panel does not open to explain itself. The person's own choice is
 * remembered for this screen until the tab closes (`filter-disclosure`),
 * so opening it, changing a date and pressing „Caută" does not snap it
 * shut on the next page.
 *
 * A real `<button>` with `aria-expanded` and `aria-controls`: Enter and
 * Space toggle it, and opening it moves focus to the first control
 * inside, where the keyboard was going anyway. The fields stay in the
 * form while the panel is closed — `hidden` hides, it does not disable —
 * so an active advanced filter survives a search made from the three
 * main fields.
 *
 * Without JavaScript the button does nothing and the `<noscript>` rule
 * shows the panel instead: every filter is still reachable.
 */
export function AdvancedFilters({
  screen,
  label,
  count,
  countText,
  children,
}: {
  /** The screen this panel belongs to, for its session memory: „cereri", „admin-oferte". */
  screen: string;
  /** „Mai multe filtre". */
  label: string;
  /** How many advanced filters are doing something; shown on the button. */
  count: number;
  /**
   * What a screen reader hears for the number: „2 filtre active". A
   * string, formatted by the server: a function cannot cross into a
   * client component, and trying took every search screen down.
   */
  countText: string;
  children: ReactNode;
}) {
  // Closed on the server and on the first paint. After hydration it
  // opens only if the person opened it earlier in this tab's session:
  // nothing in the address can.
  const leftOpen = useSyncExternalStore(
    subscribeNothing,
    () => wasLeftOpen(browserStorage('session'), screen),
    () => ADVANCED_OPEN_ON_LOAD,
  );
  // What the person did on this page, which wins over what they did before.
  const [choice, setChoice] = useState<boolean | null>(null);
  const open = choice ?? leftOpen;
  const focusOnOpen = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = `${useId()}-mai-multe-filtre`;

  useEffect(() => {
    if (!open || !focusOnOpen.current) return;
    focusOnOpen.current = false;
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
  }, [open]);

  function toggle() {
    const next = !open;
    focusOnOpen.current = next;
    setChoice(next);
    rememberChoice(browserStorage('session'), screen, next);
  }

  const shown = countLabel(count);

  return (
    <div
      className="rounded-input border border-border bg-ground-alt/60"
      data-advanced-filters={screen}
      data-open={open ? 'da' : 'nu'}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={toggle}
        className={cn(
          'flex min-h-11 w-full cursor-pointer items-center justify-between gap-3 rounded-input px-3 py-2.5 text-left text-small font-medium',
          'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground',
        )}
      >
        <span className={cn('inline-flex items-center', ICON_GAP)}>
          <Icon as={iconForAction('filter')} size="sm" tone="muted" />
          {label}
          {shown === null ? null : (
            <Badge kind="count" label={countText}>
              {shown}
            </Badge>
          )}
        </span>
        <Icon
          as={UI_ICONS.expand}
          size="sm"
          tone="strong"
          className={cn('transition-transform motion-reduce:transition-none', open && 'rotate-180')}
        />
      </button>
      <div
        id={panelId}
        ref={panelRef}
        hidden={!open}
        data-advanced-panel=""
        className="flex flex-col gap-4 border-t border-border px-3 py-4"
      >
        {children}
      </div>
      {/* In Tailwind's base layer on purpose: its preflight hides
          `[hidden]` with !important there, and an !important rule in an
          earlier layer beats any unlayered one — the fallback lost to it
          until it joined the same layer, where specificity decides. */}
      <noscript>
        <style>{'@layer base{[data-advanced-panel][hidden]{display:flex!important}}'}</style>
      </noscript>
    </div>
  );
}
