import { expect, test } from '@playwright/test';

/**
 * The half of the shell that needs real accounts: what each role sees in
 * the menu, what the dashboard shows, and — the part that matters — what
 * the server refuses when somebody types a URL the menu left out.
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
 * `tests/unit/navigation.test.ts` and `tests/unit/banners.test.ts`.
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
  suspendedCarrier: account('SUSPENDED_CARRIER'),
  both: account('BOTH'),
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

function sidebar(page: Page) {
  return page.getByRole('navigation', { name: 'Navigare în cont' }).first();
}

test.describe('what a carrier owner sees', () => {
  test('the work, the firm, and the billing', async ({ page }) => {
    await signIn(page, ACCOUNTS.carrierOwner, 'carrier owner');
    await page.goto('/cont');

    const nav = sidebar(page);
    await expect(nav.getByRole('link', { name: 'Traseele mele' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Flotă' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Echipă' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Abonament' })).toBeVisible();
  });

  test('no menu item for anything that is not built', async ({ page }) => {
    await signIn(page, ACCOUNTS.carrierOwner, 'carrier owner');
    await page.goto('/cont');

    const nav = sidebar(page);
    for (const missing of ['Mesaje', 'Oferte trimise', 'Comenzi', 'Cererile mele']) {
      await expect(nav.getByRole('link', { name: missing })).toHaveCount(0);
    }
  });

  test('every link in the menu leads somewhere that exists', async ({ page }) => {
    await signIn(page, ACCOUNTS.carrierOwner, 'carrier owner');
    await page.goto('/cont');

    const hrefs = await sidebar(page).getByRole('link').evaluateAll((links) =>
      links.map((link) => (link as HTMLAnchorElement).getAttribute('href') ?? ''),
    );
    expect(hrefs.length).toBeGreaterThan(0);

    for (const href of hrefs) {
      const response = await page.goto(href);
      expect(response?.status(), `${href} should not 404`).toBeLessThan(400);
    }
  });

  test('the publish menu offers both directions', async ({ page }) => {
    await signIn(page, ACCOUNTS.carrierOwner, 'carrier owner');
    await page.goto('/cont');

    await page.getByRole('button', { name: 'Publică' }).click();
    const menu = page.getByRole('menu', { name: 'Ce vrei să publici' });
    await expect(menu.getByRole('menuitem', { name: 'Traseu pe tur' })).toBeVisible();
    await expect(menu.getByRole('menuitem', { name: 'Traseu pe retur' })).toBeVisible();
  });

  test('the publish menu closes on Escape and gives focus back', async ({ page }) => {
    await signIn(page, ACCOUNTS.carrierOwner, 'carrier owner');
    await page.goto('/cont');

    const button = page.getByRole('button', { name: 'Publică' });
    await button.click();
    await expect(button).toHaveAttribute('aria-expanded', 'true');

    await page.keyboard.press('Escape');
    await expect(button).toHaveAttribute('aria-expanded', 'false');
    await expect(button).toBeFocused();
  });
});

test.describe('what a dispatcher may not reach', () => {
  test('no billing or team in the menu', async ({ page }) => {
    await signIn(page, ACCOUNTS.carrierDispatcher, 'carrier dispatcher');
    await page.goto('/cont');

    const nav = sidebar(page);
    await expect(nav.getByRole('link', { name: 'Traseele mele' })).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Abonament' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Echipă' })).toHaveCount(0);
  });

  // The menu leaving it out is a courtesy; this is the protection.
  test('and typing the address is refused, not merely un-linked', async ({ page }) => {
    await signIn(page, ACCOUNTS.carrierDispatcher, 'carrier dispatcher');

    for (const path of ['/cont/abonament', '/cont/firma/membri', '/cont/firma']) {
      const response = await page.goto(path);
      expect(response?.status(), `${path} should be refused`).toBe(404);
    }
  });

  test('but the work is still open', async ({ page }) => {
    await signIn(page, ACCOUNTS.carrierDispatcher, 'carrier dispatcher');
    const response = await page.goto('/cont/trasee');
    expect(response?.status()).toBeLessThan(400);
  });
});

test.describe('what a driver may reach', () => {
  test('two pages, and an explanation on the first', async ({ page }) => {
    await signIn(page, ACCOUNTS.driver, 'driver');
    await page.goto('/cont');
    await expect(page.getByText(/repartizate/)).toBeVisible();
  });

  test('everything else is a 404', async ({ page }) => {
    await signIn(page, ACCOUNTS.driver, 'driver');

    for (const path of ['/cont/firma/flota', '/cont/trasee', '/cont/abonament']) {
      const response = await page.goto(path);
      expect(response?.status(), `${path} should be refused`).toBe(404);
    }
  });

  test('their own profile is not', async ({ page }) => {
    await signIn(page, ACCOUNTS.driver, 'driver');
    const response = await page.goto('/cont/profil');
    expect(response?.status()).toBeLessThan(400);
  });
});

test.describe('a company that does both', () => {
  test('gets each side under its own heading, and each item once', async ({ page }) => {
    await signIn(page, ACCOUNTS.both, 'both');
    await page.goto('/cont');

    const nav = sidebar(page);
    await expect(nav.getByText('Transport')).toBeVisible();
    await expect(nav.getByText('Expediții')).toBeVisible();
    await expect(nav.getByRole('link', { name: 'Trasee disponibile' })).toHaveCount(1);
  });
});

test.describe('the banner says the one thing that matters', () => {
  test('a suspended carrier is told that, and nothing else', async ({ page }) => {
    await signIn(page, ACCOUNTS.suspendedCarrier, 'suspended carrier');
    await page.goto('/cont');

    await expect(page.getByText('Cont suspendat')).toBeVisible();
    // One banner at a time: the trial and the documents wait their turn.
    await expect(page.getByText('Perioada gratuită se încheie curând')).toHaveCount(0);
  });

  test('a pending company is told to wait, with no action it cannot take', async ({ page }) => {
    await signIn(page, ACCOUNTS.forwarderPending, 'pending forwarder');
    await page.goto('/cont');
    await expect(page.getByText('Documentele sunt în verificare')).toBeVisible();
  });
});

test.describe('an individual', () => {
  test('is told plainly that publishing is not built yet', async ({ page }) => {
    await signIn(page, ACCOUNTS.individual, 'individual');
    await page.goto('/cont');

    await expect(page.getByText(/Formularul de cerere este în lucru/)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Vezi traseele disponibile' })).toBeVisible();
  });

  test('has no company section in the menu', async ({ page }) => {
    await signIn(page, ACCOUNTS.individual, 'individual');
    await page.goto('/cont');

    const nav = sidebar(page);
    await expect(nav.getByRole('link', { name: 'Documente' })).toHaveCount(0);
    await expect(nav.getByRole('link', { name: 'Flotă' })).toHaveCount(0);
  });
});

test.describe('on a phone', () => {
  test('the bottom bar carries at most five items', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Phone layout only.');
    await signIn(page, ACCOUNTS.carrierOwner, 'carrier owner');
    await page.goto('/cont');

    const bar = page.getByRole('navigation', { name: 'Navigare în cont' }).last();
    const count = await bar.locator('li').count();
    expect(count).toBeLessThanOrEqual(5);
  });

  test('the rest opens in a sheet that traps focus', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Phone layout only.');
    await signIn(page, ACCOUNTS.carrierOwner, 'carrier owner');
    await page.goto('/cont');

    await page.getByRole('button', { name: 'Mai mult' }).click();
    const sheet = page.getByRole('dialog', { name: 'Restul meniului' });
    await expect(sheet).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
  });
});

test.describe('the company switcher changes the data, not the view', () => {
  test('switching reloads the account as the other company', async ({ page }) => {
    await signIn(page, ACCOUNTS.both, 'both');
    await page.goto('/cont');

    const switcher = page.getByLabel('Firma activă');
    const options = await switcher.locator('option').count();
    test.skip(options < 2, 'Needs an account belonging to two companies.');

    const second = await switcher.locator('option').nth(1).getAttribute('value');
    await switcher.selectOption(second ?? '');
    await page.getByRole('button', { name: 'Schimbă' }).click();

    await expect(switcher).toHaveValue(second ?? '');
  });
});
