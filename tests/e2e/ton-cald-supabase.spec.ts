import { expect, test } from '@playwright/test';

/**
 * The half of the warmth pass that needs rows: badges on real cards, the
 * key numbers in the accent, and a save that says so in a toast.
 *
 * Skipped unless E2E_SUPABASE=1:
 *
 *   supabase start
 *   E2E_SUPABASE=1 pnpm test:e2e
 *
 * The board checks need at least one published request. The toast check
 * needs a manager of a transport company, passed as E2E_EMAIL and
 * E2E_PASSWORD. Without them these skip rather than fail.
 *
 * NOT YET RUN: this checkout cannot reach a Supabase instance. What each
 * assertion checks about the components is covered without a browser by
 * `tests/unit/badges.test.tsx`, `tests/unit/category-art.test.tsx` and
 * `tests/unit/feedback.test.tsx`.
 */

const ENABLED = process.env.E2E_SUPABASE === '1';
const EMAIL = process.env.E2E_EMAIL ?? '';
const PASSWORD = process.env.E2E_PASSWORD ?? '';
const HAS_ACCOUNT = ENABLED && EMAIL !== '' && PASSWORD !== '';

const ACCENT = 'rgb(21, 97, 109)';

test.describe('a board with rows', () => {
  test.skip(!ENABLED, 'needs E2E_SUPABASE=1');

  for (const [width, height] of [
    [1440, 900],
    [390, 844],
  ] as const) {
    test(`every card has its drawing and its time at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/cereri');
      const cards = page.locator('main article');
      test.skip((await cards.count()) === 0, 'No published request.');

      for (const card of await cards.all()) {
        await expect(card.locator('[data-category-tile]')).toBeVisible();
        await expect(card.locator('[data-badge="time"]')).toHaveCount(1);
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(1);
    });
  }

  test('„Nou" only beside a time inside the last day', async ({ page }) => {
    await page.goto('/cereri');
    const cards = page.locator('main article');
    test.skip((await cards.count()) === 0, 'No published request.');

    for (const card of await cards.all()) {
      const time = (await card.locator('[data-badge="time"]').innerText()).trim();
      const isNew = (await card.locator('[data-badge="new"]').count()) === 1;
      // „ieri" and „acum N zile" are both a day or more.
      if (/ieri|zile|săptămân|lun/.test(time)) expect(isNew, time).toBe(false);
    }
  });

  test('the distance is the accented number', async ({ page }) => {
    await page.goto('/cereri');
    const km = page.locator('main article').getByText(/\d\s?km$/).first();
    test.skip((await km.count()) === 0, 'No request with a distance.');
    await expect(km).toHaveCSS('color', ACCENT);
  });
});

test.describe('a save', () => {
  test.skip(!HAS_ACCOUNT, 'needs E2E_SUPABASE=1 and a carrier account');

  test('says so in a toast, where the person is looking', async ({ page }) => {
    await page.goto('/autentificare');
    await page.getByLabel('E-mail').fill(EMAIL);
    await page.getByLabel('Parolă').fill(PASSWORD);
    await page.getByRole('button', { name: /Intră în cont|Autentificare/ }).click();
    await expect(page).toHaveURL(/\/cont/);

    await page.goto('/cont/firma');
    await page.getByRole('button', { name: 'Salvează' }).click();
    const toast = page.locator('[data-toast="success"]');
    await expect(toast).toBeVisible();
    await expect(toast).toHaveAttribute('role', 'status');
    // And it leaves by itself.
    await expect(toast).toHaveCount(0, { timeout: 8_000 });
  });
});
