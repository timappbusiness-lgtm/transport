import { expect, test } from '@playwright/test';
import { UNBUILT_ROUTES } from '../../src/config/routes';

test.describe('homepage', () => {
  test('serves one h1 and the brand in the header', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toContainText('actele la vedere');
    await expect(page.locator('header')).toContainText('Coridor');
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

  test('the first Tab reaches the skip link', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.locator(':focus')).toHaveText('Sari la conținut');
  });

  test('draws the corridor network', async ({ page }) => {
    await page.goto('/');
    const canvas = page.locator('#corridor');
    await expect(canvas).toBeAttached();
    await expect
      .poll(() => canvas.evaluate((c: HTMLCanvasElement) => c.width))
      .toBeGreaterThan(1);
  });

  test('every internal link resolves', async ({ page, request }) => {
    await page.goto('/');
    const hrefs = await page
      .locator('a[href^="/"]')
      .evaluateAll((as) => [...new Set(as.map((a) => a.getAttribute('href')!))]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      const res = await request.get(href);
      expect(res.status(), href).toBe(200);
    }
  });

  test('every in-page anchor has a target', async ({ page }) => {
    await page.goto('/');
    const missing = await page.locator('a[href^="#"]').evaluateAll((as) =>
      as
        .map((a) => a.getAttribute('href')!.slice(1))
        .filter((id) => !document.getElementById(id)),
    );
    expect(missing).toEqual([]);
  });
});

test.describe('unbuilt routes', () => {
  for (const route of UNBUILT_ROUTES) {
    test(`${route} serves a placeholder`, async ({ page }) => {
      const res = await page.goto(route);
      expect(res?.status()).toBe(200);
      await expect(page.getByText('Pagină în lucru')).toBeVisible();
    });
  }

  test('the design reference is still served', async ({ page }) => {
    const res = await page.goto('/demo');
    expect(res?.status()).toBe(200);
  });
});
