import { expect, test } from '@playwright/test';

/**
 * The shell, without a database.
 *
 * What can be checked with nobody signed in is the boundary itself: every
 * page in the account redirects to sign-in, and none of them leaks a title
 * or a nav item on the way. That is worth pinning precisely because the
 * shell now decides what a role may open — a regression here is a
 * dispatcher reading the invoices.
 *
 * The half that needs seeded accounts is in `cont-shell-supabase.spec.ts`.
 */

const ACCOUNT_PAGES = [
  '/cont',
  '/cont/profil',
  '/cont/firma',
  '/cont/firma/documente',
  '/cont/firma/flota',
  '/cont/firma/membri',
  '/cont/abonament',
  '/cont/trasee',
  '/cont/invitatii',
];

test.describe('the account is closed to an anonymous visitor', () => {
  for (const path of ACCOUNT_PAGES) {
    test(`${path} sends you to sign in`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/autentificare/);
    });
  }

  test('and brings you back where you were going', async ({ page }) => {
    await page.goto('/cont/abonament');
    await expect(page).toHaveURL(/next=%2Fcont%2Fabonament|next=\/cont\/abonament/);
  });

  test('no nav item leaks before the redirect', async ({ page }) => {
    await page.goto('/cont/firma/membri');
    await expect(page.getByRole('navigation', { name: 'Navigare în cont' })).toHaveCount(0);
  });
});
