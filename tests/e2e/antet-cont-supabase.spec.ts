import { expect, test } from '@playwright/test';

/**
 * The header's account area, with real sessions.
 *
 * What each role is offered, that the name leads to the dashboard, that the
 * menu works from a keyboard, and that one tap opens it on a phone.
 *
 * Skipped unless E2E_SUPABASE=1:
 *
 *   supabase start
 *   E2E_SUPABASE=1 pnpm test:e2e
 *
 * Each role needs a seeded account, passed as a pair of environment
 * variables. A role with no credentials skips rather than fails.
 *
 * NOT YET RUN: this checkout cannot reach a Supabase instance — the network
 * policy blocks it and `supabase start` cannot pull its images. Treat every
 * expectation here as unverified until somebody runs it with the stack up.
 * The rules behind them are covered without a browser in
 * `tests/unit/navigation.test.ts` and `tests/unit/header-menu.test.tsx`.
 */

const ENABLED = process.env.E2E_SUPABASE === '1';

type Page = import('@playwright/test').Page;

interface Account {
  email: string;
  password: string;
}

function account(prefix: string): Account | null {
  const email = process.env[`E2E_${prefix}_EMAIL`] ?? '';
  const password = process.env[`E2E_${prefix}_PASSWORD`] ?? '';
  return email && password ? { email, password } : null;
}

/** Seeded accounts. Never real ones: this suite runs against staging too. */
const ACCOUNTS = {
  individual: account('INDIVIDUAL'),
  carrierOwner: account('CARRIER_OWNER'),
  carrierDispatcher: account('CARRIER_DISPATCHER'),
  driver: account('DRIVER'),
  forwarderPending: account('FORWARDER_PENDING'),
  staff: account('STAFF'),
};

test.beforeEach(() => {
  test.skip(!ENABLED, 'Needs a Supabase with the migrations applied: E2E_SUPABASE=1.');
});

async function signIn(page: Page, who: Account | null, label: string) {
  test.skip(who === null, `Needs a seeded ${label} account.`);
  if (!who) return;

  await page.goto('/autentificare');
  await page.getByLabel('E-mail').fill(who.email);
  await page.getByLabel('Parolă').fill(who.password);
  await page.getByRole('button', { name: /Autentificare|Intră/ }).click();
  await expect(page).not.toHaveURL(/autentificare/);
}

/** The account menu in the floating bar, once it is open. */
function accountMenu(page: Page) {
  return page.getByRole('menu', { name: 'Meniul contului' });
}

function chevron(page: Page) {
  return page.getByRole('button', { name: 'Meniul contului' });
}

/** The bar's entries, without their badges, in the order read. */
async function barLabels(page: Page): Promise<string[]> {
  return page
    .getByRole('navigation', { name: 'Navigare' })
    .locator('a')
    .evaluateAll((links) => links.map((link) => link.firstChild?.textContent?.trim() ?? ''));
}

/** What each role finds in the bar, the button beside it, and where sign-in leaves it. */
const EXPECTED: Record<
  string,
  { who: keyof typeof ACCOUNTS; bar: string[]; publish: string | null; menu: string[]; lands: RegExp }
> = {
  'an individual': {
    who: 'individual',
    bar: ['Cererile mele', 'Oferte primite', 'Mesaje', 'Trasee disponibile'],
    publish: 'Publică o cerere',
    menu: ['Contul meu', 'Cereri de transport', 'Firme', 'Abonamente', 'Cum funcționează'],
    lands: /\/cont$/,
  },
  'a carrier owner': {
    who: 'carrierOwner',
    bar: ['Cereri de transport', 'Traseele mele', 'Oferte trimise', 'Transporturi', 'Mesaje'],
    publish: 'Publică un traseu',
    menu: ['Contul meu', 'Publică o cerere', 'Trasee disponibile', 'Firme', 'Abonamente', 'Cum funcționează'],
    // The board once the firm's file is done; its next step until then.
    lands: /\/cereri$|\/cont\/firma\/(creare|flota|documente)/,
  },
  'a forwarder': {
    who: 'forwarderPending',
    bar: ['Cursele mele', 'Oferte primite', 'Trasee disponibile', 'Transporturi', 'Mesaje'],
    publish: 'Publică o cerere',
    menu: ['Contul meu', 'Cereri de transport', 'Firme', 'Abonamente', 'Cum funcționează'],
    lands: /\/cont$/,
  },
  'a driver': {
    who: 'driver',
    bar: ['Transporturile mele'],
    publish: null,
    menu: ['Contul meu', 'Firme', 'Abonamente', 'Cum funcționează'],
    lands: /\/cont$/,
  },
};

