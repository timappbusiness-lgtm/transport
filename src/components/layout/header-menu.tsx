'use client';

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { countLabel } from '@/lib/badges';
import { Icon } from '@/components/ui/icon';
import { ICON_GAP, iconForRoute, uiIcon } from '@/lib/icons';
import { signOutAction } from '@/app/auth-actions';
import { ROUTES } from '@/config/routes';
import { accountCopy } from '@/content/account';
import { PUBLIC_NAV, currentPublicHref, type BadgedNavItem } from '@/lib/navigation';
import { cn } from '@/lib/utils';

export interface HeaderUser {
  name: string;
  /**
   * The menu itself, built by `headerMenu` from the same `buildNav` the
   * sidebar reads. The component draws what it is given and decides
   * nothing about who may see what.
   */
  items: readonly BadgedNavItem[];
}

/**
 * The bar's one filled pill — „Publică o cerere", or „Contul meu" — in the
 * bright accent, because it is the primary action on a dark surface. Dark
 * ink on it is 8.80:1, and the pill against the bar 6.12:1 and ΔE00 55.
 */
// `whitespace-nowrap` is load-bearing: without it a label wraps to two or
// three lines on a phone and the pill grows taller than the bar it sits in.
const PILL_SOLID =
  'inline-flex items-center justify-center whitespace-nowrap rounded-pill bg-accent-bright px-3 py-1.5 text-small font-semibold text-on-accent-bright transition-[background-color,transform] duration-(--duration-quick) hover:bg-accent-bright-hover motion-safe:active:scale-[0.98] sm:px-4';
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

/** „3" up to nine, „9+" past it — `countLabel`, kept under this name
 *  because the header's tests speak it. Zero is the empty string: the
 *  caller never draws a badge for it. */
export function badgeLabel(count: number): string {
  return countLabel(count) ?? '';
}

/**
 * The letter on the avatar. The first letter of the name, upper-cased,
 * and a neutral dot when there is no letter to take — an e-mail address
 * that starts with a digit is still a person.
 */
export function initialOf(name: string): string {
  const letter = name.trim().match(/\p{L}/u)?.[0];
  return letter === undefined ? '·' : letter.toLocaleUpperCase('ro-RO');
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

/** The header's right half, reading the path from the router. */
export function HeaderNav({ user }: { user: HeaderUser | null }) {
  return <HeaderNavView user={user} pathname={usePathname() ?? ROUTES.home} />;
}

/**
 * The same, with the path passed in — so a test can draw the bar for any
 * page and any name without a router, and measure it with the real
 * stylesheet at every width.
 */
export function HeaderNavView({ user, pathname }: { user: HeaderUser | null; pathname: string }) {
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
  const currentHref = currentPublicHref(pathname);

  return (
    <>
      <PublicNav currentHref={currentHref} />

      {user ? (
        <div className="flex min-w-0 flex-none items-center gap-1.5">
          {/* The one visible way back in from a public page. Only where
              there is room for it beside five links and a name: below
              `xl` the name itself is the link to /cont, and the menu's
              first item says the same thing. */}
          {showAccountButton ? (
            <Link href={ROUTES.account} className={cn(PILL_SOLID, 'hidden xl:inline-flex')}>
              {accountCopy.nav.dashboard}
            </Link>
          ) : null}

          <div ref={menuRef} className="relative min-w-0">
            {/* The pill never grows past its content and never pushes the
                bar: the avatar and the chevron are `flex-none`, the name
                is the one part that gives, with an ellipsis at a width
                that still reads as a name, and the full name is its
                `title` and its accessible text. */}
            <div
              data-account-pill
              className={cn(PILL_QUIET, 'min-w-0 max-w-full gap-1 border border-white/30 p-0 pr-1 sm:px-0 sm:pr-1.5')}
            >
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
                title={user.name}
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
                className="flex min-w-0 items-center gap-2 rounded-pill py-1.5 pl-1.5 pr-1 sm:pl-2"
              >
                <span
                  aria-hidden="true"
                  data-account-avatar
                  className="flex size-6 flex-none items-center justify-center rounded-full bg-accent-bright text-small font-semibold text-on-accent-bright"
                >
                  {initialOf(user.name)}
                </span>
                {/* Below `sm` the name is read, not drawn: the bar holds
                    the mark, five links and this pill inside 360px. */}
                <span
                  data-account-name
                  className="sr-only sm:not-sr-only sm:block sm:min-w-0 sm:max-w-[7.5rem] sm:truncate xl:max-w-[11rem]"
                >
                  {user.name}
                </span>
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
                data-account-chevron
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
                        'flex items-center justify-between gap-3 px-4 py-2.5 text-body',
                        'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground',
                        current ? 'bg-accent-subtle font-medium text-accent' : 'hover:bg-ground-alt',
                      )}
                    >
                      <span className={cn('flex min-w-0 items-center', ICON_GAP)}>
                        {glyph ? <Icon as={glyph} size="sm" tone="muted" /> : null}
                        <span className="truncate">{item.label}</span>
                      </span>
                      {countLabel(item.badge) === null ? null : (
                        <Badge kind="count" label={accountCopy.nav.waiting}>
                          {countLabel(item.badge)}
                        </Badge>
                      )}
                    </Link>
                  );
                })}
                <form action={signOutAction} className="border-t border-border">
                  <button
                    type="submit"
                    role="menuitem"
                    className="w-full px-4 py-2.5 text-left text-body text-danger hover:bg-ground-alt focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground"
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

/**
 * The public bar: five links, built once in `PUBLIC_NAV`, drawn once.
 *
 * From `lg` they sit in the bar. Below it they do not fit — measured, the
 * five links need 880px signed out beside the two actions — and the row
 * used to scroll sideways inside itself, which on a phone showed
 * „Cereri, Trase" and nothing to say there was more. So below `lg` the
 * same list is a panel under the bar, opened by „Meniu": a word beside
 * the icon, never the icon alone. It closes on a choice, on Escape and on
 * a press outside it.
 */
function PublicNav({ currentHref }: { currentHref: string | null }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (navRef.current?.contains(target) || toggleRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      toggleRef.current?.focus();
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        ref={toggleRef}
        type="button"
        data-nav-toggle
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className={cn(PILL_QUIET, 'flex-none gap-1.5 border border-white/30 lg:hidden')}
      >
        <Icon as={uiIcon(open ? 'close' : 'menu')} size="sm" />
        Meniu
      </button>
      <nav
        ref={navRef}
        id={id}
        aria-label="Navigare"
        data-open={open ? 'true' : undefined}
        className={cn(
          // Below lg: a panel under the bar, shown only when open.
          'absolute inset-x-0 top-full mt-2 hidden flex-col gap-0.5 rounded-card border border-white/15 bg-dark-from p-2 shadow-float data-[open=true]:flex',
          // From lg: the row inside the bar.
          'lg:static lg:mt-0 lg:flex lg:flex-none lg:flex-row lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none',
        )}
      >
        {PUBLIC_NAV.map((page) => {
          // The page you are on, in the bright accent with a bar under
          // it: the state is said by `aria-current` and shown by more
          // than colour.
          const current = page.href === currentHref;
          return (
            <Link
              key={page.href}
              href={page.href}
              onClick={() => setOpen(false)}
              aria-current={current ? 'page' : undefined}
              className={cn(
                PILL_QUIET,
                'max-lg:justify-start max-lg:rounded-input max-lg:px-3 max-lg:py-3 max-lg:text-body',
                current &&
                  'text-accent-bright underline decoration-accent-bright decoration-2 underline-offset-[6px] hover:text-accent-bright',
              )}
            >
              {page.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
