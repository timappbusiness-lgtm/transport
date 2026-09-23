import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * A tab, a box filter, a segmented choice — the pill a person clicks to
 * change what the list below it shows.
 *
 * There were four versions of this: filled ink on the ratings and
 * messages boxes, filled accent on offers and plans, white on the account
 * sub-navigation, and each with its own padding. A dispatcher moving from
 * „Oferte" to „Mesaje" saw the same control change colour for no reason.
 * The active one is the accent now, everywhere, because the active tab is
 * one of the places the accent is for.
 *
 * `aria-current` carries the state; the fill only shows it.
 */
export function tabClasses(active: boolean, size: 'sm' | 'md' = 'md'): string {
  return cn(
    'inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill border',
    'transition-[background-color,border-color,color,transform] duration-(--duration-quick) ease-(--ease-soft)',
    'active:scale-[0.98] motion-reduce:active:scale-100',
    size === 'sm' ? 'px-3 py-1 text-small' : 'px-3.5 py-1.5 text-sm',
    active
      ? 'border-accent bg-accent font-medium text-on-accent'
      : 'border-border-strong text-muted hover:border-accent-border hover:bg-accent-subtle hover:text-foreground',
  );
}

export function TabLink({
  href,
  active,
  size = 'md',
  children,
  className,
}: {
  href: string;
  active: boolean;
  size?: 'sm' | 'md';
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(tabClasses(active, size), className)}
    >
      {children}
    </Link>
  );
}