test.describe('what each role finds in the header', () => {
  for (const [label, { who, bar, publish, menu }] of Object.entries(EXPECTED)) {
    test(`${label}: the bar, the button and the menu`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await signIn(page, ACCOUNTS[who], label);
      await page.goto('/firme');

      expect(await barLabels(page)).toEqual(bar);

      const button = page.locator('header [data-publish]');
      if (publish === null) await expect(button).toHaveCount(0);
      else await expect(button).toContainText(publish);

      await chevron(page).click();
      const items = await accountMenu(page).getByRole('menuitem').allInnerTexts();
      const labels = items.map((text) => text.split('\n')[0]?.trim());
      for (const item of menu) expect(labels, item).toContain(item);
      expect(labels.at(-1)).toBe('Ieșire');
      // Between the bar and the menu, every page once.
      expect(labels.filter((item) => bar.includes(item ?? ''))).toEqual([]);
    });
  }

  test('a dispatcher gets the work without the billing', async ({ page }) => {
    await signIn(page, ACCOUNTS.carrierDispatcher, 'dispatcher');
    await page.goto('/cereri');

    await chevron(page).click();
    const menu = accountMenu(page);
    await expect(menu.getByRole('menuitem', { name: 'Traseele mele' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Abonament' })).toHaveCount(0);
    await expect(menu.getByRole('menuitem', { name: 'Echipă' })).toHaveCount(0);
  });

  test('staff get a way across to /admin, and a carrier does not', async ({ page }) => {
    await signIn(page, ACCOUNTS.staff, 'staff');
    await page.goto('/cereri');
    await chevron(page).click();
    await expect(accountMenu(page).getByRole('menuitem', { name: 'Administrare' })).toBeVisible();
  });

  test('no carrier sees Administrare', async ({ page }) => {
    await signIn(page, ACCOUNTS.carrierOwner, 'carrier owner');
    await page.goto('/cereri');
    await chevron(page).click();
    await expect(accountMenu(page).getByRole('menuitem', { name: 'Administrare' })).toHaveCount(0);
  });

  test('every item in the menu leads somewhere that exists', async ({ page }) => {
    await signIn(page, ACCOUNTS.carrierOwner, 'carrier owner');
    await page.goto('/cereri');
    await chevron(page).click();

    const hrefs = await accountMenu(page)
      .getByRole('menuitem')
      .evaluateAll((items) =>
        items
          .filter((item): item is HTMLAnchorElement => item instanceof HTMLAnchorElement)
          .map((item) => item.getAttribute('href') ?? ''),
      );
    expect(hrefs.length).toBeGreaterThan(0);

    for (const href of hrefs) {
      const response = await page.goto(href);
      expect(response?.status(), `${href} should not 404`).toBeLessThan(400);
    }
  });
});

test.describe('the way into the account', () => {
  test('the name is a link to the dashboard', async ({ page }) => {
    await signIn(page, ACCOUNTS.carrierOwner, 'carrier owner');
    await page.goto('/cereri');

    // The bug this replaces: the name was a button and the only way in
    // was a menu that did not name the dashboard.
    await page.locator('header a[aria-haspopup="menu"]').click();
    await expect(page).toHaveURL(/\/cont$/);
  });

  test('and so is the first item of its menu', async ({ page }) => {
    await signIn(page, ACCOUNTS.carrierOwner, 'carrier owner');
    await page.goto('/cereri');

    // The button beside the name is the role's work now — „Publică un
    // traseu" — and „Contul meu" opens the menu instead.
    await chevron(page).click();
    await accountMenu(page).getByRole('menuitem', { name: 'Contul meu' }).click();
    await expect(page).toHaveURL(/\/cont$/);
  });

  test('the brand leads to the dashboard from inside the account', async ({ page }) => {
    await signIn(page, ACCOUNTS.carrierOwner, 'carrier owner');
    await page.goto('/cont/trasee');

    const brand = page.locator('header a').first();
    await expect(brand).toHaveAttribute('href', '/cont');
  });

  test('and back to the homepage from a public page', async ({ page }) => {
    await signIn(page, ACCOUNTS.carrierOwner, 'carrier owner');
    await page.goto('/cereri');

    const brand = page.locator('header a').first();
    await expect(brand).toHaveAttribute('href', '/');
  });
});

test.describe('the menu from a keyboard', () => {
  test('opens with Enter and closes with Escape, giving focus back', async ({ page }) => {
    await signIn(page, ACCOUNTS.carrierOwner, 'carrier owner');
    await page.goto('/cereri');

    const button = chevron(page);
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(accountMenu(page)).toBeVisible();
    await expect(button).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('Escape');
    await expect(accountMenu(page)).toHaveCount(0);
    // Focus goes back to the name, which is the control a screen reader
    // was on when the menu opened.
    await expect(page.locator('header a[aria-haspopup="menu"]')).toBeFocused();
  });

  test('opens with Space too', async ({ page }) => {
    await signIn(page, ACCOUNTS.carrierOwner, 'carrier owner');
    await page.goto('/cereri');

    await chevron(page).focus();
    await page.keyboard.press(' ');
    await expect(accountMenu(page)).toBeVisible();
  });

  test('ArrowDown opens it with the first item focused', async ({ page }) => {
    await signIn(page, ACCOUNTS.carrierOwner, 'carrier owner');
    await page.goto('/cereri');

    await chevron(page).focus();
    await page.keyboard.press('ArrowDown');
    await expect(accountMenu(page).getByRole('menuitem').first()).toBeFocused();
  });

  test('arrows walk the items and wrap at both ends', async ({ page }) => {
    await signIn(page, ACCOUNTS.carrierOwner, 'carrier owner');
    await page.goto('/cereri');

    await chevron(page).focus();
    await page.keyboard.press('ArrowDown');
    const items = accountMenu(page).getByRole('menuitem');

    await page.keyboard.press('ArrowDown');
    await expect(items.nth(1)).toBeFocused();

    // Up from the second is the first; up again wraps to the last.
    await page.keyboard.press('ArrowUp');
    await expect(items.first()).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(items.last()).toBeFocused();
  });

  test('Home and End jump to the ends', async ({ page }) => {
    await signIn(page, ACCOUNTS.carrierOwner, 'carrier owner');
    await page.goto('/cereri');

    await chevron(page).focus();
    await page.keyboard.press('ArrowDown');
    const items = accountMenu(page).getByRole('menuitem');

    await page.keyboard.press('End');
    await expect(items.last()).toBeFocused();
    await page.keyboard.press('Home');
    await expect(items.first()).toBeFocused();
  });

  test('marks the page you are on', async ({ page }) => {
    await signIn(page, ACCOUNTS.carrierOwner, 'carrier owner');
    await page.goto('/cont');

    await chevron(page).click();
    await expect(
      accountMenu(page).getByRole('menuitem', { name: 'Contul meu' }),
    ).toHaveAttribute('aria-current', 'page');
  });
});

test.describe('on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('one tap opens the menu rather than navigating', async ({ page }) => {
    await signIn(page, ACCOUNTS.carrierOwner, 'carrier owner');
    await page.goto('/cereri');

    // There is no hover on a touch screen, so the name has to do both
    // jobs: the tap opens the menu and „Contul meu" is its first item.
    await page.locator('header a[aria-haspopup="menu"]').tap();
    await expect(accountMenu(page)).toBeVisible();
    await expect(page).toHaveURL(/\/cereri/);
  });

  test('and Contul meu is the first item in it', async ({ page }) => {
    await signIn(page, ACCOUNTS.carrierOwner, 'carrier owner');
    await page.goto('/cereri');

    await page.locator('header a[aria-haspopup="menu"]').tap();
    await expect(accountMenu(page).getByRole('menuitem').first()).toHaveText(/Contul meu/);

    await accountMenu(page).getByRole('menuitem').first().tap();
    await expect(page).toHaveURL(/\/cont$/);
  });

  test('the bar does not scroll sideways at 390px', async ({ page }) => {
    await signIn(page, ACCOUNTS.carrierOwner, 'carrier owner');

    for (const path of ['/', '/cereri', '/cont', '/cont/trasee']) {
      await page.goto(path);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(1);
    }
  });
});

