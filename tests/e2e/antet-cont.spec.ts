import { expect, test } from '@playwright/test';

/**
 * The header, without a database.
 *
 * What can be checked with nobody signed in is the half that must not have
 * changed: an anonymous visitor still gets Autentificare and Publică o
 * cerere, and nothing about an account leaks into the bar before there is
 * one. The brand still leads to the homepage.
 *
 * The account menu itself needs a seeded session and is in
 * `antet-cont-supabase.spec.ts`; the rules behind it are covered without a
 * browser in `tests/unit/navigation.test.ts` and
 * `tests/unit/header-menu.test.tsx`.
 */

const PUBLIC_PAGES = ['/', '/cereri', '/trasee', '/firme', '/abonamente', '/contact'];

test.describe('the signed-out header is untouched', () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} offers sign-in and publishing`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('link', { name: 'Autentificare' })).toBeVisible();
      // One of the two labels is in the DOM at a time, by width.
      await expect(
        page.getByRole('link', { name: /Publică o cerere|Cerere nouă/ }).first(),
      ).toBeVisible();
    });
  }

  test('and nothing about an account', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Contul meu' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Meniul contului' })).toHaveCount(0);
    await expect(page.getByRole('menu')).toHaveCount(0);
  });

  test('the brand leads to the homepage', async ({ page }) => {
    await page.goto('/cereri');
    const brand = page.locator('header a').first();
    await expect(brand).toHaveAttribute('href', '/');
  });
});

test.describe('the bar fits a phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const path of PUBLIC_PAGES) {
    test(`${path} does not scroll sideways at 390px`, async ({ page }) => {
      await page.goto(path);
      // The nav row scrolls inside itself; the page must not. A header
      // that widens the document is the one bug this whole area keeps
      // producing.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(1);
    });
  }
});

test.describe('the account is still closed to an anonymous visitor', () => {
  test('and brings you back to the page you asked for', async ({ page }) => {
    await page.goto('/cont/oferte');
    await expect(page).toHaveURL(/next=%2Fcont%2Foferte|next=\/cont\/oferte/);
  });

  test('/cont itself needs no next, because it is the default', async ({ page }) => {
    await page.goto('/cont');
    await expect(page).toHaveURL(/autentificare$/);
  });
});
