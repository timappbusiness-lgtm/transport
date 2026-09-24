'use client';

import { Suspense, useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { signInLinkFor } from '@/lib/auth/next-path';
import { Badge } from '@/components/ui/badge';
import { countLabel } from '@/lib/badges';
import { Icon } from '@/components/ui/icon';
import { ICON_GAP, iconForRoute, uiIcon } from '@/lib/icons';
import { signOutAction } from '@/app/auth-actions';
import { PublishMenu } from '@/components/app/publish-menu';
import { ROUTES } from '@/config/routes';
import { accountCopy } from '@/content/account';
import { BOARD_SEEN_EVENT } from '@/lib/board-news';
import {
  GROUP_LABELS,
  PUBLIC_NAV,
  activeHref,
  currentPublicHref,
  type BadgedNavItem,
  type NavGroup,
  type PublishMenuSpec,
} from '@/lib/navigation';
import { cn } from '@/lib/utils';
import { KeepingForm } from '@/components/ui/keeping-form';
import { PILL_QUIET, PILL_SOLID } from './header-shell';

export interface HeaderUser {
  name: string;
  /**
   * The bar: what this person actually uses, board first for a carrier,
   * their own requests first for a client. Built by `headerBar` from the
   * same `buildNav` the sidebar reads.
   */
  bar: readonly BadgedNavItem[];
  /**
   * The account menu: everything the bar does not show, in the sidebar's
   * groups, then the public pages and — for staff — /admin. Built by
   * `headerMenu`. The component draws what it is given and decides
   * nothing about who may see what.
   */
  items: readonly BadgedNavItem[];
  /** The role's primary action — „Publică un traseu", „Publică o cerere" — or none. */
  publish: PublishMenuSpec | null;
}

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

/**
 * Whether the board has been seen since the header was drawn.
 *
 * The header stays mounted from page to page, so the count it was drawn
 * with would outlive the visit that made it old news. The board says it
 * was seen (`MarkBoardSeen`), and the badge on „Cereri de transport"
 * drops at once.
 */
function useBoardSeen(): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const onSeen = () => setSeen(true);
    window.addEventListener(BOARD_SEEN_EVENT, onSeen);
    return () => window.removeEventListener(BOARD_SEEN_EVENT, onSeen);
  }, []);
  return seen;
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

  const boardSeen = useBoardSeen();
  const bar: BarLink[] = user
    ? user.bar.map((item) => ({
        href: item.href,
        label: item.label,
        // Seen on this visit: no longer new, whatever the count said.
        badge: boardSeen && item.href === ROUTES.requests ? 0 : item.badge,
      }))
    : PUBLIC_NAV.map((link) => ({ ...link, badge: 0 }));
  const currentHref = user ? activeHref(user.bar, pathname) : currentPublicHref(pathname);

  return (
    <>
      {/* Signed in, the bar is the work; signed out, the shop window. The
          work has longer words, so it moves into the „Meniu" panel a step
          earlier. A driver's one entry fits a phone, and a menu that opens
          onto a single link is a tap for nothing. */}
      <BarNav
        links={bar}
        currentHref={currentHref}
        inline={user ? (bar.length <= 1 ? 'always' : 'xl') : 'lg'}
      />

      {user ? (
        // Shrinks, so the name inside it can give way: `flex-none` here
        // held the whole group at its full width, and with „Publică un
        // traseu" beside the name the bar overflowed at 640px.
        <div className="flex min-w-0 flex-initial items-center gap-1.5">
          {/* The role's one primary action, on every page — the button the
              bar used to spend on „Contul meu", which the name beside it
              already is. A driver publishes nothing and gets no button. */}
          <PublishMenu
            spec={user.publish}
            variant="bar"
            compactLabel={user.publish?.compactLabel}
          />

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
                className="absolute right-0 z-50 mt-2 max-h-[calc(100dvh-5.5rem)] w-60 max-w-[calc(100vw-2rem)] overflow-y-auto overscroll-contain rounded-card border border-border bg-surface text-foreground shadow-float"
              >
                {user.items.map((item, index) => {
                  const current = pathname === item.href;
                  const glyph = iconForRoute(item.href);
                  const heading = sectionHeading(user.items, index);
                  return (
                    <div key={item.href} role="none">
                    {heading !== null ? (
                      <p
                        role="presentation"
                        className="border-t border-border px-4 pb-1 pt-3 font-mono text-label uppercase tracking-[0.12em] text-muted"
                      >
                        {heading}
                      </p>
                    ) : null}
                    <Link
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
                        <Badge
                          kind="count"
                          label={item.href === ROUTES.requests ? accountCopy.nav.fresh : accountCopy.nav.waiting}
                        >
                          {countLabel(item.badge)}
                        </Badge>
                      )}
                    </Link>
                    </div>
                  );
                })}
                <KeepingForm action={signOutAction} className="border-t border-border">
                  <button
                    type="submit"
                    role="menuitem"
                    className="w-full px-4 py-2.5 text-left text-body text-danger hover:bg-ground-alt focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-foreground"
                  >
                    {accountCopy.nav.signOut}
                  </button>
                </KeepingForm>
              </div>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          {/* Visible at every width: off the homepage there is no other way
              into sign-in from the header on a phone. */}
          {/* The query is read in a boundary of its own: on a page drawn
              ahead of time, `useSearchParams` leaves everything up to the
              nearest boundary for the browser to draw, and without this
              one that is the whole header — on every such page. */}
          <Suspense
            fallback={
              <Link href={signInLinkFor(pathname, '')} className={PILL_QUIET}>
                Autentificare
              </Link>
            }
          >
            <SignInLink pathname={pathname} />
          </Suspense>
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

/** „Autentificare", coming back to this page with its query: the step, the filters. */
function SignInLink({ pathname }: { pathname: string }) {
  const search = useSearchParams()?.toString() ?? '';
  return (
    <Link href={signInLinkFor(pathname, search)} className={PILL_QUIET}>
      Autentificare
    </Link>
  );
}

/** One link in the bar, with the number waiting on it (usually none). */
interface BarLink {
  href: string;
  label: string;
  badge: number;
}

/**
 * The heading above an entry in the account menu, when it opens a new
 * section: the sidebar's groups, then „Platformă". The first section —
 * the dashboard and the work — has none; it is what the menu is for.
 */
function sectionHeading(items: readonly BadgedNavItem[], index: number): string | null {
  const item = items[index];
  if (item === undefined || index === 0) return null;
  const previous = items[index - 1];
  if (previous === undefined || previous.group === item.group) return null;
  const work: NavGroup[] = ['principal', 'transport', 'expeditii'];
  // The work can span two groups for a firm that does both; it is one
  // section in a menu this small.
  if (work.includes(item.group) && work.includes(previous.group)) return null;
  return GROUP_LABELS[item.group];
}

/**
 * The bar's links: built by `navigation.ts`, drawn once.
 *
 * Signed out, the five public pages (`PUBLIC_NAV`); signed in, the work
 * of this kind of account (`headerBar`), board first for a carrier.
 *
 * From `inline` up they sit in the bar. Below it they do not fit — the
 * public five need 880px beside the two actions, the signed-in five more
 * than that — and a row that scrolled sideways inside itself used to show
 * „Cereri, Trase" and nothing to say there was more. So below it the same
 * list is a panel under the bar, opened by „Meniu": a word beside the
 * icon, never the icon alone. It closes on a choice, on Escape and on a
 * press outside it.
 */
function BarNav({
  links,
  currentHref,
  inline,
}: {
  links: readonly BarLink[];
  currentHref: string | null;
  inline: 'lg' | 'xl' | 'always';
}) {
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

  // Written out rather than built from `inline`: Tailwind only ships the
  // classes it can read in the source.
  const at =
    inline === 'always'
      ? {
          toggle: '',
          panel:
            'static mt-0 flex max-h-none flex-none flex-row gap-0 overflow-visible rounded-none border-0 bg-transparent p-0 shadow-none',
          link: '',
        }
      : inline === 'lg'
      ? {
          toggle: 'lg:hidden',
          panel:
            'lg:max-h-none lg:overflow-visible lg:static lg:mt-0 lg:flex lg:flex-none lg:flex-row lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none',
          link: 'max-lg:justify-start max-lg:rounded-input max-lg:px-3 max-lg:py-3 max-lg:text-body',
        }
      : {
          toggle: 'xl:hidden',
          panel:
            'xl:max-h-none xl:overflow-visible xl:static xl:mt-0 xl:flex xl:flex-none xl:flex-row xl:gap-0 xl:rounded-none xl:border-0 xl:bg-transparent xl:p-0 xl:shadow-none',
          link: 'max-xl:justify-start max-xl:rounded-input max-xl:px-3 max-xl:py-3 max-xl:text-body xl:px-2.5',
        };

  return (
    <>
      {inline === 'always' ? null : (
        <button
          ref={toggleRef}
          type="button"
          data-nav-toggle
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen((value) => !value)}
          className={cn(PILL_QUIET, 'flex-none gap-1.5 border border-white/30', at.toggle)}
        >
          <Icon as={uiIcon(open ? 'close' : 'menu')} size="sm" />
          Meniu
          {/* Something waiting behind the closed menu is said on it. */}
          {!open && links.some((link) => link.badge > 0) ? (
            <span aria-hidden="true" data-nav-dot className="size-2 rounded-full bg-accent-bright" />
          ) : null}
        </button>
      )}
      <nav
        ref={navRef}
        id={id}
        aria-label="Navigare"
        data-open={open ? 'true' : undefined}
        className={cn(
          // Below the breakpoint: a panel under the bar, shown only when
          // open. Never taller than the screen under the bar: a phone
          // held sideways is 390px high, and a panel cut off at the bottom
          // hid its last links with no way to reach them.
          'absolute inset-x-0 top-full mt-2 hidden max-h-[calc(100dvh-5.5rem)] flex-col gap-0.5 overflow-y-auto overscroll-contain rounded-card border border-white/15 bg-dark-from p-2 shadow-float data-[open=true]:flex',
          // From the breakpoint: the row inside the bar.
          at.panel,
        )}
      >
        {links.map((page) => {
          // The page you are on, in the bright accent with a bar under
          // it: the state is said by `aria-current` and shown by more
          // than colour.
          const current = page.href === currentHref;
          const count = countLabel(page.badge);
          return (
            <Link
              key={page.href}
              href={page.href}
              onClick={() => setOpen(false)}
              aria-current={current ? 'page' : undefined}
              className={cn(
                PILL_QUIET,
                'gap-1.5',
                at.link,
                current &&
                  'text-accent-bright underline decoration-accent-bright decoration-2 underline-offset-[6px] hover:text-accent-bright',
              )}
            >
              {page.label}
              {count === null ? null : (
                // New requests are not waiting on anybody; they are new.
                <Badge
                  kind="count"
                  label={page.href === ROUTES.requests ? accountCopy.nav.fresh : accountCopy.nav.waiting}
                >
                  {count}
                </Badge>
              )}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