test.describe('the badges', () => {
  test('carry the same number in the header as in the sidebar', async ({ page }) => {
    await signIn(page, ACCOUNTS.forwarderPending, 'forwarder');
    await page.goto('/cont');

    const sidebar = page.getByRole('navigation', { name: 'Navigare în cont' }).first();
    const inSidebar = await sidebar
      .getByRole('link', { name: /Mesaje/ })
      .innerText()
      .catch(() => '');

    // Mesaje is in the bar for every role now, not in the menu.
    const inBar = await page
      .getByRole('navigation', { name: 'Navigare' })
      .getByRole('link', { name: /Mesaje/ })
      .innerText()
      .catch(() => '');

    // Both read „Mesaje" plus the same count, or neither carries one.
    const digits = (text: string) => text.replace(/\D+/g, '');
    expect(digits(inBar)).toBe(digits(inSidebar));
  });
});

test.describe('where sign-in leaves you', () => {
  for (const [label, { who, lands }] of Object.entries(EXPECTED)) {
    test(`${label}: never the marketing homepage`, async ({ page }) => {
      await signIn(page, ACCOUNTS[who], label);
      await expect(page).toHaveURL(lands);
    });
  }

  test('a carrier on the board opens on its own view', async ({ page }) => {
    await signIn(page, ACCOUNTS.carrierOwner, 'carrier owner');
    test.skip(!/\/cereri$/.test(page.url()), 'The seeded carrier has an unfinished file.');
    const view = page.getByRole('navigation', { name: 'Ce cereri vezi' });
    await expect(view.getByRole('link', { name: 'Potrivite cu firma mea' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await view.getByRole('link', { name: 'Toate cererile' }).click();
    await expect(page).toHaveURL(/doar=toate/);
  });

  test('or on the page you were asked to sign in for', async ({ page }) => {
    const who = ACCOUNTS.carrierOwner;
    test.skip(who === null, 'Needs a seeded carrier owner account.');
    if (!who) return;

    // Asked for a protected page while signed out, sent to sign-in, and
    // back to the page afterwards — not to the dashboard, and never to
    // the public homepage.
    await page.goto('/cont/trasee');
    await expect(page).toHaveURL(/autentificare/);

    await page.getByLabel('E-mail').fill(who.email);
    await page.getByLabel('Parolă').fill(who.password);
    await page.getByRole('button', { name: /Autentificare|Intră/ }).click();
    await expect(page).toHaveURL(/\/cont\/trasee$/);
  });
});

test.describe('what a driver is refused', () => {
  const REFUSED = [
    '/cont/firma/flota',
    '/cont/firma/documente',
    '/cont/trasee',
    '/cont/cereri',
    '/cont/alerte',
  ];

  for (const path of REFUSED) {
    test(`${path} is not theirs`, async ({ page }) => {
      await signIn(page, ACCOUNTS.driver, 'driver');
      // The guard used to allow all of these: `/cont` sat in a list matched
      // as prefixes, so it matched every page in the account area.
      const response = await page.goto(path);
      expect(response?.status(), `${path} should be refused`).toBe(404);
    });
  }

  test('but their own pages open', async ({ page }) => {
    await signIn(page, ACCOUNTS.driver, 'driver');

    for (const path of ['/cont', '/cont/profil', '/cont/transporturi', '/cont/mesaje']) {
      const response = await page.goto(path);
      expect(response?.status(), `${path} should open`).toBeLessThan(400);
    }
  });
});
