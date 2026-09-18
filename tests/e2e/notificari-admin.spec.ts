import { expect, test } from '@playwright/test';
import { ROUTES } from '../../src/config/routes';

/**
 * The queue screen, as far as it can be checked without a database.
 *
 * The half that needs rows — the counts, the retry button, the job health
 * table with real runs in it — is in `notificari-admin-supabase.spec.ts`.
 * What is here is the half that matters most anyway: **staff only**, and
 * a 404 rather than a 403 for everyone else.
 *
 * A 403 confirms the route exists and that there is something behind it
 * worth finding. On a screen that lists every notification the platform
 * has ever queued, including e-mail addresses, that confirmation is
 * itself the leak.
 */

test.describe('the notification queue is staff-only', () => {
  test('a visitor gets a 404, not a 403', async ({ page }) => {
    const response = await page.goto(ROUTES.adminNotifications);
    expect(response?.status()).toBe(404);
  });

  test('nothing links a signed-out visitor to it', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator(`a[href="${ROUTES.adminNotifications}"]`)).toHaveCount(0);
  });

  test('the staff area as a whole stays closed', async ({ page }) => {
    const response = await page.goto('/admin');
    expect(response?.status()).toBe(404);
  });
});

test.describe('the route is wired', () => {
  test('it is in the admin navigation exactly once', async () => {
    // A second entry means two people added it; a missing one means the
    // page exists and nobody can find it.
    const { readFileSync } = await import('node:fs');
    const layout = readFileSync('src/app/admin/layout.tsx', 'utf8');
    const matches = layout.match(/adminNotifications/g) ?? [];
    expect(matches.length).toBe(1);
  });
});
