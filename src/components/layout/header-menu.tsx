'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronDown, Menu, X } from 'lucide-react';
import { signOutAction } from '@/app/auth-actions';
import { buttonClasses } from '@/components/ui/button';
import { ROUTES } from '@/config/routes';
import { accountCopy } from '@/content/account';
import { cn } from '@/lib/utils';

/** Anchors that only mean anything on the homepage. */
const SECTIONS = [
  { href: '#cereri', label: 'Cereri' },
  { href: '#preturi', label: 'Prețuri' },
  { href: '#platforme', label: 'Platforme' },
  { href: '#transportatori', label: 'Transportatori' },
] as const;

export interface HeaderUser {
  name: string;
  hasCompany: boolean;
  isStaff: boolean;
}

export function HeaderNav({ user }: { user: HeaderUser | null }) {
  const pathname = usePathname();
  const onHome = pathname === ROUTES.home;
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // A dropdown that does not close when you click elsewhere or press Escape
  // is a dropdown people learn to distrust.
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
    ...(user?.hasCompany
      ? [{ href: ROUTES.accountCompany, label: accountCopy.nav.company }]
      : []),
    ...(user?.isStaff ? [{ href: ROUTES.admin, label: accountCopy.nav.admin }] : []),
  ];

  return (
    <>
      {onHome ? (
        <nav aria-label="Secțiuni" className="hidden gap-6 text-sm text-muted min-[900px]:flex">
          {SECTIONS.map((section) => (
            <a key={section.href} href={section.href} className="hover:text-foreground">
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
            className="flex items-center gap-2 rounded-[8px] border border-border px-2.5 py-1.5 text-sm hover:border-muted"
          >
            <span
              aria-hidden="true"
              className="flex size-6 items-center justify-center rounded-full bg-accent font-display text-[0.6875rem] font-bold text-background"
            >
              {user.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="hidden max-w-[10rem] truncate sm:inline">{user.name}</span>
            <ChevronDown size={14} aria-hidden="true" />
          </button>

          {menuOpen ? (
            <div
              role="menu"
              className="absolute right-0 z-50 mt-2 w-56 overflow-hidden rounded-[8px] border border-border bg-surface shadow-lg"
            >
              {accountLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="block px-4 py-2.5 text-sm hover:bg-white/5"
                >
                  {link.label}
                </Link>
              ))}
              <form action={signOutAction} className="border-t border-border">
                <button
                  type="submit"
                  role="menuitem"
                  className="w-full px-4 py-2.5 text-left text-sm text-danger hover:bg-white/5"
                >
                  {accountCopy.nav.signOut}
                </button>
              </form>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Visible at every width: off the homepage there is no other way
              into sign-in from the header on a phone. */}
          <Link
            href={ROUTES.signIn}
            className={cn(buttonClasses('ghost', 'sm'), 'px-2 text-[0.8125rem] sm:px-3.5')}
          >
            Autentificare
          </Link>
          <Link
            href={ROUTES.newRequest}
            className={cn(buttonClasses('primary', 'sm'), 'px-2.5 text-[0.8125rem] sm:px-3.5')}
          >
            Publică o cerere
          </Link>
        </div>
      )}

      {onHome ? (
        <button
          type="button"
          onClick={() => setMobileOpen((open) => !open)}
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? 'Închide meniul' : 'Deschide meniul'}
          className="rounded-[8px] border border-border p-1.5 min-[900px]:hidden"
        >
          {mobileOpen ? <Menu size={16} /> : <X size={16} className="rotate-45" />}
        </button>
      ) : null}

      {onHome && mobileOpen ? (
        <div className="absolute inset-x-0 top-[60px] z-40 border-b border-border bg-background px-4 py-3 min-[900px]:hidden">
          <nav aria-label="Secțiuni" className="flex flex-col">
            {SECTIONS.map((section) => (
              <a
                key={section.href}
                href={section.href}
                onClick={() => setMobileOpen(false)}
                className="py-2 text-sm text-muted"
              >
                {section.label}
              </a>
            ))}
            {user ? null : (
              <Link href={ROUTES.signIn} className="py-2 text-sm text-muted">
                Autentificare
              </Link>
            )}
          </nav>
        </div>
      ) : null}
    </>
  );
}
