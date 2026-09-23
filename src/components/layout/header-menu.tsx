'use client';

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/icon';
import { ICON_GAP, iconForRoute, uiIcon } from '@/lib/icons';
import { signOutAction } from '@/app/auth-actions';
import { ROUTES } from '@/config/routes';
import { accountCopy } from '@/content/account';
import type { BadgedNavItem } from '@/lib/navigation';
import { cn } from '@/lib/utils';

/** Anchors that only mean anything on the homepage. */
const SECTIONS = [
  { href: '#cum-functioneaza', label: 'Cum funcționează' },
  { href: '#transportatori', label: 'Transportatori' },
  { href: '#siguranta', label: 'Siguranță' },
] as const;

/**
 * Real pages, so they belong in the bar on every route rather than only
 * where an anchor happens to resolve. Prețuri used to be the homepage
 * `#tarife` anchor; it is a page now, and a link that leaves the homepage
 * has to work from the other pages too.
 */
/**
 * The public bar.
 *
 * The two boards come first, because they are the product: a carrier who
 * lands on the homepage and cannot find the requests has no reason to
 * come back, and until 20260920 there was no link to `/cereri` anywhere
 * on an empty platform — the only one sat inside a block that is hidden
 * below the activity threshold.
 *
 * Prețuri is not here. The page exists and is reachable by link, but
 * `price_settings.is_published` is false and a visitor who clicks a menu
 * item to be told there is nothing to see has learned not to trust the
 * menu. It goes back the moment the team publishes the table — see
 * docs/configurare-externa.md.
 */
const PAGES = [
  { href: ROUTES.requests, label: 'Cereri' },
  { href: ROUTES.routes, label: 'Trasee' },
  { href: ROUTES.companies, label: 'Firme' },
  { href: ROUTES.plans, label: 'Abonamente' },
  // The fifth and last: somewhere a first-time visitor can find out what
  // this is before deciding whether to sign up. Four product pages and
  // no explanation is a menu that assumes everybody already knows.
  { href: ROUTES.faq, label: 'Cum funcționează' },
] as const;

export interface HeaderUser {
  name: string;
  /**
   * The menu itself, built by `headerMenu` from the same `buildNav` the
   * sidebar reads. The component draws what it is given and decides
   * nothing about who may see what.
   */
  items: readonly BadgedNavItem[];
}

/** Pill button sized for the floating bar, in its on-dark colours. */
// `whitespace-nowrap` is load-bearing: without it a label wraps to two or
// three lines on a phone and the pill grows taller than the bar it sits in.
const PILL_SOLID =
  'inline-flex items-center justify-center whitespace-nowrap rounded-pill bg-white px-3 py-1.5 text-small font-medium text-foreground transition-[background-color] duration-150 hover:bg-ground-alt sm:px-4';
const PILL_QUIET =
  'inline-flex items-center justify-center whitespace-nowrap rounded-pill px-2 py-1.5 text-small text-white/85 transition-[color,background-color] duration-150 hover:bg-white/12 hover:text-white sm:px-3';

/** Where the account area begins. Inside it, the brand leads to /cont. */
function insideAccount(pathname: string): boolean {
  return (
    pathname === ROUTES.account ||
    pathname.startsWith(`${ROUTES.account}/`) ||
    pathname === ROUTES.admin ||
    pathname.startsWith(`${ROUTES.admin}/`)
  );
}

/**
 * Where the brand in the bar should lead.
 *
 * Signed in and already in the account, it is the dashboard: a logo that
 * throws somebody out to the marketing homepage from inside their own
 * application is the oldest way to lose them. Everywhere else it is the
 * homepage, which is what a logo on a public page means.
 */
export function brandHref(signedIn: boolean, pathname: string): string {
  return signedIn && insideAccount(pathname) ? ROUTES.account : ROUTES.home;
}

/** „3" up to nine, „9+" past it: a three-digit badge pushes the label
 *  out of a 240px menu. */
export function badgeLabel(count: number): string {
  return count > 9 ? '9+' : String(count);
}

