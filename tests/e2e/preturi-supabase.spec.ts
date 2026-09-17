import { expect, test } from '@playwright/test';

/**
 * The half of the prices page that needs a database with published rates.
 *
 * Skipped unless E2E_SUPABASE=1, so a run without the stack reports
 * honestly instead of going green on a page that showed nothing:
 *
 *   supabase start
 *   E2E_SUPABASE=1 E2E_STAFF_EMAIL=… E2E_STAFF_PASSWORD=… pnpm test:e2e
 *
 * The staff account must be a row in `platform_staff` with role 'admin'.
 * The run publishes the prices through the admin screen and withdraws them
 * again at the end, so it leaves the project as it found it.
 *
 * NOT YET RUN: this checkout cannot reach a Supabase instance — the network
 * policy blocks it and `supabase start` cannot pull its images. Treat every
 * expectation here as unverified until somebody runs it with the stack up.
 * The arithmetic each one asserts is covered without a browser in
 * `tests/unit/pricing.test.ts`.
 */

const ENABLED = process.env.E2E_SUPABASE === '1';
const STAFF_EMAIL = process.env.E2E_STAFF_EMAIL ?? '';
const STAFF_PASSWORD = process.env.E2E_STAFF_PASSWORD ?? '';

test.beforeEach(() => {
  test.skip(!ENABLED, 'Needs a Supabase with the migrations applied: E2E_SUPABASE=1.');
});

async function signInAsStaff(page: import('@playwright/test').Page) {
  test.skip(
    STAFF_EMAIL === '' || STAFF_PASSWORD === '',
    'Needs E2E_STAFF_EMAIL and E2E_STAFF_PASSWORD for a platform_staff account.',
  );
  await page.goto('/autentificare');
  await page.getByLabel('E-mail').fill(STAFF_EMAIL);
  await page.getByLabel('Parolă').fill(STAFF_PASSWORD);
  await page.getByRole('button', { name: /Autentificare|Intră/ }).click();
  await expect(page).not.toHaveURL(/autentificare/);
}

async function setPublished(page: import('@playwright/test').Page, published: boolean) {
  await page.goto('/admin/preturi');
  const button = page.getByRole('button', {
    name: published ? 'Publică prețurile' : 'Retrage prețurile',
  });
  if ((await button.count()) === 0) return; // Already in the state we wanted.
  await button.click();
  await page.getByRole('button', { name: 'Da, continuă' }).click();
}

test.describe('staff set and publish the prices', () => {
  test('a visitor cannot reach the staff screen', async ({ page }) => {
    const response = await page.goto('/admin/preturi');
    expect(response?.status()).toBe(404);
  });

  test('publishing makes the table public, withdrawing hides it again', async ({ page }) => {
    await signInAsStaff(page);

    await setPublished(page, true);
    await expect(page.getByText('Publicat', { exact: false }).first()).toBeVisible();

    await page.goto('/preturi');
    await expect(page.getByRole('tablist', { name: 'Tip de serviciu' })).toBeVisible();
    await expect(page.getByText('Prețurile orientative vor fi publicate')).toHaveCount(0);

    await signInAsStaff(page);
    await setPublished(page, false);
    await page.goto('/preturi');
    await expect(page.getByText('Prețurile orientative vor fi publicate în curând.')).toBeVisible();
  });

  test('a rate change is recorded in the history', async ({ page }) => {
    await signInAsStaff(page);
    await page.goto('/admin/preturi');

    const form = page.locator('form', { hasText: 'SUV' }).first();
    await form.getByLabel('Național (lei/km)').fill('4,05');
    await form.getByRole('button', { name: 'Salvează' }).click();

    await expect(page.getByText('Tarif salvat.')).toBeVisible();
    await page.reload();
    await expect(page.getByText('Tarif modificat · SUV').first()).toBeVisible();
  });
});

test.describe('the published page', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsStaff(page);
    await setPublished(page, true);
  });

  test('lists every vehicle class with a rate per kilometre', async ({ page }) => {
    await page.goto('/preturi');
    for (const name of ['Motocicletă', 'Hatchback', 'Sedan', 'SUV', 'Autoutilitară']) {
      await expect(page.getByText(name).first()).toBeVisible();
    }
    await expect(page.getByText(/lei\/km/).first()).toBeVisible();
    await expect(page.getByText(/€\/km/).first()).toBeVisible();
  });

  test('Expres raises the figures the table shows', async ({ page, viewport }) => {
    test.skip((viewport?.width ?? 0) < 640, 'The table is a stack of cards on a phone.');
    await page.goto('/preturi');

    const cell = page.locator('tbody tr').first().locator('td').nth(1);
    const standard = await cell.innerText();
    await page.getByRole('tab', { name: 'Expres' }).click();
    const express = await cell.innerText();

    const asNumber = (text: string) => Number(text.replace(/[^\d,]/g, '').replace(',', '.'));
    expect(asNumber(express)).toBeGreaterThan(asNumber(standard));
  });

  test('the toggle is a tablist and moves with the arrow keys', async ({ page }) => {
    await page.goto('/preturi');
    const tabs = page.getByRole('tab');
    await expect(tabs).toHaveCount(2);
    await tabs.first().click();
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
  });

  test('calculates München to Cluj-Napoca for a non-running SUV, Expres', async ({ page }) => {
    await page.goto('/preturi');
    await page.getByLabel('De unde').selectOption('München|DE');
    await page.getByLabel('Unde').selectOption('Cluj-Napoca|RO');
    await page.getByLabel('Clasă vehicul').selectOption('suv');
    await page.getByRole('radio', { name: 'Nu' }).check();
    await page.getByRole('radio', { name: 'Expres' }).check();

    // A range in euro, because the route crosses a border.
    await expect(page.getByText(/\d[\d.]*–\d[\d.]*\s*€/)).toBeVisible();
    await expect(page.getByText(/km estimați pe șosea/)).toBeVisible();
    await expect(page.getByText('Internațional').first()).toBeVisible();
  });

  test('carries the calculation into the request form', async ({ page }) => {
    await page.goto('/preturi');
    await page.getByLabel('De unde').selectOption('München|DE');
    await page.getByLabel('Unde').selectOption('Cluj-Napoca|RO');
    await page.getByLabel('Clasă vehicul').selectOption('suv');
    await page.getByRole('radio', { name: 'Nu' }).check();

    await page.getByRole('link', { name: 'Publică o cerere cu aceste date' }).click();
    await expect(page).toHaveURL(/plecare=M%C3%BCnchen%7CDE/);
    await expect(page).toHaveURL(/porneste=nu/);
    await expect(page.getByText('Datele din calculator')).toBeVisible();
  });

  test('becomes a card per class on a phone', async ({ page, viewport }) => {
    test.skip((viewport?.width ?? 0) > 640, 'The card stack is the phone rendering.');
    await page.goto('/preturi');
    // The table is hidden below the small breakpoint; the cards carry it.
    await expect(page.locator('table')).toBeHidden();
    await expect(page.getByText('Minimum pe cursă').first()).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test.afterAll(async ({ browser }) => {
    if (!ENABLED || STAFF_EMAIL === '') return;
    const page = await browser.newPage();
    await signInAsStaff(page);
    await setPublished(page, false);
    await page.close();
  });
});
