import { expect, test } from '@playwright/test';

/**
 * The landing pages, without a database.
 *
 * Which is exactly the state they ship in: the whole starting set lands
 * unpublished, so every one of these addresses is a 404 until somebody
 * publishes from /admin/pagini. That makes the negative half the half
 * worth checking hardest — an unpublished page must be absent everywhere,
 * not merely unlinked.
 *
 * The half that needs rows is in `transport-auto-supabase.spec.ts`.
 */

test.describe('an unpublished page does not exist', () => {
  for (const path of [
    '/transport-auto/germania-romania',
    '/transport-auto/bucuresti-cluj-napoca',
    '/transport-auto/judet/cluj',
    '/transport-auto/motocicleta',
  ]) {
    test(`${path} is a 404 until it is published`, async ({ page }) => {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
    });
  }

  test('a slug that never existed is a 404 too', async ({ page }) => {
    const response = await page.goto('/transport-auto/marte-romania');
    expect(response?.status()).toBe(404);
  });

  test('a county reached through the wrong route is a 404', async ({ page }) => {
    // Two addresses for one page is what canonical tags exist to clean up
    // after; not creating the second one is better.
    const response = await page.goto('/transport-auto/cluj');
    expect(response?.status()).toBe(404);
  });
});

test.describe('the hub', () => {
  test('says so rather than showing four empty headings', async ({ page }) => {
    await page.goto('/transport-auto');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Transport auto');
    await expect(page.getByText('Nu este publicată încă nicio pagină.')).toBeVisible();
  });

  test('claims nothing it cannot show', async ({ page }) => {
    await page.goto('/transport-auto');
    for (const heading of ['Din străinătate în România', 'Județe']) {
      await expect(page.getByRole('heading', { name: heading })).toHaveCount(0);
    }
  });

  test('works on a phone without sideways scrolling', async ({ page }) => {
    await page.goto('/transport-auto');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });
});

test.describe('nothing links to pages that are not published', () => {
  test('the footer does not offer the hub yet', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Transport auto pe rute' })).toHaveCount(0);
  });

  test('/preturi shows no route list', async ({ page }) => {
    await page.goto('/preturi');
    await expect(
      page.getByRole('heading', { name: 'Prețuri pe rutele cele mai cerute' }),
    ).toHaveCount(0);
  });

  test('/firme shows no county list', async ({ page }) => {
    await page.goto('/firme');
    await expect(page.getByRole('heading', { name: 'Transportatori pe județe' })).toHaveCount(0);
  });
});

test.describe('robots and the sitemap while the site is not indexable', () => {
  test('robots.txt disallows everything', async ({ page }) => {
    const response = await page.goto('/robots.txt');
    expect(response?.status()).toBe(200);
    const body = await response!.text();
    expect(body).toMatch(/Disallow:\s*\/\s*$/m);
    // A sitemap line on a noindex site invites a crawl of pages we have
    // just asked the crawler to ignore.
    expect(body).not.toMatch(/Sitemap:/i);
  });

  test('the sitemap is empty rather than absent', async ({ page }) => {
    const response = await page.goto('/sitemap.xml');
    expect(response?.status()).toBe(200);
    const body = await response!.text();
    expect(body).not.toContain('/transport-auto/');
  });
});

test.describe('the admin screen is staff-only', () => {
  test('/admin/pagini is a 404 for somebody who is not staff', async ({ page }) => {
    const response = await page.goto('/admin/pagini');
    expect(response?.status()).toBe(404);
  });

  test('so is a draft preview', async ({ page }) => {
    // The preview renders an unpublished page, so it has to be at least as
    // closed as the list it is reached from.
    const response = await page.goto('/admin/pagini/germania-romania/previzualizare');
    expect(response?.status()).toBe(404);
  });
});
