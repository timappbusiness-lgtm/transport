import { expect, test } from '@playwright/test';
import { ROUTES } from '../../src/config/routes';

/**
 * Date personale, as far as it goes without a database.
 *
 * The half that needs rows — an archive actually built, a deletion
 * scheduled, a grace period held — is in
 * `date-personale-supabase.spec.ts`. What is here is the half that would
 * be worst to get wrong and needs nothing: who may open each page, and
 * whether the link from the e-mail works for somebody with no session.
 */

test.describe('who may open these pages', () => {
  test('the settings screen sends a visitor to sign in', async ({ page }) => {
    await page.goto(ROUTES.accountPersonalData);
    await expect(page).toHaveURL(/autentificare/);
  });

  test('and brings them back afterwards', async ({ page }) => {
    await page.goto(ROUTES.accountPersonalData);
    expect(page.url()).toContain(encodeURIComponent(ROUTES.accountPersonalData));
  });

  test('the staff screen is a 404, not a 403', async ({ page }) => {
    // A 403 would confirm that a page listing who is leaving exists.
    const response = await page.goto(ROUTES.adminDeletions);
    expect(response?.status()).toBe(404);
  });

  test('the download route refuses an archive to a visitor', async ({ page }) => {
    await page.goto(`${ROUTES.accountPersonalData}/descarca/not-a-uuid?t=nope`);
    await expect(page).toHaveURL(/autentificare/);
  });
});

test.describe('the cancel link from the e-mail', () => {
  /**
   * Public on purpose. The account it rescues is one we held a fortnight
   * ago, so asking it to sign in first is asking somebody to unlock a
   * door with the key inside.
   */
  test('opens without a session', async ({ page }) => {
    const response = await page.goto(`${ROUTES.cancelDeletion}?t=${crypto.randomUUID()}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ștergerea contului');
  });

  test('says so plainly when the token is not one of ours', async ({ page }) => {
    await page.goto(`${ROUTES.cancelDeletion}?t=${crypto.randomUUID()}`);
    await expect(page.getByText(/Linkul nu mai este valabil/)).toBeVisible();
  });

  test('survives a token that is not even a uuid', async ({ page }) => {
    const response = await page.goto(`${ROUTES.cancelDeletion}?t=%3Cscript%3E`);
    expect(response?.status()).toBe(200);
    await expect(page.getByText(/Linkul nu mai este valabil/)).toBeVisible();
  });

  test('is kept out of the index', async ({ page }) => {
    await page.goto(`${ROUTES.cancelDeletion}?t=${crypto.randomUUID()}`);
    const robots = page.locator('meta[name="robots"]');
    await expect(robots).toHaveAttribute('content', /noindex/);
  });

  test('offers a way back in and a way home', async ({ page }) => {
    await page.goto(`${ROUTES.cancelDeletion}?t=${crypto.randomUUID()}`);
    // Scoped to the page's own content: the site header carries both of
    // these links too, and a strict locator that matched them would pass
    // even if the page itself offered nothing.
    const main = page.getByRole('main');
    await expect(main.locator(`a[href="${ROUTES.signIn}"]`)).toBeVisible();
    await expect(main.locator(`a[href="${ROUTES.home}"]`)).toBeVisible();
  });
});

test.describe('the routes are wired', () => {
  test('the staff screen is in the admin navigation exactly once', async () => {
    const { readFileSync } = await import('node:fs');
    const layout = readFileSync('src/app/admin/layout.tsx', 'utf8');
    expect((layout.match(/adminDeletions/g) ?? []).length).toBe(1);
  });

  test('nothing links a signed-out visitor to the staff screen', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(`a[href="${ROUTES.adminDeletions}"]`)).toHaveCount(0);
  });
});
