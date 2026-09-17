import { expect, test } from '@playwright/test';

/**
 * The review queue, from outside.
 *
 * Without a database there is nothing in the queue and no staff session to
 * open it with, so what runs everywhere is the part that matters most: the
 * screen is not reachable, and it does not announce itself to somebody who
 * has no business there.
 */

test.describe('the review queue is staff-only', () => {
  test('a visitor gets a 404, not a 403', async ({ page }) => {
    // A 403 confirms the route exists and that there is something behind it.
    const response = await page.goto('/admin/documente');
    expect(response?.status()).toBe(404);
  });

  test('the staff area as a whole is closed', async ({ page }) => {
    const response = await page.goto('/admin');
    expect(response?.status()).toBe(404);
  });

  test('nothing links a signed-out visitor to it', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
  });
});
