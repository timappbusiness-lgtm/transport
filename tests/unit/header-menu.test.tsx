import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ROUTES } from '@/config/routes';
import {
  FOOTER_NAV,
  NO_NAV_COUNTS,
  PUBLIC_NAV,
  headerBar,
  headerMenu,
  publishMenu,
  type NavContext,
  type NavCounts,
} from '@/lib/navigation';

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

// The header reads the query too, so „Autentificare" comes back to the same place.
vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/app/auth-actions', () => ({ signOutAction: async () => {} }));

let mockPathname = '/';

const { HeaderNav, badgeLabel, brandHref, initialOf } = await import('@/components/layout/header-menu');

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
  user: { name: string; ctx?: NavContext; counts?: NavCounts } | null,
  pathname = '/',
): string {
  mockPathname = pathname;
  if (user === null) return renderToStaticMarkup(<HeaderNav user={null} />);
  const ctx = user.ctx ?? context();
  const counts = user.counts ?? NO_NAV_COUNTS;
  return renderToStaticMarkup(
    <HeaderNav
      user={{
        name: user.name,
        bar: headerBar(ctx, counts),
        items: headerMenu(ctx, counts),
        publish: publishMenu(ctx),
      }}
    />,
  );
}

/** The labels of the bar's links, in order. */
function barLabels(html: string): string[] {
  const nav = html.slice(html.indexOf('<nav'), html.indexOf('</nav>'));
  return [...nav.matchAll(/<a [^>]*>([^<]+)(?:<[^/][\s\S]*?)?<\/a>/g)].map((m) => m[1]!.trim());
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

describe('the primary action beside the name', () => {
  it('is „Publică un traseu" for a carrier, a menu rather than a link', () => {
    const html = render({ name: 'Ana' }, '/cereri');
    const button = html.match(/<button[^>]*data-publish[^>]*>[\s\S]*?<\/button>/)?.[0] ?? '';
    expect(button).toContain('Publică un traseu');
    expect(button).toContain('Traseu nou');
    expect(button).toContain('aria-haspopup="menu"');
    // The name is the way into the account; the button is the work.
    expect(html).not.toMatch(/>Contul meu</);
  });

  it('is „Publică o cerere" for a forwarder and a private client, and goes straight there', () => {
    for (const ctx of [
      context({ companyType: 'expeditie' }),
      context({ accountType: 'individual', companyType: null, role: null }),
    ]) {
      const html = render({ name: 'Ana', ctx }, '/cereri');
      const link = html.match(/<a[^>]*data-publish[^>]*>[\s\S]*?<\/a>/)?.[0] ?? '';
      expect(link).toContain(`href="${ROUTES.newRequest}"`);
      expect(link).toContain('Publică o cerere');
      expect(link).toContain('Cerere nouă');
    }
  });

  it('is absent for a driver, who publishes nothing', () => {
    const html = render({ name: 'Ana', ctx: context({ role: 'driver' }) }, ROUTES.accountTransports);
    expect(html).not.toContain('data-publish');
    expect(html).not.toContain('Publică');
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

  it('numbers only the things that wait on somebody', () => {
    const counts = { messages: 3, offers: 2 };
    const ctx = context({ companyType: 'expeditie' });
    const items = [...headerBar(ctx, counts), ...headerMenu(ctx, counts)];
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
    const items = headerBar(context({ companyType: 'expeditie' }), { messages: 120, offers: 0 });
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

describe('the bar, signed in', () => {
  it('is the work of that kind of account, not the public five', () => {
    expect(barLabels(render({ name: 'Ana' }, '/cereri'))).toEqual([
      'Cereri de transport',
      'Traseele mele',
      'Oferte trimise',
      'Transporturi',
      'Mesaje',
    ]);
    expect(
      barLabels(render({ name: 'Ana', ctx: context({ companyType: 'expeditie' }) }, '/cereri')),
    ).toEqual(['Cursele mele', 'Oferte primite', 'Trasee disponibile', 'Transporturi', 'Mesaje']);
    expect(
      barLabels(
        render({ name: 'Ana', ctx: context({ accountType: 'individual', companyType: null, role: null }) }),
      ),
    ).toEqual(['Cererile mele', 'Oferte primite', 'Mesaje', 'Trasee disponibile']);
    expect(barLabels(render({ name: 'Ana', ctx: context({ role: 'driver' }) }))).toEqual([
      'Transporturile mele',
    ]);
  });

  it('carries the new requests on the board, and nothing at zero', () => {
    const counts = { messages: 0, offers: 0, newRequests: 12 };
    const html = render({ name: 'Ana', counts }, ROUTES.account);
    const nav = html.slice(html.indexOf('<nav'), html.indexOf('</nav>'));
    expect(nav).toMatch(/Cereri de transport<span[^>]*>[\s\S]*?9\+/);
    // Said on the closed „Meniu" too, where the bar folds away on a phone.
    expect(html).toContain('data-nav-dot');

    const none = render({ name: 'Ana', counts: { ...counts, newRequests: 0 } }, ROUTES.account);
    expect(none).not.toContain('data-nav-dot');
    expect(none.slice(none.indexOf('<nav'), none.indexOf('</nav>'))).not.toContain('9+');
  });

  it('marks the board as current on the board, and a detail page under it', () => {
    const html = render({ name: 'Ana' }, '/cereri/abc');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="page"[^>]*>Cereri de transport/);
  });

  it('folds into „Meniu" a step earlier than the public bar, because its words are longer', () => {
    const html = render({ name: 'Ana' }, '/');
    const toggle = html.match(/<button[^>]*data-nav-toggle[^>]*>/)?.[0] ?? '';
    expect(toggle).toContain('xl:hidden');
    expect(html.match(/<nav [^>]*>/)?.[0]).toContain('xl:flex');
  });
});

describe('the public bar', () => {

  it('is five links, each once — built in one place', () => {
    expect(PUBLIC_NAV.map((l) => l.label)).toEqual([
      'Cereri',
      'Trasee',
      'Firme',
      'Abonamente',
      'Cum funcționează',
    ]);
    expect(new Set(PUBLIC_NAV.map((l) => l.href)).size).toBe(PUBLIC_NAV.length);
    expect(new Set(PUBLIC_NAV.map((l) => l.label)).size).toBe(PUBLIC_NAV.length);
  });

  it('the footer has no duplicate either', () => {
    expect(new Set(FOOTER_NAV.map((l) => l.href)).size).toBe(FOOTER_NAV.length);
    expect(new Set(FOOTER_NAV.map((l) => l.label)).size).toBe(FOOTER_NAV.length);
  });

  it.each(['/', '/cereri', '/intrebari-frecvente', '/cont'])(
    'on %s says „Cum funcționează" exactly once and nothing else twice',
    (pathname) => {
      const html = render(null, pathname);
      expect(barLabels(html)).toEqual(PUBLIC_NAV.map((l) => l.label));
      expect(html.match(/Cum funcționează/g)).toHaveLength(1);
      // Signed in, it is in the account menu, which is not in the
      // document until it is opened; the bar never repeats it.
      const signedIn = render({ name: 'Ana' }, pathname);
      expect(signedIn).not.toContain('Cum funcționează');
      expect(new Set(barLabels(signedIn)).size).toBe(barLabels(signedIn).length);
    },
  );

  it('carries no homepage anchors any more', () => {
    const html = render(null, '/');
    expect(html).not.toContain('href="#');
  });

  it('marks the page you are on, and only that one', () => {
    const html = render(null, '/cereri/abc');
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-current="page"[^>]*>Cereri</);
  });

  it('is one list: a row from lg, a panel behind „Meniu" below it', () => {
    // Below lg the five links do not fit, and a row that scrolls inside
    // itself showed „Cereri, Trase" with nothing to say there was more.
    for (const user of [null] as const) {
      const html = render(user, '/');
      expect(html.match(/<nav /g)).toHaveLength(1);
      const toggle = html.match(/<button[^>]*data-nav-toggle[^>]*>[\s\S]*?<\/button>/)?.[0] ?? '';
      expect(toggle).toContain('aria-expanded="false"');
      expect(toggle).toContain('lg:hidden');
      // A word beside the icon, never the icon alone.
      expect(toggle).toMatch(/>Meniu<\/button>$/);
      const controls = toggle.match(/aria-controls="([^"]+)"/)?.[1];
      const nav = html.match(/<nav [^>]*>/)?.[0] ?? '';
      expect(nav).toContain(`id="${controls}"`);
      // Closed below lg, always shown from lg.
      expect(nav).toMatch(/class="[^"]*\bhidden\b/);
      expect(nav).toContain('lg:flex');
      expect(nav).not.toContain('data-open');
      expect(nav).not.toContain('overflow-x-auto');
    }
  });
});

describe('a long name', () => {
  const LONG = 'Constantin-Alexandru Popescu-Ionescu';

  it('is cut with an ellipsis at a width that still reads as a name, and whole in its title', () => {
    const html = render({ name: LONG });
    const name = html.match(/<span data-account-name="true" class="([^"]+)">([^<]+)<\/span>/);
    expect(name?.[2]).toBe(LONG);
    expect(name?.[1]).toMatch(/\bsm:truncate\b/);
    expect(name?.[1]).toMatch(/\bsm:min-w-0\b/);
    expect(name?.[1]).toMatch(/sm:max-w-\[[\d.]+rem\]/);
    expect(html).toContain(`title="${LONG}"`);
  });

  it('never takes the avatar or the chevron with it', () => {
    const html = render({ name: LONG });
    expect(html).toMatch(/data-account-avatar="true" class="[^"]*\bflex-none\b/);
    expect(html).toMatch(/data-account-chevron="true" class="[^"]*\bflex-none\b/);
    // The pill and the link can shrink, so the name is the part that gives.
    expect(html).toMatch(/data-account-pill="true" class="[^"]*\bmin-w-0\b/);
  });

  it('has an initial for the avatar, even when it does not start with a letter', () => {
    expect(initialOf(LONG)).toBe('C');
    expect(initialOf('ștefan')).toBe('Ș');
    expect(initialOf('  ana')).toBe('A');
    expect(initialOf('123@firma.ro')).toBe('F');
    expect(initialOf('42')).toBe('·');
  });
});
