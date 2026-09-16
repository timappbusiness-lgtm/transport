import { expect, test } from '@playwright/test';

test.describe('phase 0 smoke', () => {
  test('the app boots and serves the holding page', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toContainText('Coridor');
  });

  test('the document is in Romanian', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ro');
  });

  test('the page does not scroll horizontally', async ({ page }) => {
    await page.goto('/');
    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1,
    );
    expect(overflows).toBe(false);
  });

  test('focus rings use the accent colour, not the border colour', async ({
    page,
  }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      const s = getComputedStyle(el);
      return { color: s.outlineColor, width: s.outlineWidth };
    });
    // #f2ad4b — the accent. The border #1f2e36 is 1.35:1 here and would be
    // invisible as a focus indicator.
    expect(outline?.color).toBe('rgb(242, 173, 75)');
    expect(outline?.width).not.toBe('0px');
  });

  test('the design reference is served', async ({ page }) => {
    const response = await page.goto('/demo');
    expect(response?.status()).toBe(200);
    await expect(page.locator('#corridor')).toBeAttached();
  });
});
