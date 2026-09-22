import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ROUTES } from '@/config/routes';
import { NO_NAV_COUNTS, headerMenu, type NavContext } from '@/lib/navigation';

/**
 * The header's account area, rendered to markup without a browser.
 *
 * What is worth pinning here is the half a person meets before any
 * JavaScript arrives: that the name is a link to /cont rather than a
 * button, that the menu button says what it is, and that a signed-out
 * header is untouched. The keyboard behaviour needs a real browser and is
 * in `tests/e2e/antet-cont.spec.ts`.
 *
 * `usePathname` is stubbed because this renders outside a router. The
 * server action behind Ieșire is stubbed for the same reason: importing
 * it would pull in the Supabase client.
 */

vi.mock('next/navigation', () => ({ usePathname: () => mockPathname }));
vi.mock('@/app/auth-actions', () => ({ signOutAction: async () => {} }));

let mockPathname = '/';

const { HeaderNav, badgeLabel, brandHref } = await import('@/components/layout/header-menu');

function context(over: Partial<NavContext> = {}): NavContext {
  return {
    accountType: 'company',
    companyType: 'transport',
    role: 'owner',
    isStaff: false,
    ...over,
  };
}

function render(
  user: { name: string; ctx?: NavContext; counts?: { messages: number; offers: number } } | null,
  pathname = '/',
): string {
  mockPathname = pathname;
  if (user === null) return renderToStaticMarkup(<HeaderNav user={null} />);
  return renderToStaticMarkup(
    <HeaderNav
      user={{
        name: user.name,
        items: headerMenu(user.ctx ?? context(), user.counts ?? NO_NAV_COUNTS),
      }}
    />,
  );
}

describe('the name in the bar', () => {
  it('is a link to the dashboard, not a button', () => {
    const html = render({ name: 'Mădălina Ionescu' });
    // The whole point of the change: a signed-in person on a public page
    // could see their name and had no way in.
    expect(html).toContain(`href="${ROUTES.account}"`);
    expect(html).toContain('Mădălina Ionescu');
  });

  it('carries the initial for somebody who cannot read the name at that width', () => {
    // The name itself is hidden below `sm`, so the avatar is all there is.
    expect(render({ name: 'mădălina ionescu' })).toContain('>M<');
  });

  it('says aria-expanded before anything is opened', () => {
    const html = render({ name: 'Ana' });
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-haspopup="menu"');
  });

  it('gives the chevron a name of its own', () => {
    // It is an icon-only control; without this it is announced as
    // „button" and nothing else.
    expect(render({ name: 'Ana' })).toContain('aria-label="Meniul contului"');
  });
});

describe('the way back in from a public page', () => {
  it('is a visible button, not only the menu', () => {
    const html = render({ name: 'Ana' }, '/cereri');
    expect(html).toContain('Contul meu');
  });

  it('is not repeated inside the account, where it points at where you are', () => {
    const inside = render({ name: 'Ana' }, ROUTES.account);
    const outside = render({ name: 'Ana' }, '/cereri');
    const count = (html: string) => html.split('Contul meu').length - 1;
    expect(count(inside)).toBeLessThan(count(outside));
  });

  it('leaves a signed-out header exactly as it was', () => {
    const html = render(null, '/');
    expect(html).toContain('Autentificare');
    expect(html).toContain('Publică o cerere');
    expect(html).toContain('Cerere nouă');
    expect(html).not.toContain('Contul meu');
    expect(html).not.toContain('Ieșire');
  });
});

describe('where the brand leads', () => {
  it('to the dashboard from inside the account', () => {
    expect(brandHref(true, ROUTES.account)).toBe(ROUTES.account);
    expect(brandHref(true, '/cont/oferte')).toBe(ROUTES.account);
    expect(brandHref(true, '/admin/firme')).toBe(ROUTES.account);
  });

  it('to the homepage from a public page, signed in or not', () => {
    expect(brandHref(true, '/cereri')).toBe(ROUTES.home);
    expect(brandHref(true, '/')).toBe(ROUTES.home);
    expect(brandHref(false, ROUTES.account)).toBe(ROUTES.home);
  });

  it('does not treat a path that merely starts the same as the account', () => {
    expect(brandHref(true, '/contact')).toBe(ROUTES.home);
  });
});

describe('what the menu is given to draw', () => {
  it('puts Contul meu first for every account type', () => {
    for (const ctx of [
      context(),
      context({ accountType: 'individual', companyType: null, role: null }),
      context({ role: 'driver' }),
      context({ companyType: 'expeditie' }),
    ]) {
      const items = headerMenu(ctx);
      expect(items[0]?.href).toBe(ROUTES.account);
      expect(items[0]?.label).toBe('Contul meu');
    }
  });

  it('numbers only the two things that wait on somebody', () => {
    const items = headerMenu(context({ companyType: 'expeditie' }), { messages: 3, offers: 2 });
    const badge = (href: string) => items.find((item) => item.href === href)?.badge;
    expect(badge(ROUTES.accountMessages)).toBe(3);
    expect(badge(ROUTES.accountOffers)).toBe(2);
    expect(badge(ROUTES.accountRequests)).toBe(0);
    expect(badge(ROUTES.account)).toBe(0);
  });

  it('caps the badge at 9+, so a big number cannot widen the row', () => {
    expect(badgeLabel(1)).toBe('1');
    expect(badgeLabel(9)).toBe('9');
    expect(badgeLabel(10)).toBe('9+');
    expect(badgeLabel(120)).toBe('9+');
    // The count itself is untouched; only what is drawn is capped.
    const items = headerMenu(context({ companyType: 'expeditie' }), { messages: 120, offers: 0 });
    expect(items.find((item) => item.href === ROUTES.accountMessages)?.badge).toBe(120);
  });

  it('keeps the dropdown out of the document until it is opened', () => {
    // Nothing in it is reachable by Tab from the page behind it, and
    // Ieșire in particular is not one key away from a stray press.
    const html = render({ name: 'Ana' });
    expect(html).not.toContain('role="menu"');
    expect(html).not.toContain('Ieșire');
  });
});