/**
 * Whether the thing pointing at this page is a finger.
 *
 * On a touch screen there is no hover, so the name in the bar has to do
 * both jobs: one tap opens the menu rather than navigating. On a mouse or
 * a trackpad the tap is a click, and the click goes to /cont — which is
 * what a name in a header has always meant.
 *
 * `useSyncExternalStore` rather than an effect: the server has no idea
 * what is pointing at the page, so the server snapshot is `false` and the
 * first client paint agrees with the HTML it hydrates. A `matchMedia` read
 * during render would not.
 */
function subscribeToPointer(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => {};
  const query = window.matchMedia('(pointer: coarse)');
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function useCoarsePointer(): boolean {
  return useSyncExternalStore(
    subscribeToPointer,
    () => typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches,
    () => false,
  );
}

export function HeaderNav({ user }: { user: HeaderUser | null }) {
  const pathname = usePathname();
  const onHome = pathname === ROUTES.home;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLAnchorElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const coarsePointer = useCoarsePointer();

  const close = useCallback((returnFocus: boolean) => {
    setMenuOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  // A dropdown that does not close on an outside click or Escape is one
  // people learn to distrust.
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close(true);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen, close]);

  /** Every focusable row in the open menu, in the order they are read. */
  const rows = useCallback(
    () => Array.from(listRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []),
    [],
  );

  // Opening with a key puts focus on the first item; opening with a mouse
  // leaves it where it was, because moving focus under a pointer somebody
  // is already using is how a menu closes itself by accident.
  //
  // A ref rather than state: the menu is not in the DOM until the render
  // that opens it, so the focus has to wait for an effect — and „should
  // the next open take focus" is an intention passed to that effect, not
  // something the markup depends on. As state it would be a second render
  // for nothing.
  const focusFirst = useRef(false);
  useEffect(() => {
    if (!menuOpen || !focusFirst.current) return;
    focusFirst.current = false;
    rows()[0]?.focus();
  }, [menuOpen, rows]);

  function openWithKeyboard() {
    focusFirst.current = true;
    setMenuOpen(true);
  }

  /** Arrow keys walk the menu; Home and End jump to its ends. */
  function onMenuKeyDown(event: React.KeyboardEvent) {
    const items = rows();
    if (items.length === 0) return;
    const at = items.indexOf(document.activeElement as HTMLElement);

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      // Wraps at both ends: a menu of eight items should not need eight
      // presses to get back to the top.
      const next = at === -1 ? 0 : (at + step + items.length) % items.length;
      items[next]?.focus();
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      items[0]?.focus();
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      items[items.length - 1]?.focus();
    }
  }

  const signedIn = user !== null;
  const showAccountButton = signedIn && !insideAccount(pathname);

  return (
    <>
      {/* Below 900px this used to disappear entirely, which meant a
          visitor on a phone — most of this market — had no way to reach
          either board from the header at all. It stays now and scrolls
          sideways inside itself: the row scrolls, the page does not.
          The in-page anchors drop out first, because on a phone they are
          the least useful of the two kinds and the ones that fit worst. */}
      <nav
        aria-label="Navigare"
        className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden min-[900px]:flex-none"
      >
        {onHome
          ? SECTIONS.map((section) => (
              <a
                key={section.href}
                href={section.href}
                className={cn(PILL_QUIET, 'hidden min-[900px]:inline-flex')}
              >
                {section.label}
              </a>
            ))
          : null}
        {PAGES.map((page) => {
          // The page you are on, in the accent's dark step and with a bar
          // under it: the state is said by `aria-current` and shown by
          // more than colour.
          const current = pathname === page.href || pathname.startsWith(`${page.href}/`);
          return (
            <Link
              key={page.href}
              href={page.href}
              aria-current={current ? 'page' : undefined}
              className={cn(
                PILL_QUIET,
                'whitespace-nowrap',
                current &&
                  'text-accent-on-dark underline decoration-accent-on-dark decoration-2 underline-offset-4 hover:text-accent-on-dark',
              )}
            >
              {page.label}
            </Link>
          );
        })}
      </nav>

      {user ? (
        <div className="flex items-center gap-1.5">
          {/* The one visible way back in from a public page. Hidden on a
              phone, where the bar has no room for it and the menu's first
              item says the same thing. */}
          {showAccountButton ? (
            <Link href={ROUTES.account} className={cn(PILL_SOLID, 'hidden sm:inline-flex')}>
              {accountCopy.nav.dashboard}
            </Link>
          ) : null}

          <div ref={menuRef} className="relative">
            <div className={cn(PILL_QUIET, 'gap-1 border border-white/30 p-0 pr-1 sm:pr-1.5')}>
              {/* The name is a link, so a click goes where a name in a
                  header has always gone. The chevron beside it is the
                  button, so opening the menu is still one press for
                  somebody who wants the menu rather than the page. */}
              <Link
                ref={triggerRef}
                href={ROUTES.account}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                aria-controls={menuOpen ? menuId : undefined}
                onClick={(event) => {
                  if (!coarsePointer) return;
                  // No hover on a touch screen, so the tap has to open the
                  // menu. „Contul meu" is its first item, so the page the
                  // link points at is still one tap away.
                  event.preventDefault();
                  setMenuOpen((open) => !open);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    openWithKeyboard();
                  }
                }}
                className="flex items-center gap-2 rounded-pill py-1.5 pl-2 pr-1 sm:pl-3"
              >
                <span
                  aria-hidden="true"
                  className="flex size-5 flex-none items-center justify-center rounded-full bg-white text-xs font-medium text-foreground"
                >
                  {user.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="hidden max-w-[9rem] truncate sm:inline">{user.name}</span>
              </Link>

              <button
                type="button"
                onClick={() => setMenuOpen((open) => !open)}
                onKeyDown={(event) => {
                  // Enter and Space are the button's own; this adds the
                  // arrow, which is what a menu button is expected to do.
                  if (event.key === 'ArrowDown') {
                    event.preventDefault();
                    openWithKeyboard();
                  }
                }}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
                aria-controls={menuOpen ? menuId : undefined}
                aria-label={accountCopy.nav.menu}
                className="flex size-7 flex-none items-center justify-center rounded-full text-white/85 hover:bg-white/12 hover:text-white"
              >
                <Icon as={uiIcon('expand')} size="sm" />
              </button>
            </div>

            {menuOpen ? (
              <div
                ref={listRef}
                id={menuId}
                role="menu"
                aria-label={accountCopy.nav.menu}
                onKeyDown={onMenuKeyDown}
                className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-card border border-border bg-surface text-foreground shadow-float"
              >
                {user.items.map((item) => {
                  const current = pathname === item.href;
                  const glyph = iconForRoute(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      role="menuitem"
                      aria-current={current ? 'page' : undefined}
                      onClick={() => setMenuOpen(false)}
                      className={cn(
                        'flex items-center justify-between gap-3 px-4 py-2.5 text-sm',
                        'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground',
                        current ? 'bg-accent-subtle font-medium text-accent' : 'hover:bg-ground-alt',
                      )}
                    >
                      <span className={cn('flex min-w-0 items-center', ICON_GAP)}>
                        {glyph ? <Icon as={glyph} size="sm" tone="muted" /> : null}
                        <span className="truncate">{item.label}</span>
                      </span>
                      {item.badge > 0 ? (
                        <span className="inline-flex min-w-5 flex-none items-center justify-center rounded-pill bg-foreground px-1.5 py-0.5 font-mono text-label leading-none text-surface">
                          {badgeLabel(item.badge)}
                          <span className="sr-only"> {accountCopy.nav.waiting}</span>
                        </span>
                      ) : null}
                    </Link>
                  );
                })}
                <form action={signOutAction} className="border-t border-border">
                  <button
                    type="submit"
                    role="menuitem"
                    className="w-full px-4 py-2.5 text-left text-sm text-danger hover:bg-ground-alt focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground"
                  >
                    {accountCopy.nav.signOut}
                  </button>
                </form>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          {/* Visible at every width: off the homepage there is no other way
              into sign-in from the header on a phone. */}
          <Link href={ROUTES.signIn} className={PILL_QUIET}>
            Autentificare
          </Link>
          <Link href={ROUTES.newRequest} className={PILL_SOLID}>
            {/* The full label and the brand and sign-in together need more
                room than a 360px phone has. Only one of the two is in the
                DOM at a time, so the accessible name is never doubled. */}
            <span className="sm:hidden">Cerere nouă</span>
            <span className="hidden sm:inline">Publică o cerere</span>
          </Link>
        </div>
      )}
    </>
  );
}
