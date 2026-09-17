'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { signOutAction } from '@/app/auth-actions';
import { ROUTES } from '@/config/routes';
import { accountCopy } from '@/content/account';
import { cn } from '@/lib/utils';

/** Anchors that only mean anything on the homepage. */
const SECTIONS = [
  { href: '#cum-functioneaza', label: 'Cum funcționează' },
  { href: '#transportatori', label: 'Transportatori' },
  { href: '#verificare', label: 'Verificare' },
  { href: '#tarife', label: 'Tarife' },
] as const;

export interface HeaderUser {
  name: string;
  hasCompany: boolean;
  isStaff: boolean;
}

/** Pill button sized for the floating bar, in its on-dark colours. */
// `whitespace-nowrap` is load-bearing: without it a label wraps to two or
// three lines on a phone and the pill grows taller than the bar it sits in.
const PILL_SOLID =
  'inline-flex items-center justify-center whitespace-nowrap rounded-pill bg-white px-3 py-1.5 text-[0.8125rem] font-medium text-foreground transition-[background-color] duration-150 hover:bg-[#eef1f2] sm:px-4';
const PILL_QUIET =
  'inline-flex items-center justify-center whitespace-nowrap rounded-pill px-2 py-1.5 text-[0.8125rem] text-white/85 transition-[color,background-color] duration-150 hover:bg-white/12 hover:text-white sm:px-3';

export function HeaderNav({ user }: { user: HeaderUser | null }) {
  const pathname = usePathname();
  const onHome = pathname === ROUTES.home;
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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
      if (event.key === 'Escape') setMenuOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const accountLinks = [
    { href: ROUTES.account, label: accountCopy.nav.dashboard },
    { href: ROUTES.accountProfile, label: accountCopy.nav.profile },
    ...(user?.hasCompany ? [{ href: ROUTES.accountCompany, label: accountCopy.nav.company }] : []),
    ...(user?.isStaff ? [{ href: ROUTES.admin, label: accountCopy.nav.admin }] : []),
  ];

  return (
    <>
      {onHome ? (
        <nav aria-label="Secțiuni" className="hidden gap-1 min-[900px]:flex">
          {SECTIONS.map((section) => (
            <a key={section.href} href={section.href} className={PILL_QUIET}>
              {section.label}
            </a>
          ))}
        </nav>
      ) : null}

      {user ? (
        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            className={cn(PILL_QUIET, 'gap-2 border border-white/30')}
          >
            <span
              aria-hidden="true"
              className="flex size-5 items-center justify-center rounded-full bg-white text-[0.625rem] font-medium text-foreground"
            >
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="hidden max-w-[9rem] truncate sm:inline">{user.name}</span>
            <ChevronDown size={13} aria-hidden="true" />
          </button>

          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-card border border-border bg-surface text-foreground shadow-[0_24px_48px_-24px_rgba(28,38,43,.5)]"
            >
              {accountLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="block px-4 py-2.5 text-sm hover:bg-ground-alt"
                >
                  {link.label}
                </Link>
              ))}
              <form action={signOutAction} className="border-t border-border">
                <button
                  type="submit"
                  role="menuitem"
                  className="w-full px-4 py-2.5 text-left text-sm text-danger hover:bg-ground-alt"
                >
                  {accountCopy.nav.signOut}
                </button>
              </form>
            </div>
          ) : null}
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
